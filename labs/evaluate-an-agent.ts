// Lab: evaluate an order-support agent before it ships: pass@k vs pass^k by hand and in the sim, grade whole
// trajectories (step accuracy, cost per success), then build an agent design with an eval gate in the sandbox.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

const agentDesign = (agent: NodeConfig, gate?: NodeConfig): Graph =>
  build(
    {
      users: ["users", { rps: 2, hardShare: 0.4, promptTokens: 1500, outputTokens: 250 }],
      ...(gate ? { gate: ["eval-gate", gate] as ["eval-gate", NodeConfig] } : {}),
      agent: ["agent", agent, "Support agent"],
      llm: ["llm-api", { model: "medium", rateLimitRps: 100 }],
      orders: ["tool", { latencyMs: 400, failureRate: 0.03 }, "Orders API"],
      refunds: ["tool", { latencyMs: 600, failureRate: 0.05 }, "Refunds API"],
      obs: ["observability"],
    },
    `${gate ? "users > gate > agent" : "users > agent"} > llm, agent > orders, agent > refunds`,
  );

export const evaluateAnAgent: Lab = {
  slug: "evaluate-an-agent",
  module: "agents",
  title: "Evaluate an agent",
  product: "A refund agent for an electronics retailer",
  summary: "The demo agent \"solves 99% of tasks\". Find out what that number hides: compute pass@k against pass^k, grade whole trajectories rather than final answers, price each success, and ship the agent behind an eval gate in the sandbox.",
  difficulty: "medium",
  minutes: 40,
  tags: ["agent evaluation", "pass@k", "pass^k", "trajectory", "tool calling", "LLM judge", "eval gate", "sandbox"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`An electronics retailer has a refund agent. For each request it should **look up the order**, **check the refund policy**, **issue the refund** and **reply** to the customer, calling real tools along the way.

The vendor's demo slide says the agent "solves 99% of tasks". The fine print: each task was attempted **5 times** and counted as solved if *any* attempt worked. That is **pass@k**. Your customers do not get five tries and a referee to pick the best one; each of them gets one answer, and they come back again and again.

This lab evaluates the agent the way it will be used:

- **pass^k**: does the task succeed on *every one* of $k$ tries? (the τ-bench metric for reliability),
- **trajectory grading**: was each step right, were tool calls well formed, how many steps did it waste,
- **cost per success**: what a solved ticket really costs, retries and checks included,
- an **eval gate** so a worse model version cannot ship silently.`,
    },
    {
      type: "math",
      title: "pass@k vs pass^k",
      body: r`On a given task type the agent succeeds on a single attempt with probability $p = 0.8$, independently each time. For $k = 3$ attempts:

$$\text{pass@}k = 1 - (1-p)^k \qquad\qquad \text{pass}^k = p^k$$`,
      question: r`What is pass^3, the chance that all three attempts succeed? (Three decimals.)`,
      answer: 0.512,
      tolerance: 0.01,
      hint: r`$0.8^3$.`,
      solution: r`$$\text{pass}^3 = 0.8^3 = 0.512 \qquad\text{while}\qquad \text{pass@}3 = 1 - 0.2^3 = 0.992$$

The same agent "solves 99.2%" or "is reliable 51.2% of the time", depending on the question. pass@k suits settings where a verifier can pick the good attempt (code with unit tests). For a customer-facing agent pass^k is the honest number: a customer who asks three times, or three customers with the same problem, all need it to work.`,
    },
    {
      type: "sim",
      title: "How reliable must each attempt be?",
      body: r`The support lead wants **pass^5 of at least 70%**: a task should work on five tries in a row seven times out of ten. She also wants the vendor's pass@5 and your pass^5 to disagree by **at most 30 points**, so the two numbers stop telling different stories.

The number of attempts is fixed at 5. How good must a single attempt be?`,
      sim: "pass-at-k",
      params: { p: 0.8, k: 5, tasks: 20, spread: 0 },
      locked: ["k", "spread"],
      goals: [
        { metric: "passHatK", op: ">=", value: 0.7, label: "pass^5 at least 70%" },
        { metric: "gap", op: "<=", value: 0.3, label: "pass@5 and pass^5 within 30 points" },
      ],
      hints: [
        "pass^5 = p^5, so you need $p \\ge 0.7^{1/5}$.",
        "$0.7^{1/5} = e^{\\ln 0.7 / 5} \\approx 0.931$.",
        "A per-attempt success of 94% meets both goals.",
      ],
      solution: { p: 0.94 },
    },
    {
      type: "quiz",
      title: "Grade the answer or the trajectory?",
      body: r`Two runs of the agent end with the same reply: "Refunded \$89.00, reference R-2291." In run A it took the four expected steps. In run B it called the wrong tool, sent invalid arguments twice, looked the order up twice, and only then issued the refund.`,
      question: "Why grade the trajectory and not only the final answer?",
      options: [
        { text: "Run B shows failure modes (wrong tool, invalid arguments, wasted steps) that cost money and latency and will turn into real failures under a tighter step budget or a flakier tool, even though this time the outcome was right", correct: true, why: "Right. Outcome-only grading hides how close to failure the agent was. Step accuracy, tool-call accuracy and efficiency (steps used vs optimal) show where to improve, and cost per success shows what the waste costs. Keep the outcome metric as the headline and the trajectory metrics as diagnostics." },
        { text: "It doesn't matter: the customer got the right answer both times", why: "This time. Wasted steps cost money on every run and the same mistakes fail the task when the budget or the tools are less forgiving." },
        { text: "Because LLM judges cannot read final answers", why: "Judges read final answers fine. The point is what the answer alone cannot tell you." },
        { text: "Trajectory grading replaces the need for an outcome metric", why: "No: the outcome is what users care about. Trajectory metrics explain it; they do not replace it." },
      ],
    },
    {
      type: "sim",
      title: "Fix the trajectory",
      body: r`Here is the refund agent's trace generator. The tools are flaky (**20% errors**, of which 40% silently return bad data) and the grader is fairly strict (both locked). With a budget of 8 steps and no checks, only 62% of runs succeed.

Get the agent to at least **80% judged task success** and **90% step accuracy**, while keeping the **cost per successful task at most \$0.072**. Step through a few seeds to see what goes wrong.`,
      sim: "agent-trajectory",
      params: { toolErrorRate: 0.2, maxSteps: 8, judgeStrictness: 0.8, verify: false, seed: 3 },
      locked: ["toolErrorRate", "judgeStrictness"],
      goals: [
        { metric: "taskSuccess", op: ">=", value: 0.8, label: "Task success at least 80%" },
        { metric: "stepAccuracy", op: ">=", value: 0.9, label: "Step accuracy at least 90%" },
        { metric: "costPerSuccess", op: "<=", value: 0.072, label: "At most $0.072 per successful task" },
      ],
      hints: [
        "Silent bad data poisons the refund and the reply. Verifying tool results catches most of it.",
        "Verification adds a step after every tool call, so 8 steps is no longer enough budget: runs stop before the reply.",
        "Verification on with a budget of 14 steps passes: more steps per run, but more runs succeed, so the cost per success stays within budget.",
      ],
      solution: { verify: true, maxSteps: 14 },
    },
    {
      type: "math",
      title: "What does a success cost?",
      body: r`With verification on, an average run of the agent costs **\$0.0593** (every step re-reads the growing context) and **84.75%** of runs succeed. Failed runs are paid for too.

$$\text{cost per success} = \frac{\text{average cost per run}}{\text{success rate}}$$`,
      question: r`What is the cost per successful task, in dollars? (Four decimals.)`,
      answer: 0.07,
      tolerance: 0.01,
      unit: "$",
      hint: r`Divide 0.0593 by 0.8475.`,
      solution: r`$$\frac{\$0.0593}{0.8475} = \$0.0700$$

Without verification a run is cheaper (\$0.044) but only 61.75% succeed: $0.044 / 0.6175 = \$0.0713$ per success. Spending more per run bought **more successes per dollar**. Always compare agents on cost per *success*, not cost per run.`,
    },
    {
      type: "design",
      title: "Ship it behind an eval gate",
      body: r`Here is the agent in the sandbox: **5 steps** at 93% per step, **no retries**, two tools, tracing on. Only 59% of tasks succeed, and pass^3 is 20%. The test also runs a **bad model rollout**: the provider silently ships a worse version of the agent's model.

Redesign it so that, under the bad rollout:

- at least **88%** of tasks succeed and **pass^3 is at least 70%**,
- answer quality stays at least **0.80** (an **Eval gate** in front of the agent has to block most bad versions),
- the gate blocks at most **20%** of good releases,
- each task costs at most **\$0.035**.

The *Agent pass^3* tile in the results shows reliability across repeated tries.`,
      starter: agentDesign({ steps: 5, stepSuccess: 0.93, retries: 0 }),
      palette: ["agent", "tool", "llm-api", "observability", "eval-gate", "gateway"],
      test: {
        incident: { type: "badRollout" },
        constraints: [
          { type: "successRate", min: 0.88, why: "Success compounds over steps: fewer steps and a retry per step help most." },
          { type: "taskSuccessPassK", min: 0.7, why: "pass^3 = success³: 90% per task is only 73% over three tries." },
          { type: "quality", min: 0.8, why: "A bad model version reaches users unless an eval gate in front of the agent stops it. A bigger eval set catches more." },
          { type: "gateFalseAlarms", max: 0.2, why: "A threshold inside the noise blocks good releases by chance." },
          { type: "costPerRequest", maxUsd: 0.035, why: "Every step is a model call that re-reads the context. Long chains are expensive." },
        ],
      },
      hints: [
        "Cut the steps to 3 (combine lookups into one tool call) and allow 1 retry per step.",
        "Add an Eval gate between Users and the agent. At 500 items it stops about 87% of bad versions, just short; 1,000 items is enough.",
        "Agent: 3 steps, 1 retry. Eval gate: 1,000 items, block at > 2 pp, LLM judge.",
      ],
      solution: agentDesign({ steps: 3, stepSuccess: 0.93, retries: 1 }, { evalSetSize: 1000, threshold: 2, judge: "llm-judge" }),
    },
  ],
};
