// Lab: self-host an 8B open model for a bank's support chat. Decode is bandwidth-bound, so batching is the lever; then quantization.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

/** One users node (800-token prompts, 300-token answers) in front of a self-hosted 8B model. */
const chat = (rps: number, llm: NodeConfig): Graph =>
  build(
    {
      users: ["users", { rps, promptTokens: 800, outputTokens: 300 }],
      llm: ["llm-selfhost", { model: "8B", ...llm }, "8B chat model"],
    },
    "users > llm",
  );

export const serveAChatModel: Lab = {
  slug: "serve-a-chat-model",
  module: "inference-and-serving",
  title: "Serve a chat model",
  product: "A bank's support chat on its own GPUs",
  summary: "A bank self-hosts an 8B model for its support chat. Work out why one GPU serving one user wastes almost everything, find a batch size that balances throughput and speed, then build serving designs in the sandbox that meet success, latency and budget targets.",
  difficulty: "medium",
  minutes: 40,
  tags: ["batching", "decode", "memory bandwidth", "TTFT", "quantization", "GPU cost", "sandbox"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A bank's compliance team will not let customer chats leave its own data centre, so the support assistant runs on a **self-hosted 8B open model**, streaming answers to the app.

A typical turn: about 800 prompt tokens (instructions, history, question) and 300 output tokens. Users care about two things: how fast the **first token** appears (TTFT) and how fast text streams afterwards.

A request has two phases:

- **Prefill**: process all 800 prompt tokens in one parallel pass. This is compute-heavy and fast.
- **Decode**: write the answer one token at a time. Each token needs a full pass over the model, which means reading **every weight** from GPU memory.

That second phase is why serving is about memory bandwidth, and why **batching** many requests into each step is the main lever. In this lab you will compute the limit by hand, find a good batch size, and then fix two sandbox designs.`,
    },
    {
      type: "quiz",
      title: "Why batching is nearly free",
      body: r`At batch size 1, each decode step moves the model's 16 GB of weights through the GPU's memory system to produce **one** token for **one** user. The arithmetic done with those weights is tiny compared with what the GPU can do.`,
      question: "What happens to throughput if you decode 32 users in the same step instead of 1?",
      options: [
        { text: "The step takes only slightly longer (the weights are read once for all 32), so total tokens per second rises by close to 32x", correct: true, why: "Right. Reading the weights dominates and is shared by the whole batch. Compute grows with the batch but is still far from the GPU's limit, so each step stays almost as fast. Per-user speed falls only gently." },
        { text: "Throughput stays the same: the GPU has a fixed number of tokens per second", why: "That would be true only if compute were the bottleneck. In decode, memory bandwidth is, and bandwidth is shared across the batch." },
        { text: "Latency per user drops 32x because users share the work", why: "Users do not finish sooner. Each user's step time is about the same or slightly worse; the gain is in how many users the GPU serves in parallel." },
        { text: "Throughput falls, because the GPU must switch between users", why: "Continuous batching runs all active sequences in one fused step. There is no switching cost of that kind." },
      ],
    },
    {
      type: "math",
      title: "The bandwidth ceiling",
      body: r`An A10G has about **600 GB/s** of memory bandwidth. The 8B model in fp16 is **16 GB** of weights. Ignore compute, KV-cache reads and software overhead: at batch size 1, one decode step has to read all the weights once.`,
      question: r`What is the maximum decode speed for a single stream, in tokens per second?`,
      answer: 37.5,
      tolerance: 0.02,
      unit: "tokens/s",
      hint: r`Time per step $= \text{bytes}/\text{bandwidth}$. Tokens per second is the reciprocal.`,
      solution: r`$$t_\text{step} = \frac{16\text{ GB}}{600\text{ GB/s}} = 26.7\text{ ms}$$

$$\text{tokens/s} = \frac{1}{0.0267} = 37.5$$

No amount of GPU compute raises this limit for batch size 1. Quantizing to int8 halves the bytes (75 tokens/s ceiling); an H100 with 3,350 GB/s would reach about 209. Batching leaves the *per-stream* ceiling alone but multiplies the number of streams.`,
    },
    {
      type: "sim",
      title: "Find the right batch size",
      body: r`One H100 serving the 8B model, prompts of 1,000 tokens and answers of 300 tokens. It starts at batch size 1. Find a batch size that gives the replica real throughput while each user still gets a fast stream:

- replica throughput at least **2,500 tokens/s**,
- each user at least **100 tokens/s**,
- cost at most **\$0.25 per million output tokens**.`,
      sim: "llm-batching",
      params: { model: "llama3-8b", gpu: "h100", batch: 1, promptTokens: 1000, outputTokens: 300, gpuPrice: 2.5 },
      locked: ["model", "gpu", "promptTokens", "outputTokens", "gpuPrice"],
      goals: [
        { metric: "tokensPerSec", op: ">=", value: 2500, label: "Replica throughput at least 2,500 tokens/s" },
        { metric: "perUserTps", op: ">=", value: 100, label: "Each user sees at least 100 tokens/s" },
        { metric: "costPer1M", op: "<=", value: 0.25, label: "Cost at most \$0.25 per 1M output tokens" },
      ],
      hints: [
        "Slide the batch size up and watch both charts: throughput climbs, per-user speed falls.",
        "Throughput must be at least 2,500 but each user must stay at or above 100 tokens/s. That limits how far you can go.",
        "Anything from about 24 to 70 works. Try 32.",
      ],
      solution: { batch: 32 },
    },
    {
      type: "math",
      title: "Price a million tokens",
      body: r`At batch size 32 the replica produces **2,983 output tokens per second**. The H100 rents for **\$2.50 per GPU-hour**.`,
      question: r`What does one million output tokens cost, in dollars?`,
      answer: 0.2328,
      tolerance: 0.02,
      unit: "USD",
      hint: r`Tokens per hour $= 2983\times 3600$. Divide the hourly price by it, then scale to $10^6$ tokens.`,
      solution: r`$$\text{tokens per hour} = 2983\times 3600 = 1.074\times 10^{7}$$

$$\text{cost per } 10^6\text{ tokens} = \frac{2.50}{1.074\times 10^{7}}\times 10^{6} = \$0.2328$$

At batch 1 the same GPU makes 163 tokens/s and the same million tokens cost \$4.26, eighteen times more. The GPU costs the same either way; batching spreads the cost over more tokens.`,
    },
    {
      type: "design",
      title: "Launch day: turn on batching",
      body: r`Launch traffic is **3 requests/s**. The design below has **two A10G replicas** (one GPU each) but **continuous batching is off**, so each replica serves one request at a time and almost every request times out.

Fix it **without buying more GPUs**. The checks: nearly all requests answered, GPUs not run into the ground, and the bill under \$2,000 a month. Select the model node and look at its settings.`,
      starter: chat(3, { gpu: "A10G", replicas: 2, batching: false, quantization: "fp16", maxBatch: 32 }),
      palette: ["llm-selfhost", "llm-api", "semantic-cache", "gateway"],
      test: {
        constraints: [
          { type: "successRate", min: 0.99, why: "Without batching, one A10G streams one answer at a time (about 0.1 requests/s), so almost everything fails." },
          { type: "gpuUtil", max: 0.9, why: "A GPU at 100% queues and times out. Keep headroom below 90%." },
          { type: "costPerMonth", maxUsd: 2000, why: "The budget allows two A10Gs, about \$1,750 a month. Throwing more GPUs at it is not the fix." },
        ],
      },
      hints: [
        "Open the self-hosted node: the inspector shows the replica is over capacity.",
        "A single request barely uses the GPU. Batching decodes many requests per step.",
        "Turn on continuous batching and keep two replicas.",
      ],
      solution: chat(3, { gpu: "A10G", replicas: 2, batching: true, quantization: "fp16", maxBatch: 32 }),
    },
    {
      type: "design",
      title: "Traffic grows to 5 requests/s",
      body: r`After a marketing push traffic reaches **5 requests/s**. Three batched fp16 A10Gs are at 95% utilisation, so queues build and the first token takes tens of seconds.

The budget is capped at **\$3,000 a month**, so a fourth GPU or an H100 is not allowed. Streaming users need the 99th-percentile first token within **1.5 s**, and answer quality must stay at least **0.715** (the quality proxy of the unquantized model is 0.723).

Hint: halving the bytes per weight roughly doubles decode speed and leaves room for a bigger KV cache.`,
      starter: chat(5, { gpu: "A10G", replicas: 3, batching: true, quantization: "fp16", maxBatch: 32 }),
      palette: ["llm-selfhost", "llm-api", "semantic-cache", "gateway"],
      test: {
        constraints: [
          { type: "successRate", min: 0.99, why: "At 95% utilisation the queue grows and requests time out." },
          { type: "ttft", maxMs: 1500, why: "Streaming users notice a slow first token. Queueing delay is what pushes TTFT up." },
          { type: "quality", min: 0.715, why: "INT4 is cheaper but gives up too much quality here. INT8 loses almost nothing." },
          { type: "costPerMonth", maxUsd: 3000, why: "Three A10Gs cost about \$2,630. An H100 (\$3,285) is over budget." },
        ],
      },
      hints: [
        "Utilisation is the problem: each replica is nearly saturated.",
        "Quantizing the weights speeds up the bandwidth-bound decode step without adding GPUs.",
        "Switch the model to INT8. INT4 would pass speed but lose quality.",
      ],
      solution: chat(5, { gpu: "A10G", replicas: 3, batching: true, quantization: "int8", maxBatch: 32 }),
    },
  ],
};
