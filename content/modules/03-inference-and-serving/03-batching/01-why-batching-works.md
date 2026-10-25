---
title: Why batching is almost free, until it is not
minutes: 8
---

A bus costs roughly the same to drive whether it carries one passenger or forty. The fuel, the driver and the route are fixed; each extra passenger adds only a little weight. Running forty separate taxis instead would cost forty times as much.

A decode step is that bus. The fixed cost is reading the model's weights from memory, about 16 GB for an 8B model in BF16, which takes about 4.8 ms on an H100 regardless of how many sequences ride along. Each extra sequence adds only its own KV-cache reads and a sliver of arithmetic. Serving many users in the same step, **batching**, is the single most important reason LLM serving is affordable.

## A step-time model

Combine the pieces from the previous lesson. With weight bytes $W = N b$, per-sequence KV bytes $K = \bar{n}\, s_{kv}$ (average context times KV bytes per token), bandwidth $\beta$ and peak compute $P$:

$$
t_{step}(B) \approx \max\left( \frac{W + B K}{\beta},\; \frac{2 N B}{P} \right)
$$

The first term is memory time, the second compute time. Each step produces one token for each of the $B$ sequences, so

$$
\text{server throughput} = \frac{B}{t_{step}(B)}, \qquad \text{per-user speed} = \frac{1}{t_{step}(B)}
$$

When $BK \ll W$, the step time barely moves as $B$ grows, so throughput grows almost linearly with $B$ at almost no cost to anyone. As $BK$ approaches $W$, each extra sequence starts to slow everybody down.

```steps
An 8B model on an H100, contexts of 2,000 tokens
$W = 16.06$ GB, $s_{kv} = 131{,}072$ bytes, so $K = 2000 \times 131{,}072 = 0.262$ GB per sequence. $\beta \approx 3.35$ TB/s (ideal, no efficiency factor).
---
$B = 1$: $t = (16.06 + 0.26)/3350 = 4.87$ ms. Throughput 205 tokens/s, per-user 205 tokens/s.
---
$B = 32$: $t = (16.06 + 8.39)/3350 = 7.30$ ms. Throughput $32/0.0073 = 4{,}385$ tokens/s (21× more), per-user 137 tokens/s (one third slower).
---
$B = 128$: $t = (16.06 + 33.55)/3350 = 14.8$ ms. Throughput 8,643 tokens/s, per-user 67.5 tokens/s.
---
Compute check at $B = 128$: $2 \times 8.03\times10^9 \times 128 / 9.89\times10^{14} = 2.1$ ms, well below 14.8 ms. Still memory-bound; the KV reads, not arithmetic, are what is slowing each step.
```

| Batch $B$ | Step time | Server tokens/s | Per-user tokens/s |
|---|---|---|---|
| 1 | 4.87 ms | 205 | 205 |
| 8 | 5.42 ms | 1,476 | 185 |
| 32 | 7.30 ms | 4,385 | 137 |
| 64 | 9.80 ms | 6,529 | 102 |
| 128 | 14.81 ms | 8,643 | 67.5 |

Going from 1 to 8 users costs each user under 10% of their speed and multiplies throughput by 7. Going from 64 to 128 costs each user a third of their speed for only 32% more throughput. That curve is diminishing returns made visible.

## The memory ceiling

There is also a hard limit: all those KV caches must fit in GPU memory beside the weights. On an 80 GB GPU with 16 GB of weights and a few GB reserved for activations and the runtime, roughly 60 GB is left for KV. At 0.262 GB per 2,000-token sequence, that is about $60/0.262 \approx 229$ sequences. Longer contexts lower the ceiling proportionally: at 8,000 tokens it is about 57.

## See it

```sim
llm-batching
{"model": "llama3-8b", "gpu": "h100", "batch": 1, "promptTokens": 1000, "outputTokens": 300, "gpuPrice": 2.5}
```

Raise the batch size through 1, 8, 32, 128 and record replica throughput and per-user speed. You should see the same shape as the table: throughput climbs steeply then flattens; per-user speed falls slowly then faster. Watch the cost per million output tokens fall as the batch grows, since the GPU-hour is shared by more tokens. Then raise prompt tokens to 16,000 and look at the maximum batch the sim reports and the "KV fits" indicator: long contexts shrink the batch you can run at all.

## In practice

Engines do not let you pick $B$ directly; you set limits such as the maximum number of concurrent sequences and the maximum tokens per step, and the scheduler fills the batch from whatever requests are waiting. At low traffic the batch is small and every user is fast; at peak the batch is large and everyone slows down. That is why TPOT is a function of load, and why the same model can feel quick at 3 a.m. and sluggish at noon. The engineering decision is the limit: where on this curve your latency SLO says to stop.

```quiz
{"q": "Using the walkthrough's model, what is the step time at batch 16 (contexts of 2,000 tokens, 0.262 GB of KV each)?", "options": ["About 6.0 ms", "About 4.9 ms", "About 77 ms", "About 9.8 ms"], "answer": 0, "explain": "$(16.06 + 16 \\times 0.262)/3350 = (16.06 + 4.19)/3350 = 6.04$ ms. 4.9 ms ignores the KV reads; 77 ms multiplies the whole batch-1 step by 16, as if weights were reread per sequence; 9.8 ms is the batch-64 value."}
```

```quiz
{"q": "Why does doubling the batch from 4 to 8 barely change per-user speed, while doubling from 128 to 256 changes it a lot?", "options": ["At small batches weight reads dominate step time and are shared; at large batches the per-sequence KV reads dominate", "Small batches are compute-bound and large ones memory-bound", "The GPU only parallelises up to 8 sequences", "Larger batches use slower kernels"], "answer": 0, "explain": "Step time is about $(W + BK)/\\beta$. When $BK \\ll W$ the fixed weight term dominates, so adding sequences is nearly free. When $BK$ is comparable to or bigger than $W$, each extra sequence adds proportionally to the step. The regime here is memory-bound throughout; it is the composition of the bytes that changes."}
```
