// Shared sandbox types. The sandbox engine (sandbox/engine.ts) evaluates a Graph of LLM-system components
// under some traffic (and optionally an incident), and checks it against a DesignTest.

/** Every component a learner can place on the canvas. See sandbox/catalog.ts for configs, ranges and help. */
export type NodeKind =
  | "users"
  | "gateway"
  | "router"
  | "semantic-cache"
  | "input-guardrail"
  | "output-guardrail"
  | "retriever"
  | "reranker"
  | "llm-api"
  | "llm-selfhost"
  | "fallback"
  | "agent"
  | "tool"
  | "observability"
  | "eval-gate";

export type ConfigValue = number | string | boolean;
export type NodeConfig = Record<string, ConfigValue>;

export interface SandboxNode {
  id: string;
  kind: NodeKind;
  /** missing keys fall back to the catalog defaults */
  config?: NodeConfig;
  /** optional display name (defaults to the catalog label) */
  label?: string;
  x?: number;
  y?: number;
}

export interface SandboxEdge {
  from: string;
  to: string;
}

export interface Graph {
  nodes: SandboxNode[];
  /** Order matters for `fallback` (first outgoing edge = primary, second = secondary). */
  edges: SandboxEdge[];
}

/**
 * Overrides applied to every `users` node when running. All optional.
 * `scale` multiplies requests/s (after `rps` is applied).
 */
export interface Traffic {
  scale?: number;
  rps?: number;
  promptTokens?: number;
  outputTokens?: number;
  hardShare?: number;
  attackShare?: number;
  groundedShare?: number;
  repeatShare?: number;
  streaming?: boolean;
}

/** An incident applied at full strength by `run`, or from t=10s by the timeline. */
export type Incident =
  | { type: "none" }
  /** every llm-api node on this provider (default "a") fails all calls */
  | { type: "providerOutage"; provider?: string }
  /** requests/s × factor (default 3) */
  | { type: "trafficSpike"; factor?: number }
  /** the semantic cache is emptied (cold), then refills */
  | { type: "cacheFlush" }
  /** share of traffic that is prompt-injection attacks jumps to attackShare (default 0.2) */
  | { type: "injectionCampaign"; attackShare?: number }
  /** retriever search is factor× slower (default 10) */
  | { type: "slowVectorDb"; factor?: number }
  /** a worse model version ships to one LLM node (default: the first LLM on the request path) */
  | { type: "badRollout"; nodeId?: string };

export type IncidentType = Incident["type"];

interface ConstraintBase {
  /** shown to the learner when the check fails (and as a tooltip) */
  why?: string;
  /** custom label for the check; a sensible default is generated */
  label?: string;
  /** evaluate this check under an incident (overrides the test-level incident) */
  under?: Incident;
}

export type Constraint = ConstraintBase &
  (
    | { type: "successRate"; min: number }
    | { type: "p50"; maxMs: number }
    | { type: "p99"; maxMs: number }
    /** p99 time to first token */
    | { type: "ttft"; maxMs: number }
    | { type: "costPerMonth"; maxUsd: number }
    | { type: "costPerRequest"; maxUsd: number }
    | { type: "quality"; min: number }
    /** share (0..1) of attack requests that got a model answer through */
    | { type: "attacksLeaked"; max: number }
    | { type: "cacheHitRate"; min: number }
    /** pass^3 of the agents' task success: all three tries of the same task succeed */
    | { type: "taskSuccessPassK"; min: number }
    /** the worst eval gate's chance of blocking a good release by chance (fails when there is no gate) */
    | { type: "gateFalseAlarms"; max: number }
    | { type: "gpuUtil"; min?: number; max?: number }
    /** the design must contain at least `count` (default 1) nodes of this kind */
    | { type: "requires"; kind: NodeKind; count?: number }
    /** the design must not contain this kind */
    | { type: "forbids"; kind: NodeKind }
  );

export interface DesignTest {
  /** traffic overrides (applied to the design's users nodes) */
  traffic?: Traffic;
  /** incident applied to every check (unless a check has its own `under`) */
  incident?: Incident;
  constraints: Constraint[];
}

export interface DesignCheck {
  label: string;
  pass: boolean;
  detail: string;
}

export interface DesignEvaluation {
  pass: boolean;
  results: DesignCheck[];
  run: RunResult;
}

/** End-to-end results for the whole design. Rates are 0..1. */
export interface Metrics {
  /** user requests per second offered (benign + attacks) */
  rps: number;
  benignRps: number;
  attackRps: number;
  /** share of benign requests that got an answer */
  successRate: number;
  /** latency of answered requests, ms */
  p50Ms: number;
  p99Ms: number;
  /** time to first token (equals latency when streaming is off) */
  ttftP50Ms: number;
  ttftP99Ms: number;
  costPerRequest: number;
  costPerMonth: number;
  /** answer-quality proxy, 0..1, over answered benign requests */
  quality: number;
  /** load-weighted GPU utilisation of self-hosted models; null when there are none */
  gpuUtil: number | null;
  /** share of benign requests answered from the semantic cache */
  cacheHitRate: number;
  /** shares of attack requests blocked / answered (0 when there are no attacks) */
  attacksBlocked: number;
  attacksLeaked: number;
  /** shares of benign requests rejected by the gateway / wrongly blocked by a guardrail */
  rateLimited: number;
  falseBlocks: number;
  /** share of benign requests that failed with an error (overload, outage, timeout, tool failure) */
  errors: number;
  /** model calls per second (all LLM nodes) */
  llmCallsPerSec: number;
  /**
   * Only for designs with an agent: pass^k for k = 3, the chance that the same task succeeds on all three tries
   * (τ-bench style), from the load-weighted per-task success of the agent nodes.
   */
  taskSuccessPassK?: number;
}

export interface NodeStat {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}

export interface NodeResult {
  id: string;
  kind: NodeKind;
  /** requests (or calls) per second arriving */
  load: number;
  /** load / capacity (0 when capacity is unlimited) */
  util: number;
  /** requests/s it can handle; null = effectively unlimited */
  capacity: number | null;
  /** requests/s failed here (overload, outage, errors) */
  dropped: number;
  /** requests/s blocked here on purpose (guardrails, rate limits, auth) */
  blocked: number;
  /** own mean latency added per request, ms */
  latencyMs: number;
  /** monthly cost attributed to this node (fixed + usage) */
  costPerMonth: number;
  down: boolean;
  /** 1-2 headline stats for the node card, then more for the inspector */
  stats: NodeStat[];
  /** extra numbers for explanations */
  extra: Record<string, number>;
}

export type Severity = "bad" | "warn" | "info";

export interface Issue {
  severity: Severity;
  text: string;
  nodeId?: string;
}

export interface RunResult {
  metrics: Metrics;
  nodes: Record<string, NodeResult>;
  /** keyed by `${from}->${to}`: requests/s on the edge */
  edges: Record<string, number>;
  issues: Issue[];
  incident: Incident;
}
