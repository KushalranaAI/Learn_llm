// Retries during an outage: fixed-interval retries create a retry storm; exponential backoff with jitter spreads it.
// A fluid (expected-value) simulation in 0.5 s buckets.
// Metric keys: successRate (originals eventually served), peakLoadX (peak offered load ÷ normal load),
//              amplification (attempts ÷ original requests), recoverySec (seconds after the outage until ≥99% succeed).
import { BarChart, LineChart, C } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { r } from "./lib";

const DT = 0.5;
const LAMBDA = 100; // original requests per second
const OUT_START = 20;
const ORIG_END = 100; // new requests stop at 100 s so every attempt is accounted for
const HORIZON = 180;
const SHOW = 120;
const CAP_DELAY = 30;
const COLLAPSE = 0.12; // goodput lost per unit of overload (wasted work on requests that time out anyway)
const MIN_GOODPUT = 0.4;

export type Strategy = "none" | "fixed" | "exponential" | "jitter";

/** Retries that fit in the client's retry window: fixed d₀·k ≤ W, exponential d₀(2^k − 1) ≤ W. */
export function retriesAllowed(strategy: Strategy, windowSec: number, baseDelay: number) {
  if (strategy === "none") return 0;
  if (strategy === "fixed") return Math.max(1, Math.floor(windowSec / baseDelay + 1e-9));
  return Math.max(1, Math.floor(Math.log2(windowSec / baseDelay + 1) + 1e-9));
}

export function simulate(strategy: Strategy, outageSec: number, windowSec: number, baseDelay: number, capacityX: number) {
  const B = Math.round(HORIZON / DT);
  const A = retriesAllowed(strategy, windowSec, baseDelay) + 1;
  const q: number[][] = Array.from({ length: A }, () => new Array<number>(B + 1).fill(0));
  for (let b = 0; b < Math.round(ORIG_END / DT); b++) q[0][b] = LAMBDA * DT;
  const offered = new Array<number>(B).fill(0), served = new Array<number>(B).fill(0);
  const cap = capacityX * LAMBDA * DT;
  const outA = Math.round(OUT_START / DT), outB = Math.round((OUT_START + outageSec) / DT);
  let attempts = 0, ok = 0;
  for (let b = 0; b < B; b++) {
    let off = 0;
    for (let a = 0; a < A; a++) off += q[a][b];
    offered[b] = off / DT;
    attempts += off;
    const sv = b >= outA && b < outB ? 0 : off <= cap ? off : cap * Math.max(MIN_GOODPUT, 1 - COLLAPSE * (off / cap - 1));
    served[b] = sv / DT;
    ok += sv;
    const fail = off > 0 ? 1 - sv / off : 0;
    if (!fail) continue;
    for (let a = 0; a + 1 < A; a++) {
      const m = q[a][b] * fail;
      if (!m) continue;
      const D = strategy === "fixed" ? baseDelay : Math.min(CAP_DELAY, baseDelay * Math.pow(2, a));
      if (strategy === "jitter") {
        const span = Math.max(1, Math.round(D / DT));
        for (let j = 1; j <= span; j++) if (b + j < B) q[a + 1][b + j] += m / span;
      } else {
        const j = Math.max(1, Math.round(D / DT));
        if (b + j < B) q[a + 1][b + j] += m;
      }
    }
  }
  const originals = LAMBDA * ORIG_END;
  let rec = 0;
  for (let b = B - 1; b >= outB; b--) if (offered[b] > 0 && served[b] / offered[b] < 0.99) { rec = (b + 1 - outB) * DT; break; }
  const peak = Math.max(...offered.slice(0, Math.round(SHOW / DT)));
  return { offered, served, successRate: ok / originals, peakLoadX: peak / LAMBDA, amplification: attempts / originals, recoverySec: rec };
}

function run(p: Params, s?: Strategy) {
  return simulate(s ?? (str(p, "strategy") as Strategy), num(p, "outageSec"), num(p, "retryWindow"), num(p, "baseDelay"), num(p, "capacityX"));
}

function compute(p: Params) {
  const m = run(p);
  return { successRate: m.successRate, peakLoadX: m.peakLoadX, amplification: m.amplification, recoverySec: m.recoverySec };
}

const NAMES: Record<Strategy, string> = { none: "no retry", fixed: "fixed", exponential: "exp backoff", jitter: "exp + jitter" };

function View({ params }: SimViewProps) {
  const m = run(params);
  const nb = Math.round(SHOW / DT);
  const xs = Array.from({ length: nb }, (_, i) => i * DT);
  const capLine = num(params, "capacityX") * LAMBDA;
  const all = (["none", "fixed", "exponential", "jitter"] as Strategy[]).map((s) => ({ s, m: run(params, s) }));
  const endIdx = Math.round((OUT_START + num(params, "outageSec")) / DT);
  return (
    <>
      <Caption>Offered vs served load (req/s); outage {OUT_START}–{OUT_START + num(params, "outageSec")} s, dashed marker = recovery begins</Caption>
      <LineChart
        x={xs}
        series={[
          { name: "offered (new + retries)", values: m.offered.slice(0, nb), color: C.red },
          { name: "served", values: m.served.slice(0, nb), color: C.green },
          { name: "capacity", values: xs.map(() => capLine), color: C.muted, dashed: true },
        ]}
        xFormat={(v) => `${Math.round(v)}s`}
        xLabel="time"
        marker={Math.min(nb - 1, endIdx)}
        height={210}
      />
      <Caption>Offered load by strategy</Caption>
      <LineChart
        x={xs}
        series={all.map((a, i) => ({ name: NAMES[a.s], values: a.m.offered.slice(0, nb), color: [C.muted, C.red, C.blue, C.green][i], dashed: a.s === "none" }))}
        xFormat={(v) => `${Math.round(v)}s`}
        marker={Math.min(nb - 1, endIdx)}
        height={170}
      />
      <BarChart format="pct" yMax={1} height={150} bars={all.map((a) => ({ label: NAMES[a.s], value: a.m.successRate, color: a.s === str(params, "strategy") ? C.accent : C.muted }))} />
    </>
  );
}

const defaults = { strategy: "fixed", outageSec: 20, retryWindow: 30, baseDelay: 1, capacityX: 1.5 };
const d = simulate("fixed", 20, 30, 1, 1.5);
const de = simulate("exponential", 20, 30, 1, 1.5);
const dj = simulate("jitter", 20, 30, 1, 1.5);
const dn = simulate("none", 20, 30, 1, 1.5);

export const retryBackoff: SimDef = {
  id: "retry-backoff",
  title: "Retries under an outage: storm or backoff",
  summary: "A provider goes down for 20 seconds. Fixed-interval retries multiply the load and keep the service down after it recovers; exponential backoff with jitter spreads the retries out.",
  module: "agents",
  tags: ["retries", "exponential backoff", "jitter", "retry storm", "outage"],
  params: [
    { key: "strategy", label: "Retry strategy", kind: "select", options: [{ value: "none", label: "No retries" }, { value: "fixed", label: "Fixed interval" }, { value: "exponential", label: "Exponential backoff" }, { value: "jitter", label: "Exponential + full jitter" }] },
    { key: "outageSec", label: "Outage length", kind: "range", min: 2, max: 60, step: 1, unit: "s" },
    { key: "retryWindow", label: "Client retry window W", kind: "range", min: 5, max: 60, step: 1, unit: "s", help: "Clients keep retrying until this long after the first attempt" },
    { key: "baseDelay", label: "Base delay d₀", kind: "range", min: 0.5, max: 5, step: 0.5, unit: "s" },
    { key: "capacityX", label: "Capacity (× normal load)", kind: "range", min: 1.1, max: 4, step: 0.1 },
  ],
  defaults,
  metrics: [
    { key: "successRate", label: "Requests eventually served", format: "pct" },
    { key: "peakLoadX", label: "Peak load", format: "x" },
    { key: "amplification", label: "Attempts per request", format: "x" },
    { key: "recoverySec", label: "Recovery after outage", format: "s" },
  ],
  compute,
  View,
  math: `New requests arrive at $\\lambda = ${LAMBDA}$/s. The service can serve $C = \\kappa\\lambda$ per second and serves nothing during the outage. In each $\\Delta t = ${DT}$ s bucket, the offered load $O_t$ is new requests plus retries due now. Overload wastes work (requests time out half-done), so goodput falls when $O_t > C$:
$$S_t = \\begin{cases} O_t & O_t \\le C \\\\ C\\,\\max\\big(${MIN_GOODPUT},\\ 1 - ${COLLAPSE}(O_t/C - 1)\\big) & O_t > C \\end{cases}$$
and every attempt in the bucket fails with the same probability $1 - S_t/O_t$ ($S_t = 0$ during the outage).

A failed attempt number $a$ ($a = 0$ is the original) is retried after
$$D_a = \\begin{cases} d_0 & \\text{fixed} \\\\ \\min(${CAP_DELAY}, d_0 2^{a}) & \\text{exponential} \\\\ U\\big(0, \\min(${CAP_DELAY}, d_0 2^{a})\\big) & \\text{full jitter} \\end{cases}$$
as long as the client's retry window $W$ allows: fixed fits $\\lfloor W/d_0 \\rfloor$ retries, exponential $\\lfloor \\log_2(W/d_0 + 1) \\rfloor$.

During a long outage every original keeps retrying, so offered load approaches $(1 + \\text{retries})\\lambda$: $31\\lambda$ for fixed 1 s retries in a 30 s window, but only $5\\lambda$ for exponential. When service returns, the fixed-retry backlog is far above $C$, goodput collapses and failures re-queue: a **retry storm** that keeps the service down after the cause is gone. Backoff makes later retries rare; jitter spreads them so they don't arrive in synchronised waves.

**Worked example (defaults: fixed, 20 s outage, $W = 30$ s, $d_0 = 1$ s, $\\kappa = 1.5$)**: 30 retries per request; offered load peaks at ${r(d.peakLoadX, 1)}× normal, each request is attempted ${r(d.amplification, 2)} times on average, ${r(d.successRate * 100, 1)}% are eventually served (no retries at all: ${r(dn.successRate * 100, 1)}%), and only ${r(d.recoverySec, 1)} s after the outage do 99% of attempts succeed.
Exponential (4 retries: 1, 2, 4, 8 s): peak ${r(de.peakLoadX, 1)}×, ${r(de.amplification, 2)} attempts, ${r(de.successRate * 100, 1)}% served, recovery ${r(de.recoverySec, 1)} s. With full jitter: peak ${r(dj.peakLoadX, 1)}×, ${r(dj.successRate * 100, 1)}% served, recovery ${r(dj.recoverySec, 1)} s.`,
  explain: (_p, m) =>
    m.peakLoadX > 3
      ? `Retries pile up to ${m.peakLoadX.toFixed(1)}× normal load, so the service is still overloaded ${m.recoverySec.toFixed(1)} s after it comes back. Spread retries with exponential backoff and jitter, and cap them.`
      : `Peak load stays at ${m.peakLoadX.toFixed(1)}× normal and ${(m.successRate * 100).toFixed(0)}% of requests are eventually served, with ${m.amplification.toFixed(2)} attempts per request.`,
};
