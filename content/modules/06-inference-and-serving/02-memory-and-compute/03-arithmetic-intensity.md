---
title: Arithmetic intensity, FLOPs per byte
minutes: 7
---

The last two topics produced two numbers for every operation: how many FLOPs it does, and how many bytes it must move. Their ratio decides which of the GPU's two limits you hit. That ratio has a name, **arithmetic intensity**, and it is the most useful single number in inference performance.

Back to the chef: if each truckload of ingredients feeds one dish, the chef idles most of the time. If each truckload feeds 300 dishes, the chef becomes the bottleneck. Intensity is "dishes per truckload": work done per unit of data delivered.

## Definition

$$
I = \frac{\text{FLOPs performed}}{\text{bytes moved to and from memory}} \quad [\text{FLOP/byte}]
$$

A GPU has a matching ratio of its own. With peak compute $P$ (FLOP/s) and memory bandwidth $\beta$ (byte/s), the **ridge point** is

$$
I^{*} = \frac{P}{\beta}
$$

If a workload's $I$ is below $I^{*}$, memory cannot deliver bytes fast enough to keep the arithmetic units busy: the work is **memory-bound** (or bandwidth-bound). Above $I^{*}$, the arithmetic units are the limit: **compute-bound**.

For an H100 SXM, $P \approx 989 \times 10^{12}$ FLOP/s (dense BF16) and $\beta \approx 3.35 \times 10^{12}$ B/s, so

$$
I^{*}_{H100} \approx \frac{989}{3.35} \approx 295 \ \text{FLOP/byte}
$$

The GPU must perform about 295 operations on every byte it fetches to use its full compute. For an A100 80GB ($\approx 312$ TFLOP/s, $\approx 2.0$ TB/s) the ridge is about 156. Each hardware generation has tended to add compute faster than bandwidth, so the ridge point keeps moving right.

## The intensity of a decode step

Consider one weight matrix with $m \times k$ parameters stored at $b$ bytes each, applied to a batch of $B$ token vectors (one per sequence). The weights are read once and used for all $B$ tokens:

$$
\text{FLOPs} = 2mkB, \qquad \text{bytes} \approx b\,mk \;(+\text{activations}), \qquad I \approx \frac{2B}{b}
$$

The activations are tiny next to the weights when $B$ is small, so we drop them. With BF16 weights ($b = 2$):

$$
I \approx B
$$

A decode step at batch size $B$ has an arithmetic intensity of roughly $B$ FLOP/byte. At $B = 1$ that is 1, almost 300 times below the H100's ridge point.

```steps
Where batch sizes land on an H100
Ridge point $I^{*} \approx 295$ FLOP/byte; BF16 weights, so $I \approx B$.
---
$B = 1$: $I \approx 1$. The GPU can use at most $1/295 \approx 0.34\%$ of its peak compute. Attainable throughput is $I \cdot \beta = 1 \times 3.35 \times 10^{12} = 3.35$ TFLOP/s.
---
$B = 32$: $I \approx 32$, attainable $32 \times 3.35 = 107$ TFLOP/s, about 11% of peak. The step takes almost the same time as at $B = 1$, but produces 32 tokens.
---
$B = 295$: the ridge. Arithmetic and memory are balanced; adding more sequences now adds time.
---
With 4-bit weights ($b = 0.5$), $I \approx 2B/0.5 = 4B$: the same batch reaches the ridge at $B \approx 74$. Quantization moves the workload to the right.
```

## Prefill has huge intensity

During prefill, the prompt's $n_{in}$ tokens all pass through each weight matrix together, exactly like a batch of $n_{in}$. So prefill intensity is roughly $I \approx n_{in}$ (BF16). A 2,000-token prompt has $I \approx 2000$, far above the ridge: prefill is compute-bound. This is the heart of the next topics: **prefill is limited by FLOPs, decode by bytes**.

| Operation (BF16, H100) | Intensity $I$ | Regime |
|---|---|---|
| Decode, batch 1 | ~1 | Memory-bound, ~0.3% of peak usable |
| Decode, batch 64 | ~64 | Memory-bound, ~22% of peak usable |
| Prefill, 512-token prompt | ~512 | Compute-bound |
| Attention over the KV cache during decode | ~1 per sequence | Memory-bound regardless of batch |

The last row is a warning: batching raises the intensity of the *weight* matrices because the weights are shared, but every sequence has its own KV cache, so attention reads cannot be shared. Topic 6 returns to this.

## See it

```sim
roofline
{"gpu": "h100", "model": "llama3-8b", "tokens": 1, "precision": "bf16"}
```

Read the arithmetic intensity and ridge point shown for $B = 1$. Then set tokens per pass to 32, 295 and 2,000, and note where the point crosses from the slope to the flat roof. Finally switch precision to INT4 weights at 32 tokens and see the intensity roughly quadruple.

## In practice

Arithmetic intensity is how performance engineers decide what to optimise. A memory-bound kernel gets faster by moving fewer bytes (quantization, fusing operations so intermediate results never leave the chip, sharing reads across a batch). A compute-bound kernel gets faster with better use of tensor cores or lower-precision arithmetic such as FP8. Optimising the wrong side does nothing: a beautifully tuned matrix-multiply kernel will not speed up batch-1 decode.

```quiz
{"q": "A GPU has about 312 TFLOP/s of BF16 compute and 2.0 TB/s of bandwidth. Decode at what batch size (BF16 weights) reaches its ridge point?", "options": ["About 156", "About 312", "About 624", "About 78"], "answer": 0, "explain": "Ridge $I^* = 312/2.0 = 156$ FLOP/byte, and BF16 decode has $I \\approx B$, so $B \\approx 156$. 312 confuses the TFLOP/s figure with the ridge itself; 78 is what you get by wrongly using $I \\approx 2B$ for BF16 (that is the INT8 case, $b = 1$)."}
```

```quiz
{"q": "Why does increasing the batch size not make attention over the KV cache more compute-efficient during decode?", "options": ["Each sequence reads its own keys and values, so bytes grow in step with FLOPs", "Attention uses no FLOPs", "The KV cache is stored on chip", "Batching is impossible for attention"], "answer": 0, "explain": "The weight matrices are shared across the batch, so their bytes are amortised and intensity grows with $B$. KV caches are per sequence: doubling the batch doubles both the attention FLOPs and the KV bytes, leaving intensity near 1. Attention can be batched; it just stays memory-bound."}
```
