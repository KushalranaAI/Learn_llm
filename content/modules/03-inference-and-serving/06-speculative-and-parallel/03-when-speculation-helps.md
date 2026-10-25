---
title: When speculation helps, and when it does not
minutes: 7
---

The speedup formula quietly assumed that verifying $k+1$ tokens costs the same as generating one. That is true only while the target's pass is memory-bound. Push the batch up and the assumption breaks, which is why speculative decoding is a tool for the *latency-sensitive, lightly loaded* corner of the design space and not a universal win.

## The hidden assumption

A verification pass for one sequence processes $k + 1$ token positions. Across a batch of $B$ sequences, that is $B(k+1)$ tokens through the weights in one pass, so the arithmetic intensity is roughly $B(k+1)$ FLOP/byte for BF16 weights. The pass stays memory-bound only while $B(k+1)$ is below the ridge point $I^* \approx 295$ (H100).

```steps
Where the free lunch ends (H100, BF16 8B model, k = 4)
Verification processes $B \times (k+1) = 5B$ tokens per pass. Ridge point about 295.
---
$B = 1$: 5 tokens per pass, intensity about 5. Far below the ridge: the pass costs the same as one ordinary step. Speculation is almost free.
---
$B = 16$: 80 tokens per pass, intensity about 80. Still memory-bound; extra compute is hidden under the weight reads.
---
$B = 59$: 295 tokens per pass. At the ridge. From here the pass takes longer in proportion to tokens, so every wrong guess burns real compute.
---
$B = 128$: 640 tokens per pass, compute-bound. With acceptance 0.8, only 3.36 of the 5 verified positions per sequence are useful; the other 1.64 (33%) are wasted compute that could have served other users.
```

So at high load a server running ordinary continuous batching is already using its spare compute to serve other users, and speculation competes with them for it. Many production systems turn speculation on at low load (when the batch is small and every user's speed matters) and off or limit $k$ when the batch is large. A simple rule: speculate while $B(k+1) \lesssim I^*$.

## Where acceptance is high, and where it is not

| Workload | Typical acceptance | Why |
|---|---|---|
| Code editing, refactoring | High (0.8 to 0.9) | Output copies and lightly changes the input |
| Summarising or quoting a document | High with n-gram / lookup drafts | Output reuses phrases from the context |
| Structured output (JSON with fixed keys) | High | Most tokens are forced |
| Open-ended chat | Medium (0.6 to 0.8) | Genuine choices, but common phrases are predictable |
| High-temperature creative writing | Low | The target samples many different tokens; the draft rarely matches |

Higher sampling temperature flattens $p$ and so lowers the overlap $\alpha = \sum \min(p, q)$ with any draft; greedy decoding (temperature 0) gives the most predictable target and the highest $\alpha$.

## Break-even acceptance

Speculation only helps if the speedup exceeds 1. With $k = 4$ and $c = 0.1$ the round cost is $1.4$, so you need expected tokens per pass $> 1.4$:

$$
\frac{1 - \alpha^{5}}{1 - \alpha} > 1.4 \quad\Longrightarrow\quad \alpha \gtrsim 0.29
$$

Check: at $\alpha = 0.3$ the sum is $1 + 0.3 + 0.09 + 0.027 + 0.0081 = 1.425$, barely above 1.4; at $\alpha = 0.2$ it is $1.2496 < 1.4$. Below roughly 0.3 acceptance, the draft costs more than it earns.

## Costs beyond the arithmetic

Speculation needs memory for the draft model's weights and KV cache, which reduces the batch the GPU can hold. Draft and target must share a tokenizer. Implementations must handle rejection correctly under batching, where sequences accept different numbers of tokens and so advance by different amounts; this complexity is why speculative decoding arrived in serving engines later than continuous batching. And the speedup applies to decode only: TTFT (prefill) is unchanged.

## See it

```sim
speculative-decoding
{"k": 4, "alpha": 0.3, "draftCost": 0.1, "seed": 3}
```

At $\alpha = 0.3$ the speedup should be only slightly above 1 (about 1.0 with this $k$). Raise $\alpha$ to 0.5, 0.7 and 0.9 and note when the speedup passes 2. Then keep $\alpha = 0.7$ and raise the draft cost to 0.3: a slow draft turns a good acceptance rate into a mediocre gain. The sim cannot show the batch-size effect (it assumes a memory-bound target), so combine it with the arithmetic above when you reason about a loaded server.

## In practice

Decide per route. A coding-assistant endpoint with long, repetitive outputs and modest concurrency is an ideal candidate; a bulk summarisation pipeline running at maximum batch size is not (and should not use speculation at all, since it is throughput-bound). A/B test: speculative decoding should not change output quality at all, so the experiment compares only latency and cost. If quality metrics move, there is a bug in the sampler or acceptance logic.

```quiz
{"q": "A server decodes with $k = 3$ speculative tokens per sequence. At roughly what batch size does verification reach the H100 ridge point (about 295 FLOP/byte), assuming intensity ≈ tokens per pass?", "options": ["About 74", "About 295", "About 98", "About 4"], "answer": 0, "explain": "Tokens per pass $= B(k+1) = 4B$, so $4B = 295$ gives $B \\approx 74$. 295 would be the answer without speculation; 98 divides by 3 instead of 4."}
```

```quiz
{"q": "Which situation is the best fit for speculative decoding?", "options": ["Interactive code-editing assistant at low to moderate load, greedy decoding", "Overnight batch job at the largest possible batch size", "High-temperature poetry generation at maximum load", "A prefill-dominated workload with 20,000-token prompts and 20-token answers"], "answer": 0, "explain": "It needs spare compute (small batch), predictable output (code, low temperature) and a decode-dominated cost. The batch job has no spare compute, the poetry has low acceptance, and the long-prompt workload is limited by prefill, which speculation does not touch."}
```
