// Lab: capacity planning for a support-chat launch. GPUs needed from QPS and tokens, utilisation headroom, and cost per request.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

const fleet = (llm: NodeConfig): Graph =>
  build(
    {
      users: ["users", { rps: 12, promptTokens: 800, outputTokens: 300 }],
      llm: ["llm-selfhost", { model: "8B", batching: true, maxBatch: 32, replicas: 1, ...llm }, "Chat fleet"],
    },
    "users > llm",
  );

export const capacityPlan: Lab = {
  slug: "capacity-plan",
  module: "inference-and-serving",
  title: "Capacity plan",
  product: "A telecom's support chat launch",
  summary: "A telecom is launching a support assistant to 50 requests a second. Turn requests, tokens and per-GPU throughput into a GPU count and a monthly bill, decide how much headroom to keep, and then size a self-hosted fleet in the sandbox that survives a traffic spike.",
  difficulty: "medium",
  minutes: 35,
  tags: ["capacity planning", "utilization", "headroom", "cost per request", "GPUs", "sandbox"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A telecom company is launching an AI assistant in its app. Product has the forecasts; you have to turn them into a hardware request:

- **50 requests per second** at the evening peak,
- about **1,000 prompt tokens** and **300 output tokens** per request,
- an 8B open model on **H100** GPUs at \$2.50 per GPU-hour,
- finance wants a monthly number, and operations wants the fleet to survive a surge without paging anyone.

The method is always the same four steps:

1. **Demand**: requests per second $\times$ tokens per request.
2. **Supply**: tokens per second one replica can sustainably produce (from a measured or modelled batch).
3. **Replicas** $= \lceil \text{demand} / (\text{supply}\times\text{target utilisation})\rceil$. Never plan to run at 100%.
4. **Cost** $=$ GPUs $\times$ hourly price $\times$ 730 hours.`,
    },
    {
      type: "math",
      title: "How many replicas?",
      body: r`At the default operating point (batch 32) one H100 replica produces **2,983 output tokens per second**. A smaller test run needs **20 requests/s** with 300 output tokens each, and operations wants to plan for **70% utilisation**.

Compute the number of replicas as a real number first (before rounding up to whole GPUs).`,
      question: r`How many replicas does the formula $\dfrac{\text{demand}}{\text{supply}\times\text{utilisation}}$ give?`,
      answer: 2.87,
      tolerance: 0.02,
      hint: r`Demand $= 20\times 300 = 6000$ tokens/s. Divide by $2983\times 0.7$.`,
      solution: r`**Demand.**

$$20\ \text{req/s}\times 300\ \text{tokens} = 6{,}000\ \text{tokens/s}$$

**Usable supply per replica.**

$$2{,}983\times 0.7 = 2{,}088\ \text{tokens/s}$$

**Replicas.**

$$\frac{6{,}000}{2{,}088} = 2.87\ \Rightarrow\ \lceil 2.87\rceil = 3\ \text{GPUs}$$

Rounding up matters: 2.87 means a third GPU that is 87% used by the time the first two are at the 70% target. The sim agrees: 3 replicas.`,
    },
    {
      type: "sim",
      title: "Meet the budget at 50 requests/s",
      body: r`Now scale to the real peak: **50 requests/s**. With batch size 32 and a 70% utilisation target the fleet needs 8 H100s and costs \$14,600 a month, more than the \$12,000 budget.

You may change the **operating batch size** per replica and the **target utilisation**. Meet two goals: monthly cost at most **\$12,000**, and the actual utilisation at most **75%** (so the fleet has some headroom).`,
      sim: "gpu-capacity",
      params: { qps: 50, promptTokens: 1000, outputTokens: 300, model: "llama3-8b", gpu: "h100", batch: 32, targetUtil: 0.7, gpuPrice: 2.5 },
      locked: ["qps", "promptTokens", "outputTokens", "model", "gpu", "gpuPrice"],
      goals: [
        { metric: "monthlyCost", op: "<=", value: 12000, label: "Monthly cost at most \$12,000" },
        { metric: "actualUtil", op: "<=", value: 0.75, label: "Actual utilisation at most 75%" },
      ],
      hints: [
        "A larger batch makes each replica produce more tokens per second, so fewer replicas are needed.",
        "Raising the target utilisation also saves GPUs but erodes headroom. Watch the actual utilisation readout.",
        "Batch 64 reaches the cost goal with about 60% utilisation.",
      ],
      solution: { batch: 64 },
    },
    {
      type: "quiz",
      title: "Why not run at 90%?",
      body: r`Finance asks why the plan keeps GPUs at 60-70% instead of 90%, which would need fewer of them. Requests do not arrive evenly, and each request occupies a slot for several seconds.`,
      question: "What is the main reason to plan for headroom?",
      options: [
        { text: "Queueing delay grows sharply as utilisation approaches 100%, and bursts or a failed GPU push the fleet over the edge", correct: true, why: "Right. In a queueing system the wait grows roughly like $\\rho/(1-\\rho)$: at 90% it is several times higher than at 60%, and any burst above capacity makes the queue grow without bound until requests time out." },
        { text: "GPUs wear out faster when they are used more than 70%", why: "GPU wear is not what drives headroom. The reason is queueing delay and burst tolerance." },
        { text: "Higher utilisation produces lower-quality answers", why: "Answer quality does not depend on how busy the GPU is. Latency and timeouts do." },
        { text: "Cloud providers refuse to rent GPUs that will run above 70%", why: "There is no such rule. Headroom is an engineering choice." },
      ],
    },
    {
      type: "sim",
      title: "Survive a 2x surge",
      body: r`A marketing text message can double traffic within minutes, and autoscaling takes several minutes to react. Plan the fleet so it holds **2x the peak** without queueing: the **actual utilisation at normal peak must be at most 50%**. Keep the bill at most **\$18,000** a month.

Start from the batch-64 plan with a 90% target (too aggressive) and change what you must.`,
      sim: "gpu-capacity",
      params: { qps: 50, promptTokens: 1000, outputTokens: 300, model: "llama3-8b", gpu: "h100", batch: 64, targetUtil: 0.9, gpuPrice: 2.5 },
      locked: ["qps", "promptTokens", "outputTokens", "model", "gpu", "gpuPrice", "batch"],
      goals: [
        { metric: "actualUtil", op: "<=", value: 0.5, label: "Actual utilisation at most 50% at normal peak" },
        { metric: "monthlyCost", op: "<=", value: 18000, label: "Monthly cost at most \$18,000" },
      ],
      hints: [
        "Utilisation at 2x load is twice the normal-peak utilisation. You need it to stay at or under 100%.",
        "Lower the target utilisation: the planner then adds replicas.",
        "A 50% target does it.",
      ],
      solution: { targetUtil: 0.5 },
    },
    {
      type: "math",
      title: "Cost per thousand requests",
      body: r`For the 20 requests/s test, the plan from earlier uses **3 H100s** at \$2.50 per GPU-hour. The service handles all 20 requests per second.`,
      question: r`What does the fleet cost per **1,000 requests**, in dollars?`,
      answer: 0.1042,
      tolerance: 0.02,
      unit: "USD",
      hint: r`Fleet cost per second $= 3\times 2.50/3600$. Requests per second is 20. Scale to 1,000.`,
      solution: r`$$\text{fleet cost per second} = \frac{3\times 2.50}{3600} = \$0.002083$$

$$\text{cost per request} = \frac{0.002083}{20} = \$0.000104$$

$$\text{per 1,000 requests} = \$0.1042$$

About ten cents per thousand requests is the figure to compare against a hosted API at the same traffic (the sandbox shows both). It rises if utilisation falls, because idle GPUs cost the same as busy ones.`,
    },
    {
      type: "design",
      title: "Size the fleet in the sandbox",
      body: r`A smaller region needs **12 requests/s** (800-token prompts, 300-token answers) from a self-hosted 8B model. The design below has **one A100**, which is completely overloaded.

Choose the GPU type, the number of replicas and (optionally) the quantization so that:

- nearly every request is answered, **also when traffic jumps 1.5x**,
- the 99th-percentile first token is within **4 s** even then,
- GPUs are no more than **80%** busy on a normal day,
- the bill is under **\$7,000** a month.`,
      starter: fleet({ gpu: "A100", replicas: 1, quantization: "fp16" }),
      palette: ["llm-selfhost", "llm-api", "semantic-cache", "gateway"],
      test: {
        constraints: [
          { type: "successRate", min: 0.99, why: "One A100 serves about 5 requests/s in this setup. At 12 requests/s most fail." },
          { type: "successRate", min: 0.99, under: { type: "trafficSpike", factor: 1.5 }, label: "Success rate ≥ 99% during a 1.5x spike", why: "A fleet sized for exactly today's peak has nothing left when traffic jumps." },
          { type: "ttft", maxMs: 4000, under: { type: "trafficSpike", factor: 1.5 }, label: "p99 first token ≤ 4 s during a 1.5x spike", why: "Even when requests are not failing, a nearly full GPU queues them." },
          { type: "gpuUtil", max: 0.8, why: "Plan for at most 80% busy on a normal day." },
          { type: "costPerMonth", maxUsd: 7000, why: "Four A100s in fp16 cost \$8,760: over budget." },
        ],
      },
      hints: [
        "Open the model node and read its capacity (requests/s per replica) from the inspector.",
        "Two H100s, or three A100s with INT8 weights, each give enough capacity for 18 requests/s.",
        "Try H100 with two replicas, or A100 with three replicas and INT8.",
      ],
      solution: fleet({ gpu: "H100", replicas: 2, quantization: "fp16" }),
    },
  ],
};
