// Plain-language guide for the sandbox: describe a design before it runs, explain the results after
// (bottlenecks, failures, what to try - with one-click fixes - and the trade-offs), and "what if" checks.
// Pure: no React.
import { KINDS, apiModel, cfgBool, cfgNum, cfgStr, isLlm, nodeTitle, openModel, resolveConfig } from "./catalog";
import { evalGateModel, incidentLabel, run } from "./engine";
import { fmtMs, fmtRps, fmtUsd, pct } from "./format";
import { addFallback, insertAfter, insertBefore, setConfig } from "./presets";
import { TIMELINE, type TimelineSummary } from "./timeline";
import type { Graph, Incident, NodeConfig, NodeKind, RunResult, SandboxNode, Traffic } from "./types";

/** A one-click change the UI can apply for the learner (see applyAction). */
export type Action =
  | { kind: "config"; nodeId: string; patch: NodeConfig; label: string }
  | { kind: "insertBefore"; nodeId: string; nodeKind: NodeKind; config?: NodeConfig; label: string }
  | { kind: "insertAfter"; nodeId: string; nodeKind: NodeKind; config?: NodeConfig; label: string }
  | { kind: "addFallback"; nodeId: string; backup: { kind: NodeKind; config?: NodeConfig }; label: string };

export interface Advice {
  severity: "bad" | "warn" | "info";
  problem: string;
  why: string;
  fix: string;
  tradeoff: string;
  nodeId?: string;
  action?: Action;
}

export interface Guide {
  tone: "good" | "warn" | "bad" | "empty";
  headline: string;
  /** how requests flow, in a sentence or two */
  path: string[];
  advice: Advice[];
}

export interface WhatIf {
  id: "traffic-x2" | "provider-down" | "cache-flushed";
  scenario: string;
  successRate: number;
  p99Ms: number;
  costPerMonth: number;
  quality: number;
  verdict: string;
  tone: "good" | "warn" | "bad";
}

export function applyAction(g: Graph, a: Action): Graph {
  switch (a.kind) {
    case "config": return setConfig(g, a.nodeId, a.patch);
    case "insertBefore": return insertBefore(g, a.nodeId, a.nodeKind, a.config).graph;
    case "insertAfter": return insertAfter(g, a.nodeId, a.nodeKind, a.config).graph;
    case "addFallback": return addFallback(g, a.nodeId, a.backup);
  }
}

// ---------------------------------------------------------------- helpers

const kids = (g: Graph, id: string) => g.edges.filter((e) => e.from === id).map((e) => e.to);
const parents = (g: Graph, id: string) => g.edges.filter((e) => e.to === id).map((e) => e.from);
const byId = (g: Graph, id: string) => g.nodes.find((n) => n.id === id);

/** Node ids reachable from the users nodes, breadth first. */
function reachable(g: Graph): string[] {
  const order: string[] = [];
  const queue = g.nodes.filter((n) => n.kind === "users").map((n) => n.id);
  const seen = new Set(queue);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const k of kids(g, id)) if (!seen.has(k)) { seen.add(k); queue.push(k); }
  }
  return order;
}

/** The first node of a kind set on the request path. */
function firstOnPath(g: Graph, pred: (n: SandboxNode) => boolean): SandboxNode | undefined {
  for (const id of reachable(g)) { const n = byId(g, id); if (n && pred(n)) return n; }
  return undefined;
}

/** Where to insert something "in front of the models": the first model/router/fallback/agent on the path. */
function modelEntry(g: Graph): SandboxNode | undefined {
  return firstOnPath(g, (n) => isLlm(n.kind) || n.kind === "router" || n.kind === "fallback" || n.kind === "agent");
}

const has = (g: Graph, k: NodeKind) => g.nodes.some((n) => n.kind === k);
const usersCfg = (g: Graph) => g.nodes.filter((n) => n.kind === "users").map((n) => resolveConfig(n));

function modelName(n: SandboxNode): string {
  const c = resolveConfig(n);
  if (n.kind === "llm-api") return `${apiModel(c.model).id} model API`;
  if (n.kind === "llm-selfhost") return `self-hosted ${openModel(c.model).id} model`;
  return KINDS[n.kind].label.toLowerCase();
}

// ---------------------------------------------------------------- before running

/** One or two sentences describing how requests flow through the design. */
export function describeDesign(g: Graph): string[] {
  if (!g.nodes.length) return ["The canvas is empty. Add Users and a model (LLM API or self-hosted), then wire Users → model."];
  const out: string[] = [];
  const users = g.nodes.filter((n) => n.kind === "users");
  if (!users.length) return ["There are no Users yet, so no traffic will flow. Add a Users node and wire it to the design."];
  for (const u of users) {
    const c = resolveConfig(u);
    const bits = [`${fmtRps(cfgNum(c, "rps"))} requests/s`, `~${cfgNum(c, "promptTokens")} prompt and ${cfgNum(c, "outputTokens")} output tokens each`, `${pct(cfgNum(c, "hardShare"))} hard`];
    if (cfgNum(c, "groundedShare") > 0) bits.push(`${pct(cfgNum(c, "groundedShare"))} about your documents`);
    if (cfgNum(c, "attackShare") > 0) bits.push(`${pct(cfgNum(c, "attackShare"))} attacks`);
    out.push(`${nodeTitle(u, g.nodes)} send ${bits.join(", ")}.`);
  }
  // A simple path description along first edges.
  const path: string[] = [];
  let cur: string | undefined = users[0].id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n = byId(g, cur);
    if (!n) break;
    const ks = kids(g, cur);
    if (n.kind !== "users") {
      if (n.kind === "router" && ks.length > 1) path.push(`a router (easy → ${ks.map((k) => byId(g, k)).filter(Boolean).map((k) => modelName(k!)).join(" / hard → ")})`);
      else if (n.kind === "fallback" && ks.length > 1) path.push(`a fallback (${modelName(byId(g, ks[0])!)}, backup ${modelName(byId(g, ks[1])!)})`);
      else if (n.kind === "agent") path.push(`an agent loop (${cfgNum(resolveConfig(n), "steps")} steps, ${ks.length} tools/models)`);
      else path.push(isLlm(n.kind) ? `the ${modelName(n)}` : KINDS[n.kind].label.toLowerCase());
    }
    if (n.kind === "router" || n.kind === "fallback" || n.kind === "agent") break;
    cur = ks[0];
  }
  if (path.length) out.push(`Each request goes through ${path.join(" → ")}.`);
  else out.push("The users aren't wired to anything yet - drag from their right handle to another component.");
  if (!g.nodes.some((n) => isLlm(n.kind))) out.push("There's no model yet: add an LLM API or a self-hosted LLM.");
  return out;
}

// ---------------------------------------------------------------- after running

export function explain(g: Graph, r: RunResult, traffic: Traffic = {}): Guide {
  const path = describeDesign(g);
  if (!g.nodes.length) return { tone: "empty", headline: "Start by adding Users and a model, then wire them together.", path, advice: [] };
  const m = r.metrics;
  const advice: Advice[] = [];
  const title = (id: string) => { const n = byId(g, id); return n ? nodeTitle(n, g.nodes) : id; };
  const ucfg = usersCfg(g);
  const grounded = Math.max(0, ...ucfg.map((c) => traffic.groundedShare ?? cfgNum(c, "groundedShare")));
  const repeat = Math.max(0, ...ucfg.map((c) => traffic.repeatShare ?? cfgNum(c, "repeatShare")));
  const hard = Math.max(0, ...ucfg.map((c) => traffic.hardShare ?? cfgNum(c, "hardShare")));
  const promptTok = Math.max(0, ...ucfg.map((c) => traffic.promptTokens ?? cfgNum(c, "promptTokens")));
  const streaming = ucfg.some((c) => traffic.streaming ?? cfgBool(c, "streaming"));

  // Structural problems first.
  for (const i of r.issues.filter((x) => x.severity === "bad")) {
    if (i.text.includes("outage")) continue;
    advice.push({ severity: "bad", problem: i.text, why: "Requests that can't reach a working model fail.", fix: "Wire the design so every path ends at a model.", tradeoff: "None - this is a wiring fix.", nodeId: i.nodeId });
  }

  // Overloaded and hot components, worst first.
  const loaded = Object.values(r.nodes).filter((n) => n.util > 0.85 && !n.down).sort((a, b) => b.util - a.util);
  for (const nr of loaded) {
    const n = byId(g, nr.id);
    if (!n) continue;
    const c = resolveConfig(n);
    const over = nr.util > 1;
    const sev = over ? "bad" : "warn";
    const head = over ? `${title(n.id)} is over capacity (${pct(nr.util)}).` : `${title(n.id)} is running hot (${pct(nr.util)}).`;
    const whyBase = over
      ? `It receives ${fmtRps(nr.load)} requests/s but can only handle ~${fmtRps(nr.capacity ?? 0)}/s, so ${pct(1 - 1 / nr.util)} of them fail or time out.`
      : "Past ~85% busy, requests wait in a queue and latency climbs steeply - and there's no headroom for a spike.";
    if (n.kind === "llm-selfhost") {
      const x = nr.extra;
      if (!cfgBool(c, "batching")) {
        advice.push({
          severity: sev, problem: head, nodeId: n.id,
          why: `${whyBase} Without batching each decode step streams all the weights from GPU memory for a single request (~${Math.round(x.tokensPerSecPerStream ?? 0)} tokens/s), leaving the GPU's compute almost idle.`,
          fix: "Turn on continuous batching: many requests share every decode step.",
          tradeoff: "Each request gets a little slower per token, but total throughput rises many times over.",
          action: { kind: "config", nodeId: n.id, patch: { batching: true }, label: "Turn on batching" },
        });
      } else {
        const need = Math.min(32, Math.ceil(cfgNum(c, "replicas") * nr.util * 1.3));
        const kvBound = (x.kvSeqs ?? 0) < cfgNum(c, "maxBatch");
        advice.push({
          severity: sev, problem: head, nodeId: n.id,
          why: `${whyBase} Each replica decodes up to ${Math.round(x.maxBatch ?? 0)} requests at once${kvBound ? ` (limited by KV-cache memory: only ${Math.round(x.kvSeqs ?? 0)} sequences fit)` : ""}.`,
          fix: kvBound ? "Add replicas, or quantize the weights (INT8) to free memory for more KV cache - or use a GPU with more memory/bandwidth." : "Add replicas, or move to a faster GPU (more memory bandwidth = more tokens/s).",
          tradeoff: `Every replica is another ${x.gpus && cfgNum(c, "replicas") ? Math.round(x.gpus / cfgNum(c, "replicas")) : 1} GPU(s) billed by the hour, busy or not.`,
          action: { kind: "config", nodeId: n.id, patch: { replicas: Math.max(cfgNum(c, "replicas") + 1, need) }, label: `Use ${Math.max(cfgNum(c, "replicas") + 1, need)} replicas` },
        });
      }
    } else if (n.kind === "llm-api") {
      const want = Math.ceil(nr.load * 1.4);
      advice.push({
        severity: sev, problem: head, nodeId: n.id,
        why: `${whyBase} Over the provider's rate limit calls fail with HTTP 429.`,
        fix: "Ask the provider for a higher rate limit, or take load off the model: a semantic cache for repeats, a router to a second model, or a gateway limit for noisy tenants.",
        tradeoff: "Higher limits often need a bigger commitment; caching and routing add components to run.",
        action: { kind: "config", nodeId: n.id, patch: { rateLimitRps: Math.min(2000, want) }, label: `Raise rate limit to ${Math.min(2000, want)} rps` },
      });
    } else if (n.kind === "retriever") {
      advice.push({
        severity: sev, problem: head, nodeId: n.id,
        why: `${whyBase} Each search takes ~${fmtMs(nr.extra.serviceMs ?? 0)}.`,
        fix: cfgStr(c, "index") === "flat" ? "A flat index scans every vector - switch to HNSW, or add replicas." : "Add index replicas to share the query load.",
        tradeoff: "Replicas multiply the memory bill; approximate indexes trade a little recall for speed.",
        action: cfgStr(c, "index") === "flat"
          ? { kind: "config", nodeId: n.id, patch: { index: "hnsw" }, label: "Switch to HNSW" }
          : { kind: "config", nodeId: n.id, patch: { replicas: Math.min(8, cfgNum(c, "replicas") + Math.max(1, Math.ceil(cfgNum(c, "replicas") * (nr.util - 0.7)))) }, label: "Add replicas" },
      });
    } else if (n.kind === "tool") {
      advice.push({
        severity: sev, problem: head, nodeId: n.id,
        why: `${whyBase} The agent calls it ${fmtRps(nr.load)} times a second.`,
        fix: "Raise the tool's rate limit, cache its results, or make the agent call it fewer times.",
        tradeoff: "Caching tool results can serve stale data.",
        action: { kind: "config", nodeId: n.id, patch: { rateLimitRps: Math.min(2000, Math.ceil(nr.load * 1.4)) }, label: "Raise tool rate limit" },
      });
    } else {
      advice.push({ severity: sev, problem: head, why: whyBase, fix: "Spread the load or reduce it upstream.", tradeoff: "More capacity costs more.", nodeId: n.id });
    }
  }

  // Self-hosted models that don't fit.
  for (const n of g.nodes.filter((x) => x.kind === "llm-selfhost")) {
    const nr = r.nodes[n.id];
    if (!nr?.down) continue;
    const c = resolveConfig(n);
    const q = cfgStr(c, "quantization");
    advice.push({
      severity: "bad", problem: `${title(n.id)} doesn't fit on its GPUs.`, nodeId: n.id,
      why: r.issues.find((i) => i.nodeId === n.id)?.text ?? "The weights plus KV cache need more GPU memory than is available.",
      fix: q !== "int4" ? "Quantize the weights (fewer bytes per parameter) or pick a GPU with more memory." : "Pick a GPU with more memory, a smaller model, or shorter prompts.",
      tradeoff: "Quantization costs a little quality; bigger GPUs cost more per hour.",
      action: q === "fp16" ? { kind: "config", nodeId: n.id, patch: { quantization: "int8" }, label: "Quantize to INT8" } : q === "int8" ? { kind: "config", nodeId: n.id, patch: { quantization: "int4" }, label: "Quantize to INT4" } : { kind: "config", nodeId: n.id, patch: { gpu: "H100" }, label: "Use H100s" },
    });
  }

  // Outages.
  const down = g.nodes.filter((n) => n.kind === "llm-api" && r.nodes[n.id]?.down);
  for (const n of down) {
    const c = resolveConfig(n);
    const inFallback = parents(g, n.id).some((p) => byId(g, p)?.kind === "fallback");
    const fbParent = parents(g, n.id).map((p) => byId(g, p)).find((p) => p?.kind === "fallback");
    if (!inFallback) {
      const other = cfgStr(c, "provider") === "b" ? "c" : "b";
      advice.push({
        severity: "bad", problem: `${title(n.id)} is down (provider ${cfgStr(c, "provider").toUpperCase()} outage) and nothing replaces it.`, nodeId: n.id,
        why: "Every request that needs this model fails until the provider recovers.",
        fix: `Put a Fallback in front of it with a backup model on a different provider (${other.toUpperCase()}).`,
        tradeoff: "Two providers means two contracts, two sets of prompts to test, and answers that differ slightly in style.",
        action: { kind: "addFallback", nodeId: n.id, backup: { kind: "llm-api", config: { model: cfgStr(c, "model"), provider: other } }, label: `Add fallback on provider ${other.toUpperCase()}` },
      });
    } else if (fbParent) {
      const ks = kids(g, fbParent.id);
      const backup = byId(g, ks[1]);
      if (backup && backup.kind === "llm-api" && cfgStr(resolveConfig(backup), "provider") === cfgStr(c, "provider")) {
        const other = cfgStr(c, "provider") === "b" ? "c" : "b";
        advice.push({
          severity: "bad", problem: `The backup behind ${title(fbParent.id)} is on the same provider - the outage took both down.`, nodeId: backup.id,
          why: "A fallback only helps when the backup fails independently of the primary.",
          fix: `Move the backup to provider ${other.toUpperCase()}.`,
          tradeoff: "A second provider needs its own prompt testing and contract.",
          action: { kind: "config", nodeId: backup.id, patch: { provider: other }, label: `Move backup to provider ${other.toUpperCase()}` },
        });
      }
    }
  }

  // Fallback timeouts that are too long.
  for (const n of g.nodes.filter((x) => x.kind === "fallback")) {
    const nr = r.nodes[n.id];
    const c = resolveConfig(n);
    if (nr && (nr.extra.backupShare ?? 0) > 0.05 && cfgNum(c, "timeoutMs") > 10_000 && m.p99Ms > 10_000)
      advice.push({
        severity: "warn", problem: `${pct(nr.extra.backupShare)} of requests fail over, and the ${fmtMs(cfgNum(c, "timeoutMs"))} timeout makes slow failures very slow.`, nodeId: n.id,
        why: "When the primary hangs instead of erroring, each request waits the full timeout before trying the backup.",
        fix: "Lower the timeout to a little above the primary's normal p99.",
        tradeoff: "Too low and you fail over on requests that would have finished - paying twice.",
        action: { kind: "config", nodeId: n.id, patch: { timeoutMs: 6000 }, label: "Timeout 6 s" },
      });
  }

  // Safety.
  if (m.attackRps > 0 && m.attacksLeaked > 0.01) {
    const guard = g.nodes.find((n) => n.kind === "input-guardrail");
    const entry = modelEntry(g);
    if (!guard && entry) {
      advice.push({
        severity: m.attacksLeaked > 0.2 ? "bad" : "warn", problem: `${pct(m.attacksLeaked)} of attacks reach the model and get answered.`, nodeId: entry.id,
        why: "Nothing screens prompts, so injected instructions run with your system prompt's privileges.",
        fix: "Add an input guardrail in front of the model (and an output guardrail after it for defence in depth).",
        tradeoff: "Every detector blocks some real users (false positives) and adds latency.",
        action: { kind: "insertBefore", nodeId: entry.id, nodeKind: "input-guardrail", label: "Add input guardrail" },
      });
    } else if (guard) {
      const c = resolveConfig(guard);
      const out = g.nodes.find((n) => n.kind === "output-guardrail");
      const llm = firstOnPath(g, (n) => isLlm(n.kind));
      if (!out && llm && kids(g, llm.id).length === 0)
        advice.push({
          severity: "warn", problem: `${pct(m.attacksLeaked, 1)} of attacks still get through the input guardrail.`, nodeId: llm.id,
          why: "No detector catches everything. A second, independent check on the answer catches much of what slipped past.",
          fix: "Add an output guardrail after the model.",
          tradeoff: "With streaming it delays the first token by its latency.",
          action: { kind: "insertAfter", nodeId: llm.id, nodeKind: "output-guardrail", label: "Add output guardrail" },
        });
      else if (cfgNum(c, "threshold") > 0.2)
        advice.push({
          severity: "warn", problem: `${pct(m.attacksLeaked, 1)} of attacks still get through.`, nodeId: guard.id,
          why: "The block threshold is fairly lenient.",
          fix: "Lower the threshold (stricter) or use a stronger detector.",
          tradeoff: "Stricter means more real users wrongly blocked.",
          action: { kind: "config", nodeId: guard.id, patch: { threshold: Math.max(0.05, Math.round((cfgNum(c, "threshold") - 0.15) * 20) / 20) }, label: "Make it stricter" },
        });
    }
  }
  if (m.falseBlocks > 0.03) {
    const guard = g.nodes.filter((n) => n.kind === "input-guardrail" || n.kind === "output-guardrail").sort((a, b) => cfgNum(resolveConfig(a), "threshold") - cfgNum(resolveConfig(b), "threshold"))[0];
    if (guard)
      advice.push({
        severity: "warn", problem: `${pct(m.falseBlocks, 1)} of real users are wrongly blocked.`, nodeId: guard.id,
        why: "A strict threshold flags harmless prompts that merely look unusual.",
        fix: "Raise the block threshold a little, or use a more precise detector.",
        tradeoff: "More attacks slip through.",
        action: { kind: "config", nodeId: guard.id, patch: { threshold: Math.min(0.95, Math.round((cfgNum(resolveConfig(guard), "threshold") + 0.15) * 20) / 20) }, label: "Loosen threshold" },
      });
  }

  // Retrieval and quality.
  const firstLlm = firstOnPath(g, (n) => isLlm(n.kind));
  if (grounded >= 0.3 && firstLlm && !has(g, "retriever")) {
    const entry = modelEntry(g) ?? firstLlm;
    advice.push({
      severity: "warn", problem: `${pct(grounded)} of questions are about your documents, but nothing retrieves them.`, nodeId: entry.id,
      why: "The model never saw your documents, so on those questions it guesses - confidently.",
      fix: "Add a retriever before the model (RAG).",
      tradeoff: "Retrieved chunks make every prompt longer: more input cost and a slower first token.",
      action: { kind: "insertBefore", nodeId: entry.id, nodeKind: "retriever", label: "Add retriever" },
    });
  } else if (grounded >= 0.3 && firstLlm && g.nodes.some((n) => n.kind === "retriever") && !g.nodes.some((n) => n.kind === "retriever" && (r.nodes[n.id]?.load ?? 0) > 0)) {
    advice.push({ severity: "warn", problem: "The retriever isn't on the request path, so no context is added.", why: "Retrieval only helps if requests pass through it before reaching the model.", fix: "Wire it between the users (or guardrail) and the model.", tradeoff: "Adds ~20-40 ms per request." });
  }
  for (const n of g.nodes.filter((x) => x.kind === "retriever" && (r.nodes[x.id]?.load ?? 0) > 0)) {
    const c = resolveConfig(n);
    const nr = r.nodes[n.id];
    const reranked = kids(g, n.id).some((k) => byId(g, k)?.kind === "reranker");
    if ((nr.extra.recall ?? 1) < 0.85 && grounded > 0)
      advice.push({
        severity: "warn", problem: `${title(n.id)} finds the right chunk only ${pct(nr.extra.recall ?? 0)} of the time.`, nodeId: n.id,
        why: `With top-k = ${cfgNum(c, "topK")} the relevant chunk is often just outside the results.`,
        fix: reranked ? "Retrieve more candidates; the reranker will keep only the best." : "Retrieve more (higher top-k) - ideally with a reranker so the prompt stays short.",
        tradeoff: "More chunks = longer prompts (cost, TTFT) unless a reranker trims them.",
        action: { kind: "config", nodeId: n.id, patch: { topK: reranked ? 40 : Math.min(10, cfgNum(c, "topK") + 4) }, label: reranked ? "Retrieve 40 candidates" : `Top-k ${Math.min(10, cfgNum(c, "topK") + 4)}` },
      });
    if (!reranked && cfgNum(c, "topK") > 10)
      advice.push({
        severity: "info", problem: `${title(n.id)} stuffs ${cfgNum(c, "topK")} chunks into every prompt.`, nodeId: n.id,
        why: "Long, noisy contexts cost more and models use the middle of long contexts poorly.",
        fix: "Add a reranker after it to keep only the best few chunks.",
        tradeoff: "The reranker adds ~30 ms + ~1 ms per candidate.",
        action: { kind: "insertAfter", nodeId: n.id, nodeKind: "reranker", label: "Add reranker" },
      });
  }
  for (const n of g.nodes.filter((x) => x.kind === "semantic-cache")) {
    const nr = r.nodes[n.id];
    const c = resolveConfig(n);
    if ((nr?.extra.falseHitRate ?? 0) > 0.05)
      advice.push({
        severity: "warn", problem: `${pct(nr.extra.falseHitRate)} of cache hits answer a different question.`, nodeId: n.id,
        why: "The similarity threshold is loose, so merely similar questions get reused answers.",
        fix: "Raise the similarity threshold.",
        tradeoff: "Fewer hits, so higher cost.",
        action: { kind: "config", nodeId: n.id, patch: { similarity: Math.min(0.99, Math.round((cfgNum(c, "similarity") + 0.05) * 100) / 100) }, label: "Raise similarity" },
      });
  }
  // Small model answering hard queries.
  for (const n of g.nodes.filter((x) => x.kind === "router")) {
    const c = resolveConfig(n);
    if (m.quality < 0.8 && hard > 0.2 && cfgNum(c, "threshold") < 0.8)
      advice.push({
        severity: "info", problem: "Quality is lowish: the router sends a fair number of hard questions to the small model.", nodeId: n.id,
        why: "The router only uses the small model when it is confident a query is easy - at a low threshold it's often wrong.",
        fix: "Raise the confidence threshold.",
        tradeoff: "More traffic on the large model costs more.",
        action: { kind: "config", nodeId: n.id, patch: { threshold: Math.min(0.95, Math.round((cfgNum(c, "threshold") + 0.15) * 20) / 20) }, label: "Raise threshold" },
      });
  }

  // Cost.
  const apiNodes = g.nodes.filter((n) => n.kind === "llm-api" && (r.nodes[n.id]?.load ?? 0) > 0);
  if (!has(g, "semantic-cache") && repeat >= 0.25 && m.costPerMonth > 1000) {
    const entry = firstOnPath(g, (n) => n.kind === "retriever" || n.kind === "router" || n.kind === "fallback" || isLlm(n.kind) || n.kind === "agent");
    if (entry && entry.kind !== "agent")
      advice.push({
        severity: "info", problem: `About ${pct(repeat)} of questions are repeats, and each one pays for a full model call.`, nodeId: entry.id,
        why: "A semantic cache answers near-duplicates in ~15 ms for almost nothing.",
        fix: "Add a semantic cache in front of the model (and retrieval).",
        tradeoff: "Loose matching returns wrong answers (false hits), and cached answers can go stale.",
        action: { kind: "insertBefore", nodeId: entry.id, nodeKind: "semantic-cache", label: "Add semantic cache" },
      });
  }
  for (const n of apiNodes) {
    const c = resolveConfig(n);
    if (!cfgBool(c, "promptCache") && promptTok + 0 >= 1500 && (r.nodes[n.id]?.costPerMonth ?? 0) > 500)
      advice.push({
        severity: "info", problem: `${title(n.id)} re-reads a long prompt prefix on every call.`, nodeId: n.id,
        why: "System prompts, tool definitions and few-shot examples are identical across calls.",
        fix: "Turn on prompt caching: cached input tokens cost ~90% less and prefill faster.",
        tradeoff: "Only the shared prefix benefits; keep it stable (no timestamps at the top!).",
        action: { kind: "config", nodeId: n.id, patch: { promptCache: true }, label: "Turn on prompt caching" },
      });
  }
  const larges = apiNodes.filter((n) => apiModel(resolveConfig(n).model).id === "large");
  if (larges.length && !has(g, "router") && hard < 0.5 && m.costPerMonth > 2000) {
    const n = larges[0];
    advice.push({
      severity: "info", problem: `Every request uses the large model, though only ${pct(hard)} are hard.`, nodeId: n.id,
      why: "Easy questions get nearly the same answer from a much cheaper model.",
      fix: "Add a router with a small model for easy queries - or try the medium model for everything.",
      tradeoff: "Routing mistakes send some hard questions to the weak model (lower quality).",
      action: { kind: "config", nodeId: n.id, patch: { model: "medium" }, label: "Try the medium model" },
    });
  }
  // Idle GPUs.
  for (const n of g.nodes.filter((x) => x.kind === "llm-selfhost")) {
    const nr = r.nodes[n.id];
    const c = resolveConfig(n);
    if (nr && !nr.down && nr.util < 0.3 && cfgNum(c, "replicas") > 1)
      advice.push({
        severity: "info", problem: `${title(n.id)}'s GPUs are only ${pct(nr.util)} busy.`, nodeId: n.id,
        why: "Self-hosted GPUs cost the same per hour whether they're busy or idle.",
        fix: "Use fewer replicas (keep one spare for failures and spikes).",
        tradeoff: "Less headroom for spikes.",
        action: { kind: "config", nodeId: n.id, patch: { replicas: Math.max(1, Math.ceil(cfgNum(c, "replicas") * nr.util / 0.6)) }, label: "Fewer replicas" },
      });
  }

  // Latency / TTFT.
  if (m.successRate > 0 && m.ttftP99Ms > 2000) {
    const judge = g.nodes.find((n) => (n.kind === "input-guardrail" || n.kind === "output-guardrail") && cfgStr(resolveConfig(n), "model") === "llm-judge");
    if (!streaming)
      advice.push({ severity: "info", problem: `Users wait ${fmtMs(m.ttftP99Ms)} (p99) before seeing anything.`, why: "Without streaming the whole answer must finish first.", fix: "Turn on streaming in the Users node, if the client can render partial answers.", tradeoff: "Streamed answers can't be fully checked before the user sees them." });
    else if (judge)
      advice.push({
        severity: "info", problem: `p99 time to first token is ${fmtMs(m.ttftP99Ms)}.`, nodeId: judge.id,
        why: "The LLM-judge guardrail adds a whole model call before the first token.",
        fix: "Use a small classifier instead.", tradeoff: "Slightly lower recall on clever attacks.",
        action: { kind: "config", nodeId: judge.id, patch: { model: "classifier" }, label: "Use a classifier" },
      });
  }

  // Agents.
  for (const n of g.nodes.filter((x) => x.kind === "agent")) {
    const nr = r.nodes[n.id];
    const c = resolveConfig(n);
    if (nr && (nr.extra.taskSuccess ?? 1) < 0.9 && nr.load > 0)
      advice.push({
        severity: "warn", problem: `Only ${pct(nr.extra.taskSuccess ?? 0)} of agent tasks succeed.`, nodeId: n.id,
        why: `Success compounds: ${pct(cfgNum(c, "stepSuccess"))} per step over ${cfgNum(c, "steps")} steps is ${pct(Math.pow(cfgNum(c, "stepSuccess"), cfgNum(c, "steps")))} before tool and model errors.`,
        fix: cfgNum(c, "retries") < 2 ? "Retry failed steps (validate tool calls and try again), or redesign the task to need fewer steps." : "Use fewer steps: combine tools, or give the model better instructions.",
        tradeoff: "Retries cost extra model calls and add latency.",
        action: cfgNum(c, "retries") < 2 ? { kind: "config", nodeId: n.id, patch: { retries: cfgNum(c, "retries") + 1 }, label: "Retry failed steps" } : { kind: "config", nodeId: n.id, patch: { steps: Math.max(1, cfgNum(c, "steps") - 1) }, label: "One step fewer" },
      });
  }

  // Agent reliability over repeated tries.
  if (m.taskSuccessPassK !== undefined && m.taskSuccessPassK < 0.7) {
    const ag = g.nodes.find((n) => n.kind === "agent" && (r.nodes[n.id]?.load ?? 0) > 0);
    if (ag)
      advice.push({
        severity: "info", problem: `pass^3 is only ${pct(m.taskSuccessPassK)}: a task tried three times succeeds all three times that rarely.`, nodeId: ag.id,
        why: `Per-task success of ${pct(r.nodes[ag.id]?.extra.taskSuccess ?? 0)} sounds fine for one attempt, but users repeat tasks and every attempt must work. pass^k = (task success)^k falls fast with k, which is why agent benchmarks such as τ-bench report it alongside pass@1.`,
        fix: "Raise per-step success or cut steps (fewer, better tools), retry steps whose failure you can detect, and evaluate with repeated trials before shipping.",
        tradeoff: "Retries and verification cost extra model calls; fewer steps may need a stronger model.",
      });
  }

  // Eval gates.
  const gates = g.nodes.filter((n) => n.kind === "eval-gate");
  for (const n of gates) {
    const c = resolveConfig(n);
    const e = evalGateModel(c);
    const ownsModel = r.issues.every((i) => i.nodeId !== n.id);
    if (!ownsModel) {
      const entry = modelEntry(g);
      advice.push({
        severity: "warn", problem: `${title(n.id)} isn't wired in front of a model, so it protects nothing.`, nodeId: n.id,
        why: "A gate checks the releases of the models downstream of it. Unwired, a bad model version goes straight to users.",
        fix: entry ? `Wire ${title(n.id)} → ${title(entry.id)} (or put it on the path just before the model).` : "Wire it to the model whose releases it checks.",
        tradeoff: "None - it adds no latency on the request path.",
      });
      continue;
    }
    if (e.catchRate < 0.85)
      advice.push({
        severity: "info", problem: `${title(n.id)} would stop only ${pct(e.catchRate)} of bad model versions.`, nodeId: n.id,
        why: `With ${cfgNum(c, "evalSetSize")} items the measured score moves by about ±${e.seDropPp.toFixed(1)} points from run to run, so a real ${e.judge.coverage < 1 ? "but partly invisible " : ""}regression often stays under the ${cfgNum(c, "threshold")}-point threshold${e.judge.coverage < 1 ? `, and ${e.judge.label.toLowerCase()} only see about ${pct(e.judge.coverage)} of what goes wrong` : ""}.`,
        fix: e.judge.coverage < 1 ? "Add an LLM judge to the assertions, or grow the eval set." : "Grow the eval set (less noise) or lower the threshold a little.",
        tradeoff: `Every candidate version runs the whole set: ${fmtUsd(e.monthly)}/month now. A lower threshold also blocks more good releases (${pct(e.falseAlarm)} today).`,
        action: { kind: "config", nodeId: n.id, patch: { evalSetSize: Math.min(5000, cfgNum(c, "evalSetSize") * 2) }, label: `Use ${Math.min(5000, cfgNum(c, "evalSetSize") * 2)} eval items` },
      });
    else if (e.falseAlarm > 0.2)
      advice.push({
        severity: "info", problem: `${title(n.id)} blocks ${pct(e.falseAlarm)} of perfectly good releases.`, nodeId: n.id,
        why: `The ${cfgNum(c, "threshold")}-point threshold sits inside the run-to-run noise (±${e.seDropPp.toFixed(1)} points), so chance dips trip it. Engineers learn to override a gate that cries wolf.`,
        fix: "Raise the threshold a little, or grow the eval set so the noise shrinks.",
        tradeoff: "A higher threshold lets smaller regressions through; a bigger set costs more per run.",
        action: { kind: "config", nodeId: n.id, patch: { threshold: Math.min(10, cfgNum(c, "threshold") + 1) }, label: `Block at > ${Math.min(10, cfgNum(c, "threshold") + 1)} pp` },
      });
    if (cfgStr(c, "judge") === "human" && e.monthly > 2000)
      advice.push({
        severity: "info", problem: `Human review of every candidate costs ${fmtUsd(e.monthly)}/month.`, nodeId: n.id,
        why: "People are the most accurate graders but grade every item of every run.",
        fix: "Use an LLM judge calibrated against a small human-labelled sample, and keep humans for spot checks.",
        tradeoff: "An LLM judge is noisier and has its own biases; re-check its agreement with humans regularly.",
        action: { kind: "config", nodeId: n.id, patch: { judge: "llm-judge" }, label: "Grade with an LLM judge" },
      });
  }
  if (r.incident.type === "badRollout" && !gates.length) {
    const entry = modelEntry(g);
    if (entry)
      advice.push({
        severity: "warn", problem: "A worse model version went live and nothing checked it before release.", nodeId: entry.id,
        why: "Error rates and latency look normal, so no alarm fires: only answer quality dropped. Online evals notice later; offline evals in CI can stop it before any user sees it.",
        fix: "Add an Eval gate in front of the model: every new version must pass the golden eval set before it deploys.",
        tradeoff: "Each candidate pays for an eval run, and a too-tight threshold blocks good releases by chance.",
        action: { kind: "insertBefore", nodeId: entry.id, nodeKind: "eval-gate", label: "Add an eval gate" },
      });
  }

  // Ops.
  if (!has(g, "observability") && g.nodes.some((n) => isLlm(n.kind)))
    advice.push({
      severity: "info", problem: "There's no observability: in production you'd be flying blind.",
      why: "These per-node numbers exist only in the sandbox. Without tracing and evals you can't see where latency and money go, or notice that answers got worse.",
      fix: "Add Observability & evals (it's off the request path - no latency).",
      tradeoff: "Tracing storage and judge calls for evals cost money.",
    });

  const order = { bad: 0, warn: 1, info: 2 };
  advice.sort((a, b) => order[a.severity] - order[b.severity]);
  const bad = advice.some((a) => a.severity === "bad");
  const tone: Guide["tone"] = m.successRate >= 0.99 && !bad ? (advice.some((a) => a.severity === "warn") ? "warn" : "good") : m.successRate >= 0.95 && !bad ? "warn" : "bad";
  const headline =
    m.benignRps <= 0 && m.attackRps <= 0
      ? "No traffic is flowing. Add Users (with requests/s above zero) and wire them in."
      : m.successRate === 0
        ? "Nothing gets answered. Fix the problems below."
        : `${pct(m.successRate, m.successRate > 0.99 ? 2 : 0)} answered, p99 ${fmtMs(m.p99Ms)}${streaming ? ` (first token ${fmtMs(m.ttftP99Ms)})` : ""}, ${fmtUsd(m.costPerMonth)}/month, quality ${m.quality.toFixed(2)}${m.attackRps > 0 ? `, ${pct(m.attacksLeaked, 1)} of attacks leaked` : ""}.`;
  return { tone, headline, path, advice };
}

// ---------------------------------------------------------------- what if

export function whatIfs(g: Graph, traffic: Traffic = {}, base?: RunResult): WhatIf[] {
  const b = base ?? run(g, traffic);
  const make = (id: WhatIf["id"], scenario: string, r: RunResult, note: (r: RunResult) => string): WhatIf => {
    const drop = b.metrics.successRate - r.metrics.successRate;
    const tone: WhatIf["tone"] = r.metrics.successRate >= 0.99 ? "good" : r.metrics.successRate >= 0.9 || drop < 0.02 ? "warn" : "bad";
    return { id, scenario, successRate: r.metrics.successRate, p99Ms: r.metrics.p99Ms, costPerMonth: r.metrics.costPerMonth, quality: r.metrics.quality, verdict: note(r), tone };
  };
  const out: WhatIf[] = [];
  const x2 = run(g, { ...traffic, scale: (traffic.scale ?? 1) * 2 });
  out.push(make("traffic-x2", "Traffic doubles", x2, (r) => {
    const hot = Object.values(r.nodes).filter((n) => n.util > 1).map((n) => { const node = byId(g, n.id); return node ? nodeTitle(node, g.nodes) : n.id; });
    return hot.length
      ? `${hot.join(", ")} ${hot.length > 1 ? "run" : "runs"} out of capacity: ${pct(r.metrics.successRate)} answered. Leave headroom or autoscale.`
      : `Still fine: ${pct(r.metrics.successRate, 1)} answered, p99 ${fmtMs(r.metrics.p99Ms)}, cost ${fmtUsd(r.metrics.costPerMonth)}/month.`;
  }));
  const providers = [...new Set(g.nodes.filter((n) => n.kind === "llm-api").map((n) => cfgStr(resolveConfig(n), "provider")))];
  if (providers.length) {
    const p = providers.includes("a") ? "a" : providers[0];
    const down = run(g, traffic, { type: "providerOutage", provider: p });
    out.push(make("provider-down", `Provider ${p.toUpperCase()} goes down`, down, (r) =>
      r.metrics.successRate >= 0.99 ? `Survives: the fallback takes over (${pct(r.metrics.successRate, 1)} answered).` : r.metrics.successRate > 0 ? `Only ${pct(r.metrics.successRate)} answered - part of the traffic has no working model.` : "Everything fails: no backup on another provider."));
  } else {
    out.push({ id: "provider-down", scenario: "A provider goes down", successRate: b.metrics.successRate, p99Ms: b.metrics.p99Ms, costPerMonth: b.metrics.costPerMonth, quality: b.metrics.quality, verdict: "No hosted APIs - self-hosted models don't depend on a provider (but a GPU failure would hurt).", tone: "good" });
  }
  if (has(g, "semantic-cache")) {
    const flushed = run(g, traffic, { type: "cacheFlush" });
    out.push(make("cache-flushed", "Cache is flushed", flushed, (r) =>
      r.metrics.successRate < b.metrics.successRate - 0.01
        ? `Every request hits the model at once: only ${pct(r.metrics.successRate)} answered until the cache refills. Size the model for a cold cache.`
        : `Survives a cold cache; cost rises to ${fmtUsd(r.metrics.costPerMonth)}/month until it refills.`));
  } else {
    out.push({ id: "cache-flushed", scenario: "Cache is flushed", successRate: b.metrics.successRate, p99Ms: b.metrics.p99Ms, costPerMonth: b.metrics.costPerMonth, quality: b.metrics.quality, verdict: "No semantic cache, so nothing changes.", tone: "good" });
  }
  return out;
}

// ---------------------------------------------------------------- timeline

export function explainTimeline(s: TimelineSummary, incident: Incident): string {
  const name = incidentLabel(incident);
  const parts: string[] = [`At t=${TIMELINE.at}s: ${name}.`];
  if (incident.type === "badRollout") {
    parts.push(`Success stays at ${pct(s.worstSuccess)} - no error alarm fires - but quality falls to ${s.worstQuality.toFixed(2)}.`);
    parts.push(s.rolledBackAt !== null ? `Online evals noticed after ${s.rolledBackAt}s and it was rolled back.` : "Nothing measures answer quality, so it stays broken until users complain. Add Observability with evals.");
    return parts.join(" ");
  }
  if (s.worstSuccess >= 0.99) parts.push(`The design absorbs it: success never drops below ${pct(s.worstSuccess, 1)}.`);
  else {
    parts.push(`Success falls to ${pct(s.worstSuccess)} and about ${Math.round(s.failedRequests).toLocaleString("en-US")} requests fail.`);
    parts.push(s.recoverySeconds === null ? "It hasn't recovered by the end of the minute." : `It recovers ${s.recoverySeconds}s after the incident started${incident.type === "cacheFlush" ? " as the cache refills" : ""}.`);
  }
  if (s.leakedAttacks > 1) parts.push(`${Math.round(s.leakedAttacks)} attacks got answers during the minute.`);
  if (s.costRatio > 1.1) parts.push(`The minute cost ${s.costRatio.toFixed(1)}× a normal one.`);
  return parts.join(" ");
}
