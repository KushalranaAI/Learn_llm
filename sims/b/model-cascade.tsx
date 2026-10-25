// A model cascade: a small model answers first; if its confidence is below a threshold, escalate to the large model.
// 2,000 synthetic queries (seeded). Metric keys: quality (share answered correctly), escalationRate, costPer1k (USD),
// avgLatencyMs, savingsVsLarge (cost saved vs sending everything to the large model).
import { LineChart, StackBar, C } from "../ui";
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { gauss, linspace, mulberry32, nearestIndex, pc, r, sigmoid } from "./lib";

const N = 2000;
const ACC = { small: { easy: 0.92, hard: 0.45 }, large: { easy: 0.97, hard: 0.85 } };
const COST = { small: 0.0003, large: 0.006 }; // USD per query
const LAT = { small: 400, large: 1500 }; // ms

const rnd = mulberry32(31337);
const U = Array.from({ length: N }, () => ({ hard: rnd(), small: rnd(), large: rnd(), noise: gauss(rnd) }));

export function cascade(threshold: number, easyShare: number, separation: number) {
  let correct = 0, esc = 0, cost = 0, lat = 0, smallOnly = 0, largeOnly = 0;
  for (const u of U) {
    const hard = u.hard >= easyShare;
    const sOk = u.small < (hard ? ACC.small.hard : ACC.small.easy);
    const lOk = u.large < (hard ? ACC.large.hard : ACC.large.easy);
    if (sOk) smallOnly++;
    if (lOk) largeOnly++;
    // confidence: correct answers score higher on average; +1 shift = models are overconfident
    const conf = sigmoid((sOk ? 1 : -1) * (separation / 2) + u.noise + 1);
    if (conf >= threshold) {
      correct += sOk ? 1 : 0;
      cost += COST.small;
      lat += LAT.small;
    } else {
      esc++;
      correct += lOk ? 1 : 0;
      cost += COST.small + COST.large;
      lat += LAT.small + LAT.large;
    }
  }
  const quality = correct / N;
  return { quality, escalationRate: esc / N, costPer1k: (cost / N) * 1000, avgLatencyMs: lat / N, savingsVsLarge: 1 - cost / N / COST.large, smallQuality: smallOnly / N, largeQuality: largeOnly / N };
}

const model = (p: Params, t?: number) => cascade(t ?? num(p, "threshold"), num(p, "easyShare"), num(p, "separation"));

function compute(p: Params) {
  const m = model(p);
  return { quality: m.quality, escalationRate: m.escalationRate, costPer1k: m.costPer1k, avgLatencyMs: m.avgLatencyMs, savingsVsLarge: m.savingsVsLarge };
}

function View({ params }: SimViewProps) {
  const ts = linspace(0, 1, 41);
  const sw = ts.map((t) => model(params, t));
  const m = model(params);
  const mk = nearestIndex(ts, num(params, "threshold"));
  return (
    <>
      <Caption>Threshold sweep: quality vs share escalated (dashed lines: small-only and large-only quality)</Caption>
      <LineChart
        x={ts}
        series={[
          { name: "cascade quality", values: sw.map((s) => s.quality), color: C.green },
          { name: "escalated", values: sw.map((s) => s.escalationRate), color: C.blue },
          { name: "large only", values: sw.map(() => m.largeQuality), color: C.purple, dashed: true },
          { name: "small only", values: sw.map(() => m.smallQuality), color: C.red, dashed: true },
        ]}
        xFormat={(v) => v.toFixed(2)}
        xLabel="confidence threshold"
        yFormat="pct"
        yMax={1}
        marker={mk}
        height={210}
      />
      <Caption>Cost per 1,000 queries vs threshold (large only = ${(COST.large * 1000).toFixed(2)})</Caption>
      <LineChart x={ts} series={[{ name: "cost / 1k", values: sw.map((s) => s.costPer1k), color: C.accent }]} xFormat={(v) => v.toFixed(2)} yFormat="usd" marker={mk} height={150} />
      <StackBar parts={[{ label: "answered by small", value: 1 - m.escalationRate, color: C.green }, { label: "escalated to large", value: m.escalationRate, color: C.blue }]} format="pct" />
    </>
  );
}

const defaults = { threshold: 0.7, easyShare: 0.7, separation: 2 };
const d = cascade(0.7, 0.7, 2);

export const modelCascade: SimDef = {
  id: "model-cascade",
  title: "Model cascade: small first, escalate when unsure",
  summary: "Route every query to a cheap model and escalate to the large one only when the small model's confidence is low. Pick the threshold that keeps quality while cutting cost.",
  module: "production-systems",
  tags: ["routing", "cascade", "cost", "confidence threshold"],
  params: [
    { key: "threshold", label: "Confidence threshold τ", kind: "range", min: 0, max: 1, step: 0.01 },
    { key: "easyShare", label: "Share of easy queries", kind: "range", min: 0, max: 1, step: 0.05 },
    { key: "separation", label: "Confidence quality (separation)", kind: "range", min: 0, max: 4, step: 0.1, help: "How much higher the small model's confidence is when it is right" },
  ],
  defaults,
  metrics: [
    { key: "quality", label: "Quality", format: "pct" },
    { key: "escalationRate", label: "Escalated", format: "pct" },
    { key: "costPer1k", label: "Cost / 1k queries", format: "usd" },
    { key: "avgLatencyMs", label: "Avg latency", format: "ms" },
    { key: "savingsVsLarge", label: "Saved vs large only", format: "pct" },
  ],
  compute,
  View,
  math: `Each of ${N.toLocaleString("en-US")} queries is easy with probability $e$. Accuracy: small ${ACC.small.easy} / ${ACC.small.hard} (easy / hard), large ${ACC.large.easy} / ${ACC.large.hard}. Cost per query: small \\$${COST.small}, large \\$${COST.large}; latency ${LAT.small} / ${LAT.large} ms.

The small model reports a confidence $\\text{conf} = \\sigma\\big(\\pm\\tfrac{s}{2} + \\varepsilon + 1\\big)$, $+$ when it is right, $-$ when wrong, $\\varepsilon \\sim \\mathcal N(0,1)$; $s$ is how well confidence separates right from wrong answers (the $+1$ makes it overconfident, like real models).

**Routing**: answer with the small model if $\\text{conf} \\ge \\tau$, otherwise call the large one as well. With escalation rate $\\eta$:
$$\\text{quality} = \\frac{1}{N}\\sum_i \\big[\\text{conf}_i \\ge \\tau\\big]\\,\\text{ok}^{small}_i + \\big[\\text{conf}_i < \\tau\\big]\\,\\text{ok}^{large}_i$$
$$\\text{cost} = c_{small} + \\eta\\,c_{large}, \\qquad \\text{latency} = t_{small} + \\eta\\,t_{large}$$
Escalated queries pay for both models, so a cascade only saves money if $\\eta < 1 - c_{small}/c_{large}$.

**Worked example (defaults: $\\tau = 0.7$, $e = 0.7$, $s = 2$)**: small alone scores ${pc(d.smallQuality)}, large alone ${pc(d.largeQuality)}. The cascade escalates $\\eta = ${r(d.escalationRate, 3)}$ and scores ${pc(d.quality)}.
Cost $= 0.0003 + ${r(d.escalationRate, 3)}\\times0.006 = \\$${r(d.costPer1k / 1000, 5)}$ per query (\\$${r(d.costPer1k, 2)} per 1k, ${pc(d.savingsVsLarge)} cheaper than large only); latency $= 400 + ${r(d.escalationRate, 3)}\\times1500 = ${r(d.avgLatencyMs, 0)}$ ms.`,
  explain: (_p, m) =>
    `${(m.escalationRate * 100).toFixed(0)}% of queries go to the large model; quality is ${(m.quality * 100).toFixed(1)}% at ${(m.savingsVsLarge * 100).toFixed(0)}% lower cost than always using it. Raising τ buys quality with cost; better-calibrated confidence (higher separation) gets both.`,
};
