// A CI regression gate: score each candidate build on an eval set and block the release when the measured drop
// exceeds a threshold. Too tight and good builds are blocked by noise; too loose and real regressions ship.
// Metric keys: falseAlarmRate (blocks a non-regressed build), missRate (ships the true regression), minDetectable
//              (drop caught 80% of the time, as a fraction), seDrop (standard error of the measured drop, fraction).
import type { SimDef } from "../types";
import { pc, r } from "../b/lib";
import { compute, model } from "./eval-gate-sim-model";
import View from "./eval-gate.view";

const defaults = { evalSetSize: 300, trueRegression: 3, threshold: 2, baselineAccuracy: 0.85, noise: 1, seed: 1 };
const d = model(defaults);
const big = model({ ...defaults, evalSetSize: 1500 });

export const evalGate: SimDef = {
  id: "eval-gate",
  title: "The eval gate: block regressions, not good builds",
  summary: "Every build runs the eval set in CI and is blocked if its score drops more than a threshold. Size the eval set and set the threshold so real regressions are caught without crying wolf.",
  module: "evaluation",
  tags: ["CI", "regression testing", "eval set", "false alarms", "release gate", "statistics"],
  params: [
    { key: "evalSetSize", label: "Eval set size n", kind: "range", min: 50, max: 5000, step: 10, log: true },
    { key: "trueRegression", label: "True regression", kind: "range", min: 0, max: 10, step: 0.5, unit: "pp", help: "How much worse the candidate really is (percentage points)" },
    { key: "threshold", label: "Block if drop >", kind: "range", min: 0, max: 10, step: 0.5, unit: "pp" },
    { key: "baselineAccuracy", label: "Baseline accuracy", kind: "range", min: 0.5, max: 0.99, step: 0.01 },
    { key: "noise", label: "Run-to-run noise", kind: "range", min: 0, max: 5, step: 0.1, unit: "pp", help: "Standard deviation from sampling temperature and judge variance" },
    { key: "seed", label: "Seed (animation)", kind: "range", min: 1, max: 50, step: 1 },
  ],
  defaults,
  metrics: [
    { key: "falseAlarmRate", label: "False alarm rate", format: "pct", help: "Chance a build with no regression is blocked" },
    { key: "missRate", label: "Miss rate", format: "pct", help: "Chance the regressed build ships" },
    { key: "minDetectable", label: "Min. detectable drop (80%)", format: "pct", help: "Drop in points caught 80% of the time" },
    { key: "seDrop", label: "SE of measured drop", format: "pct" },
  ],
  compute,
  View,
  math: `The gate measures the candidate's accuracy drop $\\hat D$ against the baseline score on $n$ items. Both scores carry sampling error, and repeated runs differ by noise $\\sigma$ (temperature, judge variance), so
$$\\hat D \\sim \\mathcal N\\big(R,\\ \\text{SE}^2\\big), \\qquad \\text{SE} = \\sqrt{\\frac{2p(1-p)}{n} + \\sigma^2}$$
where $R$ is the true regression and $p$ the baseline accuracy. The gate blocks when $\\hat D > T$:
$$\\text{false alarm} = P(\\hat D > T \\mid R = 0) = 1 - \\Phi\\!\\left(\\frac{T}{\\text{SE}}\\right), \\qquad \\text{miss} = P(\\hat D \\le T \\mid R) = \\Phi\\!\\left(\\frac{T - R}{\\text{SE}}\\right)$$
The smallest regression caught 80% of the time is $T + z_{0.8}\\,\\text{SE} = T + 0.84\\,\\text{SE}$. To get false alarms $\\le \\alpha$ and misses $\\le \\beta$ you need $T \\ge z_{1-\\alpha}\\text{SE}$ and $R - T \\ge z_{1-\\beta}\\text{SE}$, i.e. $\\text{SE} \\le R / (z_{1-\\alpha} + z_{1-\\beta})$: a bigger eval set or less noise.

**Worked example (defaults: $n = 300$, $p = 0.85$, $\\sigma = 1$ pp, $T = 2$ pp, $R = 3$ pp)**:
- $\\text{SE} = \\sqrt{2 \\times 0.85 \\times 0.15 / 300 + 0.01^2} = \\sqrt{0.00085 + 0.0001} = ${r(d.se / 100, 4)}$ (${r(d.se, 2)} pp)
- false alarm $= 1 - \\Phi(2 / ${r(d.se, 2)}) = ${r(d.falseAlarm, 3)}$: about one clean build in ${Math.round(1 / d.falseAlarm)} is blocked
- miss $= \\Phi((2 - 3) / ${r(d.se, 2)}) = ${r(d.miss, 3)}$; min. detectable $= 2 + 0.84 \\times ${r(d.se, 2)} = ${r(d.minDetectable, 2)}$ pp

With $n = 1500$ the SE falls to ${r(big.se, 2)} pp: false alarms ${pc(big.falseAlarm)}, misses ${pc(big.miss)}.`,
  explain: (_p, m) =>
    m.falseAlarmRate > 0.1 && m.missRate > 0.2
      ? `The gate is noisy both ways: ${(m.falseAlarmRate * 100).toFixed(0)}% of good builds are blocked and ${(m.missRate * 100).toFixed(0)}% of real regressions ship. The standard error (${(m.seDrop * 100).toFixed(1)} pp) is too big for this threshold: grow the eval set or cut run-to-run noise.`
      : m.falseAlarmRate > 0.1
        ? `${(m.falseAlarmRate * 100).toFixed(0)}% false alarms: engineers will learn to ignore the gate. Raise the threshold or grow the eval set.`
        : m.missRate > 0.2
          ? `${(m.missRate * 100).toFixed(0)}% of real regressions slip through: only drops above ${(m.minDetectable * 100).toFixed(1)} pp are reliably caught. Lower the threshold (and grow the set to keep false alarms down).`
          : `A useful gate: ${(m.falseAlarmRate * 100).toFixed(1)}% false alarms and ${(m.missRate * 100).toFixed(1)}% misses for this regression.`,
};
