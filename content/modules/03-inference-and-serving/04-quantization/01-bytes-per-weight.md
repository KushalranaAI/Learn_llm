---
title: Bytes per weight, the cheapest speed-up
minutes: 7
---

```callout-before
Before you start
From the previous lesson: decode time per token is roughly the bytes read per step divided by memory bandwidth. This topic attacks the numerator.
```

If decode waits on memory, the most direct fix is to make the weights smaller. A weight does not need 16 bits of precision to do its job; most of the information in a trained network survives being stored coarsely, the way a photo survives JPEG compression. **Quantization** stores each weight with fewer bits and converts it back (or computes with it directly) when needed.

## The formula

A format that spends $q$ bits per weight stores a model with $N$ parameters in

$$
M_{weights} = \frac{N \cdot q}{8} \quad \text{bytes}
$$

and, in the memory-bound regime, a decode step takes about $M_{weights}/\beta$ for the weights, where $\beta$ is memory bandwidth. Halving $q$ halves both memory and the weight-read time.

```steps
An 8B model at four precisions
$N = 8.03 \times 10^{9}$ (Llama 3 8B). H100 bandwidth approximately $3.35 \times 10^{12}$ B/s.
---
FP32 ($q = 32$): $8.03\times10^9 \times 4 = 32.1$ GB. Does not fit on a 24 GB card at all.
---
BF16 ($q = 16$): 16.06 GB, weight read 4.79 ms, ceiling about 209 tokens/s at batch 1.
---
INT8 ($q = 8$): 8.03 GB, read 2.40 ms, ceiling about 417 tokens/s.
---
INT4 ($q = 4$): 4.02 GB, read 1.20 ms, ceiling about 835 tokens/s (about 4.14 GB and 810 tokens/s once the per-group scales from topic 3 are counted).
```

| Model | FP16/BF16 | INT8 | INT4 (plus scales, ~4.1 bits) |
|---|---|---|---|
| 8B | 16.1 GB | 8.0 GB | 4.1 GB |
| 13B | 26 GB | 13 GB | 6.7 GB |
| 70B | 141 GB | 70.6 GB | 36 GB |
| 405B | 810 GB | 405 GB | ~209 GB |

The 70B row is the practical headline: in BF16 it needs at least two 80 GB GPUs (141 GB of weights alone), in INT8 it just fits one 80 GB GPU with almost no room for KV cache, and in INT4 it fits one with about 40 GB to spare for the cache.

## Floating-point formats

Not all 16-bit and 8-bit formats are alike. A floating-point number has a sign, an exponent (range) and a mantissa (precision):

| Format | Bits | Exponent / mantissa | Notes |
|---|---|---|---|
| FP32 | 32 | 8 / 23 | Training master copy |
| BF16 | 16 | 8 / 7 | Same range as FP32, coarse precision; the default for serving |
| FP16 | 16 | 5 / 10 | More precision, narrow range |
| FP8 (E4M3) | 8 | 4 / 3 | Supported natively by recent GPUs (H100 and later) |
| INT8 / INT4 | 8 / 4 | integer + a scale | Needs a scale factor to map back to real values |

Integer formats have no exponent, so they need an extra number, the **scale**, that says what real value one integer step represents. The next two topics are about choosing it.

## See it

```sim
quantization
{"paramsB": 8, "format": "bf16", "groupSize": "128", "outliers": false, "seed": 1}
```

The sim starts at BF16 for an 8B model. Read the weight memory (about 16 GB), then switch the format to INT8 and INT4 and watch memory halve each time. Look at the relative error and the perplexity proxy as you go: memory falls in exact proportion to bits, quality does not, and the cost of the last bits is higher than the first. Change the model size to 70B to reproduce the table row.

## In practice

Beyond fitting a model on cheaper hardware, quantization often enables a larger batch: bytes saved on weights become KV-cache space (a 70B in INT4 on one 80 GB card leaves roughly 40 GB for KV, versus almost nothing in INT8). Throughput per GPU then rises twice, from faster steps and from bigger batches. The caveat is that the speed-up is the *ceiling*; kernels that unpack 4-bit weights on the fly add overhead, and measured gains are usually somewhat below the ratio of bytes.

```quiz
{"q": "How much memory do the weights of a 13B-parameter model need at 8 bits per weight (ignoring scale overhead)?", "options": ["13 GB", "26 GB", "6.5 GB", "104 GB"], "answer": 0, "explain": "$13 \\times 10^9 \\times 8/8 = 13$ GB. 26 GB is the 16-bit figure, 6.5 GB the 4-bit one, and 104 GB would be bits mistaken for bytes."}
```

```quiz
{"q": "A model's batch-1 decode ceiling is 100 tokens/s in BF16 on a memory-bound GPU. Roughly what is the ceiling after INT4 weight quantization, if kernels reach the ideal?", "options": ["About 400 tokens/s", "About 200 tokens/s", "About 100 tokens/s, since compute is unchanged", "About 25 tokens/s"], "answer": 0, "explain": "Decode time is proportional to weight bytes, and INT4 has a quarter of BF16's bytes, so about 4 times faster. Compute being unchanged is true but irrelevant: decode is memory-bound, which is the whole point."}
```
