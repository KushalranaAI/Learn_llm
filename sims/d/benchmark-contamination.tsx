// Benchmark contamination: part of the test set leaked into the training data and is answered from memory.
// Metric keys: reportedScore, trueScore (held-out ability), inflation (reported − true), measuredScore (what this
//              evaluation shows: reported, or true after a rephrased re-test), noiseMargin (95% sampling margin).
import type { SimDef } from "../types";
import { pc, r } from "../b/lib";
import { compute } from "./benchmark-contamination-model";
import View from "./benchmark-contamination.view";

const defaults = { benchmarkSize: 1000, contaminationRate: 0.3, memorisationBoost: 0.95, trueAccuracy: 0.6, retest: false, seed: 1 };
const d = compute(defaults);

export const benchmarkContamination: SimDef = {
  id: "benchmark-contamination",
  title: "Benchmark contamination: when the test set leaked",
  summary: "If benchmark questions were in the training data, the model can answer them from memory. See how much that inflates a score, and how a rephrased, held-out re-test exposes it.",
  module: "evaluation",
  tags: ["contamination", "benchmarks", "data leakage", "held-out set", "memorisation"],
  params: [
    { key: "benchmarkSize", label: "Benchmark size", kind: "range", min: 100, max: 5000, step: 50, log: true },
    { key: "contaminationRate", label: "Contamination rate", kind: "range", min: 0, max: 0.8, step: 0.01, help: "Share of test items that appeared in training data" },
    { key: "memorisationBoost", label: "Accuracy on seen items", kind: "range", min: 0.5, max: 1, step: 0.01, help: "How often a memorised item is answered right" },
    { key: "trueAccuracy", label: "True accuracy", kind: "range", min: 0.2, max: 0.95, step: 0.01, help: "Accuracy on items the model has never seen" },
    { key: "retest", label: "Held-out / rephrased re-test", kind: "toggle", help: "Rephrase every item so memorised answers no longer match" },
    { key: "seed", label: "Seed", kind: "range", min: 1, max: 50, step: 1 },
  ],
  defaults,
  metrics: [
    { key: "reportedScore", label: "Reported score", format: "pct" },
    { key: "trueScore", label: "True score", format: "pct" },
    { key: "inflation", label: "Inflation", format: "pct", help: "Reported minus true, in percentage points" },
    { key: "measuredScore", label: "This eval shows", format: "pct" },
    { key: "noiseMargin", label: "Sampling margin (95%)", format: "pct" },
  ],
  compute,
  View,
  math: `A share $c$ of the $n$ test items leaked into training. On those the model scores $m$ (memorised), on the rest its real accuracy $a$ (we take $m \\ge a$). The reported score mixes the two:
$$\\text{reported} = (1-c)\\,a + c\\,m, \\qquad \\text{inflation} = \\text{reported} - a = c\\,(m - a)$$
Inflation is zero when nothing leaked ($c = 0$) or memory does not help ($m = a$).

A **rephrased, held-out re-test** (new wording, new numbers, or items written after the training cut-off) breaks the memorised mapping, so every item is answered at the true accuracy $a$.

Compare inflation with ordinary **sampling noise**: a score on $n$ items has a 95% margin $\\pm 1.96\\sqrt{a(1-a)/n}$.

**Worked example (defaults: $n = 1000$, $c = 0.3$, $m = 0.95$, $a = 0.6$)**:
- reported $= 0.7 \\times 0.6 + 0.3 \\times 0.95 = 0.42 + 0.285 = ${r(d.reportedScore, 3)}$
- inflation $= 0.3 \\times (0.95 - 0.6) = ${r(d.inflation, 3)}$, i.e. ${pc(d.inflation)} points
- noise margin $= 1.96\\sqrt{0.6 \\times 0.4 / 1000} = ${r(d.noiseMargin, 4)}$ (${pc(d.noiseMargin)}): the inflation is about ${Math.round(d.inflation / d.noiseMargin)} times larger than the noise.`,
  explain: (p, m) =>
    m.inflation <= 1e-9
      ? "No contamination effect: the reported score equals the true score (up to sampling noise)."
      : p.retest === true
        ? `The re-test shows ${(m.trueScore * 100).toFixed(1)}%. The public benchmark said ${(m.reportedScore * 100).toFixed(1)}%: ${(m.inflation * 100).toFixed(1)} points came from memorised answers, ${(m.inflation / m.noiseMargin).toFixed(1)}× the sampling margin.`
        : `The benchmark reports ${(m.reportedScore * 100).toFixed(1)}%, but ${(m.inflation * 100).toFixed(1)} points of it are memorised answers. Toggle the rephrased re-test to see the real ability.`,
};
