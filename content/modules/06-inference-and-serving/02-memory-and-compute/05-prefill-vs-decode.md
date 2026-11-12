---
title: Prefill is compute-bound, decode is bandwidth-bound
minutes: 8
---

One request, two completely different workloads. Prefill pushes thousands of prompt tokens through each weight matrix at once: lots of arithmetic per byte fetched, so the tensor cores are the limit. Decode pushes one token per sequence through the same matrices: almost no arithmetic per byte, so memory bandwidth is the limit. Nearly every serving optimisation is aimed at one phase or the other, and understanding which is which saves you from optimising the wrong thing.

## Two time formulas

Write $\eta_c$ for the fraction of peak compute that real kernels reach (model FLOPs utilisation, typically well under 1) and $\eta_m$ for the fraction of peak bandwidth they reach. Then for a model with $N$ parameters at $b$ bytes each:

$$
t_{prefill} \approx \frac{2 N n_{in}}{\eta_c P}, \qquad t_{decode\ step} \approx \frac{N b + \text{KV bytes}}{\eta_m \beta}
$$

Here $n_{in}$ is the prompt length, $P$ peak FLOP/s and $\beta$ peak bandwidth. Prefill time grows with prompt length; a decode step's time is nearly independent of how many sequences share it, as long as the batch stays below the ridge point.

```steps
One 8B request on an H100, phase by phase
Assume $N = 8.03 \times 10^{9}$, BF16, $P \approx 989$ TFLOP/s with $\eta_c = 0.6$, $\beta \approx 3.35$ TB/s with $\eta_m = 0.8$. Prompt $n_{in} = 2000$, output 300 tokens, batch of one, short context so we ignore KV bytes.
---
Prefill: $2 \times 8.03\times10^{9} \times 2000 = 3.21 \times 10^{13}$ FLOPs. Divided by $0.6 \times 9.89 \times 10^{14} = 5.93 \times 10^{14}$ FLOP/s gives 54 ms. That is about 27 µs per prompt token.
---
Decode step: $16.06 \times 10^{9}$ bytes divided by $0.8 \times 3.35 \times 10^{12} = 2.68 \times 10^{12}$ B/s gives 6.0 ms per output token.
---
Ratio: $6.0 \text{ ms} / 27\ \mu\text{s} \approx 220$. On this setup an output token costs about 220 times more GPU time than a prompt token.
---
Whole request: $54 + 299 \times 6.0 \approx 1{,}850$ ms of GPU time, of which prefill is under 3%.
```

## Batching closes part of the gap

At batch 1 a decode step uses the GPU for 6 ms to produce one token. At batch 64 the same 6 ms (plus a little for the extra KV reads) produces 64 tokens, about 94 µs each. The output-token penalty drops from about 220× to about 3.5× relative to prefill. Batching is how decode gets cheaper, and it is why the next lesson exists. But it never fully closes the gap, and it costs per-user speed, which is why providers typically charge several times more per output token than per input token.

| | Prefill | Decode |
|---|---|---|
| Tokens per pass | the whole prompt, $n_{in}$ | one per sequence, $B$ |
| Intensity (BF16) | $\approx n_{in}$, hundreds to thousands | $\approx B$, often 1 to 100 |
| Limit | Tensor-core FLOP/s | HBM bandwidth |
| Shows up as | TTFT | TPOT |
| Gets faster with | FP8 math, more GPUs, prefix caching | Quantized weights, bigger batches, more bandwidth, speculative decoding |

## See it

```sim
roofline
{"gpu": "h100", "model": "llama3-8b", "tokens": 2000, "precision": "bf16"}
```

The point starts as a 2,000-token prefill on the flat roof. Note the ideal pass time, then set tokens per pass to 1. The pass time drops only a little even though the work dropped by a factor of 2,000: that is a memory-bound pass. Now find the smallest token count at which the sim reports compute-bound; it should sit near the ridge point of about 295.

## Interference and disaggregation

Because the two phases want different things, running them on the same GPU causes friction. A long prefill monopolises the GPU's compute for tens or hundreds of milliseconds, and every decoding user waits during it (the stall from the first lesson). Two families of fixes exist. **Chunked prefill** splits a long prompt into pieces processed alongside decode steps, bounding the stall (batching lesson). **Prefill-decode disaggregation** runs the two phases on separate pools of GPUs and ships the KV cache from the prefill pool to the decode pool, so each pool can be sized and tuned for its own bottleneck. Disaggregation adds the cost of moving KV data between machines, so it pays off mainly at large scale with strict TTFT and TPOT targets.

```mermaid
flowchart LR
  R[Request] --> P["Prefill pool: compute-heavy"]
  P -->|"KV cache transfer"| D["Decode pool: bandwidth-heavy, large batches"]
  D --> U[Streamed tokens]
```

## In practice

Look at your traffic's ratio of prompt to output tokens. Retrieval-augmented and agentic workloads often send 10 to 50 prompt tokens per output token, so prefill, and therefore TTFT and compute, matter a lot; prefix caching is the biggest lever. Chat and writing workloads have longer outputs, so decode, and therefore bandwidth and batch size, dominate. The same model on the same hardware can need quite different tuning for the two.

```quiz
{"q": "Using the walkthrough's assumptions, roughly how long does prefill of an 8,000-token prompt take for the 8B model at batch 1?", "options": ["About 215 ms", "About 54 ms", "About 6 ms", "About 48 s"], "answer": 0, "explain": "Prefill scales linearly with $n_{in}$ (ignoring attention's quadratic term): $4 \\times 54 \\approx 216$ ms. 54 ms is the 2,000-token case; 6 ms is one decode step; 48 s would be generating 8,000 tokens one at a time."}
```

```quiz
{"q": "Your workload averages 6,000 prompt tokens and 80 output tokens. Which optimisation most likely helps total GPU time the most?", "options": ["Reducing prefill work, for example with prefix caching or FP8 compute", "Speculative decoding", "Increasing the decode batch size from 32 to 64", "Moving to a GPU with more memory bandwidth but equal FLOP/s"], "answer": 0, "explain": "With 75 prompt tokens per output token, prefill dominates. At about 27 µs per prompt token it is roughly 160 ms per request, versus about 80 × (6 ms / batch) of decode, which is small at any reasonable batch. The other options all target decode, which is a minor share here."}
```
