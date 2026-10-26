// The sandbox engine: a deterministic, analytical model of an LLM application.
//
// How it works
// - Requests start at `users` nodes in three classes: easy, hard and attack (prompt injection).
// - Each request walks the graph (request → response). Every node returns an Outcome for its whole subtree:
//   the chance of an answer, a latency distribution (a few "atoms", each a mean + p99 spread), expected cost,
//   expected quality, and how often it was blocked / rate limited / failed.
// - Capacity: each node's utilisation ρ = load / capacity comes from the previous pass (we iterate a few times
//   until loads settle). Over capacity (ρ > 1) the excess 1 − 1/ρ fails; below it, queueing adds an
//   M/M/c-style wait ≈ S·ρ^(√(2(c+1))−1) / (c(1−ρ)) (Sakasegawa).
// - Self-hosted models use a roofline: decode step = max(weight bytes ÷ HBM bandwidth, FLOPs ÷ compute)
//   + KV-cache reads; batching shares each step across requests until compute or KV memory runs out.
// Pure TypeScript - no React, safe to import anywhere.
import { gateRates } from "../sims/d/eval-gate-model";
import {
  EVAL_GATE,
  EVAL_JUDGES,
  GUARD_MODELS,
  INDEXES,
  KINDS,
  QUANT,
  apiModel,
  cfgBool,
  cfgNum,
  cfgStr,
  gpu,
  isKind,
  isLlm,
  nodeTitle,
  openModel,
  resolveConfig,
} from "./catalog";
import { fmtMs, fmtRps, fmtUsd, pct } from "./format";
import type {
  Constraint,
  DesignCheck,
  DesignEvaluation,
  DesignTest,
  Graph,
  Incident,
  Issue,
  Metrics,
  NodeConfig,
  NodeKind,
  NodeResult,
  NodeStat,
  RunResult,
  SandboxNode,
  Traffic,
} from "./types";

export const MONTH_SECONDS = 30 * 86_400;
const HOURS_PER_MONTH = 730;
const ITERATIONS = 6;
const MAX_DEPTH = 40;
const Z99 = 2.326;

// ---------------------------------------------------------------- conditions

/** What an incident changes, at a given strength. The timeline varies these second by second. */
export interface Conditions {
  downProviders: string[];
  /** 0 = empty semantic cache, 1 = warm */
  cacheWarm: number;
  /** multiplies requests/s (spikes, retries) */
  scale: number;
  /** overrides attack share */
  attackShare?: number;
  /** retriever slowdown factor */
  vectorSlow: number;
  /** LLM node running a bad model version */
  badRollout?: string;
}

export const NORMAL: Conditions = { downProviders: [], cacheWarm: 1, scale: 1, vectorSlow: 1 };

/** The first LLM reached from the users nodes (breadth first). */
export function primaryLlm(graph: Graph): string | undefined {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const queue = graph.nodes.filter((n) => n.kind === "users").map((n) => n.id);
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    const n = byId.get(id);
    if (n && isLlm(n.kind)) return id;
    for (const e of graph.edges) if (e.from === id && !seen.has(e.to)) { seen.add(e.to); queue.push(e.to); }
  }
  return graph.nodes.find((n) => isLlm(n.kind))?.id;
}

export function conditionsFor(graph: Graph, incident: Incident | undefined): Conditions {
  const c: Conditions = { ...NORMAL, downProviders: [] };
  if (!incident) return c;
  switch (incident.type) {
    case "providerOutage": c.downProviders = [incident.provider ?? "a"]; break;
    case "trafficSpike": c.scale = incident.factor ?? 3; break;
    case "cacheFlush": c.cacheWarm = 0; break;
    case "injectionCampaign": c.attackShare = incident.attackShare ?? 0.2; break;
    case "slowVectorDb": c.vectorSlow = incident.factor ?? 10; break;
    case "badRollout": c.badRollout = incident.nodeId ?? primaryLlm(graph); break;
  }
  return c;
}

// ---------------------------------------------------------------- latency atoms

/** A slice of requests: weight (probability), mean latency and p99 spread (squared), and the same for TTFT. */
interface Atom { w: number; lat: number; e2: number; ttft: number; te2: number }

interface Outcome {
  atoms: Atom[];
  /** probability of an answer (sum of atom weights) */
  ok: number;
  /** Σ over answered of quality (so quality | ok = qSum / ok) */
  qSum: number;
  /** expected $ per request (usage-based costs) */
  cost: number;
  /** blocked on purpose by a guardrail / auth */
  blocked: number;
  /** rejected by a rate limit */
  limited: number;
  /** errors: overload, outage, timeouts, tool failures */
  fail: number;
  /** some model generation happens in this subtree */
  genDown: boolean;
}

const sinkOk = (q: number): Outcome => ({
  atoms: [{ w: 1, lat: 0, e2: 0, ttft: 0, te2: 0 }], ok: 1, qSum: q, cost: 0, blocked: 0, limited: 0, fail: 0, genDown: false,
});
const failAll = (): Outcome => ({ atoms: [], ok: 0, qSum: 0, cost: 0, blocked: 0, limited: 0, fail: 1, genDown: false });

/** Prepend a stage: pass = chance the request survives this stage; the rest is split into fail/blocked/limited. */
function stage(
  d: Outcome,
  o: { lat: number; e: number; ttft?: number; te?: number; pass?: number; blocked?: number; limited?: number; cost?: number; gen?: boolean },
): Outcome {
  const pass = o.pass ?? 1;
  const blocked = o.blocked ?? 0;
  const limited = o.limited ?? 0;
  const ownFail = Math.max(0, 1 - pass - blocked - limited);
  const ttftOwn = o.ttft ?? o.lat;
  const teOwn = o.te ?? o.e;
  // For a generating stage: if more generation follows, the user waits for this whole output first.
  const ttftBase = o.gen && d.genDown ? o.lat : ttftOwn;
  const ttftE = o.gen && d.genDown ? o.e : teOwn;
  return {
    atoms: d.atoms.map((a) => ({
      w: a.w * pass,
      lat: o.lat + a.lat,
      e2: o.e * o.e + a.e2,
      ttft: ttftBase + a.ttft,
      te2: ttftE * ttftE + a.te2,
    })),
    ok: d.ok * pass,
    qSum: d.qSum * pass,
    cost: (o.cost ?? 0) + pass * d.cost,
    blocked: blocked + pass * d.blocked,
    limited: limited + pass * d.limited,
    fail: ownFail + pass * d.fail,
    genDown: d.genDown || !!o.gen,
  };
}

function mix(parts: { w: number; o: Outcome }[]): Outcome {
  const out: Outcome = { atoms: [], ok: 0, qSum: 0, cost: 0, blocked: 0, limited: 0, fail: 0, genDown: false };
  for (const { w, o } of parts) {
    if (w <= 0) continue;
    for (const a of o.atoms) out.atoms.push({ ...a, w: a.w * w });
    out.ok += w * o.ok;
    out.qSum += w * o.qSum;
    out.cost += w * o.cost;
    out.blocked += w * o.blocked;
    out.limited += w * o.limited;
    out.fail += w * o.fail;
    out.genDown ||= o.genDown;
  }
  out.atoms = compress(out.atoms);
  return out;
}

/** Keep at most `max` atoms by merging the closest (moment preserving). */
function compress(atoms: Atom[], max = 10): Atom[] {
  const list = atoms.filter((a) => a.w > 1e-12).sort((a, b) => a.lat - b.lat);
  while (list.length > max) {
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < list.length - 1; i++) {
      const gap = (list[i + 1].lat - list[i].lat) * Math.min(list[i].w, list[i + 1].w);
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    const a = list[best];
    const b = list[best + 1];
    const w = a.w + b.w;
    const lat = (a.w * a.lat + b.w * b.lat) / w;
    const ttft = (a.w * a.ttft + b.w * b.ttft) / w;
    const spread = (x: Atom, m: number) => x.e2 + (x.lat - m) ** 2 * Z99 * Z99;
    const tspread = (x: Atom, m: number) => x.te2 + (x.ttft - m) ** 2 * Z99 * Z99;
    list.splice(best, 2, {
      w, lat, ttft,
      e2: (a.w * spread(a, lat) + b.w * spread(b, lat)) / w,
      te2: (a.w * tspread(a, ttft) + b.w * tspread(b, ttft)) / w,
    });
  }
  return list;
}

/** Collapse an outcome's atoms into one mean/spread (used for repeated calls, e.g. agent steps). */
function moments(o: Outcome): { lat: number; e2: number; ttft: number; te2: number } {
  if (o.ok <= 0) return { lat: 0, e2: 0, ttft: 0, te2: 0 };
  const [a] = compress(o.atoms, 1);
  return a ? { lat: a.lat, e2: a.e2, ttft: a.ttft, te2: a.te2 } : { lat: 0, e2: 0, ttft: 0, te2: 0 };
}

// Normal CDF (Abramowitz-Stegun).
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Share of an atom slower than x. */
function overShare(mean: number, e2: number, x: number): number {
  const sd = Math.sqrt(e2) / Z99;
  if (sd < 1e-9) return mean > x ? 1 : 0;
  return 1 - phi((x - mean) / sd);
}

function quantile(atoms: Atom[], q: number, field: "lat" | "ttft"): number {
  const total = atoms.reduce((s, a) => s + a.w, 0);
  if (total <= 0) return 0;
  const get = (a: Atom) => (field === "lat" ? [a.lat, a.e2] : [a.ttft, a.te2]);
  const over = (x: number) => atoms.reduce((s, a) => { const [m, e] = get(a); return s + a.w * overShare(m, e, x); }, 0) / total;
  let lo = 0;
  let hi = Math.max(1, ...atoms.map((a) => { const [m, e] = get(a); return m + 3 * Math.sqrt(e); }));
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (over(mid) > 1 - q) lo = mid; else hi = mid;
  }
  return Math.max(0, (lo + hi) / 2);
}

/** Mean queueing wait in an M/M/c queue (Sakasegawa), as a multiple of nothing - returns ms. */
export function queueWait(rho: number, c: number, serviceMs: number): number {
  const r = Math.min(0.97, Math.max(0, rho));
  if (r <= 0) return 0;
  return (serviceMs * Math.pow(r, Math.sqrt(2 * (c + 1)) - 1)) / (c * (1 - r));
}

/** Requests slower than the client timeout count as failed. */
function withTimeout(o: Outcome, timeoutMs: number): Outcome {
  let lost = 0;
  const atoms = o.atoms.map((a) => {
    const over = overShare(a.lat, a.e2, timeoutMs);
    lost += a.w * over;
    // the survivors are the faster part of the atom: pull its mean and spread in a little
    if (over <= 0) return a;
    const lat = over > 0.5 ? Math.min(a.lat, timeoutMs * 0.8) : a.lat;
    const e2 = Math.min(a.e2, (timeoutMs - lat) ** 2);
    const ttft = Math.min(a.ttft, lat);
    return { w: a.w * (1 - over), lat, e2, ttft, te2: Math.min(a.te2, e2) };
  });
  if (lost <= 0) return o;
  const keep = o.ok > 0 ? (o.ok - lost) / o.ok : 0;
  return { ...o, atoms, ok: o.ok - lost, qSum: o.qSum * keep, fail: o.fail + lost };
}

const overloadDrop = (rho: number) => (rho > 1 ? 1 - 1 / rho : 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// ---------------------------------------------------------------- per-node models

/** Retrieval quality as a function of top-k. */
export const recallAtK = (k: number) => 1 - Math.pow(0.7, k);
/** Chance the reranker keeps the relevant chunk (given it was among the candidates). */
export const rerankKeep = (keep: number) => 1 - Math.pow(0.35, keep);

export function guardRates(c: NodeConfig) {
  const g = GUARD_MODELS[cfgStr(c, "model")] ?? GUARD_MODELS.classifier;
  const t = cfgNum(c, "threshold");
  return {
    recall: g.recallScale * (1 - Math.pow(t, g.recallPow)),
    fpr: 0.03 * Math.pow(1 - t, 3) * g.fprScale,
    latencyMs: g.latencyMs,
    costPerReq: g.costPerReq,
  };
}

export function cacheRates(c: NodeConfig) {
  const s = cfgNum(c, "similarity");
  return {
    /** share of repeated questions found */
    find: Math.min(1, 0.25 + 2.5 * (1 - s)),
    /** share of hits that answer a different question */
    falseHit: 0.3 * Math.pow((1 - s) / 0.3, 2),
  };
}

export function retrieverModel(c: NodeConfig, slow = 1) {
  const docs = cfgNum(c, "docsMillions");
  const index = cfgStr(c, "index");
  const serviceMs =
    (index === "flat" ? 3 + 15 * docs : index === "ivf-pq" ? 4 + Math.log2(1 + docs) : 6 + 3 * Math.log2(1 + docs)) * slow;
  const replicas = cfgNum(c, "replicas");
  const conc = 4;
  const fixed = replicas * (index === "flat" ? 60 + 30 * docs : index === "ivf-pq" ? 60 + 10 * docs : 100 + 60 * docs);
  return {
    serviceMs,
    embedMs: 10,
    servers: replicas * conc,
    capacity: (replicas * conc * 1000) / serviceMs,
    recall: recallAtK(cfgNum(c, "topK")) * (INDEXES[index]?.recallFactor ?? 1),
    fixedMonthly: fixed,
  };
}

/**
 * Offline eval gate (shared maths with the eval-gate simulation): a bad model version drops the eval score by
 * EVAL_GATE.regressionPp × the grader's coverage; the gate blocks it when the measured drop exceeds the threshold.
 */
export function evalGateModel(c: NodeConfig) {
  const j = EVAL_JUDGES[cfgStr(c, "judge")] ?? EVAL_JUDGES["llm-judge"];
  const n = cfgNum(c, "evalSetSize");
  const g = gateRates({ n, thresholdPp: cfgNum(c, "threshold"), regressionPp: EVAL_GATE.regressionPp * j.coverage, baseline: EVAL_GATE.baseline, noisePp: j.noisePp });
  const monthly = n * (EVAL_GATE.genCostPerItem + j.gradeCost) * EVAL_GATE.runsPerMonth;
  return { catchRate: g.catchRate, falseAlarm: g.falseAlarm, seDropPp: g.se, monthly, judge: j };
}

export interface SelfHostPerf {
  fits: boolean;
  why?: string;
  tp: number;
  gpus: number;
  weightsGB: number;
  kvSeqs: number;
  maxBatch: number;
  batch: number;
  stepMs: number;
  prefillMs: number;
  tokensPerSecPerStream: number;
  tokensPerSec: number;
  capacity: number;
  util: number;
  waitMs: number;
  ttftMs: number;
  latencyMs: number;
  drop: number;
  monthly: number;
}

/** Roofline-style serving model for one self-hosted LLM node at `load` req/s. */
export function selfHostPerf(c: NodeConfig, load: number, promptTokens: number, outputTokens: number): SelfHostPerf {
  const m = openModel(c.model);
  const g = gpu(c.gpu);
  const q = QUANT[cfgStr(c, "quantization")] ?? QUANT.fp16;
  const replicas = cfgNum(c, "replicas");
  const weightsGB = m.paramsB * q.bytes;
  const tp = [1, 2, 4, 8].find((t) => weightsGB <= 0.85 * t * g.memGB) ?? 0;
  const base = {
    tp, gpus: tp * replicas, weightsGB, kvSeqs: 0, maxBatch: 0, batch: 0, stepMs: 0, prefillMs: 0,
    tokensPerSecPerStream: 0, tokensPerSec: 0, capacity: 0, util: load > 0 ? Infinity : 0, waitMs: 0, ttftMs: 0, latencyMs: 0, drop: 1,
    monthly: Math.max(1, tp) * replicas * g.pricePerHour * HOURS_PER_MONTH,
  };
  if (!tp) return { ...base, fits: false, why: `${m.label} needs ${weightsGB} GB of weights - more than 8 × ${g.label} can hold. Quantize or pick a bigger GPU.` };
  const P = Math.max(1, promptTokens);
  const O = Math.max(1, outputTokens);
  const bw = tp * g.bandwidthGBs * 1e9 * 0.8;
  const flops = tp * g.tflops * 1e12 * 0.5;
  const params = m.paramsB * 1e9;
  const kvSeq = m.kvBytesPerToken * (P + O);
  const freeBytes = (tp * g.memGB * 0.9 - weightsGB) * 1e9;
  const kvSeqs = Math.floor(freeBytes / kvSeq);
  if (kvSeqs < 1) return { ...base, fits: false, why: `No GPU memory left for even one request's KV cache (${Math.round(kvSeq / 1e6)} MB at ${Math.round(P + O)} tokens).` };
  const maxBatch = cfgBool(c, "batching") ? Math.max(1, Math.min(cfgNum(c, "maxBatch"), kvSeqs)) : 1;
  const step = (B: number) => Math.max((weightsGB * 1e9) / bw, (2 * params * B) / flops) + (B * m.kvBytesPerToken * (P + O / 2)) / bw;
  const prefill = (2 * params * P) / (tp * g.tflops * 1e12 * 0.6) + 0.01;
  const lam = load / replicas;
  const capPer = 1 / (prefill + (O * step(maxBatch)) / maxBatch);
  const capacity = capPer * replicas;
  const util = load / capacity;
  const slowdown = 1 / Math.max(0.05, 1 - Math.min(0.95, lam * prefill));
  const T = (B: number) => prefill + O * step(B) * slowdown;
  let B = 1;
  for (let i = 0; i < 40; i++) B = Math.min(maxBatch, Math.max(1, lam * T(B)));
  const svc = maxBatch > 1 ? T(maxBatch) : T(1);
  const waitS = queueWait(util, maxBatch, svc * 1000) / 1000;
  const stepS = step(B) * slowdown;
  return {
    ...base,
    fits: true,
    kvSeqs,
    maxBatch,
    batch: B,
    stepMs: stepS * 1000,
    prefillMs: prefill * 1000,
    tokensPerSecPerStream: 1 / stepS,
    tokensPerSec: Math.min(load, capacity) * O,
    capacity,
    util,
    waitMs: waitS * 1000,
    ttftMs: (waitS + prefill + stepS) * 1000,
    latencyMs: (waitS + prefill + O * stepS) * 1000,
    drop: overloadDrop(util),
  };
}

/** Model-quality factor for a (base model quality, grounding) pair. */
function answerQuality(base: number, groundedShare: number, st: State, promptTokens: number, outputTokens: number): number {
  let ground = 0.35;
  if (st.ctxChunks > 0) {
    const noise = Math.min(1, Math.max(0.75, 1 - 0.015 * Math.max(0, st.ctxChunks - 5)));
    const long = promptTokens > 16_000 ? Math.max(0.7, 1 - 0.08 * Math.log2(promptTokens / 16_000)) : 1;
    ground = (0.35 + 0.65 * st.ctxRecall) * noise * long;
  }
  let q = base * (1 - groundedShare + groundedShare * ground);
  if (st.outCap > 0 && st.outCap < outputTokens) q *= 0.5 + (0.5 * st.outCap) / outputTokens;
  return clamp01(q);
}

// ---------------------------------------------------------------- the solver

type Cls = "easy" | "hard" | "attack";

interface Source {
  id: string;
  rps: number;
  promptTokens: number;
  outputTokens: number;
  hardShare: number;
  attackShare: number;
  groundedShare: number;
  repeatShare: number;
  tenants: number;
  topTenantShare: number;
  streaming: boolean;
  timeoutMs: number;
}

interface State {
  cls: Cls;
  src: Source;
  generated: boolean;
  /** inside an agent's tool call: reaching the end counts as done */
  sub: boolean;
  q: number;
  ctxRecall: number;
  ctxChunks: number;
  ctxTokens: number;
  outCap: number;
  depth: number;
  path: string[];
}

interface Acc {
  load: number;
  benign: number;
  attack: number;
  promptTok: number;
  outTok: number;
  dropped: number;
  blocked: number;
  hits: number;
  falseHits: number;
  varCost: number;
  latW: number;
  latSum: number;
  /** router: load sent to the cheapest path; fallback: load sent to the backup */
  routedSmall: number;
  routedBackup: number;
  /** agent tasks completed */
  tasksOk: number;
  recallSum: number;
}

const newAcc = (): Acc => ({
  load: 0, benign: 0, attack: 0, promptTok: 0, outTok: 0, dropped: 0, blocked: 0, hits: 0, falseHits: 0, varCost: 0, latW: 0, latSum: 0,
  routedSmall: 0, routedBackup: 0, tasksOk: 0, recallSum: 0,
});

/** Per-node capacity view computed from the previous pass's loads. */
interface Cap {
  util: number;
  capacity: number | null;
  drop: number;
  waitMs: number;
  inflate: number;
  down: boolean;
  self?: SelfHostPerf;
  limitedShare?: number;
}

function applyTraffic(n: SandboxNode, traffic: Traffic, cond: Conditions): Source {
  const c = resolveConfig(n);
  const rps = (traffic.rps ?? cfgNum(c, "rps")) * (traffic.scale ?? 1) * cond.scale;
  return {
    id: n.id,
    rps: Math.max(0, rps),
    promptTokens: traffic.promptTokens ?? cfgNum(c, "promptTokens"),
    outputTokens: traffic.outputTokens ?? cfgNum(c, "outputTokens"),
    hardShare: clamp01(traffic.hardShare ?? cfgNum(c, "hardShare")),
    attackShare: clamp01(cond.attackShare ?? traffic.attackShare ?? cfgNum(c, "attackShare")),
    groundedShare: clamp01(traffic.groundedShare ?? cfgNum(c, "groundedShare")),
    repeatShare: clamp01(traffic.repeatShare ?? cfgNum(c, "repeatShare")),
    tenants: cfgNum(c, "tenants"),
    topTenantShare: cfgNum(c, "topTenantShare"),
    streaming: traffic.streaming ?? cfgBool(c, "streaming"),
    timeoutMs: cfgNum(c, "timeoutMs"),
  };
}

function tenantLimitedShare(total: number, tenants: number, top: number, limit: number): number {
  if (limit <= 0 || total <= 0) return 0;
  const topR = total * (tenants > 1 ? top : 1);
  const restEach = tenants > 1 ? (total * (1 - top)) / (tenants - 1) : 0;
  const over = Math.max(0, topR - limit) + (tenants > 1 ? (tenants - 1) * Math.max(0, restEach - limit) : 0);
  return Math.min(1, over / total);
}

class Solver {
  readonly byId: Map<string, SandboxNode>;
  readonly cfg: Map<string, NodeConfig>;
  readonly out: Map<string, string[]>;
  acc = new Map<string, Acc>();
  edges = new Map<string, number>();
  caps = new Map<string, Cap>();
  issues = new Map<string, Issue>();
  /** LLM id → chance a bad version of it is blocked by an eval gate upstream */
  gated = new Map<string, number>();

  constructor(readonly graph: Graph, readonly cond: Conditions) {
    this.byId = new Map(graph.nodes.map((n) => [n.id, n]));
    this.cfg = new Map(graph.nodes.map((n) => [n.id, resolveConfig(n)]));
    this.out = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
    const seen = new Set<string>();
    for (const e of graph.edges) {
      const key = `${e.from}->${e.to}`;
      if (e.from === e.to || seen.has(key) || !this.byId.has(e.from) || !this.byId.has(e.to)) continue;
      if (this.byId.get(e.to)!.kind === "users") continue;
      seen.add(key);
      this.out.get(e.from)!.push(e.to);
    }
    // Eval gates protect every model reachable from them (they sit in front of the models they check).
    for (const n of graph.nodes) {
      if (n.kind !== "eval-gate") continue;
      const p = evalGateModel(this.cfg.get(n.id)!).catchRate;
      const queue = [...(this.out.get(n.id) ?? [])];
      const reached = new Set(queue);
      while (queue.length) {
        const id = queue.shift()!;
        const k = this.byId.get(id)?.kind;
        if (k && isLlm(k)) this.gated.set(id, 1 - (1 - (this.gated.get(id) ?? 0)) * (1 - p));
        for (const x of this.out.get(id) ?? []) if (!reached.has(x)) { reached.add(x); queue.push(x); }
      }
    }
  }

  issue(severity: Issue["severity"], text: string, nodeId?: string) {
    const key = `${nodeId ?? ""}|${text}`;
    if (!this.issues.has(key)) this.issues.set(key, { severity, text, nodeId });
  }

  /** Nodes reachable from `id` along outgoing edges. */
  reach(id: string): Set<string> {
    const seen = new Set<string>();
    const queue = [...(this.out.get(id) ?? [])];
    for (const q of queue) seen.add(q);
    while (queue.length) for (const x of this.out.get(queue.shift()!) ?? []) if (!seen.has(x)) { seen.add(x); queue.push(x); }
    return seen;
  }

  title(id: string) {
    const n = this.byId.get(id);
    return n ? nodeTitle(n, this.graph.nodes) : id;
  }

  a(id: string): Acc {
    let x = this.acc.get(id);
    if (!x) { x = newAcc(); this.acc.set(id, x); }
    return x;
  }

  promptOf(st: State) { return st.src.promptTokens + st.ctxTokens; }
  outputOf(st: State) { return st.outCap > 0 ? Math.min(st.src.outputTokens, st.outCap) : st.src.outputTokens; }

  /** Compute capacities from the accumulated loads of the last pass. */
  updateCaps(sources: Source[]) {
    const caps = new Map<string, Cap>();
    for (const n of this.graph.nodes) {
      const c = this.cfg.get(n.id)!;
      const acc = this.acc.get(n.id) ?? newAcc();
      const load = acc.load;
      const P = acc.load > 0 ? acc.promptTok / acc.load : (sources[0]?.promptTokens ?? 800);
      const O = acc.load > 0 ? acc.outTok / acc.load : (sources[0]?.outputTokens ?? 300);
      const cap: Cap = { util: 0, capacity: null, drop: 0, waitMs: 0, inflate: 1, down: false };
      switch (n.kind) {
        case "llm-api": {
          const lim = cfgNum(c, "rateLimitRps");
          cap.capacity = lim;
          cap.util = load / lim;
          cap.drop = overloadDrop(cap.util);
          cap.inflate = 1 + 0.3 * Math.min(1, cap.util) ** 2;
          cap.down = this.cond.downProviders.includes(cfgStr(c, "provider"));
          break;
        }
        case "llm-selfhost": {
          const s = selfHostPerf(c, load, P, O);
          cap.self = s;
          cap.capacity = s.capacity;
          cap.util = s.fits ? s.util : 0;
          cap.drop = s.fits ? s.drop : 1;
          cap.down = !s.fits;
          break;
        }
        case "retriever": {
          const r = retrieverModel(c, this.cond.vectorSlow);
          cap.capacity = r.capacity;
          cap.util = load / r.capacity;
          cap.drop = overloadDrop(cap.util);
          cap.waitMs = queueWait(cap.util, r.servers, r.serviceMs);
          break;
        }
        case "reranker": {
          const cap1 = 300;
          cap.capacity = cap1 * 2;
          cap.util = load / cap.capacity;
          cap.drop = overloadDrop(cap.util);
          cap.waitMs = queueWait(cap.util, 16, 60);
          break;
        }
        case "tool": {
          const lim = cfgNum(c, "rateLimitRps");
          cap.capacity = lim;
          cap.util = load / lim;
          cap.drop = overloadDrop(cap.util);
          break;
        }
        case "gateway": {
          const src = sources[0];
          cap.limitedShare = src ? tenantLimitedShare(load, src.tenants, src.topTenantShare, cfgNum(c, "perTenantRps")) : 0;
          break;
        }
      }
      caps.set(n.id, cap);
    }
    this.caps = caps;
  }

  pass(sources: Source[]) {
    this.acc = new Map();
    this.edges = new Map();
    const results: { src: Source; cls: Cls; rate: number; o: Outcome }[] = [];
    for (const src of sources) {
      const benign = src.rps * (1 - src.attackShare);
      const classes: [Cls, number][] = [
        ["easy", benign * (1 - src.hardShare)],
        ["hard", benign * src.hardShare],
        ["attack", src.rps * src.attackShare],
      ];
      for (const [cls, rate] of classes) {
        if (rate <= 0) continue;
        const st: State = { cls, src, generated: false, sub: false, q: 0, ctxRecall: 0, ctxChunks: 0, ctxTokens: 0, outCap: 0, depth: 0, path: [src.id] };
        const o = withTimeout(this.forward(src.id, st, rate), src.timeoutMs);
        results.push({ src, cls, rate, o });
      }
    }
    return results;
  }

  /** Send a request on from `id` to its children (split evenly across them). */
  forward(id: string, st: State, rate: number): Outcome {
    const kids = this.out.get(id) ?? [];
    if (!kids.length) return this.sink(id, st);
    return mix(kids.map((k) => ({ w: 1 / kids.length, o: this.edge(id, k, st, rate / kids.length) })));
  }

  edge(from: string, to: string, st: State, rate: number): Outcome {
    const key = `${from}->${to}`;
    this.edges.set(key, (this.edges.get(key) ?? 0) + rate);
    return this.visit(to, st, rate);
  }

  sink(id: string, st: State): Outcome {
    if (st.generated || st.sub) return sinkOk(st.q);
    const n = this.byId.get(id);
    if (n?.kind === "users") this.issue("bad", `${this.title(id)} isn't connected to anything - wire it to the rest of the design.`, id);
    else this.issue("bad", `Requests reach ${this.title(id)} and stop without ever reaching a model - nothing answers them.`, id);
    return failAll();
  }

  visit(id: string, st0: State, rate: number): Outcome {
    const n = this.byId.get(id)!;
    if (st0.path.includes(id) || st0.depth > MAX_DEPTH) {
      this.issue("warn", `There's a loop back into ${this.title(id)}; the extra edge is ignored.`, id);
      return this.sink(id, st0);
    }
    const st: State = { ...st0, depth: st0.depth + 1, path: [...st0.path, id] };
    const c = this.cfg.get(id)!;
    const cap = this.caps.get(id) ?? { util: 0, capacity: null, drop: 0, waitMs: 0, inflate: 1, down: false };
    const acc = this.a(id);
    acc.load += rate;
    if (st.cls === "attack") acc.attack += rate; else acc.benign += rate;
    acc.promptTok += rate * this.promptOf(st);
    acc.outTok += rate * this.outputOf(st);
    const own = (lat: number) => { acc.latW += rate; acc.latSum += rate * lat; };

    switch (n.kind) {
      case "users":
        return this.forward(id, st, rate);

      case "observability":
      case "eval-gate":
        // off the request path: no latency, no per-request cost
        own(0);
        return this.forward(id, st, rate);

      case "gateway": {
        const auth = cfgBool(c, "auth");
        const cap1 = cfgNum(c, "maxOutputTokens");
        const blocked = auth && st.cls === "attack" ? 0.3 : 0;
        const limited = (cap.limitedShare ?? 0) * (1 - blocked);
        const pass = 1 - blocked - limited;
        acc.blocked += rate * (blocked + limited);
        own(5);
        const next = { ...st, outCap: cap1 > 0 ? (st.outCap > 0 ? Math.min(st.outCap, cap1) : cap1) : st.outCap };
        const d = this.forward(id, next, rate * pass);
        return stage(d, { lat: 5, e: 5, pass, blocked, limited });
      }

      case "input-guardrail":
      case "output-guardrail": {
        const g = guardRates(c);
        const isOut = n.kind === "output-guardrail";
        if (isOut && !st.generated) {
          this.issue("warn", `${this.title(id)} sits before any model, so there's no answer to check. Move it after the model.`, id);
          own(g.latencyMs);
          const d = this.forward(id, st, rate);
          return stage(d, { lat: g.latencyMs, e: g.latencyMs * 0.5, cost: g.costPerReq });
        }
        const recall = isOut ? g.recall * 0.8 : g.recall;
        const blocked = st.cls === "attack" ? recall : isOut ? g.fpr * 0.5 : g.fpr;
        acc.blocked += rate * blocked;
        acc.varCost += rate * g.costPerReq;
        own(g.latencyMs);
        const d = this.forward(id, st, rate * (1 - blocked));
        return stage(d, { lat: g.latencyMs, e: g.latencyMs * 0.6, pass: 1 - blocked, blocked, cost: g.costPerReq });
      }

      case "semantic-cache": {
        const r = cacheRates(c);
        const lookup = 15;
        const embedCost = 0.000002;
        acc.varCost += rate * embedCost;
        own(lookup);
        if (st.generated || st.sub) {
          if (st.generated) this.issue("warn", `${this.title(id)} sits after the model, so it can't save a model call. Put it before the model.`, id);
          return stage(this.forward(id, st, rate), { lat: lookup, e: 5, cost: embedCost });
        }
        const hit = st.cls === "attack" ? 0 : st.src.repeatShare * r.find * this.cond.cacheWarm;
        acc.hits += rate * hit;
        acc.falseHits += rate * hit * r.falseHit;
        const miss = this.forward(id, st, rate * (1 - hit));
        const missQ = miss.ok > 0 ? miss.qSum / miss.ok : 0.85;
        const hitQ = (1 - r.falseHit) * missQ + r.falseHit * 0.15;
        const hitO: Outcome = { ...sinkOk(hitQ), genDown: false };
        return stage(mix([{ w: hit, o: hitO }, { w: 1 - hit, o: miss }]), { lat: lookup, e: 6, cost: embedCost });
      }

      case "router": {
        const kids = this.out.get(id) ?? [];
        own(20);
        if (!kids.length) return this.sink(id, st);
        const tiers = kids.map((k) => this.tierOf(k));
        const lo = Math.min(...tiers);
        const hi = Math.max(...tiers);
        const t = cfgNum(c, "threshold");
        let parts: { k: string; w: number }[];
        if (lo === hi) {
          if (kids.length > 1) this.issue("warn", `${this.title(id)}'s outputs all lead to the same model size, so routing can't save anything. Wire one path to a small model and one to a large model.`, id);
          else this.issue("info", `${this.title(id)} has only one output - wire a second path (a different model size) for it to route between.`, id);
          parts = kids.map((k) => ({ k, w: 1 / kids.length }));
        } else {
          const pSmall = st.cls === "easy" ? 1 - t * t : 0.6 * (1 - t) ** 2;
          const smalls = kids.filter((_, i) => tiers[i] === lo);
          const larges = kids.filter((_, i) => tiers[i] === hi);
          acc.routedSmall += rate * pSmall;
          parts = [
            ...smalls.map((k) => ({ k, w: pSmall / smalls.length })),
            ...larges.map((k) => ({ k, w: (1 - pSmall) / larges.length })),
          ];
        }
        const d = mix(parts.map((p) => ({ w: p.w, o: p.w > 0 ? this.edge(id, p.k, st, rate * p.w) : failAll() })));
        return stage(d, { lat: 20, e: 10, cost: 0.000005 });
      }

      case "retriever": {
        const r = retrieverModel(c, this.cond.vectorSlow);
        const lat = r.embedMs + r.serviceMs + cap.waitMs;
        own(lat);
        const pass = 1 - cap.drop;
        acc.dropped += rate * cap.drop;
        acc.recallSum += rate * r.recall;
        acc.varCost += rate * 0.000002;
        const topK = cfgNum(c, "topK");
        const next: State = {
          ...st,
          ctxRecall: st.ctxChunks > 0 ? Math.max(st.ctxRecall, r.recall) : r.recall,
          ctxChunks: st.ctxChunks + topK,
          ctxTokens: st.ctxTokens + topK * cfgNum(c, "chunkTokens"),
        };
        const d = this.forward(id, next, rate * pass);
        return stage(d, { lat, e: r.serviceMs * 1.5 + cap.waitMs * 3, pass, cost: 0.000002 });
      }

      case "reranker": {
        const depth = cfgNum(c, "depth");
        const keep = cfgNum(c, "keep");
        if (st.ctxChunks <= 0) {
          this.issue("warn", `${this.title(id)} has nothing to rerank - put it after a retriever.`, id);
          own(0);
          return this.forward(id, st, rate);
        }
        const cands = Math.min(depth, st.ctxChunks);
        const lat = 30 + 1.2 * cands + cap.waitMs;
        own(lat);
        const pass = 1 - cap.drop;
        acc.dropped += rate * cap.drop;
        acc.varCost += rate * 0.00002;
        const chunkTok = st.ctxTokens / st.ctxChunks;
        const kept = Math.min(keep, cands);
        const recallCands = st.ctxChunks > depth ? st.ctxRecall * (recallAtK(depth) / Math.max(1e-6, recallAtK(st.ctxChunks))) : st.ctxRecall;
        const next: State = { ...st, ctxRecall: recallCands * rerankKeep(kept), ctxChunks: kept, ctxTokens: kept * chunkTok };
        const d = this.forward(id, next, rate * pass);
        return stage(d, { lat, e: lat * 0.5, pass, cost: 0.00002 });
      }

      case "llm-api":
      case "llm-selfhost":
        return this.llm(id, n.kind, c, cap, acc, st, rate, own);

      case "fallback": {
        const kids = this.out.get(id) ?? [];
        own(0);
        if (kids.length < 2) {
          this.issue("warn", `${this.title(id)} needs two outputs: the primary and a backup.`, id);
          return this.forward(id, st, rate);
        }
        if (kids.length > 2) this.issue("info", `${this.title(id)} only uses its first two outputs (primary, then backup).`, id);
        const timeout = cfgNum(c, "timeoutMs");
        const p = this.edge(id, kids[0], st, rate);
        let timedOut = 0;
        const kept = p.atoms.map((a) => {
          const over = overShare(a.lat, a.e2, timeout);
          timedOut += a.w * over;
          return { ...a, w: a.w * (1 - over) };
        });
        const keptOk = p.ok - timedOut;
        const moved = p.fail + timedOut;
        acc.routedBackup += rate * moved;
        if (moved <= 1e-9) return { ...p, atoms: kept, ok: keptOk };
        const s = this.edge(id, kids[1], st, rate * moved);
        const shift = (p.fail * 300 + timedOut * timeout) / moved;
        const sAtoms = s.atoms.map((a) => ({ ...a, w: a.w * moved, lat: a.lat + shift, ttft: a.ttft + shift }));
        return {
          atoms: compress([...kept, ...sAtoms]),
          ok: keptOk + moved * s.ok,
          qSum: (p.ok > 0 ? (p.qSum * keptOk) / p.ok : 0) + moved * s.qSum,
          cost: p.cost + moved * s.cost,
          blocked: p.blocked + moved * s.blocked,
          limited: p.limited + moved * s.limited,
          fail: moved * s.fail,
          genDown: p.genDown || s.genDown,
        };
      }

      case "agent":
        return this.agent(id, c, acc, st, rate);

      case "tool": {
        const lat = cfgNum(c, "latencyMs");
        const fr = cfgNum(c, "failureRate");
        const pass = (1 - cap.drop) * (1 - fr);
        acc.dropped += rate * (1 - pass);
        const cost = cfgNum(c, "costPerCall");
        acc.varCost += rate * cost;
        own(lat);
        if (!st.sub) this.issue("warn", `${this.title(id)} should be called by an agent (wire Agent → Tool), not sit on the request path.`, id);
        const d = this.out.get(id)?.length ? this.forward(id, st, rate * pass) : sinkOk(st.q);
        return stage(d, { lat, e: lat * 1.5, pass, cost });
      }
    }
    return this.forward(id, st, rate);
  }

  /** Model tier reachable from a node (for routing): 0 small … 2 large. */
  tierOf(id: string, seen = new Set<string>()): number {
    if (seen.has(id)) return 1;
    seen.add(id);
    const n = this.byId.get(id);
    if (!n) return 1;
    const c = this.cfg.get(id)!;
    if (n.kind === "llm-api") return apiModel(c.model).tier;
    if (n.kind === "llm-selfhost") return openModel(c.model).tier;
    const kids = this.out.get(id) ?? [];
    if (!kids.length) return 1;
    if (n.kind === "fallback") return this.tierOf(kids[0], seen);
    return Math.max(...kids.map((k) => this.tierOf(k, seen)));
  }

  llm(id: string, kind: "llm-api" | "llm-selfhost", c: NodeConfig, cap: Cap, acc: Acc, st: State, rate: number, own: (l: number) => void): Outcome {
    const P = this.promptOf(st);
    const O = this.outputOf(st);
    // A bad version reaches users unless an eval gate upstream blocks it (in expectation: a mix of the two).
    const bad = this.cond.badRollout === id;
    const blocked = bad ? (this.gated.get(id) ?? 0) : 0;
    const slow = 1 + 0.3 * (1 - blocked);
    let base: { easy: number; hard: number };
    let ttft: number;
    let lat: number;
    let ttftE: number;
    let latE: number;
    let pass: number;
    let cost = 0;
    let limited = 0;
    if (kind === "llm-api") {
      const m = apiModel(c.model);
      base = m.quality;
      const pc = cfgBool(c, "promptCache");
      ttft = (m.ttftMs + (P / 1000) * m.prefillMsPer1k * (pc ? 0.6 : 1)) * cap.inflate * (bad ? slow : 1);
      const decode = (O / m.tokensPerSec) * 1000 * (bad ? slow : 1);
      lat = ttft + decode;
      ttftE = ttft * 1.2;
      latE = Math.sqrt(ttftE ** 2 + (decode * 0.4) ** 2);
      if (cap.down) {
        pass = 0;
        this.issue("bad", `${this.title(id)} is down: its provider is having an outage.`, id);
      } else {
        limited = 0;
        pass = (1 - cap.drop) * cfgNum(c, "availability");
      }
      const inPrice = pc ? m.priceIn * (0.5 + 0.5 * 0.1) : m.priceIn;
      cost = (pass + (cap.down ? 0 : (1 - cap.drop) * (1 - cfgNum(c, "availability")))) * ((P * inPrice + O * m.priceOut) / 1e6);
    } else {
      const s = cap.self ?? selfHostPerf(c, 0, P, O);
      const m = openModel(c.model);
      const qz = QUANT[cfgStr(c, "quantization")] ?? QUANT.fp16;
      base = { easy: m.quality.easy * qz.quality, hard: m.quality.hard * qz.quality };
      if (!s.fits) {
        this.issue("bad", `${this.title(id)} can't run: ${s.why}`, id);
        pass = 0;
        ttft = 0;
        lat = 0;
      } else {
        // Per-request latency at the shared operating point, adjusted for this request's own lengths.
        const stepMs = s.stepMs;
        ttft = s.waitMs + s.prefillMs + stepMs;
        lat = ttft + O * stepMs;
        pass = 1 - s.drop;
      }
      if (bad) { ttft *= slow; lat *= slow; }
      ttftE = ttft * 0.8 + s.waitMs * 3;
      latE = Math.sqrt(ttftE ** 2 + (lat - ttft) ** 2 * 0.09);
    }
    if (bad) { const f = blocked + (1 - blocked) * 0.6; base = { easy: base.easy * f, hard: base.hard * f }; }
    acc.dropped += rate * (1 - pass);
    acc.varCost += rate * cost;
    own(lat);
    const q = st.cls === "attack" ? 0 : answerQuality(st.cls === "easy" ? base.easy : base.hard, st.src.groundedShare, st, P, st.src.outputTokens);
    const next: State = { ...st, generated: true, q };
    const d = this.forward(id, next, rate * pass);
    return stage(d, { lat, e: latE, ttft, te: ttftE, pass, limited, cost, gen: true });
  }

  agent(id: string, c: NodeConfig, acc: Acc, st: State, rate: number): Outcome {
    const kids = this.out.get(id) ?? [];
    const tools = kids.filter((k) => this.byId.get(k)!.kind === "tool" || this.byId.get(k)!.kind === "retriever");
    const brains = kids.filter((k) => !tools.includes(k));
    const steps = cfgNum(c, "steps");
    const s = cfgNum(c, "stepSuccess");
    const r = cfgNum(c, "retries");
    const effStep = 1 - Math.pow(1 - s, r + 1);
    let callsPerStep = 0;
    for (let i = 0; i <= r; i++) callsPerStep += Math.pow(1 - s, i);
    const calls = steps * callsPerStep;
    const toolCalls = Math.max(0, steps - 1) * callsPerStep;
    if (!brains.length) {
      this.issue("bad", `${this.title(id)} has no model to think with - wire it to an LLM (or a router / fallback in front of one).`, id);
      return failAll();
    }
    if (!tools.length && steps > 1) this.issue("info", `${this.title(id)} has no tools wired, so its steps can only think. Wire it to Tool or Retriever nodes.`, id);

    // Context from a retriever the agent can call (agentic RAG).
    let ctx = { ctxRecall: st.ctxRecall, ctxChunks: st.ctxChunks, ctxTokens: st.ctxTokens };
    const toolOs = tools.map((t) => {
      const tn = this.byId.get(t)!;
      const tc = this.cfg.get(t)!;
      const per = toolCalls / tools.length;
      if (tn.kind === "retriever") {
        const rm = retrieverModel(tc, this.cond.vectorSlow);
        const k = cfgNum(tc, "topK");
        ctx = { ctxRecall: Math.max(ctx.ctxRecall, rm.recall), ctxChunks: Math.max(ctx.ctxChunks, k), ctxTokens: Math.max(ctx.ctxTokens, k * cfgNum(tc, "chunkTokens")) };
      }
      const o = per > 0 ? this.edge(id, t, { ...st, sub: true }, rate * per) : sinkOk(0);
      return { o, per };
    });
    const brainSt: State = { ...st, ...ctx };
    const B = mix(brains.map((b) => ({ w: 1 / brains.length, o: this.edge(id, b, brainSt, (rate * calls) / brains.length) })));
    const bm = moments(B);
    let okP = Math.pow(effStep, steps) * Math.pow(Math.max(0, B.ok), calls);
    let latSum = calls * bm.lat;
    let e2 = calls * bm.e2;
    let toolLat = 0;
    let cost = calls * B.cost;
    for (const { o, per } of toolOs) {
      const tm = moments(o);
      okP *= Math.pow(Math.max(0, o.ok), per);
      toolLat += per * tm.lat;
      e2 += per * tm.e2;
      cost += per * o.cost;
    }
    latSum += toolLat;
    const blocked = 1 - Math.pow(1 - clamp01(B.blocked), calls);
    const limited = 1 - Math.pow(1 - clamp01(B.limited), calls);
    const ok = Math.min(okP, Math.max(0, 1 - blocked - limited));
    acc.tasksOk += rate * ok;
    acc.dropped += rate * Math.max(0, 1 - ok - blocked - limited);
    acc.blocked += rate * (blocked + limited);
    acc.latW += rate;
    acc.latSum += rate * latSum;
    const ttft = Math.max(0, calls - 1) * bm.lat + toolLat + bm.ttft;
    const q = B.ok > 0 ? B.qSum / B.ok : 0;
    return {
      atoms: ok > 0 ? [{ w: ok, lat: latSum, e2, ttft, te2: e2 }] : [],
      ok,
      qSum: ok * q,
      cost,
      blocked,
      limited,
      fail: Math.max(0, 1 - ok - blocked - limited),
      genDown: true,
    };
  }
}

// ---------------------------------------------------------------- run

/** Run the design at steady state under some traffic (overrides) and conditions. */
export function solve(graph: Graph, traffic: Traffic = {}, cond: Conditions = NORMAL, incident: Incident = { type: "none" }): RunResult {
  const g: Graph = { nodes: graph.nodes.filter((n) => isKind(n.kind)), edges: graph.edges };
  const solver = new Solver(g, cond);
  const sources = g.nodes.filter((n) => n.kind === "users").map((n) => applyTraffic(n, traffic, cond));
  let results: ReturnType<Solver["pass"]> = [];
  for (let i = 0; i < ITERATIONS; i++) {
    solver.updateCaps(sources);
    if (i < ITERATIONS - 1) solver.issues = new Map();
    results = solver.pass(sources);
  }
  solver.updateCaps(sources);
  return buildResult(g, solver, sources, results, incident);
}

export function run(graph: Graph, traffic: Traffic = {}, incident: Incident = { type: "none" }): RunResult {
  return solve(graph, traffic, conditionsFor(graph, incident), incident);
}

function buildResult(g: Graph, solver: Solver, sources: Source[], results: ReturnType<Solver["pass"]>, incident: Incident): RunResult {
  const rps = sources.reduce((s, x) => s + x.rps, 0);
  let benign = 0, attack = 0, okB = 0, qSum = 0, costRate = 0, limited = 0, falseBlocks = 0, errors = 0, leaked = 0, attBlocked = 0;
  const atoms: Atom[] = [];
  for (const { src, cls, rate, o } of results) {
    costRate += rate * o.cost;
    if (cls === "attack") {
      attack += rate;
      leaked += rate * o.ok;
      attBlocked += rate * (o.blocked + o.limited);
      continue;
    }
    benign += rate;
    okB += rate * o.ok;
    qSum += rate * o.qSum;
    limited += rate * o.limited;
    falseBlocks += rate * o.blocked;
    errors += rate * o.fail;
    for (const a of o.atoms) {
      const ttft = src.streaming ? a.ttft : a.lat;
      const te2 = src.streaming ? a.te2 : a.e2;
      atoms.push({ ...a, w: a.w * rate, ttft, te2 });
    }
  }

  const nodes: Record<string, NodeResult> = {};
  let fixed = 0;
  let gpuW = 0, gpuSum = 0, hits = 0, llmCalls = 0;
  for (const n of g.nodes) {
    const c = solver.cfg.get(n.id)!;
    const acc = solver.acc.get(n.id) ?? newAcc();
    const cap = solver.caps.get(n.id) ?? { util: 0, capacity: null, drop: 0, waitMs: 0, inflate: 1, down: false };
    const { stats, monthly, extra } = describeNode(n.id, n.kind, c, acc, cap, solver);
    fixed += monthly;
    if (n.kind === "llm-selfhost" && cap.self?.fits) { gpuW += cap.self.gpus; gpuSum += cap.self.gpus * Math.min(1, cap.util); }
    if (n.kind === "semantic-cache") hits += acc.hits;
    if (isLlm(n.kind)) llmCalls += acc.load;
    nodes[n.id] = {
      id: n.id,
      kind: n.kind,
      load: acc.load,
      util: cap.util,
      capacity: cap.capacity,
      dropped: acc.dropped,
      blocked: acc.blocked,
      latencyMs: acc.latW > 0 ? acc.latSum / acc.latW : 0,
      costPerMonth: monthly + acc.varCost * MONTH_SECONDS,
      down: cap.down,
      stats,
      extra,
    };
  }
  // Observability evals: a judge call on a sample of answers.
  for (const n of g.nodes) {
    if (n.kind !== "observability") continue;
    const c = solver.cfg.get(n.id)!;
    const evalCost = cfgBool(c, "evals") ? okB * cfgNum(c, "sampleRate") * 0.002 * MONTH_SECONDS : 0;
    nodes[n.id].costPerMonth += evalCost;
    fixed += evalCost;
  }

  const costPerMonth = fixed + costRate * MONTH_SECONDS;
  // Agent reliability across repeated tries of the same task (pass^3).
  const agents = g.nodes.filter((n) => n.kind === "agent");
  const agentLoad = agents.reduce((s, n) => s + (solver.acc.get(n.id)?.load ?? 0), 0);
  const agentOk = agents.reduce((s, n) => s + (solver.acc.get(n.id)?.tasksOk ?? 0), 0);
  const taskSuccess = agentLoad > 0 ? clamp01(agentOk / agentLoad) : 0;
  const metrics: Metrics = {
    rps,
    benignRps: benign,
    attackRps: attack,
    successRate: benign > 0 ? clamp01(okB / benign) : 1,
    p50Ms: quantile(atoms, 0.5, "lat"),
    p99Ms: quantile(atoms, 0.99, "lat"),
    ttftP50Ms: quantile(atoms, 0.5, "ttft"),
    ttftP99Ms: quantile(atoms, 0.99, "ttft"),
    costPerRequest: rps > 0 ? costPerMonth / (rps * MONTH_SECONDS) : 0,
    costPerMonth,
    quality: okB > 0 ? clamp01(qSum / okB) : 0,
    gpuUtil: gpuW > 0 ? gpuSum / gpuW : null,
    cacheHitRate: benign > 0 ? clamp01(hits / benign) : 0,
    attacksBlocked: attack > 0 ? clamp01(attBlocked / attack) : 0,
    attacksLeaked: attack > 0 ? clamp01(leaked / attack) : 0,
    rateLimited: benign > 0 ? limited / benign : 0,
    falseBlocks: benign > 0 ? falseBlocks / benign : 0,
    errors: benign > 0 ? clamp01(errors / benign) : 0,
    llmCallsPerSec: llmCalls,
    ...(agents.length ? { taskSuccessPassK: Math.pow(taskSuccess, 3) } : {}),
  };

  structuralIssues(g, solver);
  const order: Record<Issue["severity"], number> = { bad: 0, warn: 1, info: 2 };
  const issues = [...solver.issues.values()].sort((a, b) => order[a.severity] - order[b.severity]);
  return { metrics, nodes, edges: Object.fromEntries(solver.edges), issues, incident };
}

function structuralIssues(g: Graph, solver: Solver) {
  if (!g.nodes.length) return;
  if (!g.nodes.some((n) => n.kind === "users")) solver.issue("bad", "There's no Users node, so no traffic flows. Add one and wire it to the rest of the design.");
  if (!g.nodes.some((n) => isLlm(n.kind))) solver.issue("bad", "There's no model (LLM API or self-hosted LLM) to answer requests.");
  for (const n of g.nodes) {
    if (n.kind === "eval-gate" && ![...solver.gated.keys()].some((id) => solver.reach(n.id).has(id)))
      solver.issue("warn", `${solver.title(n.id)} isn't in front of any model, so it gates nothing. Wire it before the model whose releases it checks.`, n.id);
    if (n.kind === "users" || n.kind === "observability" || n.kind === "eval-gate") continue;
    const acc = solver.acc.get(n.id);
    if (!acc || acc.load <= 0) {
      const hasIn = g.edges.some((e) => e.to === n.id);
      if (!hasIn) solver.issue("info", `${solver.title(n.id)} isn't connected - no requests reach it.`, n.id);
    }
  }
}

function describeNode(id: string, kind: NodeKind, c: NodeConfig, acc: Acc, cap: Cap, solver: Solver): { stats: NodeStat[]; monthly: number; extra: Record<string, number> } {
  const stats: NodeStat[] = [];
  const extra: Record<string, number> = {};
  let monthly = 0;
  const utilTone = (u: number): NodeStat["tone"] => (u > 1 ? "bad" : u > 0.85 ? "warn" : "good");
  const load = acc.load;
  switch (kind) {
    case "users": {
      const total = [...solver.edges.entries()].filter(([k]) => k.startsWith(`${id}->`)).reduce((s, [, v]) => s + v, 0);
      stats.push({ label: "traffic", value: `${fmtRps(total || cfgNum(c, "rps"))} rps` });
      stats.push({ label: "hard", value: pct(cfgNum(c, "hardShare")) });
      if (cfgNum(c, "attackShare") > 0) stats.push({ label: "attacks", value: pct(cfgNum(c, "attackShare")), tone: "warn" });
      break;
    }
    case "gateway": {
      monthly = 200;
      stats.push({ label: "429s", value: `${fmtRps(acc.blocked)}/s`, tone: acc.blocked > 0 ? "warn" : "good" });
      stats.push({ label: "load", value: `${fmtRps(load)} rps` });
      break;
    }
    case "router": {
      monthly = 50;
      const share = load > 0 ? acc.routedSmall / load : 0;
      extra.smallShare = share;
      stats.push({ label: "→ small", value: pct(share) });
      stats.push({ label: "load", value: `${fmtRps(load)} rps` });
      break;
    }
    case "semantic-cache": {
      monthly = 100;
      const hr = acc.benign > 0 ? acc.hits / acc.benign : 0;
      extra.hitRate = hr;
      extra.falseHitRate = acc.hits > 0 ? acc.falseHits / acc.hits : 0;
      stats.push({ label: "hit rate", value: pct(hr), tone: hr > 0.1 ? "good" : undefined });
      stats.push({ label: "false hits", value: pct(extra.falseHitRate), tone: extra.falseHitRate > 0.05 ? "warn" : undefined });
      break;
    }
    case "input-guardrail":
    case "output-guardrail": {
      const g = guardRates(c);
      monthly = cfgStr(c, "model") === "rules" ? 0 : 50;
      extra.recall = g.recall;
      extra.fpr = g.fpr;
      stats.push({ label: "blocked", value: `${fmtRps(acc.blocked)}/s` });
      stats.push({ label: "recall · FP", value: `${pct(kind === "output-guardrail" ? g.recall * 0.8 : g.recall)} · ${pct(g.fpr, 1)}` });
      break;
    }
    case "retriever": {
      const r = retrieverModel(c, solver.cond.vectorSlow);
      monthly = r.fixedMonthly;
      extra.recall = r.recall;
      extra.serviceMs = r.serviceMs;
      stats.push({ label: "recall@k", value: pct(r.recall) });
      stats.push({ label: "util", value: pct(cap.util), tone: utilTone(cap.util) });
      break;
    }
    case "reranker": {
      monthly = 150;
      stats.push({ label: "adds", value: fmtMs(acc.latW > 0 ? acc.latSum / acc.latW : 0) });
      stats.push({ label: "keeps", value: `${cfgNum(c, "keep")} chunks` });
      break;
    }
    case "llm-api": {
      const m = apiModel(c.model);
      extra.tier = m.tier;
      if (cap.down) stats.push({ label: "status", value: "DOWN", tone: "bad" });
      else stats.push({ label: "of rate limit", value: pct(cap.util), tone: utilTone(cap.util) });
      stats.push({ label: "spend", value: `${fmtUsd(acc.varCost * MONTH_SECONDS)}/mo` });
      break;
    }
    case "llm-selfhost": {
      const s = cap.self;
      monthly = s?.monthly ?? 0;
      if (s) {
        Object.assign(extra, { gpus: s.gpus, tp: s.tp, batch: s.batch, maxBatch: s.maxBatch, kvSeqs: s.kvSeqs, stepMs: s.stepMs, tokensPerSecPerStream: s.tokensPerSecPerStream, capacity: s.capacity, prefillMs: s.prefillMs });
        if (!s.fits) stats.push({ label: "status", value: "doesn't fit", tone: "bad" });
        else {
          stats.push({ label: "GPU", value: pct(Math.min(cap.util, 9.99)), tone: utilTone(cap.util) });
          stats.push({ label: "batch · tok/s", value: `${s.batch.toFixed(s.batch < 10 ? 1 : 0)} · ${Math.round(s.tokensPerSecPerStream)}` });
        }
      }
      break;
    }
    case "fallback": {
      const share = load > 0 ? acc.routedBackup / load : 0;
      extra.backupShare = share;
      stats.push({ label: "→ backup", value: pct(share), tone: share > 0.05 ? "warn" : "good" });
      break;
    }
    case "agent": {
      const sr = load > 0 ? acc.tasksOk / load : 0;
      extra.taskSuccess = sr;
      stats.push({ label: "tasks ok", value: pct(sr), tone: sr < 0.9 ? "warn" : "good" });
      stats.push({ label: "steps", value: String(cfgNum(c, "steps")) });
      break;
    }
    case "tool": {
      stats.push({ label: "calls", value: `${fmtRps(load)}/s` });
      stats.push({ label: "util", value: pct(cap.util), tone: utilTone(cap.util) });
      break;
    }
    case "eval-gate": {
      const e = evalGateModel(c);
      monthly = e.monthly;
      extra.catchRate = e.catchRate;
      extra.falseAlarm = e.falseAlarm;
      extra.evalMonthly = e.monthly;
      stats.push({ label: "catches", value: pct(e.catchRate), tone: e.catchRate >= 0.9 ? "good" : e.catchRate < 0.7 ? "warn" : undefined });
      stats.push({ label: "false alarms", value: pct(e.falseAlarm), tone: e.falseAlarm > 0.2 ? "warn" : undefined });
      stats.push({ label: "eval spend", value: `${fmtUsd(e.monthly)}/mo` });
      break;
    }
    case "observability": {
      monthly = 300;
      stats.push({ label: "tracing", value: cfgBool(c, "tracing") ? "on" : "off" });
      stats.push({ label: "evals", value: cfgBool(c, "evals") ? pct(cfgNum(c, "sampleRate")) : "off" });
      break;
    }
  }
  if (cap.drop > 0 && kind !== "llm-selfhost" && !stats.some((s) => s.tone === "bad")) stats.unshift({ label: "overloaded", value: pct(cap.util), tone: "bad" });
  return { stats, monthly, extra };
}

// ---------------------------------------------------------------- design tests

export function constraintLabel(c: Constraint): string {
  if (c.label) return c.label;
  const under = c.under && c.under.type !== "none" ? ` (${incidentLabel(c.under)})` : "";
  switch (c.type) {
    case "successRate": return `Success rate ≥ ${pct(c.min, c.min >= 0.99 && c.min < 1 ? 1 : 0)}${under}`;
    case "p50": return `p50 latency ≤ ${fmtMs(c.maxMs)}${under}`;
    case "p99": return `p99 latency ≤ ${fmtMs(c.maxMs)}${under}`;
    case "ttft": return `p99 time to first token ≤ ${fmtMs(c.maxMs)}${under}`;
    case "costPerMonth": return `Cost ≤ ${fmtUsd(c.maxUsd)} / month${under}`;
    case "costPerRequest": return `Cost ≤ ${fmtUsd(c.maxUsd)} / request${under}`;
    case "quality": return `Answer quality ≥ ${c.min.toFixed(2)}${under}`;
    case "attacksLeaked": return `Attacks leaked ≤ ${pct(c.max, c.max < 0.01 ? 1 : 0)}${under}`;
    case "cacheHitRate": return `Cache hit rate ≥ ${pct(c.min)}${under}`;
    case "taskSuccessPassK": return `Agent pass^3 ≥ ${pct(c.min)}${under}`;
    case "gateFalseAlarms": return `Eval gate blocks ≤ ${pct(c.max)} of good releases`;
    case "gpuUtil": return `GPU utilisation ${c.min !== undefined ? `≥ ${pct(c.min)}` : ""}${c.min !== undefined && c.max !== undefined ? " and " : ""}${c.max !== undefined ? `≤ ${pct(c.max)}` : ""}${under}`;
    case "requires": return `Uses ${c.count && c.count > 1 ? `${c.count}× ` : "a "}${KINDS[c.kind]?.label ?? c.kind}`;
    case "forbids": return `No ${KINDS[c.kind]?.label ?? c.kind}`;
  }
}

export function incidentLabel(i: Incident): string {
  switch (i.type) {
    case "none": return "normal day";
    case "providerOutage": return `provider ${(i.provider ?? "a").toUpperCase()} outage`;
    case "trafficSpike": return `traffic ×${i.factor ?? 3}`;
    case "cacheFlush": return "cache flushed";
    case "injectionCampaign": return `injection campaign (${pct(i.attackShare ?? 0.2)} attacks)`;
    case "slowVectorDb": return `vector DB ${i.factor ?? 10}× slower`;
    case "badRollout": return "bad model rollout";
  }
}

export function checkConstraint(graph: Graph, c: Constraint, r: RunResult): DesignCheck {
  const m = r.metrics;
  const label = constraintLabel(c);
  const res = (pass: boolean, detail: string): DesignCheck => ({ label, pass, detail: pass || !c.why ? detail : `${detail} ${c.why}` });
  switch (c.type) {
    case "successRate": return res(m.successRate >= c.min - 1e-9, `${pct(m.successRate, 2)} of requests answered (needs ≥ ${pct(c.min, 2)}).`);
    case "p50": return res(m.successRate > 0 && m.p50Ms <= c.maxMs, `p50 is ${fmtMs(m.p50Ms)} (needs ≤ ${fmtMs(c.maxMs)}).`);
    case "p99": return res(m.successRate > 0 && m.p99Ms <= c.maxMs, `p99 is ${fmtMs(m.p99Ms)} (needs ≤ ${fmtMs(c.maxMs)}).`);
    case "ttft": return res(m.successRate > 0 && m.ttftP99Ms <= c.maxMs, `p99 TTFT is ${fmtMs(m.ttftP99Ms)} (needs ≤ ${fmtMs(c.maxMs)}).`);
    case "costPerMonth": return res(m.costPerMonth <= c.maxUsd, `${fmtUsd(m.costPerMonth)} / month (budget ${fmtUsd(c.maxUsd)}).`);
    case "costPerRequest": return res(m.costPerRequest <= c.maxUsd, `${fmtUsd(m.costPerRequest)} / request (budget ${fmtUsd(c.maxUsd)}).`);
    case "quality": return res(m.successRate > 0 && m.quality >= c.min - 1e-9, `Quality is ${m.quality.toFixed(3)} (needs ≥ ${c.min.toFixed(2)}).`);
    case "attacksLeaked": return res(m.attacksLeaked <= c.max + 1e-9, `${pct(m.attacksLeaked, 1)} of attacks got through (max ${pct(c.max, 1)}).`);
    case "cacheHitRate": return res(m.cacheHitRate >= c.min - 1e-9, `${pct(m.cacheHitRate, 1)} of requests answered from cache (needs ≥ ${pct(c.min)}).`);
    case "gateFalseAlarms": {
      const gates = graph.nodes.filter((n) => n.kind === "eval-gate");
      if (!gates.length) return res(false, "There's no eval gate in the design.");
      const fa = Math.max(...gates.map((n) => r.nodes[n.id]?.extra.falseAlarm ?? 1));
      return res(fa <= c.max + 1e-9, `The gate blocks ${pct(fa, 1)} of releases that are actually fine (max ${pct(c.max)}).`);
    }
    case "taskSuccessPassK": {
      if (m.taskSuccessPassK === undefined) return res(false, "There's no agent in the design.");
      return res(m.taskSuccessPassK >= c.min - 1e-9, `pass^3 is ${pct(m.taskSuccessPassK, 1)}: the same task succeeds on all three tries that often (needs ≥ ${pct(c.min)}).`);
    }
    case "gpuUtil": {
      const u = m.gpuUtil;
      if (u === null) return res(false, "There are no self-hosted GPUs in the design.");
      const ok = (c.min === undefined || u >= c.min) && (c.max === undefined || u <= c.max);
      return res(ok, `GPUs are ${pct(u)} busy.`);
    }
    case "requires": {
      const have = graph.nodes.filter((n) => n.kind === c.kind).length;
      const need = c.count ?? 1;
      return res(have >= need, `${have} ${KINDS[c.kind]?.label ?? c.kind} node${have === 1 ? "" : "s"} (needs ${need}).`);
    }
    case "forbids": {
      const have = graph.nodes.filter((n) => n.kind === c.kind).length;
      return res(have === 0, have ? `Remove the ${KINDS[c.kind]?.label ?? c.kind}.` : `No ${KINDS[c.kind]?.label ?? c.kind}.`);
    }
  }
}

/** Check a design against a test. Labs call this; `run` is the result under the test's traffic and incident. */
export function evaluateDesign(graph: Graph, test: DesignTest): DesignEvaluation {
  const traffic = test.traffic ?? {};
  const baseIncident = test.incident ?? { type: "none" as const };
  const cache = new Map<string, RunResult>();
  const runFor = (i: Incident) => {
    const key = JSON.stringify(i);
    let r = cache.get(key);
    if (!r) { r = run(graph, traffic, i); cache.set(key, r); }
    return r;
  };
  const base = runFor(baseIncident);
  const results = test.constraints.map((c) => checkConstraint(graph, c, c.under ? runFor(c.under) : base));
  return { pass: results.every((r) => r.pass), results, run: base };
}
