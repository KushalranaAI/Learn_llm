// Lab: an order-support agent whose tasks fail too often. Compounding reliability p^n, retries only help for detected failures, retry storms.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

const agentGraph = (agent: NodeConfig, withObs: boolean): Graph =>
  build(
    {
      users: ["users", { rps: 2, hardShare: 0.4, promptTokens: 1500, outputTokens: 250 }],
      agent: ["agent", agent, "Order-support agent"],
      llm: ["llm-api", { model: "medium", rateLimitRps: 100 }],
      orders: ["tool", { latencyMs: 400, failureRate: 0.03 }, "Orders API"],
      ...(withObs ? { obs: ["observability"] as ["observability"] } : {}),
    },
    "users > agent > llm, agent > orders",
  );

export const makeTheAgentReliable: Lab = {
  slug: "make-the-agent-reliable",
  module: "agents",
  title: "Make the agent reliable",
  product: "An order-support agent for an online retailer",
  summary: "An agent that looks up orders and issues refunds completes only 6 tasks in 10. Compute why long chains fail by hand, see which retries actually help, shorten and instrument the agent in the sandbox, and avoid the retry storm.",
  difficulty: "medium",
  minutes: 35,
  tags: ["agents", "reliability", "retries", "verification", "exponential backoff", "tracing", "sandbox"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`An online retailer built a support agent. A customer writes "Where is my order, and can I get a refund for the missing item?" and the agent loops: **think** (a model call), **act** (call the Orders API), **observe**, and repeat until it can answer.

On a typical task the agent takes 5 steps. In testing each individual step looks fine, with the model choosing and using the right tool 93% of the time, yet only about **6 in 10 customers** get a correct resolution.

The reason is simple and unforgiving. If each step succeeds with probability $p$ and the task needs $n$ steps in a row, the whole task succeeds with probability

$$P(\text{success}) = p^{n}$$

Reliability **compounds**: a 95%-reliable step is a 60%-reliable ten-step task. This lab shows how to fight that with fewer steps, retries on failures you can detect, and verification for the ones you cannot, and how not to make an outage worse by retrying badly.`,
    },
    {
      type: "math",
      title: "The compounding rule",
      body: r`Each step of a ten-step task succeeds with probability $p = 0.95$, independently of the others.`,
      question: r`What is the probability that all ten steps succeed? (Four decimals.)`,
      answer: 0.5987,
      tolerance: 0.005,
      hint: r`Compute $0.95^{10}$.`,
      solution: r`$$0.95^{10} = e^{10\ln 0.95} = e^{-0.5129} = 0.5987$$

So a "95% reliable" step gives a task that fails **four times in ten**. It also shows the other direction: at $p = 0.99$ the ten-step task succeeds $0.99^{10} = 90.4\%$ of the time. Small improvements in per-step reliability are worth a lot, and so is removing steps.`,
    },
    {
      type: "quiz",
      title: "Which failures do retries fix?",
      body: r`Two kinds of step failures happen. **Loud** failures are visible: the API throws an error or times out. **Silent** failures are not: the model calls the right tool with a wrong argument, or misreads a result, and carries on confidently.`,
      question: "Adding \"retry up to 2 times\" to every step mostly helps with which failures?",
      options: [
        { text: "Loud ones: the agent can see that the step failed, so it can try again. Silent failures look like successes and need a separate check", correct: true, why: "Right. A retry needs a trigger. With a verifier (a check of the output against a schema, a second model, a business rule) silent failures become detectable and retryable too. Without one, retries cannot touch them." },
        { text: "All failures equally, since the agent simply tries again", why: "A retry only fires when the agent knows something went wrong. A silently wrong tool call never triggers it." },
        { text: "Silent ones only, because loud ones are already handled by the API", why: "It is the other way round: loud failures are exactly those that can trigger a retry." },
        { text: "None, because a failed step will fail again in exactly the same way", why: "Many failures are transient (timeouts, rate limits, sampling variance) and succeed on a second attempt." },
      ],
    },
    {
      type: "sim",
      title: "Retries and verification",
      body: r`The simulator models a ten-step task with 95% per-step success. By default it has one retry and **no verifier**, which gives a 77% task success rate (about half of the failures are loud, and the retry can only fix those).

Reach at least **95% task success** while keeping the expected number of calls at most **25** (retries and checks both cost calls).`,
      sim: "agent-reliability",
      params: { p: 0.95, n: 10, retries: 1, verify: false, catchRate: 0.9 },
      locked: ["p", "n", "catchRate"],
      goals: [
        { metric: "successRate", op: ">=", value: 0.95, label: "Task success rate at least 95%" },
        { metric: "expectedCalls", op: "<=", value: 25, label: "At most 25 calls per task on average" },
      ],
      hints: [
        "Retries alone cannot fix silent failures. Turn on verification so they can be caught.",
        "Verification doubles the calls per attempt, so be careful with the number of retries.",
        "Verification on with 2 retries gives about 97% success for about 21 calls.",
      ],
      solution: { retries: 2, verify: true },
    },
    {
      type: "math",
      title: "How long can the task be?",
      body: r`Without retries or checks and with $p = 0.98$ per step, how many steps can a task have before its success rate falls below **90%**? Solve $p^{n} \ge 0.9$ for $n$:

$$n \le \frac{\ln 0.9}{\ln p}$$`,
      question: r`What is the longest task (as a real number of steps, one decimal) that still succeeds 90% of the time?`,
      answer: 5.2,
      tolerance: 0.02,
      unit: "steps",
      hint: r`$\ln 0.9 = -0.10536$ and $\ln 0.98 = -0.020203$.`,
      solution: r`$$n \le \frac{\ln 0.9}{\ln 0.98} = \frac{-0.10536}{-0.020203} = 5.22$$

So a 98%-reliable step supports **5 steps** at a 90% bar. The agent in this lab needs 5 steps at 93% per step, which gives only $0.93^5 = 70\%$. The two levers are clear: raise per-step reliability or cut the number of steps.`,
    },
    {
      type: "design",
      title: "Shorten, retry and instrument",
      body: r`Here is the production agent in the sandbox: **5 steps**, **93%** per-step success, **no retries**, calling the Orders API (3% error rate per call). Only 61% of tasks succeed.

Redesign it to reach all of these:

- at least **90%** of tasks succeed,
- p99 task latency within **20 s** (every step adds a model call and a tool call),
- at most **\$0.035** per task,
- the design includes **Observability**, because you cannot fix what you cannot see.

You can change the agent's steps and retries (the number of steps is a design choice: a better prompt or a combined tool can merge steps).`,
      starter: agentGraph({ steps: 5, stepSuccess: 0.93, retries: 0 }, false),
      palette: ["agent", "tool", "llm-api", "retriever", "observability", "gateway"],
      test: {
        constraints: [
          { type: "successRate", min: 0.9, why: "Each step has a 7% chance of failing and there are five of them in a row, plus tool errors." },
          { type: "p99", maxMs: 20000, why: "Every step costs a model call and a tool call. Long chains are slow." },
          { type: "costPerRequest", maxUsd: 0.035, why: "Each retry is another model call. Retrying everything four times is expensive." },
          { type: "requires", kind: "observability", why: "Traces show which step fails most. Without them you are guessing." },
        ],
      },
      hints: [
        "Fewer steps raise the success rate and cut latency and cost at the same time.",
        "Three steps instead of five, with one retry per step, is a good first try.",
        "Set steps = 3 and retries = 1, and add an Observability node.",
      ],
      solution: agentGraph({ steps: 3, stepSuccess: 0.93, retries: 1 }, true),
    },
    {
      type: "sim",
      title: "Do not turn an outage into a storm",
      body: r`The Orders API goes down for 20 seconds. Thousands of agents retry. If every client retries on a **fixed** schedule they all come back at the same moments and hit the recovering service together: a **retry storm** that can keep it down.

Pick a retry strategy that keeps the peak load at most **6 times** normal, the average attempts per request at most **2.5**, and recovery within **30 seconds** of the outage ending, while still serving at least **80%** of requests.`,
      sim: "retry-backoff",
      params: { strategy: "fixed", outageSec: 20, retryWindow: 30, baseDelay: 1, capacityX: 1.5 },
      locked: ["outageSec", "retryWindow", "baseDelay", "capacityX"],
      goals: [
        { metric: "peakLoadX", op: "<=", value: 6, label: "Peak load at most 6x normal" },
        { metric: "amplification", op: "<=", value: 2.5, label: "At most 2.5 attempts per request" },
        { metric: "recoverySec", op: "<=", value: 30, label: "Recovered within 30 s of the outage ending" },
        { metric: "successRate", op: ">=", value: 0.8, label: "At least 80% of requests eventually served" },
      ],
      hints: [
        "With a fixed interval every client retries at the same moments. The load graph shows tall synchronised spikes.",
        "Exponential backoff spreads retries out over longer and longer gaps.",
        "Exponential backoff (and jitter, which also randomises the gaps) both pass.",
      ],
      solution: { strategy: "exponential" },
    },
  ],
};
