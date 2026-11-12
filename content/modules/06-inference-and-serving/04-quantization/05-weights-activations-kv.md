---
title: Quantizing weights, activations and the KV cache
minutes: 7
---

"Quantize the model" can mean three different things, with different benefits. A forward pass touches three kinds of numbers: **weights** (fixed, read every step), **activations** (computed fresh for every token) and the **KV cache** (grows with context, read every step). Each can be stored at lower precision, and each helps a different bottleneck.

## Weight-only quantization

Store weights in INT4 or INT8 and dequantize to BF16 inside the kernel just before the multiply. The arithmetic still happens in BF16. This cuts the bytes read from HBM (the decode bottleneck) and the model's memory footprint, but does nothing for compute. It is the main tool for decode and for fitting a model on fewer GPUs, usually written W4A16 (4-bit weights, 16-bit activations) or W8A16.

## Weight-and-activation quantization

If both operands of the matrix multiply are low precision, the multiply itself can run on the GPU's faster low-precision tensor cores. Notation: W8A8 means 8-bit weights and 8-bit activations. On an H100, dense FP8 throughput is approximately twice dense BF16 (about 1,979 versus 989 TFLOP/s), which raises the compute roof in the roofline chart and also halves weight bytes.

Activations are harder to quantize than weights because they change every token and contain the outliers discussed earlier, so W8A8 usually relies on scaling tricks (SmoothQuant-style channel rescaling) or on FP8, whose exponent gives it range that INT8 lacks. Where it applies:

- **Prefill** is compute-bound, so doubling the compute roof nearly halves TTFT.
- **Decode** gains from halved weight bytes either way; W8A8 adds little beyond W8A16 there.

## KV-cache quantization

The KV cache for long contexts and big batches can exceed the weights (the previous lesson's $s_{kv}$ and $B\,\bar{n}\,s_{kv}$). Storing keys and values in 8 bits halves $s_{kv}$, which doubles the number of sequences or tokens that fit and shrinks the per-step KV read:

$$
t_{step} \approx \frac{W_{bytes} + B\,\bar{n}\,s_{kv}\,(q_{kv}/16)}{\beta}
$$

with $q_{kv}$ the bits per cached number (16 for BF16).

```steps
Two ways to speed up a loaded 8B decode step
Setup: batch 64, context 4,000 tokens, BF16 KV is $64 \times 4000 \times 131{,}072 = 33.6$ GB. Weights 16.06 GB. Bandwidth about 3.35 TB/s.
---
Baseline step: $(16.06 + 33.55)/3350 = 14.8$ ms.
---
Weights to INT4 (about 4.1 GB): $(4.14 + 33.55)/3350 = 11.3$ ms. A 24% saving: the KV reads now dominate and weights were not the main cost.
---
KV cache to 8-bit instead (16.8 GB), weights left in BF16: $(16.06 + 16.78)/3350 = 9.8$ ms, a 34% saving.
---
Both: $(4.14 + 16.78)/3350 = 6.2$ ms, 2.4 times faster than the baseline. Which lever matters most depends on where the bytes are, which is the memory-versus-context ratio $BK/W$.
```

| What you quantize | Helps | Does not help | Quality risk |
|---|---|---|---|
| Weights only (W4A16, W8A16) | Decode speed, memory, GPUs needed | Prefill compute | Low at 8-bit; small at 4-bit |
| Weights and activations (W8A8, FP8) | Prefill speed too; memory | | Activation outliers need care |
| KV cache (8-bit) | Long contexts, big batches | Short, single-user chat | Small; can accumulate over very long contexts |

## See it

```sim
roofline
{"gpu": "h100", "model": "llama3-8b", "tokens": 2000, "precision": "fp8"}
```

At 2,000 tokens (a prefill) with FP8, the sim uses the doubled compute roof and halved weight bytes; compare its ideal pass time with BF16 at the same token count. Then set tokens to 1 and compare BF16, FP8 and INT4 weights: decode time tracks the bytes read (about 16, 8 and 4 GB), not the compute ceiling. Note also where the ridge point moves for each precision, since fewer bytes per weight mean higher arithmetic intensity at the same batch.

## In practice

Common production recipes: FP8 weights and activations on H100-class hardware for both phases (an easy, low-risk step, since FP8 behaves like a slightly coarser BF16), INT4 weight-only (AWQ or GPTQ) when memory or decode cost matters most, and an 8-bit KV cache when long contexts limit the batch. Always check hardware support: low-precision tensor cores exist only on recent generations, and on older GPUs W4A16 kernels still dequantize in software.

```quiz
{"q": "Your service is dominated by 100,000-token contexts, where the KV cache is five times larger than the weights. Which change cuts decode step time most?", "options": ["Quantizing the KV cache to 8 bits", "Quantizing weights from BF16 to INT4", "Moving to a GPU with twice the FLOP/s only", "Raising the prompt cache hit rate"], "answer": 0, "explain": "KV bytes dominate step time, so halving them helps most. INT4 weights shrinks only the minor term; more FLOP/s does nothing for a memory-bound step. A prompt cache avoids prefill work but does not reduce the KV reads each decode step."}
```

```quiz
{"q": "Which quantization scheme is likely to reduce prefill time (TTFT) the most on an H100?", "options": ["FP8 weights and activations", "INT4 weight-only with BF16 math", "8-bit KV cache only", "Reducing group size to 32"], "answer": 0, "explain": "Prefill is compute-bound, so only running the math on faster FP8 tensor cores raises the roof. Weight-only schemes still multiply in BF16 and mainly cut memory traffic, which is not prefill's bottleneck."}
```
