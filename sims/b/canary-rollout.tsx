// Canary rollouts: will a small slice of traffic for a short time reveal a regression before everyone gets it?
// Metric keys: pDetect (alert fires during the canary), canaryRequests, timeToDetectMin (expected),
//              expectedAffected (requests hit by the bug, expected), affectedNoCanary (same, shipping to 100% directly).
import { BarChart, LineChart, C } from "../ui";
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { big, binomCdf, logspace, nearestIndex, r } from "./lib";

const ROLLBACK_MIN = 15; // minutes from alert to rollback completing

export function canary(pct: number, duration: number, traffic: number, p: number, m: number) {
  const rate = traffic * (pct / 100); // canary requests per minute
  const n = Math.round(rate * duration);
  const pDetect = 1 - binomCdf(m - 1, n, p);
  const detectedCost = m + rate * p * ROLLBACK_MIN;
  const noCanary = m + traffic * p * ROLLBACK_MIN;
  const escapeCost = n * p + noCanary;
  const expectedAffected = pDetect * detectedCost + (1 - pDetect) * escapeCost;
  return { rate, n, pDetect, timeToDetectMin: rate * p > 0 ? m / (rate * p) : Infinity, detectedCost, escapeCost, noCanary, expectedAffected, lambda: n * p };
}

const model = (p: Params, dur?: number, pct?: number) => canary(pct ?? num(p, "canaryPct"), dur ?? num(p, "durationMin"), num(p, "trafficPerMin"), num(p, "bugRate"), num(p, "alertThreshold"));

function compute(p: Params) {
  const m = model(p);
  return { pDetect: m.pDetect, canaryRequests: m.n, timeToDetectMin: Math.min(m.timeToDetectMin, 1e9), expectedAffected: m.expectedAffected, affectedNoCanary: m.noCanary };
}

function View({ params }: SimViewProps) {
  const ds = logspace(5, 1440, 41);
  const pct = num(params, "canaryPct");
  const m = model(params);
  const mk = nearestIndex(ds.map(Math.log), Math.log(num(params, "durationMin")));
  const fmtD = (v: number) => (v >= 60 ? `${(v / 60).toFixed(v >= 600 ? 0 : 1)}h` : `${Math.round(v)}m`);
  return (
    <>
      <Caption>P(alert fires during the canary) vs canary duration (dashed line = current)</Caption>
      <LineChart
        x={ds}
        logX
        series={[
          { name: `${pct}% canary`, values: ds.map((d) => model(params, d).pDetect), color: C.accent },
          { name: "1% canary", values: ds.map((d) => model(params, d, 1).pDetect), color: C.blue, dashed: true },
          { name: "25% canary", values: ds.map((d) => model(params, d, 25).pDetect), color: C.green, dashed: true },
        ]}
        xFormat={fmtD}
        xLabel="canary duration (log)"
        yFormat="pct"
        yMax={1}
        marker={mk}
        height={210}
      />
      <Caption>Expected requests hit by the bug</Caption>
      <BarChart
        format="num"
        height={160}
        bars={[
          { label: "no canary", value: m.noCanary, color: C.red },
          { label: "this canary", value: m.expectedAffected, color: C.accent },
          { label: "if caught", value: m.detectedCost, color: C.green },
          { label: "if missed", value: m.escapeCost, color: C.purple },
        ]}
      />
    </>
  );
}

const defaults = { canaryPct: 5, durationMin: 60, trafficPerMin: 2000, bugRate: 0.0005, alertThreshold: 3 };
const d = canary(5, 60, 2000, 0.0005, 3);

export const canaryRollout: SimDef = {
  id: "canary-rollout",
  title: "Canary rollouts: will you notice in time?",
  summary: "Send a slice of traffic to the new version and wait for an alert. See how canary size, duration and how rare the bug is set the chance of catching it and how many users it reaches.",
  module: "production-systems",
  tags: ["canary", "rollout", "detection", "blast radius"],
  params: [
    { key: "canaryPct", label: "Canary share", kind: "range", min: 0.1, max: 50, step: 0.1, log: true, unit: "%" },
    { key: "durationMin", label: "Canary duration", kind: "range", min: 5, max: 1440, step: 5, log: true, unit: "min" },
    { key: "trafficPerMin", label: "Total traffic", kind: "range", min: 100, max: 100000, step: 100, log: true, unit: "req/min" },
    { key: "bugRate", label: "Bug hit rate p", kind: "range", min: 0.00001, max: 0.01, step: 0.00001, log: true, help: "Share of requests on the new version that hit the regression" },
    { key: "alertThreshold", label: "Alert after m bad requests", kind: "range", min: 1, max: 20, step: 1 },
  ],
  defaults,
  metrics: [
    { key: "pDetect", label: "P(detect in canary)", format: "pct" },
    { key: "canaryRequests", label: "Canary requests n", format: "int" },
    { key: "timeToDetectMin", label: "Expected time to alert", format: "num", help: "minutes" },
    { key: "expectedAffected", label: "Expected hit requests", format: "num" },
    { key: "affectedNoCanary", label: "Hit requests, no canary", format: "num" },
  ],
  compute,
  View,
  math: `The canary gets $n = \\text{traffic}\\times\\text{share}\\times\\text{duration}$ requests. Each independently hits the bug with probability $p$, so the number of bad requests is $X \\sim \\text{Binomial}(n, p)$. The alert fires after $m$ bad requests:
$$P(\\text{detect}) = P(X \\ge m) = 1 - \\sum_{j=0}^{m-1}\\binom{n}{j}p^j(1-p)^{n-j}, \\qquad m = 1:\\ P = 1 - (1-p)^n$$
Expected time to the alert is $m/(\\text{canary rate}\\cdot p)$ minutes: rare bugs need **volume** (share × duration), not just patience.

**Blast radius.** Rolling back takes $L = ${ROLLBACK_MIN}$ min after the alert.
- caught in the canary: $m + r_c\\,p\\,L$ bad requests ($r_c$ = canary requests/min),
- missed, then shipped to everyone: $np + m + r\\,p\\,L$ ($r$ = all traffic),
- no canary at all: $m + r\\,p\\,L$.
$$E[\\text{hit}] = P(\\text{detect})(m + r_c pL) + (1 - P(\\text{detect}))(np + m + rpL)$$

**Worked example (defaults: 5% of 2,000 req/min for 60 min, $p = 0.0005$, $m = 3$)**: $n = 100\\times60 = ${big(d.n)}$, $E[X] = np = ${r(d.lambda, 2)}$. $P(X \\ge 3) = ${r(d.pDetect, 4)}$ (Poisson approx. $1 - e^{-3}(1 + 3 + 4.5) = 0.577$). Expected time to alert $= 3/(100\\times0.0005) = ${r(d.timeToDetectMin, 0)}$ min, as long as the whole canary.
If caught: $3 + 100\\cdot0.0005\\cdot15 = ${r(d.detectedCost, 2)}$; if missed: $3 + 3 + 2000\\cdot0.0005\\cdot15 = ${r(d.escapeCost, 2)}$; expected $= ${r(d.expectedAffected, 2)}$ vs ${r(d.noCanary, 1)} with no canary. The canary mostly buys a smaller blast radius during the rollback window; a longer or larger canary raises the catch rate.`,
  explain: (_p, m) =>
    m.pDetect < 0.8
      ? `Only a ${(m.pDetect * 100).toFixed(0)}% chance the alert fires before full rollout: the canary sees ${Math.round(m.canaryRequests).toLocaleString("en-US")} requests but expects to need ${m.timeToDetectMin.toFixed(0)} minutes to collect enough bad ones. Run it longer or on more traffic.`
      : `A ${(m.pDetect * 100).toFixed(0)}% chance of catching the regression in the canary, cutting expected bad requests from ${m.affectedNoCanary.toFixed(0)} to ${m.expectedAffected.toFixed(1)}.`,
};
