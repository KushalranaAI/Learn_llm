// A scripted support agent: think → call a tool → read the observation, until it answers or runs out of steps.
// Tool calls fail at a set rate (loud errors or silent wrong data); an optional verification step catches silent ones.
// Metric keys: success (0/1 for this seed), steps (LLM calls), tokensUsed, cost (USD), successRate (over 500 seeds).
import { bool, type SimDef } from "../types";
import { big, pc, r } from "./lib";
import { LOUD_SHARE, OBS_TOKENS, SYSTEM_TOKENS, THOUGHT_TOKENS, VERIFY_CATCH, compute, runAgent, successRate } from "./agent-loop-model";
import View from "./agent-loop.view";
export { runAgent, successRate } from "./agent-loop-model";

const defaults = { maxSteps: 12, toolFailureRate: 0.15, seed: 7, verify: true };
const d = runAgent(12, 0.15, true, 7);
const clean = runAgent(12, 0, false, 1);
const cleanV = runAgent(12, 0, true, 1);
const srV = successRate(12, 0.15, true), srN = successRate(12, 0.15, false);

export const agentLoop: SimDef = {
  id: "agent-loop",
  title: "The agent loop: think, act, observe",
  summary: "Step through a support agent's trace as it calls tools, hits errors, retries and verifies. Inject tool failures and see what a step budget and a verification step do to success and cost.",
  module: "agents",
  tags: ["agent", "tool calling", "trace", "retries", "verification"],
  params: [
    { key: "maxSteps", label: "Max steps (LLM calls)", kind: "range", min: 3, max: 30, step: 1 },
    { key: "toolFailureRate", label: "Tool failure rate f", kind: "range", min: 0, max: 0.5, step: 0.01, help: "60% of failures are loud errors, 40% silently return wrong data" },
    { key: "seed", label: "Seed", kind: "range", min: 1, max: 50, step: 1 },
    { key: "verify", label: "Verify each tool result", kind: "toggle", help: "An extra LLM step that catches 90% of silent failures" },
  ],
  defaults,
  metrics: [
    { key: "success", label: "Solved (this run)", format: "int" },
    { key: "steps", label: "Steps used", format: "int" },
    { key: "tokensUsed", label: "Tokens used", format: "int" },
    { key: "cost", label: "Cost", format: "usd" },
    { key: "successRate", label: "Success rate (500 runs)", format: "pct" },
  ],
  compute,
  View,
  math: `The agent needs three tool calls: \`get_order\` → \`track_package\` → \`issue_refund\`, then a final answer. Every **step** is one LLM call that reads the whole context so far.

**Failures.** Each tool call fails with probability $f$. A failure is *loud* (an error the agent sees and retries next step) with probability ${LOUD_SHARE}, otherwise *silent*: plausible but wrong data. With verification on, each result is checked by one extra step that catches a silent failure with probability $c = ${VERIFY_CATCH}$ and triggers a retry. The run fails if a silent failure slips through or the step budget runs out.

Per tool, a silent failure survives with probability $f(1-${LOUD_SHARE})(1-c)$ (or $f(1-${LOUD_SHARE})$ without verification), so ignoring the budget
$$P(\\text{success}) \\approx \\left(1 - \\frac{0.4 f (1 - c)}{1 - f(0.6 + 0.4c)}\\right)^{3}$$
(the denominator accounts for retries until a call is accepted). The *success rate* metric is measured by running the agent with seeds $1001\\dots1500$.

**Tokens.** Context starts at ${SYSTEM_TOKENS} tokens; each step adds ${THOUGHT_TOKENS} output tokens and each observation ${OBS_TOKENS} (verifications ${OBS_TOKENS / 2}). Step $i$ costs its whole context again, so tokens grow roughly **quadratically** with steps:
$$\\text{tokens} = \\sum_{i=1}^{\\text{steps}} (\\text{ctx}_i + ${THOUGHT_TOKENS}), \\qquad \\text{cost} = \\$3/\\text{M}\\cdot\\text{in} + \\$15/\\text{M}\\cdot\\text{out}$$

**Worked example.** A clean run without verification takes ${clean.steps} steps and ${big(clean.tokensUsed)} tokens; with verification ${cleanV.steps} steps and ${big(cleanV.tokensUsed)} tokens.
With the defaults ($f = 0.15$, verify on, seed 7) this run used ${d.steps} steps, ${big(d.tokensUsed)} tokens and \\$${r(d.cost, 4)}, and ${d.success ? "solved" : "failed"} the task. Over 500 seeds: ${pc(srV)} success with verification vs ${pc(srN)} without (formula: ${pc(Math.pow(1 - (0.4 * 0.15 * 0.1) / (1 - 0.15 * (0.6 + 0.4 * 0.9)), 3))} vs ${pc(Math.pow(1 - (0.4 * 0.15) / (1 - 0.15 * 0.6), 3))}).`,
  explain: (p, m) =>
    m.success
      ? `Solved in ${m.steps} steps for $${m.cost.toFixed(4)}. Across 500 runs these settings succeed ${(m.successRate * 100).toFixed(0)}% of the time${bool(p, "verify") ? "; verification costs extra steps but catches silent bad data" : "; without verification, silent tool failures go straight into the answer"}.`
      : `This run failed (see the red events). Across 500 runs these settings succeed ${(m.successRate * 100).toFixed(0)}%: ${bool(p, "verify") ? "if the budget is the problem, raise max steps" : "turn on verification to catch silent failures"}.`,
};
