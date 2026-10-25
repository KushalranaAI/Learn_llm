// A guardrail classifier (e.g. prompt-injection detector) with a block threshold, on traffic where attacks are rare.
// Metric keys: precision, recall, falseBlocksPer10k, missedPer10k, costPer10k (USD), optimalThreshold (cost-minimising).
import { LineChart, C } from "../ui";
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { linspace, logit, nearestIndex, normCdf, normPdf, r, sigmoid } from "./lib";

/** Scores live in logit space: benign ~ N(−d/2, 1), attacks ~ N(+d/2, 1); the classifier reports sigmoid(x). */
export function guard(t: number, sep: number, pi: number, cFB: number, cMiss: number) {
  const x = logit(Math.min(0.9999, Math.max(0.0001, t)));
  const tpr = 1 - normCdf(x - sep / 2);
  const fpr = 1 - normCdf(x + sep / 2);
  const attacks = 10000 * pi, benign = 10000 * (1 - pi);
  const tp = attacks * tpr, fp = benign * fpr;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const missed = attacks - tp;
  const xStar = Math.log(((1 - pi) * cFB) / (pi * cMiss)) / sep;
  return { x, tpr, fpr, tp, fp, missed, precision, cost: fp * cFB + missed * cMiss, xStar, tStar: sigmoid(xStar), attacks, benign };
}

const model = (p: Params, t?: number) => guard(t ?? num(p, "threshold"), num(p, "separation"), num(p, "baseRate"), num(p, "costFalseBlock"), num(p, "costMiss"));

function compute(p: Params) {
  const m = model(p);
  return { precision: m.precision, recall: m.tpr, falseBlocksPer10k: m.fp, missedPer10k: m.missed, costPer10k: m.cost, optimalThreshold: m.tStar };
}

function View({ params }: SimViewProps) {
  const sep = num(params, "separation");
  const xs = linspace(-6, 6, 97);
  const m = model(params);
  const mk = nearestIndex(xs, m.x);
  const ts = linspace(0.02, 0.98, 49);
  const sw = ts.map((t) => model(params, t));
  const mk2 = nearestIndex(ts, num(params, "threshold"));
  const sf = (v: number) => sigmoid(v).toFixed(2);
  return (
    <>
      <Caption>Classifier score distributions (shape only; attacks are {(num(params, "baseRate") * 100).toFixed(2)}% of traffic). Dashed = threshold</Caption>
      <LineChart
        x={xs}
        series={[
          { name: "benign", values: xs.map((x) => normPdf(x + sep / 2)), color: C.blue },
          { name: "attack", values: xs.map((x) => normPdf(x - sep / 2)), color: C.red },
        ]}
        xFormat={sf}
        xLabel="classifier score"
        marker={mk}
        height={180}
      />
      <Caption>Per 10,000 requests vs threshold: false blocks and missed attacks</Caption>
      <LineChart
        x={ts}
        series={[
          { name: "false blocks", values: sw.map((s) => s.fp), color: C.blue },
          { name: "missed attacks", values: sw.map((s) => s.missed), color: C.red },
        ]}
        xFormat={(v) => v.toFixed(2)}
        yFormat="int"
        marker={mk2}
        height={170}
      />
      <Caption>Precision and recall vs threshold (optimal for your costs ≈ {m.tStar.toFixed(2)})</Caption>
      <LineChart
        x={ts}
        series={[
          { name: "precision", values: sw.map((s) => s.precision), color: C.purple },
          { name: "recall", values: sw.map((s) => s.tpr), color: C.green },
        ]}
        xFormat={(v) => v.toFixed(2)}
        yFormat="pct"
        yMax={1}
        marker={mk2}
        height={170}
      />
    </>
  );
}

const defaults = { threshold: 0.5, separation: 3, baseRate: 0.01, costFalseBlock: 2, costMiss: 100 };
const d = guard(0.5, 3, 0.01, 2, 100);

export const guardrailThreshold: SimDef = {
  id: "guardrail-threshold",
  title: "Guardrail thresholds: precision, recall and the base rate",
  summary: "An attack classifier with good separation still blocks mostly innocent users when attacks are rare. Move the threshold and weigh false blocks against missed attacks.",
  module: "production-systems",
  tags: ["guardrails", "prompt injection", "precision", "recall", "base rate"],
  params: [
    { key: "threshold", label: "Block threshold t", kind: "range", min: 0.01, max: 0.99, step: 0.01 },
    { key: "separation", label: "Classifier separation d′", kind: "range", min: 0.5, max: 6, step: 0.1, help: "Distance between benign and attack score means (in logit units)" },
    { key: "baseRate", label: "Attack base rate π", kind: "range", min: 0.0001, max: 0.2, step: 0.0001, log: true },
    { key: "costFalseBlock", label: "Cost of a false block", kind: "range", min: 0, max: 20, step: 0.5, unit: "$" },
    { key: "costMiss", label: "Cost of a missed attack", kind: "range", min: 0, max: 1000, step: 10, unit: "$" },
  ],
  defaults,
  metrics: [
    { key: "precision", label: "Precision", format: "pct" },
    { key: "recall", label: "Recall", format: "pct" },
    { key: "falseBlocksPer10k", label: "False blocks / 10k", format: "num" },
    { key: "missedPer10k", label: "Missed attacks / 10k", format: "num" },
    { key: "costPer10k", label: "Expected cost / 10k", format: "usd" },
    { key: "optimalThreshold", label: "Cost-optimal threshold", format: "num" },
  ],
  compute,
  View,
  math: `The classifier's raw score in logit space is $x \\sim \\mathcal N(-d'/2, 1)$ for benign and $\\mathcal N(+d'/2, 1)$ for attacks; it reports $s = \\sigma(x)$. Blocking when $s \\ge t$ means $x \\ge \\ell = \\operatorname{logit}(t)$:
$$\\text{TPR (recall)} = 1 - \\Phi(\\ell - d'/2), \\qquad \\text{FPR} = 1 - \\Phi(\\ell + d'/2)$$
With attack base rate $\\pi$, **precision** (share of blocks that were real attacks) is
$$\\text{precision} = \\frac{\\pi\\,\\text{TPR}}{\\pi\\,\\text{TPR} + (1-\\pi)\\,\\text{FPR}}$$
When $\\pi$ is small, even a small FPR applied to the huge benign majority swamps the true positives.

Per 10,000 requests: false blocks $= 10^4(1-\\pi)\\text{FPR}$, missed $= 10^4\\pi(1-\\text{TPR})$, cost $= c_{FB}\\cdot\\text{false blocks} + c_{miss}\\cdot\\text{missed}$. Block when the expected cost of letting it through exceeds the cost of blocking; the likelihood ratio here is $e^{d'x}$, so
$$x^* = \\frac{1}{d'}\\ln\\frac{(1-\\pi)\\,c_{FB}}{\\pi\\,c_{miss}}, \\qquad t^* = \\sigma(x^*)$$

**Worked example (defaults: $t = 0.5$, $d' = 3$, $\\pi = 0.01$, $c_{FB} = \\$2$, $c_{miss} = \\$100$)**: $\\ell = 0$, so TPR $= \\Phi(1.5) = ${r(d.tpr, 4)}$ and FPR $= 1-\\Phi(1.5) = ${r(d.fpr, 4)}$.
Per 10k: ${r(d.tp, 1)} attacks blocked, ${r(d.missed, 1)} missed, ${r(d.fp, 1)} benign users blocked; precision $= ${r(d.tp, 2)}/(${r(d.tp, 2)} + ${r(d.fp, 1)}) = ${r(d.precision, 4)}$, so about 7 of 8 blocks are false alarms.
Cost $= 2\\times${r(d.fp, 1)} + 100\\times${r(d.missed, 2)} = \\$${r(d.cost, 0)}$. Optimal: $x^* = \\ln(9900\\cdot2/(100\\cdot100))/3 = ${r(d.xStar, 4)}$, $t^* = ${r(d.tStar, 3)}$.`,
  explain: (_p, m) =>
    m.precision < 0.5
      ? `Recall is ${(m.recall * 100).toFixed(0)}%, but only ${(m.precision * 100).toFixed(0)}% of blocks are real attacks: ${Math.round(m.falseBlocksPer10k)} innocent requests per 10k are blocked. Rare attacks make false positives dominate; route borderline scores to review instead of a hard block.`
      : `${(m.precision * 100).toFixed(0)}% of blocks are real attacks and ${(m.recall * 100).toFixed(0)}% of attacks are caught, costing about $${Math.round(m.costPer10k)} per 10k requests (cost-optimal threshold ≈ ${m.optimalThreshold.toFixed(2)}).`,
};
