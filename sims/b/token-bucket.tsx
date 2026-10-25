// Token-bucket rate limiting for one tenant over 60 s: bursts are absorbed up to the bucket size, then capped at the refill rate.
// Metric keys: admittedPct, rejected (requests over 60 s), peakAdmittedPerSec, longestThrottleSec.
import { LineChart, C } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { big, r } from "./lib";

const DT = 0.1;
const T = 60;
const STEPS = Math.round(T / DT);

/** Offered request rate (req/s) at time t for a pattern around a base rate. */
export function rateAt(pattern: string, base: number, t: number) {
  if (pattern === "steady") return base;
  if (pattern === "spike") return t >= 20 && t < 22 ? base * 20 : base;
  // bursty: 3-second bursts at 5× base
  return [10, 30, 45].some((s) => t >= s && t < s + 3) ? base * 5 : base;
}

export function bucketSim(pattern: string, base: number, refill: number, size: number) {
  let tokens = size;
  const offered: number[] = [], admitted: number[] = [], level: number[] = [];
  let totIn = 0, totOk = 0, run = 0, longest = 0;
  for (let i = 0; i < STEPS; i++) {
    const arr = rateAt(pattern, base, i / Math.round(1 / DT)) * DT; // i/10 is exact, i*0.1 is not
    tokens = Math.min(size, tokens + refill * DT);
    const ok = Math.min(arr, tokens);
    tokens -= ok;
    offered.push(arr);
    admitted.push(ok);
    level.push(tokens);
    totIn += arr;
    totOk += ok;
    if (arr - ok > 1e-9) {
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  const perSec = (xs: number[]) => Array.from({ length: T }, (_, s) => xs.slice(s * 10, s * 10 + 10).reduce((a, b) => a + b, 0));
  const offS = perSec(offered), okS = perSec(admitted);
  return { offS, okS, level, totIn, totOk, admittedPct: totOk / totIn, rejected: totIn - totOk, peakAdmittedPerSec: Math.max(...okS), longestThrottleSec: longest * DT };
}

const model = (p: Params) => bucketSim(str(p, "pattern"), num(p, "trafficRate"), num(p, "refillRate"), num(p, "bucketSize"));

function compute(p: Params) {
  const m = model(p);
  return { admittedPct: m.admittedPct, rejected: m.rejected, peakAdmittedPerSec: m.peakAdmittedPerSec, longestThrottleSec: m.longestThrottleSec };
}

function View({ params }: SimViewProps) {
  const m = model(params);
  const secs = Array.from({ length: T }, (_, i) => i);
  const ticks = Array.from({ length: STEPS }, (_, i) => +(i * DT).toFixed(1));
  return (
    <>
      <Caption>Requests per second: offered vs admitted (refill rate dashed)</Caption>
      <LineChart
        x={secs}
        series={[
          { name: "offered", values: m.offS, color: C.red },
          { name: "admitted", values: m.okS, color: C.green },
          { name: "refill rate", values: secs.map(() => num(params, "refillRate")), color: C.muted, dashed: true },
        ]}
        xFormat={(v) => `${v}s`}
        xLabel="time"
        height={200}
      />
      <Caption>Tokens left in the bucket (capacity {num(params, "bucketSize")})</Caption>
      <LineChart x={ticks} series={[{ name: "tokens", values: m.level, color: C.blue }]} xFormat={(v) => `${Math.round(v)}s`} yMax={num(params, "bucketSize")} height={140} />
    </>
  );
}

const defaults = { pattern: "bursty", trafficRate: 8, refillRate: 10, bucketSize: 30 };
const d = bucketSim("bursty", 8, 10, 30);

export const tokenBucket: SimDef = {
  id: "token-bucket",
  title: "Token bucket: bursts, refill and rejections",
  summary: "A per-tenant rate limiter: requests spend tokens, tokens refill at a steady rate, and the bucket size decides how big a burst gets through. Watch 60 seconds of traffic.",
  module: "production-systems",
  tags: ["rate limiting", "token bucket", "bursts", "quotas"],
  params: [
    { key: "pattern", label: "Traffic pattern", kind: "select", options: [{ value: "steady", label: "Steady" }, { value: "bursty", label: "Bursts (5× for 3 s, three times)" }, { value: "spike", label: "One spike (20× for 2 s)" }] },
    { key: "trafficRate", label: "Base traffic", kind: "range", min: 1, max: 50, step: 1, unit: "req/s" },
    { key: "refillRate", label: "Refill rate r", kind: "range", min: 1, max: 50, step: 1, unit: "tok/s" },
    { key: "bucketSize", label: "Bucket size B", kind: "range", min: 1, max: 200, step: 1, unit: "tok" },
  ],
  defaults,
  metrics: [
    { key: "admittedPct", label: "Admitted", format: "pct" },
    { key: "rejected", label: "Rejected (60 s)", format: "int" },
    { key: "peakAdmittedPerSec", label: "Peak admitted / s", format: "num" },
    { key: "longestThrottleSec", label: "Longest throttling", format: "s" },
  ],
  compute,
  View,
  math: `The bucket holds up to $B$ tokens and gains $r$ tokens per second. Each request spends one token; with none left it is rejected (HTTP 429). In each $\\Delta t = ${DT}$ s step with $a_t$ arriving requests:
$$b_t^+ = \\min(B,\\ b_{t-1} + r\\Delta t), \\qquad \\text{admitted}_t = \\min(a_t, b_t^+), \\qquad b_t = b_t^+ - \\text{admitted}_t$$
Over any window of length $\\tau$ the limiter admits at most $B + r\\tau$ requests: $B$ is the **burst** allowance, $r$ the **sustained** rate. Traffic averaging below $r$ is never throttled once the bucket refills; a burst of rate $R > r$ is absorbed for about $B/(R - r)$ seconds.

**Worked example (defaults: bursts of $5\\times8 = 40$ req/s for 3 s, $r = 10$, $B = 30$)**: the bucket starts full (base traffic 8 < 10). A burst offers 120 requests; a full bucket drains in $30/(40-10) = 1$ s, after which only 10/s get through, so over 3 s the limiter admits about $B + 3r = 60$ and rejects about 60 (61 in 0.1 s steps). Between bursts the bucket refills at only $10 - 8 = 2$ tokens/s, so the third burst, 12 s after the second, finds just 24 tokens and loses about 66.
Over 60 s: ${big(d.totIn)} offered, ${big(d.rejected)} rejected (${r((1 - d.admittedPct) * 100, 1)}%), peak ${r(d.peakAdmittedPerSec, 1)} admitted in one second, longest throttled stretch ${r(d.longestThrottleSec, 1)} s.`,
  explain: (p, m) =>
    m.rejected < 0.5
      ? `Nothing is rejected: the bucket (${num(p, "bucketSize")}) absorbs the bursts and the refill rate covers the average.`
      : `${Math.round(m.rejected)} requests (${((1 - m.admittedPct) * 100).toFixed(1)}%) get a 429. Bigger B lets bursts through; bigger r raises the sustained limit (and what one tenant can cost you).`,
};
