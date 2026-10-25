---
title: Sizing the KV cache
minutes: 8
---

When an inference server runs out of GPU memory, the culprit is rarely the model weights. Weights are a fixed cost you pay once. The KV cache is a per-token, per-user cost that grows with every token of every active conversation. Being able to size it on the back of an envelope is one of the most useful skills in LLM serving: it tells you how many users fit on a GPU, how long a context you can afford, and why some models are much cheaper to serve than others of the same size.

## The formula

For every token in every sequence, each layer stores one key vector and one value vector for each KV head. Multiply it out:

$$
\text{KV bytes} = 2 \cdot L \cdot h_{kv} \cdot d_h \cdot n \cdot B \cdot b
$$

| symbol | meaning |
|---|---|
| $2$ | one key and one value |
| $L$ | number of layers |
| $h_{kv}$ | number of key/value heads (equal to the number of attention heads $h$ in standard multi-head attention) |
| $d_h$ | dimension of each head |
| $n$ | tokens per sequence (prompt plus generated so far) |
| $B$ | number of sequences held at once (batch) |
| $b$ | bytes per number: 2 for fp16/bf16, 1 for fp8 or int8 |

The first four factors with $b$ give the **bytes per token**, a fixed property of the model; $n \cdot B$ is the total number of tokens alive on the GPU.

## Worked example: Llama-2-7B

Llama-2-7B has $L = 32$ layers, $h = 32$ heads with $d_h = 128$ (so $h \cdot d_h = 4096 = d$), and standard multi-head attention, so $h_{kv} = 32$. In bf16, $b = 2$.

```steps
Llama-2-7B cache, step by step
Per token per layer: $2 \times 32 \times 128 \times 2 = 16{,}384$ bytes = 16 KiB. (Check: this is $2 \cdot d \cdot b = 2 \times 4096 \times 2$, since $h_{kv} d_h = d$ in multi-head attention.)
---
Per token, all 32 layers: $16 \text{ KiB} \times 32 = 524{,}288$ bytes = **0.5 MiB per token**.
---
One sequence at the full 4,096-token window: $0.5 \text{ MiB} \times 4096 = 2{,}048 \text{ MiB} = 2 \text{ GiB}$.
---
Eight such sequences: $2 \text{ GiB} \times 8 = 16 \text{ GiB}$. The weights themselves are about $6.7 \times 10^{9} \times 2 \approx 13.5$ GB (12.6 GiB). Eight full-length users already need more memory for their caches than for the model.
```

How many full-length users fit on one 80 GB GPU? 80 GB is about 74.5 GiB. Subtract roughly 12.6 GiB of weights and a few GiB of working buffers, and around 60 GiB remains for the cache: $60 / 2 = 30$ sequences at 4,096 tokens. Halve the context to 2,048 tokens and you fit about 60. The cache, not compute, sets the maximum batch, and the batch sets throughput.

## Scaling behaviour

Everything in the formula is a straight multiplication, so it scales simply:

- Double the context $n$, double the cache. At 32k tokens, a single Llama-2-7B-shaped sequence would need $0.5 \times 32768 / 1024 = 16$ GiB.
- Double the batch $B$, double the cache.
- Halve the bytes $b$ by storing the cache in fp8, halve the cache. Many engines support this with small quality loss.
- Reduce $h_{kv}$: share keys and values across heads. This is the subject of the next topic, and it is the change most modern models have made.

```callout-math
Bytes per token is a model fingerprint
Compute $2 \cdot L \cdot h_{kv} \cdot d_h \cdot b$ once for any model you deploy and write it down. Then KV memory is just bytes-per-token times total live tokens. For Llama-2-7B in bf16 that is 0.5 MiB, so 100,000 live tokens across all users is about 49 GiB.
```

## See it

```sim
kv-cache-memory
```

Configure Llama-2-7B: 32 layers, 32 KV heads, head dimension 128, 16-bit. Set sequence length to 4,096 and batch to 1 and check the result is 2 GiB. Now raise the batch until the fits-in-GPU check fails on an 80 GB card, and compare your answer with the 30 or so estimated above. Finally switch the cache precision to 8-bit and see how many more sequences fit.

## In practice

Three things trip people up. First, units: the formula gives bytes; GiB is $2^{30}$ bytes while GPU marketing uses GB ($10^9$), a 7% difference that matters when you are near the limit. Second, real sequences are not all at full length; engines with paged caches allocate per block of tokens (for example 16 tokens), so memory follows the actual live tokens, which is why average length, not maximum length, sets real capacity. Third, when memory runs out mid-generation, the engine must pause (**preempt**) some sequences and either swap their cache out or recompute it later. If you see latency spikes under load, check cache utilisation first.

```quiz
{"q": "A model has 40 layers, 40 KV heads of dimension 128, and stores its cache in bf16. What is the KV cache for one 2,048-token sequence?", "options": ["About 0.8 GiB", "About 1.6 GiB", "About 3.1 GiB", "About 0.4 GiB"], "answer": 1, "explain": "Per token: $2 \\times 40 \\times 40 \\times 128 \\times 2 = 819{,}200$ bytes (about 0.78 MiB). Times 2,048 tokens: $1{,}677{,}721{,}600$ bytes $\\approx 1.56$ GiB. Answering 0.8 GiB forgets the factor of 2 for keys and values."}
```

```quiz
{"q": "Your server holds 20 sequences of 4,096 tokens for Llama-2-7B in bf16. You switch the cache to fp8 and double the context to 8,192 tokens. How much KV memory do you need now compared with before?", "options": ["Half as much", "The same", "Twice as much", "Four times as much"], "answer": 1, "explain": "Doubling $n$ doubles the cache; halving bytes per number from 2 to 1 halves it. Net: unchanged, about 40 GiB either way. Every factor in $2 L h_{kv} d_h n B b$ multiplies, so you can trade them against each other."}
```

```lab
fit-the-kv-cache
```
