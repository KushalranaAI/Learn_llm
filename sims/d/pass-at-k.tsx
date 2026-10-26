// pass@k vs pass^k: "solves it at least once in k tries" (coding benchmarks, best-of-k) against "solves it every one
// of k times" (τ-bench style reliability), for one difficulty or a spread of task difficulties.
// Metric keys: passAtK, passHatK, gap (passAtK − passHatK), pass1 (mean single-attempt success).
import type { SimDef } from "../types";
import { pc, r } from "../b/lib";
import { compute, model, taskProbs, passAt, passHat } from "./pass-at-k-model";
import View from "./pass-at-k.view";

const defaults = { p: 0.7, k: 5, tasks: 20, spread: 0 };
const d = model(defaults);
const spreadPs = taskProbs(0.7, 20, 0.5);

export const passAtK: SimDef = {
  id: "pass-at-k",
  title: "pass@k vs pass^k: lucky once or reliable every time?",
  summary: "The same agent looks brilliant under pass@k and fragile under pass^k. Change per-attempt success, the number of attempts and how varied the tasks are, and watch the two metrics pull apart.",
  module: "evaluation",
  tags: ["pass@k", "pass^k", "reliability", "agent evaluation", "τ-bench", "sampling"],
  params: [
    { key: "p", label: "Per-attempt success p", kind: "range", min: 0.05, max: 0.99, step: 0.01, help: "Average chance a single attempt solves a task" },
    { key: "k", label: "Attempts k", kind: "range", min: 1, max: 20, step: 1 },
    { key: "tasks", label: "Tasks in the benchmark", kind: "range", min: 1, max: 100, step: 1 },
    { key: "spread", label: "Difficulty spread", kind: "range", min: 0, max: 1, step: 0.05, help: "0 = every task has the same p; higher = some tasks are easy, some nearly impossible" },
  ],
  defaults,
  metrics: [
    { key: "passAtK", label: "pass@k (any success)", format: "pct", help: "Share of tasks solved at least once in k attempts" },
    { key: "passHatK", label: "pass^k (all succeed)", format: "pct", help: "Share of tasks solved on every one of k attempts" },
    { key: "gap", label: "Gap", format: "pct", help: "How much the two metrics disagree" },
    { key: "pass1", label: "pass@1", format: "pct" },
  ],
  compute,
  View,
  math: `Each attempt at task $i$ succeeds independently with probability $p_i$.

**pass@k** asks "did *any* of $k$ attempts succeed?" (code generation, best-of-$k$ with a verifier):
$$\\text{pass@}k = \\frac{1}{T}\\sum_{i=1}^{T}\\Big(1 - (1-p_i)^k\\Big)$$
**pass^k** asks "did *every* one of $k$ attempts succeed?" (τ-bench: will a customer get the right answer each time they ask?):
$$\\text{pass}^k = \\frac{1}{T}\\sum_{i=1}^{T} p_i^{\\,k}$$
pass@k rises with $k$ towards 1, pass^k falls towards 0, and both equal pass@1 $= \\bar p$ at $k = 1$.

**Difficulty spread.** With spread $s > 0$ the tasks' logits are spaced around $\\operatorname{logit}(p)$ with standard deviation $3s$ (deterministic normal quantiles). Hard tasks drag pass^k down less than you might think (they were failing anyway) and cap pass@k: a task with $p_i \\approx 0$ is never solved, however many tries.

**Worked example (defaults: $p = 0.7$, $k = 5$, no spread)**:
- pass@5 $= 1 - 0.3^5 = 1 - 0.00243 = ${r(d.at, 4)}$
- pass^5 $= 0.7^5 = ${r(d.hat, 4)}$
- gap $= ${r(d.at - d.hat, 4)}$: the agent "solves" ${pc(d.at)} of tasks given five tries, but a customer asking five times gets five right answers only ${pc(d.hat)} of the time.

With spread 0.5 on 20 tasks (same $p$): pass@5 $= ${r(passAt(spreadPs, 5), 3)}$, pass^5 $= ${r(passHat(spreadPs, 5), 3)}$.`,
  explain: (p, m) => {
    const k = Math.round(Number(p.k));
    if (k === 1) return `With one attempt both metrics equal pass@1 = ${(m.pass1 * 100).toFixed(1)}%. Raise k to see them diverge.`;
    return `Given ${k} tries the agent solves ${(m.passAtK * 100).toFixed(0)}% of tasks at least once, but only ${(m.passHatK * 100).toFixed(0)}% every time. Report the one that matches how it is used: pass@k when a verifier can pick the good attempt, pass^k when every user gets one attempt.`;
  },
};
