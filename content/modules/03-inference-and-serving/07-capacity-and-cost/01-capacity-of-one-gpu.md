---
title: What one GPU can sustain
minutes: 8
---

Capacity planning starts with a single number: how many requests per second can one GPU (or one replica) sustainably serve with your model, your prompts and your latency target? Everything else, the fleet size and the bill, is multiplication and rounding from there. Get this number wrong and every downstream number is wrong, so it is worth deriving carefully and then confirming by load test.

## GPU-seconds per request

Each request consumes GPU time in two phases. Prefill occupies the GPU for $t_p$ seconds (compute-bound, all prompt tokens at once). Decode generates $n_{out}$ tokens, but the GPU is shared by the whole batch, so a request is charged only its share of each step: if the replica sustains $X$ output tokens per second at the chosen batch size, a request's decode costs $n_{out}/X$ GPU-seconds. So

$$
g = t_p + \frac{n_{out}}{X}, \qquad \lambda_{max} = \frac{1}{g}
$$

$g$ is the GPU-seconds per request and $\lambda_{max}$ the saturated request rate. This is the cost model the capacity sim uses.

```steps
Llama 3 8B on one H100, chat workload
Prompt 1,000 tokens, answer 300 tokens, batch limit 64, BF16. Assumptions: 80% of the approximately 3.35 TB/s bandwidth is achievable, 60% of the 989 TFLOP/s compute.
---
Average context during decode: about $1000 + 150 = 1150$ tokens. KV per sequence: $1150 \times 131{,}072$ bytes $= 0.151$ GB.
---
Decode step at batch 64: $(16.06 + 64 \times 0.151)/(0.8 \times 3350) = 25.7/2680 = 9.59$ ms. Server output throughput $X = 64/0.00959 = 6{,}670$ tokens/s; each user sees $1/0.00959 = 104$ tokens/s.
---
Prefill: $2 \times 8.03\times10^{9} \times 1000/(0.6 \times 9.89\times10^{14}) = 1.606\times10^{13}/5.93\times10^{14} = 27$ ms.
---
GPU-seconds per request: $g = 0.027 + 300/6670 = 0.027 + 0.045 = 0.072$ s. Saturated capacity $\lambda_{max} = 1/0.072 = 13.9$ requests/s per GPU.
```

Notice what the decomposition says: 62% of the GPU time goes to decode and 38% to prefill, even though decode is the slow part per request, because batching amortises decode across 64 users while prefill cannot be shared.

## Sensitivity to the workload

| Change | Effect on $g$ | New $\lambda_{max}$ |
|---|---|---|
| Baseline (1,000 in, 300 out) | 72 ms | 13.9 req/s |
| Output doubled to 600 tokens | $27 + 90 = 117$ ms | 8.5 req/s |
| Prompt quadrupled to 4,000 tokens | $108 + 89 \approx 197$ ms (prefill 4x; decode also slower because each KV cache is 3.6x larger: step 19 ms, 3,370 tokens/s) | ~5.1 req/s |
| Prefix cache hits 80% of the prompt | $5.4 + 45 = 50$ ms | 19.8 req/s |
| INT8 weights (step 6.6 ms, 9,700 tokens/s) | $27 + 31 = 58$ ms | ~17.2 req/s |

Capacity is therefore a property of the *workload*, not of the model alone: changing average output length by 2x moves it far more than a modest hardware change. That is why planning uses measured length distributions.

## Capacity is also limited by latency and memory

The saturated number assumes the batch of 64 fits in memory and the per-user speed (104 tokens/s here) is acceptable. Check both before accepting the number: the KV for 64 sequences is $64 \times 0.151 = 9.7$ GB, which fits easily beside the weights on an 80 GB GPU. If the SLO required 150 tokens/s per user, you would need a smaller batch (step $\le 6.7$ ms means $B \le (0.8 \times 3350 \times 0.0067 - 16.06)/0.151 = 13.6$, so 13), cutting $X$ to $13/0.0067 \approx 1{,}940$ tokens/s and capacity to about $1/(0.027 + 0.155) = 5.5$ requests/s. The latency target, not the hardware peak, determines usable capacity.

## See it

```sim
gpu-capacity
{"qps": 100, "promptTokens": 1000, "outputTokens": 300, "model": "llama3-8b", "gpu": "h100", "batch": 64, "targetUtil": 0.7, "gpuPrice": 2.5}
```

The sim uses the same ingredients. Read its GPU count and actual utilisation. Then try: output tokens to 600 (capacity falls, GPUs rise), prompt tokens to 4,000, and batch from 64 down to 16 (per-user speed rises, capacity falls). Compare the direction and rough size of each change with the table above; small differences are expected because the sim uses its own efficiency constants.

## In practice

Never trust a derived capacity without a load test at your real length mix, at the batch limit and SLO you intend to run. Use the derivation to know what the answer should be, and be suspicious when the test disagrees by more than about 30%: the usual causes are lower real bandwidth efficiency, a longer average context than assumed, CPU-side overheads (tokenization, scheduling) at small batch sizes, or prefill interference. Record the measured $\lambda_{max}$ per GPU as the planning constant, and re-measure after every model, engine or hardware change.

```quiz
{"q": "Prefill takes 40 ms per request and the replica sustains 5,000 output tokens/s. Answers average 250 tokens. What is the saturated request rate per GPU?", "options": ["About 11.1 requests/s", "25 requests/s", "20 requests/s", "About 5.6 requests/s"], "answer": 0, "explain": "$g = 0.040 + 250/5000 = 0.040 + 0.050 = 0.090$ s, so $\\lambda_{max} = 1/0.09 = 11.1$ req/s. Ignoring prefill gives 20; ignoring decode gives 25."}
```

```quiz
{"q": "Which change most increases requests per second per GPU for a workload with 6,000-token prompts and 60-token answers?", "options": ["Prefix caching of a shared prompt prefix", "Doubling the decode batch size", "Speculative decoding", "Reducing the number of layers' KV heads"], "answer": 0, "explain": "With 100 prompt tokens per output token, prefill dominates the GPU time per request, so reusing cached prefix KV removes most of it. Batching and speculation target decode, which is a small share here."}
```
