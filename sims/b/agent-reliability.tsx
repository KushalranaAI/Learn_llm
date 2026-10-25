// Compounding reliability: n steps each succeeding with p gives pⁿ. Retries help only for failures you detect.
// Metric keys: successRate (whole task), perStepSuccess, expectedCalls (LLM/tool calls incl. retries and checks),
//              maxStepsFor90 (longest task that still succeeds ≥ 90%).
import { LineChart, StackBar, C } from "../ui";
import { bool, num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { r } from "./lib";

const LOUD = 0.5; // share of failures that are visible without any checking (exceptions, timeouts)

export function reliability(p: number, n: number, retries: number, verify: boolean, catchRate: number) {
  const detect = 1 - (1 - LOUD) * (1 - (verify ? catchRate : 0));
  const q = (1 - p) * detect; // P(an attempt fails AND we notice), which triggers a retry
  const a = retries + 1;
  const geo = q === 1 ? a : (1 - Math.pow(q, a)) / (1 - q); // expected attempts per step
  const s = p * geo;
  const success = Math.pow(s, n);
  const callsPerAttempt = verify ? 2 : 1;
  const maxN = s >= 1 ? 1000 : Math.max(0, Math.floor(Math.log(0.9) / Math.log(s)));
  return { detect, q, s, success, attempts: geo, calls: n * geo * callsPerAttempt, maxN, silent: (1 - p) * (1 - detect) * geo, loudOut: Math.pow(q, a) };
}

function model(p: Params, nOverride?: number) {
  return reliability(num(p, "p"), nOverride ?? num(p, "n"), num(p, "retries"), bool(p, "verify"), num(p, "catchRate"));
}

function compute(p: Params) {
  const m = model(p);
  return { successRate: m.success, perStepSuccess: m.s, expectedCalls: m.calls, maxStepsFor90: Math.min(m.maxN, 1000) };
}

function View({ params }: SimViewProps) {
  const ns = Array.from({ length: 50 }, (_, i) => i + 1);
  const pp = num(params, "p"), v = bool(params, "verify"), rt = num(params, "retries"), cr = num(params, "catchRate");
  const m = model(params);
  const firstTry = pp, onRetry = m.s - pp;
  return (
    <>
      <Caption>Task success vs number of steps n (dashed line = current n)</Caption>
      <LineChart
        x={ns}
        series={[
          { name: "pⁿ (no retries)", values: ns.map((n) => Math.pow(pp, n)), color: C.red, dashed: true },
          { name: `retries=${rt}, ${v ? "verify on" : "no verify"}`, values: ns.map((n) => reliability(pp, n, rt, v, cr).success), color: C.accent },
          { name: `retries=${rt}, ${v ? "no verify" : "verify on"}`, values: ns.map((n) => reliability(pp, n, rt, !v, cr).success), color: C.green },
        ]}
        xLabel="steps in the task n"
        yFormat="pct"
        yMax={1}
        marker={num(params, "n") - 1}
        height={220}
      />
      <Caption>What happens to one step</Caption>
      <StackBar
        format="pct"
        parts={[
          { label: "ok first try", value: firstTry, color: C.green },
          { label: "ok after retry", value: onRetry, color: C.blue },
          { label: "silent failure", value: m.silent, color: C.purple },
          { label: "out of retries", value: m.loudOut, color: C.red },
        ]}
      />
    </>
  );
}

const defaults = { p: 0.95, n: 10, retries: 1, verify: false, catchRate: 0.9 };
const d = reliability(0.95, 10, 1, false, 0.9);
const dv = reliability(0.95, 10, 1, true, 0.9);

export const agentReliability: SimDef = {
  id: "agent-reliability",
  title: "Agent reliability: why long chains break",
  summary: "Each step succeeding 95% of the time sounds fine until you chain ten of them. See how retries and verification change pⁿ, and what they cost in calls.",
  module: "agents",
  tags: ["reliability", "compounding errors", "retries", "verification", "workflows"],
  params: [
    { key: "p", label: "Per-step success p", kind: "range", min: 0.8, max: 0.999, step: 0.001 },
    { key: "n", label: "Steps n", kind: "range", min: 1, max: 50, step: 1 },
    { key: "retries", label: "Retries per step r", kind: "range", min: 0, max: 4, step: 1 },
    { key: "verify", label: "Verify each step", kind: "toggle", help: "A checker step that detects silent failures" },
    { key: "catchRate", label: "Verifier catch rate", kind: "range", min: 0, max: 1, step: 0.05 },
  ],
  defaults,
  metrics: [
    { key: "successRate", label: "Task success", format: "pct" },
    { key: "perStepSuccess", label: "Per-step success", format: "pct" },
    { key: "expectedCalls", label: "Expected calls", format: "num" },
    { key: "maxStepsFor90", label: "Max steps for ≥90%", format: "int" },
  ],
  compute,
  View,
  math: `If each of $n$ independent steps succeeds with probability $p$, the task succeeds with $p^n$: $0.95^{10} = ${r(Math.pow(0.95, 10), 3)}$, $0.95^{30} = ${r(Math.pow(0.95, 30), 3)}$.

**Retries only fix failures you notice.** A fraction $L = ${LOUD}$ of failures are loud (exceptions, timeouts). A verifier catches a further share $v$ of the silent ones, so a failure is detected with probability
$$\\delta = 1 - (1 - L)(1 - v)\\qquad(v = 0 \\text{ without verification})$$
With $r$ retries (up to $r+1$ attempts), let $q = (1-p)\\,\\delta$ be the chance an attempt fails *and is noticed*. A step succeeds if some attempt succeeds before an unnoticed failure or the last attempt:
$$s = p\\sum_{j=0}^{r} q^j = p\\,\\frac{1-q^{r+1}}{1-q}, \\qquad P(\\text{task}) = s^n$$
Expected calls $= n\\cdot\\frac{1-q^{r+1}}{1-q}\\cdot(2 \\text{ if verifying else } 1)$. The longest task with $P \\ge 0.9$ is $n_{max} = \\lfloor \\ln 0.9 / \\ln s \\rfloor$.

**Worked example (defaults: $p = 0.95$, $n = 10$, $r = 1$, no verifier)**: $\\delta = 0.5$, $q = 0.05\\cdot0.5 = 0.025$, $s = 0.95\\,(1 - 0.025^2)/(1 - 0.025) = ${r(d.s, 4)}$, so $P = ${r(d.s, 4)}^{10} = ${r(d.success, 3)}$ (vs $p^{10} = ${r(Math.pow(0.95, 10), 3)}$), using ${r(d.calls, 2)} calls, and $n_{max} = ${d.maxN}$.
Turning on a 90% verifier: $\\delta = 1 - 0.5\\cdot0.1 = 0.95$, $s = ${r(dv.s, 4)}$, $P = ${r(dv.success, 3)}$ for ${r(dv.calls, 1)} calls, $n_{max} = ${dv.maxN}$.`,
  explain: (_p, m) =>
    m.successRate < 0.9
      ? `Each step works ${(m.perStepSuccess * 100).toFixed(1)}% of the time, but chained the task only succeeds ${(m.successRate * 100).toFixed(0)}%. At this reliability, tasks longer than ${m.maxStepsFor90} steps fall below 90%: shorten the chain, add verification, or move steps into deterministic code.`
      : `${(m.successRate * 100).toFixed(1)}% task success at ${m.expectedCalls.toFixed(1)} expected calls. Reliability per step is high enough for up to ${m.maxStepsFor90} steps at ≥90%.`,
};
