// Lab: a legal-clause classifier fine-tuned on a single 24 GB GPU. Full fine-tuning memory, LoRA parameter counts, QLoRA for a 70B model.
import type { Lab } from "./types";

const r = String.raw;

export const loraBudget: Lab = {
  slug: "lora-budget",
  module: "training-and-adaptation",
  title: "The LoRA budget",
  product: "A legal-clause classifier on one 24 GB GPU",
  summary: "A small team wants to fine-tune an 8B model on contract clauses using one 24 GB GPU. Compute why full fine-tuning cannot fit, count LoRA's trainable parameters by hand, choose the rank and target matrices, and use QLoRA to tune a 70B model on a single H100.",
  difficulty: "medium",
  minutes: 30,
  tags: ["LoRA", "QLoRA", "fine-tuning", "memory", "adapters", "parameters"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A small legal-tech team wants a model that tags contract clauses ("termination", "indemnity", "governing law"). Prompting a general model is not accurate enough, so they plan to **fine-tune** an 8B-parameter open model on 30,000 labelled clauses.

Their hardware: **one 24 GB GPU** (an L4). That is the whole budget.

Full fine-tuning updates every weight, and training needs far more memory than inference: weights, **gradients**, and **optimizer states** for every parameter. **LoRA** freezes the base weights and learns a small low-rank update for chosen matrices:

$$W' = W + \frac{\alpha}{r}\,BA, \qquad B\in\mathbb R^{d_\text{out}\times r},\; A\in\mathbb R^{r\times d_\text{in}}$$

Only $A$ and $B$ train. For one matrix, that is $r\,(d_\text{in}+d_\text{out})$ parameters instead of $d_\text{in}d_\text{out}$.`,
    },
    {
      type: "math",
      title: "Why full fine-tuning does not fit",
      body: r`Mixed-precision training with the Adam optimizer keeps, per parameter:

| Item | Bytes |
|---|---|
| bf16 weight | 2 |
| bf16 gradient | 2 |
| fp32 master weight | 4 |
| Adam first moment $m$ | 4 |
| Adam second moment $v$ | 4 |
| **Total** | **16** |

The model has $8.03\times 10^{9}$ parameters. (Activations come on top, but ignore them for now.)`,
      question: r`How many GiB do the weights, gradients and optimizer states of a full fine-tune need? ($1\text{ GiB}=2^{30}$ bytes.)`,
      answer: 119.7,
      tolerance: 0.02,
      unit: "GiB",
      hint: r`$8.03\times 10^{9}\times 16$ bytes, then divide by $1.0737\times 10^{9}$.`,
      solution: r`$$8.03\times 10^{9}\times 16 = 1.285\times 10^{11}\text{ bytes}$$

$$\frac{1.285\times 10^{11}}{2^{30}} = 119.7\text{ GiB}$$

That is five times the 24 GB the team has, before a single activation is stored. Full fine-tuning of an 8B model needs a multi-GPU node.`,
    },
    {
      type: "sim",
      title: "Switch to LoRA",
      body: r`The simulator shows the training memory on one GPU for the same 8B model, with a sequence length of 2,048, micro-batch 1 and activation checkpointing. It starts with **full** fine-tuning on the L4.

Choose a method that fits on the L4 and trains well under 1% of the parameters.`,
      sim: "lora-params",
      params: { model: "llama3-8b", method: "full", gpu: "l4", rank: 16, targets: "all" },
      locked: ["model", "gpu"],
      goals: [
        { metric: "fits", op: "==", value: 1, label: "Training fits in the L4's 24 GB" },
        { metric: "trainablePct", op: "<=", value: 0.01, label: "Trains at most 1% of the parameters" },
      ],
      hints: [
        "Compare the memory bar with the GPU's 24 GB. Which parts disappear when the base weights are frozen?",
        "With LoRA, gradients and optimizer states exist only for the small adapter matrices.",
        "Pick the LoRA method.",
      ],
      solution: { method: "lora" },
    },
    {
      type: "math",
      title: "Count the adapter",
      body: r`The team targets the **query** and **value** projections of every layer, rank $r = 16$. The model has 32 layers, hidden size $d = 4096$, and grouped-query attention with 8 KV heads of dimension 128:

- $W_Q: 4096\to 4096$
- $W_V: 4096\to 1024$

For one matrix of size $d_\text{in}\times d_\text{out}$, LoRA adds $r\,(d_\text{in}+d_\text{out})$ trainable parameters.`,
      question: r`How many millions of trainable parameters does the rank-16 Q+V adapter have across all 32 layers? (Four significant figures.)`,
      answer: 6.8157,
      tolerance: 0.01,
      unit: "M parameters",
      hint: r`Per layer: $16\,(4096+4096) + 16\,(4096+1024)$. Multiply by 32.`,
      solution: r`**Per layer.**

$$W_Q: 16\,(4096+4096) = 131{,}072, \qquad W_V: 16\,(4096+1024) = 81{,}920$$

$$\text{per layer} = 212{,}992$$

**All layers.**

$$32\times 212{,}992 = 6{,}815{,}744\approx 6.8\text{M}$$

That is 0.085% of 8.03B. The saved adapter file is $6.8\text{M}\times 2$ bytes = 13 MB, small enough to keep one per customer and swap them at serving time.`,
    },
    {
      type: "sim",
      title: "Capacity versus memory",
      body: r`A rank-8 adapter on only Q and V (3.4M parameters) trains but underfits clause types that need subtle cues. Increase capacity: target more matrices and/or raise the rank until the adapter has **at least 40M trainable parameters**, while training memory stays at most **20 GB** on the L4.

Notice how little memory the extra adapter parameters cost compared with the frozen base model.`,
      sim: "lora-params",
      params: { model: "llama3-8b", method: "lora", gpu: "l4", rank: 8, targets: "qv" },
      locked: ["model", "gpu", "method"],
      goals: [
        { metric: "trainableParamsM", op: ">=", value: 40, label: "At least 40M trainable parameters" },
        { metric: "memoryGB", op: "<=", value: 20, label: "Training memory at most 20 GB" },
        { metric: "fits", op: "==", value: 1, label: "Fits on the L4" },
      ],
      hints: [
        "Targeting attention plus the MLP matrices covers most of the model's linear layers.",
        "Parameters scale linearly with the rank.",
        "Target all linear layers at rank 16: about 42M parameters and 17 GB.",
      ],
      solution: { targets: "all", rank: 16 },
    },
    {
      type: "quiz",
      title: "What gets saved?",
      body: r`The team finishes training with rank 16 on all linear layers and wants to ship the result.`,
      question: "What do they need to store and deploy for the fine-tuned classifier?",
      options: [
        { text: "The original base model plus a roughly 78 MB adapter file (or merge the adapter into the weights for serving)", correct: true, why: "Right. LoRA never changed the base weights. $W' = W + (\\alpha/r)BA$ can be computed on the fly per request, or merged once into $W$ so inference costs nothing extra." },
        { text: "A new 16 GB copy of the full model for every fine-tune", why: "That is the cost of full fine-tuning. A LoRA adapter is 0.1-1% of that size." },
        { text: "Only the adapter: the base weights are no longer needed", why: "The adapter only holds the update. It is meaningless without the frozen base weights it modifies." },
        { text: "The optimizer states, so training can be resumed", why: "Optimizer states are useful for resuming training but are not part of the deployed model." },
      ],
    },
    {
      type: "sim",
      title: "QLoRA: tune a 70B model on one GPU",
      body: r`The firm later wants the same task on a **70B** model, on a single **H100 (80 GB)**. Ordinary LoRA keeps the base model in bf16: 140 GB of weights, which cannot fit.

**QLoRA** stores the frozen base weights in 4-bit NF4 (about 0.52 bytes per parameter with block scales) and trains bf16 LoRA adapters on top. Choose the method that fits and leaves the adapter with at least 100M trainable parameters.`,
      sim: "lora-params",
      params: { model: "llama3-70b", method: "lora", gpu: "h100", rank: 16, targets: "all" },
      locked: ["model", "gpu", "rank", "targets"],
      goals: [
        { metric: "fits", op: "==", value: 1, label: "Fits on one 80 GB H100" },
        { metric: "trainableParamsM", op: ">=", value: 100, label: "At least 100M trainable parameters" },
      ],
      hints: [
        "Look at where the memory goes: base weights dominate. Which method shrinks them?",
        "4-bit base weights cut the frozen part from 140 GB to about 36 GB.",
        "Choose QLoRA.",
      ],
      solution: { method: "qlora" },
    },
  ],
};
