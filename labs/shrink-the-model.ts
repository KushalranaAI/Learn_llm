// Lab: quantization for a legal-research assistant. Bytes per weight, group size, outliers, and a sandbox design that trades precision for GPUs.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

const research = (llm: NodeConfig): Graph =>
  build(
    {
      users: ["users", { rps: 1, promptTokens: 1200, outputTokens: 300, hardShare: 0.4 }],
      llm: ["llm-selfhost", { model: "70B", gpu: "A100", replicas: 1, batching: true, maxBatch: 32, ...llm }, "70B research model"],
    },
    "users > llm",
  );

export const shrinkTheModel: Lab = {
  slug: "shrink-the-model",
  module: "inference-and-serving",
  title: "Shrink the model",
  product: "A legal research assistant on a 70B model",
  summary: "A research assistant needs a 70B model but the GPU budget is tight. Compute the memory of quantized weights by hand, pick a format that fits without wrecking quality, see how outliers hurt, and then fix a serving design that is too expensive.",
  difficulty: "medium",
  minutes: 30,
  tags: ["quantization", "INT8", "INT4", "NF4", "group size", "outliers", "memory"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A law firm's research assistant uses a 70B-parameter model for hard questions about case law. In bf16 the weights alone take 140 GB, which means **four** 80 GB A100s per copy of the model, at about \$8,800 a month.

**Quantization** stores each weight in fewer bits. A weight stored in $b$ bits, with one 16-bit scale shared per group of $g$ weights, takes

$$\text{bits per weight} = b + \frac{16}{g}$$

so memory is $\text{params}\times \text{bits}/8$ bytes. Fewer bytes means a smaller model **and** faster decoding, because decoding is bound by how fast the weights can be read from GPU memory.

The price is rounding error. This lab takes you from bits per weight to the quality cost, and then to a design that saves real money.`,
    },
    {
      type: "quiz",
      title: "Why quantization speeds up decoding",
      body: r`Decoding one token at batch size 1 reads every weight once and does only about 2 floating-point operations per weight.`,
      question: "Why does INT8 or INT4 weight quantization make *decoding* faster even though the GPU still computes in a wider format?",
      options: [
        { text: "Decoding is memory-bandwidth-bound, so reading half or a quarter as many bytes per step gives close to a 2x or 4x faster step", correct: true, why: "Right. The weights are read from HBM every step; fewer bytes means less time. The values are dequantized on the fly in registers, which costs little compared with the memory traffic saved." },
        { text: "Integer arithmetic is always twice as fast as floating-point on any GPU", why: "Decode is limited by memory traffic, not by arithmetic speed, so the integer math is not the reason." },
        { text: "Quantized models have fewer layers", why: "Quantization changes the number of bits per weight, not the architecture." },
        { text: "The tokenizer produces fewer tokens for quantized models", why: "Tokenization is independent of the model's numeric format." },
      ],
    },
    {
      type: "math",
      title: "Memory of a 4-bit model",
      body: r`Quantize an 8B model to **INT4** with a group size of 128: 4 bits per weight plus one 16-bit scale per 128 weights.`,
      question: r`How many GiB do the 8 billion weights take? ($1\text{ GiB} = 2^{30}$ bytes.)`,
      answer: 3.84,
      tolerance: 0.02,
      unit: "GiB",
      hint: r`Bits per weight $= 4 + 16/128$. Memory $= 8\times 10^{9}\times\text{bits}/8$ bytes.`,
      solution: r`**Bits per weight.**

$$4 + \frac{16}{128} = 4.125$$

**Bytes.**

$$\frac{8\times 10^{9}\times 4.125}{8} = 4.125\times 10^{9}\text{ bytes}$$

$$\frac{4.125\times 10^{9}}{2^{30}} = 3.84\text{ GiB}$$

The same weights in bf16 take 14.9 GiB, so INT4 is 3.9 times smaller (not exactly 4: the scales cost 0.125 bits each).`,
    },
    {
      type: "sim",
      title: "How low can you go?",
      body: r`The simulator quantizes a real set of random Gaussian weights and measures the rounding error, from which it estimates how much perplexity increases (a proxy for quality loss).

An 8B model is currently stored in **INT2**: tiny, but ruined. Pick a format that uses at most **5 GiB** and increases perplexity by at most **5%** (0.05).`,
      sim: "quantization",
      params: { paramsB: 8, format: "int2", groupSize: "128", outliers: false, seed: 1 },
      locked: ["paramsB", "groupSize", "outliers", "seed"],
      goals: [
        { metric: "memoryGB", op: "<=", value: 5, label: "Weights at most 5 GiB" },
        { metric: "pplIncrease", op: "<=", value: 0.05, label: "Perplexity increase at most 5%" },
      ],
      hints: [
        "Compare relative error across formats. Error roughly doubles for every bit you remove.",
        "INT8 is nearly lossless but takes 7.6 GiB: too big. Look for a 4-bit format.",
        "INT4 or NF4 both work. NF4 spaces its levels to match a bell curve and has lower error.",
      ],
      solution: { format: "nf4" },
    },
    {
      type: "sim",
      title: "Outliers and group size",
      body: r`Real LLM weight matrices contain a few **outliers**: about 0.5% of weights are roughly 20 times larger than the rest. One outlier stretches the quantization scale of its whole group, so all the *normal* weights in that group are rounded onto very few levels.

Outliers are switched on below with INT4 and a group size of 128, and quality is poor. Cut the damage by changing the format and the group size, while keeping weights at most **4.3 GiB** and the perplexity increase at most **5%**.`,
      sim: "quantization",
      params: { paramsB: 8, format: "int4", groupSize: "128", outliers: true, seed: 1 },
      locked: ["paramsB", "outliers", "seed"],
      goals: [
        { metric: "pplIncrease", op: "<=", value: 0.05, label: "Perplexity increase at most 5%" },
        { metric: "memoryGB", op: "<=", value: 4.3, label: "Weights at most 4.3 GiB" },
      ],
      hints: [
        "Smaller groups isolate each outlier's damage to fewer weights, at the cost of more scales (more bits per weight).",
        "Group size 32 costs 0.5 bits of scale overhead per weight but contains the damage.",
        "NF4 with a group size of 32 meets both goals; INT4 with group size 32 does not.",
      ],
      solution: { format: "nf4", groupSize: "32" },
    },
    {
      type: "math",
      title: "Does the 70B model fit?",
      body: r`Back to the 70B research model. An A100 has 80 GiB, of which about 90% (72 GiB) is usable. With **INT8**, group size 128, each weight takes $8 + 16/128 = 8.125$ bits.`,
      question: r`How many GiB do the 70 billion INT8 weights take?`,
      answer: 66.2,
      tolerance: 0.02,
      unit: "GiB",
      hint: r`$70\times 10^{9}\times 8.125/8$ bytes, divided by $2^{30}$.`,
      solution: r`$$\frac{70\times 10^{9}\times 8.125}{8} = 7.109\times 10^{10}\text{ bytes}$$

$$\frac{7.109\times 10^{10}}{2^{30}} = 66.2\text{ GiB}$$

That is under 72 GiB, so the weights only just squeeze into one A100 with almost nothing left for the KV cache, and a real serving stack leaves more headroom than that: it puts one replica on **two** A100s. In bf16 the weights are 140 GB and need **four**. Halving the GPUs per replica is the saving the next step uses.`,
    },
    {
      type: "design",
      title: "Cut the research model's bill",
      body: r`The design below serves the 70B model in fp16 on A100s. Traffic is about **1 request/s** (long prompts, 40% hard questions). It works, but costs \$8,760 a month: four GPUs for one copy of the model.

Cut the cost to **under \$5,000** while keeping: nearly all requests answered, p99 time to first token under **2 s**, and answer quality of at least **0.82** (fp16 scores 0.828, INT8 0.824, INT4 0.803). GPUs should not run over 90% busy.`,
      starter: research({ quantization: "fp16" }),
      palette: ["llm-selfhost", "llm-api", "semantic-cache", "gateway"],
      test: {
        constraints: [
          { type: "costPerMonth", maxUsd: 5000, why: "In fp16 a replica needs 4 A100s. Fewer bytes per weight means fewer GPUs per replica." },
          { type: "successRate", min: 0.99, why: "A cheaper design must still answer almost everything." },
          { type: "ttft", maxMs: 2000, why: "Queueing grows quickly as a GPU gets close to full." },
          { type: "quality", min: 0.82, why: "INT4 is cheaper again but costs too much quality for legal research." },
          { type: "gpuUtil", max: 0.9, why: "Keep headroom: a GPU at 100% queues and times out." },
        ],
      },
      hints: [
        "Open the model node and read how many GPUs one replica needs: weights must fit in memory.",
        "INT8 halves the weight bytes, so one replica shrinks from four A100s to two.",
        "Set quantization to INT8. INT4 saves more money but drops quality below 0.82.",
      ],
      solution: research({ quantization: "int8" }),
    },
  ],
};
