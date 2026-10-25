---
title: Activation memory and gradient checkpointing
minutes: 7
---

Backpropagation needs to know what happened on the way forward. To compute the gradient of a layer's weights, you need the input that layer saw; to push the error through a non-linearity, you need the value that went into it. So during the forward pass, every layer leaves behind a pile of intermediate tensors, the **activations**, which wait in memory until the backward pass consumes them in reverse order.

Unlike model states, activation memory does not depend mainly on the parameter count. It grows with the **micro-batch size** $b$, the **sequence length** $s$, the model width $h$ and the number of layers $L$. For long-context training it is often the largest item in GPU memory.

## How big are the activations?

A careful count for a standard transformer layer in 16-bit precision (Korthikanti et al., 2022) gives

$$
M_{\text{act/layer}} \approx s\,b\,h\left(34 + \frac{5 a s}{h}\right) \ \text{bytes}
$$

where $a$ is the number of attention heads. The $34\,sbh$ part covers the inputs to the linear layers, the MLP's wide hidden state, layer-norm inputs and dropout masks. The $5as^2b$ part is the attention score matrices, one $s \times s$ matrix per head, which grow with the square of the sequence length. **FlashAttention**-style kernels never store those score matrices (they recompute them in the backward pass), so with them the per-layer cost is about $34\,sbh$.

```steps
Activations for a 7B-class model at 4K context
Take $h = 4096$, $L = 32$, $a = 32$, $s = 4096$, $b = 1$. Then $sbh = 4096 \times 4096 = 1.68 \times 10^{7}$.
---
With FlashAttention: $34 \times 1.68\times10^7 \approx 570$ MB per layer, times 32 layers $\approx 18.3$ GB.
---
Without it, the extra term is $5as/h = 5 \times 32 \times 4096 / 4096 = 160$, so each layer needs $194 \times 1.68\times10^7 \approx 3.25$ GB, and 32 layers need about 104 GB: more than an entire 80 GB GPU.
---
Double the sequence length to 8K and the FlashAttention figure doubles to about 36.5 GB, while the attention-matrix term would quadruple. This is why long-context training is impossible without memory-efficient attention.
```

## Gradient checkpointing: trade compute for memory

**Gradient checkpointing** (also called activation checkpointing or recomputation) stores only a few activations, the **checkpoints**, and throws the rest away. During the backward pass, when a layer's activations are needed, it reruns that layer's forward pass from the nearest checkpoint to recreate them.

The common setting checkpoints each transformer layer's input, $2sbh$ bytes per layer in 16-bit, plus the full activations of one layer at a time while it is being recomputed:

$$
M_{\text{act}}^{\text{ckpt}} \approx L \cdot 2sbh + 34\,sbh
$$

For our example: $32 \times 2 \times 1.68\times10^7 \approx 1.07$ GB plus $0.57$ GB for the layer being recomputed, about **1.6 GB instead of 18.3 GB**, an elevenfold saving.

The price is compute. Each layer's forward pass now runs twice. Training normally costs $2N$ (forward) $+ 4N$ (backward) $= 6N$ FLOPs per token; with full recomputation it costs $2N + 2N + 4N = 8N$, about **33% more** compute, which shows up as roughly 20% to 33% longer step times. **Selective checkpointing** recomputes only the cheap-to-recompute but memory-heavy parts (such as attention internals), recovering most of the memory for a few percent of compute.

```sim
training-memory
{"model": "llama2-7b", "seqLen": 4096, "microBatch": 1, "checkpointing": false}
```

The simulation starts with checkpointing off. Read "Activations + logits", then turn checkpointing on and compare. Next, set the sequence length to 16,384 with checkpointing off: activations grow fourfold, in proportion to $s$ (the sim assumes FlashAttention). Finally raise the micro-batch to 8 and see that it scales activations exactly as sequence length does: both multiply $sb$.

## One more large tensor: the logits

The final layer produces a score for every vocabulary entry at every position: $s \cdot b \cdot V$ numbers. With $V = 32{,}000$, $s = 4096$, $b = 1$ in FP32 that is $4096 \times 32{,}000 \times 4 \approx 0.52$ GB, and with a 128K vocabulary it is four times larger. Frameworks often compute the loss in chunks to avoid materialising all of it at once.

## In practice

The usual order of moves when a training job runs out of memory: turn on FlashAttention, turn on activation checkpointing, lower the micro-batch and raise **gradient accumulation** to keep the global batch the same, then shard model states with ZeRO (next topic). Each step trades a little speed for memory, so measure throughput after each change.

```quiz
{"q": "With FlashAttention, per-layer activation memory is about $34\\,sbh$ bytes. You double the micro-batch and halve the sequence length. What happens to activation memory?", "options": ["It doubles", "It halves", "It stays the same", "It quadruples"], "answer": 2, "explain": "The product $sb$ is unchanged ($2b \\times s/2$), so $34\\,sbh$ is unchanged. Without memory-efficient attention, halving $s$ would also shrink the $s^2$ attention term, so the total would fall."}
```

```quiz
{"q": "Full activation checkpointing changes training compute from about $6N$ to about how many FLOPs per token?", "options": ["$6N$: recomputation is free", "$8N$", "$12N$", "$4N$"], "answer": 1, "explain": "The forward pass ($2N$) is run a second time during backward: $2N + 2N + 4N = 8N$, a 33% increase. It does not double the whole step, because the backward pass, which costs twice the forward, is not repeated."}
```
