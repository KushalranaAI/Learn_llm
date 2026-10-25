// Component catalog: what each sandbox component is, its config fields (ranges, defaults, help) and the
// physical tables (model tiers, GPUs) the engine uses. Pure data - no React, safe for server components.
import type { ConfigValue, NodeConfig, NodeKind, SandboxNode } from "./types";

export type FieldDef =
  | {
      key: string;
      label: string;
      type: "number";
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: string;
      /** show as a percentage (value is 0..1) */
      percent?: boolean;
      /** log-scale slider */
      log?: boolean;
      help: string;
    }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[]; default: string; help: string }
  | { key: string; label: string; type: "boolean"; default: boolean; help: string };

export type KindGroup = "Traffic" | "Edge" | "Models" | "Retrieval" | "Safety" | "Agents" | "Ops";

export interface KindDef {
  kind: NodeKind;
  label: string;
  /** icon name (components/ui/Icon.tsx or sandbox/icons.tsx) */
  icon: string;
  group: KindGroup;
  /** one line, shown in the palette */
  description: string;
  /** a short paragraph, shown in the inspector */
  help: string;
  /** can receive requests (users can't) */
  hasInput: boolean;
  fields: FieldDef[];
}

// ---------------------------------------------------------------- physical tables

export interface ApiModel {
  id: "small" | "medium" | "large";
  label: string;
  /** $ per 1M input / output tokens */
  priceIn: number;
  priceOut: number;
  /** base time to first token (ms) and prefill ms per 1k prompt tokens */
  ttftMs: number;
  prefillMsPer1k: number;
  /** decode speed per stream */
  tokensPerSec: number;
  quality: { easy: number; hard: number };
  tier: number;
}

export const API_MODELS: ApiModel[] = [
  { id: "small", label: "Small (fast, cheap)", priceIn: 0.15, priceOut: 0.6, ttftMs: 250, prefillMsPer1k: 20, tokensPerSec: 150, quality: { easy: 0.86, hard: 0.5 }, tier: 0 },
  { id: "medium", label: "Medium (balanced)", priceIn: 3, priceOut: 15, ttftMs: 450, prefillMsPer1k: 50, tokensPerSec: 80, quality: { easy: 0.91, hard: 0.74 }, tier: 1 },
  { id: "large", label: "Large (frontier)", priceIn: 15, priceOut: 75, ttftMs: 800, prefillMsPer1k: 100, tokensPerSec: 40, quality: { easy: 0.94, hard: 0.88 }, tier: 2 },
];
export const apiModel = (id: unknown) => API_MODELS.find((m) => m.id === id) ?? API_MODELS[1];

export interface Gpu {
  id: string;
  label: string;
  memGB: number;
  /** HBM bandwidth, GB/s */
  bandwidthGBs: number;
  /** dense bf16 TFLOP/s */
  tflops: number;
  pricePerHour: number;
}

export const GPUS: Gpu[] = [
  { id: "L4", label: "L4 · 24 GB", memGB: 24, bandwidthGBs: 300, tflops: 121, pricePerHour: 0.8 },
  { id: "A10G", label: "A10G · 24 GB", memGB: 24, bandwidthGBs: 600, tflops: 125, pricePerHour: 1.2 },
  { id: "A100", label: "A100 · 80 GB", memGB: 80, bandwidthGBs: 2000, tflops: 312, pricePerHour: 3 },
  { id: "H100", label: "H100 · 80 GB", memGB: 80, bandwidthGBs: 3350, tflops: 990, pricePerHour: 4.5 },
];
export const gpu = (id: unknown) => GPUS.find((g) => g.id === id) ?? GPUS[1];

export interface OpenModel {
  id: string;
  label: string;
  /** billions of parameters */
  paramsB: number;
  /** KV cache bytes per token (fp16, grouped-query attention) */
  kvBytesPerToken: number;
  quality: { easy: number; hard: number };
  tier: number;
}

export const OPEN_MODELS: OpenModel[] = [
  { id: "8B", label: "8B open model", paramsB: 8, kvBytesPerToken: 131_072, quality: { easy: 0.84, hard: 0.45 }, tier: 0 },
  { id: "70B", label: "70B open model", paramsB: 70, kvBytesPerToken: 327_680, quality: { easy: 0.9, hard: 0.72 }, tier: 1 },
];
export const openModel = (id: unknown) => OPEN_MODELS.find((m) => m.id === id) ?? OPEN_MODELS[0];

export const QUANT: Record<string, { bytes: number; quality: number; label: string }> = {
  fp16: { bytes: 2, quality: 1, label: "FP16 (no quantization)" },
  int8: { bytes: 1, quality: 0.995, label: "INT8 weights" },
  int4: { bytes: 0.5, quality: 0.97, label: "INT4 weights" },
};

export const PROVIDERS = [
  { value: "a", label: "Provider A" },
  { value: "b", label: "Provider B" },
  { value: "c", label: "Provider C" },
];

export const GUARD_MODELS: Record<string, { label: string; recallScale: number; recallPow: number; fprScale: number; latencyMs: number; costPerReq: number }> = {
  rules: { label: "Rules / regex", recallScale: 0.6, recallPow: 3, fprScale: 0.5, latencyMs: 2, costPerReq: 0 },
  classifier: { label: "Small classifier", recallScale: 1, recallPow: 3, fprScale: 1, latencyMs: 30, costPerReq: 0.00001 },
  "llm-judge": { label: "LLM judge", recallScale: 1, recallPow: 5, fprScale: 0.6, latencyMs: 350, costPerReq: 0.0004 },
};

export const INDEXES: Record<string, { label: string; recallFactor: number }> = {
  flat: { label: "Flat (exact)", recallFactor: 1 },
  hnsw: { label: "HNSW graph", recallFactor: 0.97 },
  "ivf-pq": { label: "IVF-PQ (compressed)", recallFactor: 0.88 },
};

// ---------------------------------------------------------------- component definitions

const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  def: number,
  help: string,
  extra: { unit?: string; percent?: boolean; log?: boolean } = {},
): FieldDef => ({ key, label, type: "number", min, max, step, default: def, help, ...extra });
const sel = (key: string, label: string, options: { value: string; label: string }[], def: string, help: string): FieldDef => ({
  key, label, type: "select", options, default: def, help,
});
const bool = (key: string, label: string, def: boolean, help: string): FieldDef => ({ key, label, type: "boolean", default: def, help });

const guardFields = (def: number, place: string): FieldDef[] => [
  sel("model", "Detector", Object.entries(GUARD_MODELS).map(([value, g]) => ({ value, label: g.label })), "classifier",
    "Rules are free and instant but miss most attacks. A small classifier is the usual choice. An LLM judge catches the most but adds ~350 ms and a model call."),
  num("threshold", "Block threshold", 0.05, 0.95, 0.05, def,
    `Block when the detector's score is at or above this. Lower = stricter: more attacks caught (recall), but more good ${place} wrongly blocked (false positives).`),
];

export const KINDS: Record<NodeKind, KindDef> = {
  users: {
    kind: "users", label: "Users", icon: "user", group: "Traffic", hasInput: false,
    description: "Where requests come from: rate, prompt sizes and the mix of queries.",
    help: "The traffic source. Every request carries a prompt and expects an answer. Easy questions can be handled by a small model; hard ones need a big one. Some share may be prompt-injection attacks, and some questions need your private documents (grounded).",
    fields: [
      num("rps", "Requests / second", 0.1, 5000, 0.1, 5, "Average requests per second.", { log: true, unit: "rps" }),
      num("promptTokens", "Prompt tokens", 50, 20000, 50, 800, "Average input tokens per request (system prompt + history + question, before retrieval).", { log: true }),
      num("outputTokens", "Output tokens", 20, 4000, 10, 300, "Average tokens the model writes per answer.", { log: true }),
      num("hardShare", "Hard queries", 0, 1, 0.05, 0.3, "Share of questions that need a strong model (reasoning, multi-step).", { percent: true }),
      num("groundedShare", "Need private docs", 0, 1, 0.05, 0, "Share of questions only answerable from your own documents. Without retrieval the model guesses (hallucinates) on these.", { percent: true }),
      num("repeatShare", "Repeated questions", 0, 0.9, 0.05, 0.2, "Share of questions that are near-duplicates of earlier ones - the most a semantic cache could ever hit.", { percent: true }),
      num("attackShare", "Attacks", 0, 0.5, 0.01, 0, "Share of requests that are prompt-injection / jailbreak attempts.", { percent: true }),
      num("tenants", "Tenants", 1, 1000, 1, 20, "Number of customer accounts sending traffic.", { log: true }),
      num("topTenantShare", "Noisiest tenant", 0.01, 0.9, 0.01, 0.2, "Share of all traffic from the single busiest tenant.", { percent: true }),
      num("timeoutMs", "Client timeout", 1000, 120000, 1000, 60000, "Users give up (and the request counts as failed) after this long.", { unit: "ms", log: true }),
      bool("streaming", "Streaming", true, "Stream tokens as they are generated: users see the first token (TTFT) long before the answer finishes."),
    ],
  },
  gateway: {
    kind: "gateway", label: "LLM gateway", icon: "shield", group: "Edge", hasInput: true,
    description: "Auth, per-tenant rate limits and a token budget in front of everything.",
    help: "A gateway is the front door: it authenticates callers, stops one tenant from eating everyone's capacity, and caps output tokens so a runaway request can't cost a fortune. Adds ~5 ms.",
    fields: [
      bool("auth", "Require API keys", true, "Reject anonymous calls. Stops scripted attacks from unauthenticated sources (~30% of attack traffic), not attacks from real users."),
      num("perTenantRps", "Per-tenant limit", 0, 1000, 1, 0, "Max requests/s per tenant (0 = off). Requests over the limit get HTTP 429 - they fail, but they can't overload the model for everyone else.", { unit: "rps" }),
      num("maxOutputTokens", "Max output tokens", 0, 4000, 10, 0, "Cap on tokens generated per answer (0 = off). Cuts cost and latency, but answers that needed more get truncated (lower quality)."),
    ],
  },
  router: {
    kind: "router", label: "Model router", icon: "route", group: "Models", hasInput: true,
    description: "Sends easy queries to a cheap model and hard ones to a strong model.",
    help: "Wire two or more model paths out of the router. A small classifier scores each query; when it is confident the query is easy (score ≥ threshold) it goes to the cheapest path, otherwise to the strongest. Lower threshold = more traffic on the cheap model (cheaper, but some hard queries get a weak answer). Adds ~20 ms.",
    fields: [
      num("threshold", "Confidence threshold", 0, 1, 0.05, 0.6, "How sure the router must be that a query is easy before sending it to the small model."),
    ],
  },
  "semantic-cache": {
    kind: "semantic-cache", label: "Semantic cache", icon: "database", group: "Models", hasInput: true,
    description: "Answers repeated questions from earlier answers, skipping the model.",
    help: "Embeds each question and looks for a previous one that is similar enough. A hit returns the stored answer in ~15 ms for almost nothing. A looser similarity threshold hits more often, but sometimes returns the answer to a different question (a false hit) - quality drops.",
    fields: [
      num("similarity", "Similarity threshold", 0.7, 0.99, 0.01, 0.9, "How similar a new question must be to a cached one to reuse its answer."),
    ],
  },
  "input-guardrail": {
    kind: "input-guardrail", label: "Input guardrail", icon: "filter", group: "Safety", hasInput: true,
    description: "Screens prompts for injection and jailbreaks before the model sees them.",
    help: "A detector scores every prompt. Attacks above the threshold are blocked before they reach the model. Every detector has false positives: some legitimate prompts get blocked too.",
    fields: guardFields(0.5, "prompts"),
  },
  "output-guardrail": {
    kind: "output-guardrail", label: "Output guardrail", icon: "eye", group: "Safety", hasInput: true,
    description: "Checks model answers for leaks and policy violations before users see them.",
    help: "Place it after the model. It checks each answer (with streaming, the first chunks) and withholds unsafe ones - including attacks that slipped past the input guardrail. Adds its latency to TTFT.",
    fields: guardFields(0.5, "answers"),
  },
  retriever: {
    kind: "retriever", label: "Retriever (vector DB)", icon: "search", group: "Retrieval", hasInput: true,
    description: "Finds the top-k relevant document chunks and adds them to the prompt.",
    help: "Embeds the question and searches a vector index. More chunks (top-k) means the right one is more likely included (recall), but the prompt gets longer (cost, prefill time) and noisier. HNSW is the usual index; flat is exact but slow on big corpora; IVF-PQ is compact and fast but less accurate.",
    fields: [
      num("topK", "Top-k chunks", 1, 100, 1, 5, "Chunks returned per query."),
      sel("index", "Index type", Object.entries(INDEXES).map(([value, i]) => ({ value, label: i.label })), "hnsw", "How the vectors are searched."),
      num("docsMillions", "Corpus (M chunks)", 0.01, 100, 0.01, 1, "Size of the index in millions of chunks.", { log: true }),
      num("chunkTokens", "Chunk size (tokens)", 100, 1000, 50, 300, "Tokens per chunk added to the prompt."),
      num("replicas", "Replicas", 1, 8, 1, 1, "Index replicas sharing the query load."),
    ],
  },
  reranker: {
    kind: "reranker", label: "Reranker", icon: "list", group: "Retrieval", hasInput: true,
    description: "Re-scores retrieved chunks with a cross-encoder and keeps the best few.",
    help: "Place it after the retriever. It reads each candidate together with the question (much more accurate than vector similarity) and keeps only the top few - better context in fewer tokens. Costs ~30 ms + ~1.2 ms per candidate.",
    fields: [
      num("depth", "Candidates reranked", 5, 200, 5, 50, "How many retrieved chunks to score (capped by the retriever's top-k)."),
      num("keep", "Chunks kept", 1, 20, 1, 4, "How many of the best chunks go into the prompt."),
    ],
  },
  "llm-api": {
    kind: "llm-api", label: "LLM API", icon: "sparkles", group: "Models", hasInput: true,
    description: "A hosted model: pay per token, limited by the provider's rate limit.",
    help: "A model behind a provider's API. You pay per input and output token. The provider enforces a rate limit (excess calls fail with 429) and has occasional errors. Latency = time to first token (grows with prompt length) + output tokens ÷ decode speed.",
    fields: [
      sel("model", "Model tier", API_MODELS.map((m) => ({ value: m.id, label: `${m.label} · $${m.priceIn}/$${m.priceOut} per 1M` })), "medium", "Bigger models answer hard questions better but cost more and are slower."),
      sel("provider", "Provider", PROVIDERS, "a", "Which provider hosts it. An outage takes down every node on that provider - a fallback only helps if it is on a different one."),
      num("rateLimitRps", "Rate limit", 1, 2000, 1, 100, "Requests/s your account may send. Over the limit, calls fail.", { log: true, unit: "rps" }),
      num("availability", "Availability", 0.9, 1, 0.0005, 0.999, "Share of calls that succeed on a normal day.", { percent: true }),
      bool("promptCache", "Prompt caching", false, "Reuse the provider-side cache for the shared prompt prefix (~50% of input): those tokens cost 90% less and prefill faster."),
    ],
  },
  "llm-selfhost": {
    kind: "llm-selfhost", label: "Self-hosted LLM", icon: "cpu", group: "Models", hasInput: true,
    description: "An open model on your own GPUs: fixed hourly cost, you own capacity.",
    help: "Decoding is memory-bound: each step streams all weights from GPU memory, so one stream gets ≈ bandwidth ÷ weight bytes tokens/s. Batching many requests into each step multiplies throughput almost for free, until compute or KV-cache memory (one cache per active request) runs out. Over capacity, requests queue and time out.",
    fields: [
      sel("model", "Open model", OPEN_MODELS.map((m) => ({ value: m.id, label: m.label })), "8B", "Bigger models are smarter but need more memory and bandwidth per token."),
      sel("gpu", "GPU", GPUS.map((g) => ({ value: g.id, label: `${g.label} · $${g.pricePerHour}/h` })), "A10G", "Memory decides what fits; bandwidth decides tokens/s; price decides your bill."),
      sel("quantization", "Quantization", Object.entries(QUANT).map(([value, q]) => ({ value, label: q.label })), "fp16", "Fewer bytes per weight: faster decode and more room for KV cache, with a small quality loss."),
      num("replicas", "Replicas", 1, 32, 1, 1, "Copies of the model (each on its own GPUs); load is spread across them."),
      bool("batching", "Continuous batching", true, "Run many requests through each decode step. Off = one request at a time per replica."),
      num("maxBatch", "Max batch", 1, 256, 1, 32, "Most requests decoded together (also limited by KV-cache memory).", { log: true }),
    ],
  },
  fallback: {
    kind: "fallback", label: "Fallback", icon: "repeat", group: "Models", hasInput: true,
    description: "Tries the primary path; on error or timeout, retries on the secondary.",
    help: "Wire two outputs: the first is the primary, the second the backup (swap them in the inspector). Failed or too-slow calls are retried on the backup - put it on a different provider, or an outage takes both down.",
    fields: [
      num("timeoutMs", "Timeout", 500, 60000, 100, 15000, "Give up on the primary after this long and try the backup.", { unit: "ms", log: true }),
    ],
  },
  agent: {
    kind: "agent", label: "Agent loop", icon: "workflow", group: "Agents", hasInput: true,
    description: "Plans, calls tools and the model in a loop until the task is done.",
    help: "Wire it to a model (its brain) and to tools / retrievers. Each task takes several think → act → observe steps: one model call per step plus a tool call for every step but the last. Every step can go wrong, so long tasks fail more often; retries help at the price of extra calls.",
    fields: [
      num("steps", "Steps per task", 1, 20, 1, 4, "Average model calls per task."),
      num("stepSuccess", "Step success", 0.5, 1, 0.01, 0.95, "Chance the model picks and uses the right tool correctly on a step.", { percent: true }),
      num("retries", "Retries per step", 0, 3, 1, 1, "Re-try a failed step this many times."),
    ],
  },
  tool: {
    kind: "tool", label: "Tool / API", icon: "terminal", group: "Agents", hasInput: true,
    description: "An external API an agent can call (search, database, CRM...).",
    help: "Something the agent calls: it has its own latency, failure rate, rate limit and price per call.",
    fields: [
      num("latencyMs", "Latency", 5, 5000, 5, 300, "Average time per call.", { unit: "ms", log: true }),
      num("failureRate", "Failure rate", 0, 0.5, 0.005, 0.02, "Share of calls that error.", { percent: true }),
      num("rateLimitRps", "Rate limit", 1, 2000, 1, 200, "Calls/s allowed.", { unit: "rps", log: true }),
      num("costPerCall", "Cost per call", 0, 0.05, 0.0005, 0.001, "Dollars per call.", { unit: "$" }),
    ],
  },
  observability: {
    kind: "observability", label: "Observability & evals", icon: "activity", group: "Ops", hasInput: true,
    description: "Tracing and online evals: see per-step latency, cost and quality.",
    help: "Off the request path (adds no latency). Traces every request and scores a sample of answers with an LLM judge, so you can see where time and money go and catch a bad model rollout in seconds instead of days.",
    fields: [
      bool("tracing", "Tracing", true, "Record every hop of every request."),
      bool("evals", "Online evals", true, "Score a sample of live answers with an LLM judge. Detects quality regressions (bad rollouts)."),
      num("sampleRate", "Eval sample", 0.01, 1, 0.01, 0.05, "Share of answers scored (each costs a judge call).", { percent: true }),
    ],
  },
};

export const ALL_KINDS = Object.keys(KINDS) as NodeKind[];
export const KIND_GROUPS: KindGroup[] = ["Traffic", "Edge", "Models", "Retrieval", "Safety", "Agents", "Ops"];

export const isKind = (k: unknown): k is NodeKind => typeof k === "string" && k in KINDS;

/** Catalog defaults for a kind. */
export function defaultConfig(kind: NodeKind): NodeConfig {
  const out: NodeConfig = {};
  for (const f of KINDS[kind].fields) out[f.key] = f.default;
  return out;
}

/** A node's config with defaults filled in and numbers clamped into range. */
export function resolveConfig(node: SandboxNode): NodeConfig {
  const def = KINDS[node.kind];
  const out: NodeConfig = {};
  for (const f of def.fields) {
    const v: ConfigValue | undefined = node.config?.[f.key];
    if (f.type === "number") {
      const n = typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && Number.isFinite(+v) ? +v : f.default;
      out[f.key] = Math.min(f.max, Math.max(f.min, n));
    } else if (f.type === "boolean") out[f.key] = typeof v === "boolean" ? v : v === "true" ? true : v === "false" ? false : f.default;
    else out[f.key] = typeof v === "string" && f.options.some((o) => o.value === v) ? v : f.default;
  }
  return out;
}

export const cfgNum = (c: NodeConfig, k: string) => (typeof c[k] === "number" ? (c[k] as number) : 0);
export const cfgStr = (c: NodeConfig, k: string) => String(c[k] ?? "");
export const cfgBool = (c: NodeConfig, k: string) => c[k] === true;

/** Display name: custom label, else the kind label, numbered when there are several of the same kind. */
export function nodeTitle(node: SandboxNode, all: SandboxNode[]): string {
  if (node.label) return node.label;
  const same = all.filter((n) => n.kind === node.kind);
  const base = KINDS[node.kind]?.label ?? node.kind;
  if (node.kind === "llm-api") {
    const m = apiModel(node.config?.model);
    const name = `${m.id[0].toUpperCase()}${m.id.slice(1)} model API`;
    const sameModel = same.filter((n) => apiModel(n.config?.model).id === m.id);
    return sameModel.length > 1 ? `${name} ${sameModel.indexOf(node) + 1}` : name;
  }
  if (node.kind === "llm-selfhost") {
    const m = openModel(node.config?.model);
    const sameModel = same.filter((n) => openModel(n.config?.model).id === m.id);
    return sameModel.length > 1 ? `Self-hosted ${m.id} ${sameModel.indexOf(node) + 1}` : `Self-hosted ${m.id}`;
  }
  return same.length > 1 ? `${base} ${same.indexOf(node) + 1}` : base;
}

export const isLlm = (k: NodeKind) => k === "llm-api" || k === "llm-selfhost";

/** A short config summary for node cards, e.g. "medium · provider A". */
export function nodeSubtitle(node: SandboxNode): string {
  const c = resolveConfig(node);
  const n = (k: string) => cfgNum(c, k);
  const pctS = (x: number) => `${Math.round(x * 100)}%`;
  switch (node.kind) {
    case "users": return `${n("rps")} rps · ${n("promptTokens")}→${n("outputTokens")} tok`;
    case "gateway": return [cfgBool(c, "auth") ? "auth" : "no auth", n("perTenantRps") ? `${n("perTenantRps")} rps/tenant` : "no limit", n("maxOutputTokens") ? `≤${n("maxOutputTokens")} tok` : ""].filter(Boolean).join(" · ");
    case "router": return `threshold ${n("threshold").toFixed(2)}`;
    case "semantic-cache": return `similarity ≥ ${n("similarity").toFixed(2)}`;
    case "input-guardrail":
    case "output-guardrail": return `${GUARD_MODELS[cfgStr(c, "model")]?.label ?? ""} · t=${n("threshold").toFixed(2)}`;
    case "retriever": return `top-${n("topK")} · ${cfgStr(c, "index")} · ${n("docsMillions")}M`;
    case "reranker": return `${n("depth")} → keep ${n("keep")}`;
    case "llm-api": return `${apiModel(c.model).id} · provider ${cfgStr(c, "provider").toUpperCase()} · ${n("rateLimitRps")} rps`;
    case "llm-selfhost": return `${openModel(c.model).id} ${cfgStr(c, "quantization")} · ${gpu(c.gpu).id} · ×${n("replicas")}${cfgBool(c, "batching") ? "" : " · no batching"}`;
    case "fallback": return `timeout ${n("timeoutMs") >= 1000 ? `${n("timeoutMs") / 1000} s` : `${n("timeoutMs")} ms`}`;
    case "agent": return `${n("steps")} steps · ${pctS(n("stepSuccess"))}/step`;
    case "tool": return `${n("latencyMs")} ms · ${pctS(n("failureRate"))} errors`;
    case "observability": return [cfgBool(c, "tracing") ? "tracing" : "", cfgBool(c, "evals") ? `evals ${pctS(n("sampleRate"))}` : ""].filter(Boolean).join(" · ") || "off";
  }
}
