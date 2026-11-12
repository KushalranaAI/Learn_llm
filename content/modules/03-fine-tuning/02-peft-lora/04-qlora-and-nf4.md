---
title: QLoRA, a 4-bit frozen base
minutes: 8
---

LoRA removes the optimizer-state bill, but the frozen base model still sits in GPU memory in 16 bits: 13.5 GB for 7B, 130 GB for 65B. **QLoRA** (Dettmers et al., 2023) attacks that last big item. It stores the frozen base weights in **4 bits**, dequantises each matrix to BF16 on the fly while computing, and trains LoRA adapters in BF16 on top. The authors fine-tuned a 65B model on a single 48 GB GPU this way.

The gradients still flow through the quantised weights to reach the adapters, but the weights themselves are never updated, so the rounding error in the base is fixed noise the adapters learn to work around.

## Block-wise quantisation

Quantisation maps each weight to one of $2^4 = 16$ levels. To keep the error small, weights are processed in **blocks** (QLoRA uses 64 weights per block), and each block gets its own scale $s = \max_i |w_i|$ so the block's largest value uses the full range:

$$
q_i = \text{round-to-nearest-level}\!\left(\frac{w_i}{s}\right), \qquad \hat w_i = s \cdot \text{level}(q_i)
$$

A simple uniform 4-bit grid (integers $-7$ to $7$ times $s/7$) shows the idea.

```steps
Quantising one tiny block of four weights
Weights $w = (0.9, -0.2, 0.05, -1.6)$. The block's absolute maximum is $s = 1.6$, so the step is $1.6/7 \approx 0.2286$.
---
Divide and round: $0.9/0.2286 = 3.94 \to 4$; $-0.2/0.2286 = -0.875 \to -1$; $0.05/0.2286 = 0.22 \to 0$; $-1.6/0.2286 = -7 \to -7$.
---
Dequantise: $4 \times 0.2286 = 0.914$; $-1 \times 0.2286 = -0.229$; $0$; $-1.6$.
---
Errors: $0.014, 0.029, 0.05, 0$. Small weights suffer proportionally more (0.05 became 0), which is why the quantisation grid matters.
```

## NF4: a grid shaped like the weights

Trained weights are approximately normally distributed: many near zero, few large. A uniform grid wastes levels on the rare large values. **NormalFloat4 (NF4)** places its 16 levels at the **quantiles** of a standard normal distribution, so each level represents the same fraction of weights. After scaling a block into $[-1, 1]$ by its absolute maximum, each weight snaps to the nearest of those 16 values, denser near zero where most weights live. For normally distributed data this is information-theoretically well suited and gives lower error than uniform 4-bit or FP4.

## Double quantisation: the scales cost memory too

Each block of 64 weights needs one FP32 scale, which costs $32/64 = 0.5$ bits per weight, a 12.5% overhead on top of the 4 bits. QLoRA quantises the scales as well: groups of 256 scales are stored in 8 bits with their own FP32 constant:

$$
\text{bits per weight} = 4 + \frac{8}{64} + \frac{32}{64 \times 256} = 4 + 0.125 + 0.002 \approx 4.127
$$

Without double quantisation it would be $4.5$. The saving, $0.373$ bits per weight, is about 3 GB for a 65B model.

## The memory bill

```steps
Fine-tuning Llama-2-7B three ways (model states only)
**Full fine-tune, mixed AdamW:** $16 \times 6.74\times10^9 = 107.8$ GB.
---
**LoRA ($r = 16$, all linear layers, 40M adapter parameters):** frozen BF16 base $13.5$ GB, plus adapter weights, gradients and optimizer states at $16$ bytes per trainable parameter, $16 \times 40\times10^6 = 0.64$ GB. Total about **14.1 GB**.
---
**QLoRA:** base at $4.127$ bits per weight: $6.74\times10^9 \times 4.127/8 = 3.48$ GB (a few tensors, such as embeddings, are usually kept in BF16, adding some). Plus the same $0.64$ GB for the adapter. Total about **4.1 GB**.
---
Add activations (a few GB depending on sequence length and checkpointing) and the QLoRA run fits on a 16 GB GPU, or a similar 16 GB card; LoRA fits on 24 GB; full fine-tuning needs a cluster.
```

For 65B, the 4-bit base is $65\times10^9 \times 4.127/8 \approx 33.5$ GB, which is why it just fits on a 48 GB card with adapters, activations and paged optimisers (QLoRA's third trick: optimizer state pages to CPU RAM when GPU memory spikes).

```sim
lora-params
{"model": "llama2-7b", "method": "qlora", "rank": 16, "targets": "all", "gpu": "l4"}
```

This shows QLoRA on an L4 (24 GB). Read "Training memory" and "Fits". Switch to LoRA, then full, and see which methods fit; then change the model to Llama-3-70B and see which GPUs and methods remain possible.

## Costs of 4-bit

Dequantising every weight on each forward and backward pass costs compute, so QLoRA training is typically 20% to 40% slower than LoRA on the same GPU. Quantisation error slightly reduces the base model's quality, though the QLoRA authors found fine-tuned results close to 16-bit LoRA on their benchmarks. For serving, you can either keep the 4-bit base and the adapter, or merge the adapter into a 16-bit copy of the base (merging into a quantised base needs care, because the sum must be re-quantised).

## In practice

QLoRA is the standard way to fine-tune big open models on small hardware. Use it when memory, not speed, is the constraint. If the model fits in 16-bit LoRA on your GPU, plain LoRA is faster and avoids quantisation noise.

```quiz
{"q": "What is the approximate memory of a 13B model's frozen base weights in QLoRA, at 4.127 bits per weight?", "options": ["About 6.7 GB", "About 13 GB", "About 26 GB", "About 3.3 GB"], "answer": 0, "explain": "$13\\times10^9 \\times 4.127/8 = 6.71\\times10^9$ bytes. 26 GB is the BF16 size; 3.3 GB would need 2 bits per weight."}
```

```quiz
{"q": "Why does QLoRA quantise the block scales a second time?", "options": ["To make the model more accurate", "Each FP32 scale per 64 weights costs 0.5 bits per weight; quantising scales cuts that overhead to about 0.127", "Because NF4 cannot represent scales", "To speed up training"], "answer": 1, "explain": "At 64 weights per block, an FP32 scale adds $32/64 = 0.5$ bits per weight. Storing scales in 8 bits (with one FP32 constant per 256 scales) reduces the overhead to $0.125 + 0.002$ bits, saving roughly 0.37 bits per weight."}
```
