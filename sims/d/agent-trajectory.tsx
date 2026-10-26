// Agent trajectory evaluation: grade a support agent's whole trace, not just its final answer. Outcome, per-step
// correctness, tool-call accuracy, efficiency and cost per success, with injected tool faults and a judge whose
// strictness changes what "correct" means.
// Metric keys: taskSuccess (judged, over 400 runs), trueSuccess, stepAccuracy, toolCallAccuracy (right tool + valid
//              args), efficiency (optimal ÷ actual steps), costPerSuccess (USD), avgCost, runSuccess (this seed, 0/1).
import type { SimDef } from "../types";
import { pc, r } from "../b/lib";
import { CTX0, CTX_STEP, LOUD, OUT, P_BAD_ARGS, P_REDUNDANT, P_REPLY_MINOR, P_WRONG_TOOL, PRICE, RUNS, VERIFY_CATCH, VERIFY_PRICE_SCALE, compute } from "./agent-trajectory-model";
import View from "./agent-trajectory.view";

const defaults = { toolErrorRate: 0.1, maxSteps: 10, judgeStrictness: 0.7, verify: false, seed: 3 };
const d = compute(defaults);
const d0 = compute({ ...defaults, toolErrorRate: 0 });
const step1 = (CTX0 * PRICE.inPerM + OUT * PRICE.outPerM) / 1e6 + PRICE.tool;
const step4 = ((CTX0 + 3 * CTX_STEP) * PRICE.inPerM + OUT * PRICE.outPerM) / 1e6;

export const agentTrajectory: SimDef = {
  id: "agent-trajectory",
  title: "Grading an agent's trajectory, step by step",
  summary: "A refund agent looks up the order, checks the policy, issues the refund and replies. Inject tool faults, change the judge's strictness and see how outcome, step accuracy, tool-call accuracy and cost per success move.",
  module: "agents",
  tags: ["agent evaluation", "trajectory", "tool calling", "LLM judge", "cost per success"],
  params: [
    { key: "toolErrorRate", label: "Tool error rate", kind: "range", min: 0, max: 0.5, step: 0.01, help: `${LOUD * 100}% of errors are loud (timeouts), the rest silently return bad data` },
    { key: "maxSteps", label: "Step budget", kind: "range", min: 4, max: 16, step: 1 },
    { key: "judgeStrictness", label: "Judge strictness", kind: "range", min: 0, max: 1, step: 0.05, help: "Low = lenient: passes vague replies and misses some real errors" },
    { key: "verify", label: "Verify tool results", kind: "toggle", help: `An extra step after each tool call that catches ${VERIFY_CATCH * 100}% of silent bad data` },
    { key: "seed", label: "Seed (shown run)", kind: "range", min: 1, max: 50, step: 1 },
  ],
  defaults,
  metrics: [
    { key: "taskSuccess", label: "Task success (judged)", format: "pct" },
    { key: "trueSuccess", label: "Really solved", format: "pct", help: "What a perfect grader would say" },
    { key: "stepAccuracy", label: "Step accuracy", format: "pct", help: "Steps the judge marks correct" },
    { key: "toolCallAccuracy", label: "Tool-call accuracy", format: "pct", help: "Right tool with valid arguments" },
    { key: "efficiency", label: "Efficiency", format: "pct", help: "Optimal steps (4) ÷ steps used, for finished runs" },
    { key: "costPerSuccess", label: "Cost per success", format: "usd" },
    { key: "avgCost", label: "Cost per run", format: "usd" },
    { key: "runSuccess", label: "This run solved", format: "int" },
  ],
  compute,
  View,
  math: `**The task** needs four steps: \`lookup_order\` → \`check_policy\` → \`issue_refund\` → reply. At each tool step the agent picks the wrong tool with probability ${P_WRONG_TOOL} or sends invalid arguments with probability ${P_BAD_ARGS} (both retried next step), and after the first lookup it repeats the lookup with probability ${P_REDUNDANT} (a redundant call). The tool itself fails with probability $f$: ${LOUD * 100}% loud (timeout, retried), ${(1 - LOUD) * 100}% silent bad data that poisons the refund and the reply unless a verification step (if on: one extra step per tool call, run by a small checker model at ${VERIFY_PRICE_SCALE * 100}% of the price) catches it with probability ${VERIFY_CATCH}. ${P_REPLY_MINOR * 100}% of replies are vague (no amount or reference).

**Grading.** Each step's truth is *ok*, *env* (a tool outage, not the agent's fault), *minor* (redundant or vague) or *major* (wrong tool, invalid args, wrong data). A judge with strictness $s$ passes
$$P(\\text{pass}\\mid\\text{ok/env}) = 1, \\qquad P(\\text{pass}\\mid\\text{minor}) = 1 - s, \\qquad P(\\text{pass}\\mid\\text{major}) = \\tfrac12 (1-s)^2$$
The run is a judged success if the agent replies within the budget and the judge passes the reply.

**Metrics** over $N = ${RUNS}$ runs:
$$\\text{step acc.} = \\frac{\\#\\text{steps passed}}{\\#\\text{steps}}, \\quad \\text{tool-call acc.} = \\frac{\\#\\text{valid calls}}{\\#\\text{tool calls}}, \\quad \\text{efficiency} = \\frac{4}{\\overline{\\text{steps}}}, \\quad \\frac{\\$}{\\text{success}} = \\frac{\\sum \\text{cost}}{\\#\\text{successes}}$$

**Cost.** Step $t$ re-reads a context of $${CTX0} + ${CTX_STEP}(t-1)$ tokens and writes ${OUT}: at \\$${PRICE.inPerM}/M in and \\$${PRICE.outPerM}/M out, step 1 costs $${r(step1, 5)}$ (with the \\$${PRICE.tool} tool call) and the reply at step 4 $${r(step4, 5)}$.

**Worked example (defaults: $f = 0.1$, budget 10, $s = 0.7$, no verification)**: judged task success ${pc(d.taskSuccess)} vs really solved ${pc(d.trueSuccess)}; step accuracy ${pc(d.stepAccuracy)}; tool-call accuracy ${pc(d.toolCallAccuracy)}; efficiency ${pc(d.efficiency)}; cost per success \\$${r(d.costPerSuccess, 4)}. With $f = 0$: judged success ${pc(d0.taskSuccess)} and \\$${r(d0.costPerSuccess, 4)} per success.`,
  explain: (_p, m) => {
    const gap = m.taskSuccess - m.trueSuccess;
    const judge = gap > 0.03 ? ` The judge is lenient: it reports ${(m.taskSuccess * 100).toFixed(0)}% but only ${(m.trueSuccess * 100).toFixed(0)}% are really solved.` : "";
    return `${(m.taskSuccess * 100).toFixed(0)}% of runs succeed (judged), ${(m.stepAccuracy * 100).toFixed(0)}% of steps are correct and ${(m.toolCallAccuracy * 100).toFixed(0)}% of tool calls are well formed, at $${m.costPerSuccess.toFixed(3)} per success.${judge}`;
  },
};
