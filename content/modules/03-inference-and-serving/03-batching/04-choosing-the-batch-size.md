---
title: Choosing a batch size, throughput versus per-user speed
minutes: 8
---

Every serving team eventually has the same argument. Finance wants bigger batches, because each GPU-hour then produces more tokens and the cost per token falls. Product wants smaller batches, because each user then sees tokens arrive faster. Both are right. The way to settle it is to write the latency target down and solve for the largest batch that meets it.

## Solving for the batch limit

From the first topic, a memory-bound decode step takes

$$
t_{step}(B) \approx \frac{W + B K}{\eta_m \beta}
$$

where $W$ is weight bytes, $K$ KV bytes per sequence at its typical context, $\beta$ peak bandwidth and $\eta_m$ the achieved fraction of it. A TPOT target $\tau$ requires $t_{step}(B) \le \tau$. Rearranging:

$$
B_{max} = \left\lfloor \frac{\eta_m \beta \tau - W}{K} \right\rfloor
$$

and $B$ is also capped by memory: $B \le M_{kv}/K$, where $M_{kv}$ is the memory left for the KV cache. The batch limit is the smaller of the two.

```steps
A TPOT target becomes a batch limit
8B model in BF16 on an H100: $W = 16.06$ GB, $K = 0.262$ GB (2,000-token contexts), $\beta \approx 3.35$ TB/s. Use $\eta_m = 1$ to keep the numbers clean; real values are lower. KV memory available: about 60 GB, so the memory cap is $60/0.262 \approx 229$.
---
Target $\tau = 10$ ms (100 tokens/s per user): $(3350 \times 0.010 - 16.06)/0.262 = (33.5 - 16.06)/0.262 = 66.6$, so $B_{max} = 66$.
---
Target $\tau = 20$ ms (50 tokens/s): $(67.0 - 16.06)/0.262 = 194$. Below the memory cap, so $B_{max} = 194$.
---
Target $\tau = 50$ ms (20 tokens/s): $(167.5 - 16.06)/0.262 = 578$, above the memory cap, so memory decides: $B_{max} = 229$.
---
Throughput at each limit: $66/0.010 = 6{,}600$ tokens/s; $194/0.020 = 9{,}700$ tokens/s; $229$ at $t = (16.06 + 60)/3350 = 22.7$ ms gives about 10,090 tokens/s. Relaxing TPOT from 20 ms to 50 ms buys only 4% more throughput, because memory runs out first.
```

## From throughput to cost

A GPU rented at $c$ dollars per hour producing $X$ output tokens per second has a cost per million output tokens of

$$
\text{cost per 1M} = \frac{c}{3600 \cdot X} \times 10^{6}
$$

At $c = \$2.50$ per hour (an illustrative rental price):

| Operating point | Throughput $X$ | Per-user speed | Cost per 1M output tokens |
|---|---|---|---|
| Batch 1 | 205 tok/s | 205 tok/s | \$3.39 |
| TPOT 10 ms, $B = 66$ | 6,600 tok/s | 100 tok/s | \$0.105 |
| TPOT 20 ms, $B = 194$ | 9,700 tok/s | 50 tok/s | \$0.072 |
| Memory cap, $B = 229$ | 10,090 tok/s | 44 tok/s | \$0.069 |

These are ideal-bandwidth numbers for a fully loaded GPU; real systems reach a fraction of them and are rarely full all day (lesson 7). But the shape is real: the first few dozen sequences cut cost by more than an order of magnitude, and the last hundred barely move it while halving everyone's speed.

## See it

```sim
llm-batching
{"model": "llama3-8b", "gpu": "h100", "batch": 66, "promptTokens": 1500, "outputTokens": 500, "gpuPrice": 2.5}
```

The sim includes efficiency factors, so its numbers will be lower than the ideal table. Find the batch at which per-user speed drops to 100 tokens/s and read its cost per million tokens. Then double the GPU price and note that the best batch does not change, only the cost. Finally switch the GPU to an H200: with more bandwidth and memory, the batch that meets the same per-user speed is larger, and the cost per token can fall even though the GPU-hour costs more.

## The goodput view

The real objective is goodput: requests per second that meet the whole SLO. Raising $B$ beyond $B_{max}$ adds throughput but pushes typical TPOT over the target, so goodput falls. Below $B_{max}$ you are leaving capacity unused. And the TPOT target interacts with TTFT: a batch near its memory cap leaves no room to admit new requests, so queue time, and TTFT, climb. Many teams therefore set the batch limit somewhat below $B_{max}$ to keep headroom for arrivals.

## In practice

Different products on the same model often run on separate pools with different batch limits: a premium interactive tier with small batches and fast tokens, and a bulk tier (offline summarisation, evaluations) with batches as large as memory allows. Pricing that offers a discount for asynchronous "batch" requests reflects exactly this curve: if you can wait, the provider can pack your work into large, cheap batches.

```quiz
{"q": "With $W = 16$ GB, $K = 0.5$ GB per sequence and an effective bandwidth of 3,000 GB/s, what is the largest batch that keeps TPOT at or below 15 ms?", "options": ["58", "90", "32", "26"], "answer": 0, "explain": "$B_{max} = \\lfloor (3000 \\times 0.015 - 16)/0.5 \\rfloor = \\lfloor (45 - 16)/0.5 \\rfloor = 58$. Forgetting to subtract the weights gives 90; 32 and 26 come from mixing up units."}
```

```quiz
{"q": "A GPU costing \\$3.00 per hour produces 5,000 output tokens/s. What is the cost per million output tokens?", "options": ["About \\$0.17", "About \\$0.60", "\\$1.67", "About \\$0.0006"], "answer": 0, "explain": "Tokens per hour $= 5000 \\times 3600 = 18$ million, so \\$3.00 / 18 = \\$0.167 per million. \\$0.60 would need the price divided by 5 (forgetting 3,600 s per hour and the million); \\$0.0006 is the cost per second, not per million tokens."}
```
