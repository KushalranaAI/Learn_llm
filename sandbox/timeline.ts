// A 60-second incident timeline: the design runs second by second; the incident starts at t=10s.
// Users retry failed requests the next second (which can snowball), a flushed cache refills as misses are
// answered, and a bad rollout is rolled back once online evals notice it. Pure.
import { cfgBool, cfgNum, resolveConfig } from "./catalog";
import { NORMAL, conditionsFor, solve, type Conditions } from "./engine";
import type { Graph, Incident, Metrics, RunResult, Traffic } from "./types";

export const TIMELINE = {
  seconds: 60,
  /** incident starts */
  at: 10,
  /** temporary incidents (outage, spike, campaign, slow DB) end here */
  until: 40,
  /** share of failed requests users retry the next second */
  retryShare: 0.5,
  /** share of the remaining cold cache refilled per second */
  refill: 0.12,
};

export interface Tick {
  t: number;
  metrics: Metrics;
  /** extra requests/s from retries */
  retryRps: number;
  cacheWarm: number;
  /** the bad rollout has been detected and rolled back */
  rolledBack: boolean;
  result: RunResult;
}

/** Seconds the online evals need to notice a quality regression, or null without evals. */
export function detectionSeconds(graph: Graph): number | null {
  let best: number | null = null;
  for (const n of graph.nodes) {
    if (n.kind !== "observability") continue;
    const c = resolveConfig(n);
    if (!cfgBool(c, "evals")) continue;
    // ~10 scored answers are needed to see a clear drop.
    const rps = graph.nodes.filter((u) => u.kind === "users").reduce((s, u) => s + cfgNum(resolveConfig(u), "rps"), 0);
    const s = Math.max(3, Math.ceil(10 / Math.max(0.01, rps * cfgNum(c, "sampleRate"))));
    best = best === null ? s : Math.min(best, s);
  }
  return best;
}

export function runTimeline(graph: Graph, traffic: Traffic, incident: Incident): Tick[] {
  const full = conditionsFor(graph, incident);
  const detect = incident.type === "badRollout" ? detectionSeconds(graph) : null;
  const baseRps = graph.nodes.filter((n) => n.kind === "users").reduce((s, n) => s + (traffic.rps ?? cfgNum(resolveConfig(n), "rps")) * (traffic.scale ?? 1), 0);
  const ticks: Tick[] = [];
  let warm = 1;
  let retry = 0;
  for (let t = 0; t < TIMELINE.seconds; t++) {
    const on = t >= TIMELINE.at && (t < TIMELINE.until || incident.type === "badRollout" || incident.type === "cacheFlush");
    if (incident.type === "cacheFlush" && t === TIMELINE.at) warm = 0;
    const rolledBack = incident.type === "badRollout" && detect !== null && t >= TIMELINE.at + detect;
    const spike = on && incident.type === "trafficSpike" ? full.scale : 1;
    const cond: Conditions = {
      ...NORMAL,
      downProviders: on ? full.downProviders : [],
      cacheWarm: warm,
      scale: spike * (baseRps > 0 ? 1 + retry / (baseRps * spike) : 1),
      attackShare: on ? full.attackShare : undefined,
      vectorSlow: on ? full.vectorSlow : 1,
      badRollout: on && !rolledBack ? full.badRollout : undefined,
    };
    const result = solve(graph, traffic, cond, incident);
    const m = result.metrics;
    ticks.push({ t, metrics: m, retryRps: retry, cacheWarm: warm, rolledBack, result });
    // Users retry a share of the requests that errored (not the ones refused on purpose).
    retry = m.benignRps * m.errors * TIMELINE.retryShare;
    warm += (1 - warm) * TIMELINE.refill;
  }
  return ticks;
}

export interface TimelineSummary {
  worstSuccess: number;
  /** seconds after the incident starts until success is back ≥ 99%; null = not within the window */
  recoverySeconds: number | null;
  /** user requests that failed during the minute (retries counted once) */
  failedRequests: number;
  worstP99: number;
  worstQuality: number;
  leakedAttacks: number;
  /** cost of the minute vs. a normal minute */
  costRatio: number;
  /** when the bad rollout was rolled back (seconds after start), if it was */
  rolledBackAt: number | null;
}

export function summarize(ticks: Tick[], threshold?: number): TimelineSummary {
  // Recovered = back to 99%, or to within half a point of the pre-incident level if that was lower.
  const level = threshold ?? Math.min(0.99, (ticks[0]?.metrics.successRate ?? 1) - 0.005);
  const after = ticks.filter((k) => k.t >= TIMELINE.at);
  const worstSuccess = Math.min(...ticks.map((k) => k.metrics.successRate));
  let recoverySeconds: number | null = 0;
  for (let i = ticks.length - 1; i >= 0; i--) {
    if (ticks[i].metrics.successRate < level) {
      recoverySeconds = i === ticks.length - 1 ? null : Math.max(0, ticks[i].t + 1 - TIMELINE.at);
      break;
    }
  }
  const failedRequests = ticks.reduce((s, k) => s + (k.metrics.benignRps - k.retryRps) * (1 - k.metrics.successRate), 0);
  const normalCost = ticks[0]?.metrics.costPerMonth ?? 0;
  const avgCost = ticks.reduce((s, k) => s + k.metrics.costPerMonth, 0) / Math.max(1, ticks.length);
  const rb = ticks.find((k) => k.rolledBack);
  return {
    worstSuccess,
    recoverySeconds,
    failedRequests: Math.max(0, failedRequests),
    worstP99: Math.max(...ticks.map((k) => k.metrics.p99Ms)),
    worstQuality: Math.min(...after.map((k) => (k.metrics.successRate > 0 ? k.metrics.quality : 1))),
    leakedAttacks: ticks.reduce((s, k) => s + k.metrics.attackRps * k.metrics.attacksLeaked, 0),
    costRatio: normalCost > 0 ? avgCost / normalCost : 1,
    rolledBackAt: rb ? rb.t - TIMELINE.at : null,
  };
}
