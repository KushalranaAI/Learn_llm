---
title: "GPUs, KV-cache memory and embedding storage"
minutes: 10
---

If you self-host, the estimate has three more lines: how many GPUs, how much memory the in-flight conversations occupy, and how much storage the retrieval index needs. Each comes from one short formula. We continue the running example: 347 peak QPS, 1,500 input and 300 output tokens per request.

## GPUs: throughput divided by per-GPU capacity

Decode (generating output) is usually the bottleneck for chat. Let $\Theta_{dec}$ be the decode throughput one GPU sustains in tokens per second across all its batched sequences, and $u$ the target utilisation (headroom for spikes and variance). The number of GPUs for decode is

$$
G_{dec} = \frac{\text{QPS}_{peak}\,T_{out}}{u\,\Theta_{dec}}
$$

Prefill (reading the prompt) is separate work. With $\Theta_{pre}$ prefill tokens per second per GPU,

$$
G_{pre} = \frac{\text{QPS}_{peak}\,T_{in}}{u\,\Theta_{pre}}, \qquad G = G_{dec} + G_{pre}
$$

The two phases share the same GPUs unless you disaggregate them, so their times add. These per-GPU rates are **assumptions** you must state: here an 8B-class model on a modern 80 GB GPU with $\Theta_{dec} = 1{,}050$ tokens/s (about 27 concurrent streams at 40 tokens/s each) and $\Theta_{pre} = 20{,}000$ tokens/s. Measure them for your own stack; they vary 3x between serving engines and settings.

```steps
GPU count for the running example
Peak output rate: $347 \times 300 = 104{,}167$ tokens/s. Peak input rate: $347 \times 1{,}500 = 520{,}833$ tokens/s.
---
Decode only, at full utilisation ($u = 1$): $104{,}167 / 1{,}050 = 99.2$, so about **100 GPUs**. That is a lower bound: $100 \times 2.50 \times 730 = \$182{,}500$ per month.
---
Add prefill: $520{,}833 / 20{,}000 = 26$ GPUs at $u = 1$. Both phases: about 125 GPUs.
---
Leave headroom, $u = 0.7$: $125.2 / 0.7 \approx 179$ GPUs. Cost: $179 \times 2.50 \times 730 = \$326{,}675$ per month.
```

Compare with the API bill of \$567,000 with caching: the self-hosted 8B model is cheaper, but it is a different quality tier from the hypothetical large API model, so the comparison is only fair if the small model passes your evaluation. Explore it yourself.

```sim
gpu-capacity
{"qps": 347, "promptTokens": 1500, "outputTokens": 300}
```

The sim uses its own batching model, so its GPU count will differ from our hand figure. Try a different GPU and see how the count moves; then drop the target utilisation to 0.5 and watch the cost per 1,000 requests rise. Differences between your hand estimate and a tool are normal; the interview point is that you know which assumptions drive the answer.

## KV-cache memory and Little's law

Every in-flight conversation holds a **KV cache** in GPU memory. For the reference 8B-class model with $L = 32$ layers, $h_{kv} = 8$ key/value heads, head dimension $d_h = 128$ and $b = 2$ bytes (bf16), per token:

$$
\text{KV}_{tok} = 2\,L\,h_{kv}\,d_h\,b = 2 \times 32 \times 8 \times 128 \times 2 = 131{,}072 \text{ bytes} = 128 \text{ KiB}
$$

The factor 2 is keys plus values. A conversation of $S = 1{,}800$ tokens (1,500 in, 300 out) holds $1{,}800 \times 131{,}072 \approx 236$ MB.

How many conversations are in flight at once? **Little's law** says concurrency equals arrival rate times time in system: $N = \lambda W$. If a request takes $W = 0.3 + 300 \times 0.025 = 7.8$ s (0.3 s to first token, then 25 ms per token), then at peak

$$
N = 347 \times 7.8 \approx 2{,}708 \text{ concurrent sequences}, \qquad \text{KV}_{total} = 2{,}708 \times 236 \text{ MB} \approx 639 \text{ GB}
$$

Across 100 GPUs that is $6.4$ GB each, next to about 16 GB of weights ($8\text{B} \times 2$ bytes) on an 80 GB card: it fits comfortably. A 70B model with long contexts is where KV memory, not compute, sets the GPU count.

```sim
kv-cache-memory
{"model": "llama3-8b", "seqLen": 1800, "batch": 27}
```

Set the context length to 32,000 and watch the cache grow linearly while the weights stay fixed. Then compare attention variants: fewer KV heads cut the cache in proportion.

## Embedding storage

For retrieval, suppose the knowledge base is $N = 10$ million chunks embedded with $d = 768$ dimensions. Storage is $N\,d\,b$:

| Format | Bytes per value | Size |
|---|---|---|
| float32 | 4 | $10^7 \times 768 \times 4 = 30.7$ GB |
| int8 | 1 | 7.7 GB |
| HNSW links (32 neighbours, 4 bytes) | n/a | about 1.3 GB extra |

Embedding the corpus once at a hypothetical \$0.02 per million tokens costs, for $10^7 \times 500 = 5$ billion tokens, $5{,}000 \times 0.02 = \$100$. Query embeddings are cheap: 10M queries of about 30 tokens is 300M tokens, \$6 per day. The vector index is a rounding error next to the generation bill, which is why retrieval quality, not retrieval cost, should drive that deep dive.

Do not forget logs: at 2 KB per request, 10M requests per day is 20 GB per day, 600 GB per month.

## In practice

Teams size to peak and then discover autoscaling GPUs takes minutes, not seconds, because weights must load. Keep a warm floor, and use queue depth rather than CPU as the scaling signal.

```quiz
{"q": "A model has 32 layers, 8 KV heads, head dimension 128, stored in bf16. How much KV cache does one token need?", "options": ["32 KiB", "64 KiB", "128 KiB", "256 KiB"], "answer": 2, "explain": "2 (keys and values) × 32 × 8 × 128 × 2 bytes = 131,072 bytes = 128 KiB. Dropping the factor 2 gives 64 KiB; forgetting that bf16 uses 2 bytes gives 64 KiB as well."}
```

```quiz
{"q": "Peak arrival rate is 200 requests/s and each takes 5 s end to end. Roughly how many sequences are in flight?", "options": ["40", "200", "1,000", "5"], "answer": 2, "explain": "Little's law: N = λW = 200 × 5 = 1,000. Multiplying is the point: slow requests hold memory for longer, so concurrency (and KV cache) grows with latency as well as with traffic."}
```
