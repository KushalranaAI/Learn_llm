// Lab: a startup with a fixed compute budget decides model size and token count (Chinchilla-style), then prices the run in GPU-hours.
import type { Lab } from "./types";

const r = String.raw;

export const planATrainingRun: Lab = {
  slug: "plan-a-training-run",
  module: "training-and-adaptation",
  title: "Plan a training run",
  product: "A startup pretraining its own language model",
  summary: "A startup has a fixed compute budget for pretraining. Use C = 6ND to cost a run, find the compute-optimal model size and data amount for the budget, and decide when over-training a smaller model is the better deal.",
  difficulty: "medium",
  minutes: 30,
  tags: ["scaling laws", "compute budget", "Chinchilla", "FLOPs", "GPU-hours", "over-training"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A startup wants its own base language model for a domain (say, industrial maintenance manuals) and has a **fixed compute budget**: about $10^{22}$ floating-point operations (FLOPs), which it can rent as H100 time.

Two choices decide how good the model will be:

- **$N$**, the number of parameters, and
- **$D$**, the number of training tokens.

Training compute is approximately

$$C \approx 6\,N\,D \quad\text{FLOPs}$$

(2 FLOPs per parameter per token for the forward pass, 4 for the backward pass). Predicted loss follows a scaling law of the form

$$L(N, D) = E + \frac{A}{N^{\alpha}} + \frac{B}{D^{\beta}}$$

The loss falls when either term grows, but for a fixed $C$ there is a best split. You will cost a run, find that split, and then see why a small model trained on far more data is sometimes the better product.`,
    },
    {
      type: "math",
      title: "Cost a run in FLOPs",
      body: r`A well-known rule of thumb from the Chinchilla study is about **20 training tokens per parameter** for compute-optimal training. For a 7B-parameter model that is $D = 20\times 7\times 10^{9} = 1.4\times 10^{11}$ tokens.`,
      question: r`How many FLOPs does it take to train a 7B model on $1.4\times 10^{11}$ tokens, using $C = 6ND$? (Enter it as 5.88e21 style.)`,
      answer: 5.88e21,
      tolerance: 0.01,
      unit: "FLOPs",
      hint: r`$C = 6\times (7\times 10^{9})\times (1.4\times 10^{11})$.`,
      solution: r`$$C = 6\times 7\times 10^{9}\times 1.4\times 10^{11} = 5.88\times 10^{21}\text{ FLOPs}$$

That is about 59% of the startup's $10^{22}$ budget, so a 7B model on 140B tokens fits comfortably, with room to spare for a longer run.`,
    },
    {
      type: "quiz",
      title: "What does 'compute-optimal' optimise?",
      body: r`The scaling-law fit says that for a fixed compute budget $C$, the loss is lowest at a specific split of $C$ between model size and data, with $N$ and $D$ growing together.`,
      question: "A team has $10^{22}$ FLOPs. Which plan gives the lowest *training loss* for that budget?",
      options: [
        { text: r`A model of roughly 9B parameters on roughly 180B tokens (about 20 tokens per parameter)`, correct: true, why: r`Right. Solving $C = 6ND$ with $D\approx 20N$ gives $N=\sqrt{C/120}\approx 9\text{B}$ and $D\approx 180\text{B}$. Both extremes (huge model, tiny data; tiny model, huge data) waste compute.` },
        { text: "The biggest model that fits in memory, trained on as little data as possible", why: "An under-trained giant is the classic mistake the Chinchilla result corrected. Loss is dominated by the data term when $D$ is small." },
        { text: "A 1B model trained for as long as the budget allows", why: "Tiny models saturate: past some point extra data barely helps because the model cannot absorb it (the $A/N^\\alpha$ term stays large)." },
        { text: "Any split: loss depends only on the total compute", why: "Compute is not enough: at the same $C$, a 30B model on 60B tokens has a clearly higher loss than a 9B model on 180B tokens." },
      ],
    },
    {
      type: "sim",
      title: "Spend the budget well",
      body: r`The team's first draft is a 30B model on 60B tokens. That is over budget ($\log_{10} C = 22.03$) and badly balanced (**loss gap** = how much worse than the compute-optimal model for the same compute).

Change model size and token count so the run stays within **$10^{22}$ FLOPs** ($\log_{10}C \le 22$) and lands within **0.005** of the best possible loss for that compute.`,
      sim: "scaling-laws",
      params: { paramsB: 30, tokensB: 60 },
      goals: [
        { metric: "log10C", op: "<=", value: 22, label: "Compute at most 1e22 FLOPs" },
        { metric: "lossGap", op: "<=", value: 0.005, label: "Within 0.005 nats of the compute-optimal loss" },
      ],
      hints: [
        "The 'optimal' readouts show the best N and D for the compute you are currently spending.",
        "Aim for roughly 20 tokens per parameter, and make sure $6ND$ stays at or under $10^{22}$.",
        "Try about 9 billion parameters and about 180 billion tokens.",
      ],
      solution: { paramsB: 9.2, tokensB: 180 },
    },
    {
      type: "math",
      title: "Turn FLOPs into GPU-hours",
      body: r`The startup rents H100s. One H100 does about $989\times 10^{12}$ dense bf16 FLOP/s at peak, but real training reaches about **40% of peak** (called model FLOPs utilisation, MFU).

The 7B / 140B-token run needs $5.88\times 10^{21}$ FLOPs.`,
      question: r`How many H100 GPU-hours does it take? (Round to the nearest hour.)`,
      answer: 4129,
      tolerance: 0.02,
      unit: "GPU-hours",
      hint: r`Effective speed $= 0.4\times 989\times 10^{12}$ FLOP/s. Seconds $= C/\text{speed}$. Divide by 3600.`,
      solution: r`**Effective throughput.**

$$0.4\times 989\times 10^{12} = 3.956\times 10^{14}\text{ FLOP/s per GPU}$$

**Seconds.**

$$\frac{5.88\times 10^{21}}{3.956\times 10^{14}} = 1.486\times 10^{7}\text{ s}$$

**Hours.**

$$\frac{1.486\times 10^{7}}{3600} \approx 4{,}129\text{ GPU-hours}$$

At about \$2.50 per GPU-hour that is roughly \$10,300. On 256 GPUs it finishes in about 16 hours of wall-clock time, in the ideal case.`,
    },
    {
      type: "sim",
      title: "When to over-train a small model",
      body: r`Compute-optimal is optimal for *training* cost. But the startup will serve this model to millions of requests, and a smaller model is cheaper to serve every single time. So the real target is different: an **8B model** (fixed, to fit the serving hardware) that reaches **loss at most 2.09**, as cheaply as possible, at no more than $10^{22.6}$ FLOPs.

Only the token count is free. Notice how far past 20 tokens per parameter you have to go.`,
      sim: "scaling-laws",
      params: { paramsB: 8, tokensB: 200 },
      locked: ["paramsB"],
      goals: [
        { metric: "loss", op: "<=", value: 2.09, label: "Predicted loss at most 2.09" },
        { metric: "log10C", op: "<=", value: 22.6, label: "Compute at most about 4e22 FLOPs" },
      ],
      hints: [
        "More tokens always lower the loss, with diminishing returns.",
        "At 20 tokens per parameter (160B tokens) the 8B model is far from 2.09.",
        "Try 700 billion tokens, about 90 tokens per parameter.",
      ],
      solution: { tokensB: 700 },
    },
  ],
};
