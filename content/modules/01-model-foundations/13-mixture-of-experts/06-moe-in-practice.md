---
title: MoE in practice
minutes: 9
---

MoE trades compute for memory and communication. The first topic showed the good side: a token pays for $k$ experts, not $N$. This topic covers the bill. Every expert must be held in fast memory, because the next token may choose any of them. When experts live on different GPUs, tokens have to travel to them and back on every MoE layer. And at serving time, the savings in FLOPs often do not turn into savings in time, because generating text is usually limited by how fast weights can be read, not by arithmetic.

Whether MoE is worth it depends on which of these resources is scarce for you.

## Memory: you store the total

Weight memory is total parameters times bytes per parameter. For Mixtral 8x7B in bf16 (2 bytes):

$$
46.7 \times 10^9 \times 2 \text{ bytes} \approx 93 \text{ GB}
$$

That does not fit on one 80 GB GPU, even though the model computes like a 13B model, which would need about 26 GB. Serving it means two GPUs, or quantising the weights (4-bit brings it to about 23 GB plus overheads). Training is worse: with mixed-precision Adam at roughly 16 bytes per parameter, the model and optimiser states alone take about $46.7\text{B} \times 16 \approx 750$ GB.

## Decode: the batch touches every expert

During generation, each step reads the weights it needs from GPU memory. With batch size 1 and top-2 routing, a step reads 2 experts per layer. But a batch of $b$ sequences routes $b$ tokens per layer, and each picks its own pair. If routing is roughly uniform, the chance that a given expert is *not* chosen by one token is $(N - k)/N$, so the expected number of distinct experts touched per layer is

$$
\mathbb{E}[\text{experts read}] = N \left( 1 - \left( \frac{N-k}{N} \right)^{b} \right)
$$

For Mixtral ($N = 8$, $k = 2$, so $(N-k)/N = 0.75$):

| Batch $b$ | Experts read per layer | Fraction of expert weights read |
|---|---|---|
| 1 | $8(1 - 0.75) = 2.00$ | 25% |
| 4 | $8(1 - 0.316) = 5.47$ | 68% |
| 8 | $8(1 - 0.100) = 7.20$ | 90% |
| 32 | $8(1 - 0.0001) = 8.00$ | 100% |

At any realistic serving batch, every step reads all 47B parameters, just like a dense 47B model, while doing the arithmetic of a 13B model. Decode is memory-bound, so step time follows bytes read. The MoE advantage at decode comes from batching: many tokens share each expert read.

There is a second effect. Each expert sees only about $bk/N$ of the batch's tokens, a quarter for Mixtral. Its **arithmetic intensity** (FLOPs per byte of weights read) is therefore $N/k$ times lower than a dense layer at the same batch. To reach the same efficiency, you need an $N/k$ times larger batch.

```sim
roofline
{"gpu": "h100", "model": "llama3-8b", "tokens": 256}
```

The sim shows a dense model. Treat the token count as the number of tokens each weight matrix sees. Note where 256 tokens sits relative to the ridge point. Then set tokens to 64, which is what one Mixtral expert sees out of a batch of 256 ($256 \times 2/8$). The point slides left, deeper into the memory-bound region, and attained throughput drops. That is the MoE decode penalty.

## Expert parallelism and all-to-all

When the experts do not fit on one GPU, **expert parallelism** places different experts on different devices. Attention and the router run as usual (often data-parallel), and each MoE layer then does two collective exchanges:

```steps
One MoE layer under expert parallelism
**Route.** Each GPU runs the router on its own tokens and finds each token's $k$ experts.
---
**All-to-all (dispatch).** Every GPU sends each token's $d$-dimensional vector to the GPUs that hold its chosen experts. Every device both sends and receives.
---
**Compute.** Each GPU runs its local experts on the tokens it received, the per-expert loop from earlier, now with tokens that came from everywhere.
---
**All-to-all (combine).** Outputs travel back to the tokens' home GPUs, where they are weighted by $g_i$ and summed into the residual stream.
```

Per token per MoE layer, the traffic is about $2 \cdot k \cdot d$ values (out and back). In bf16 for Mixtral:

$$
2 \times 2 \times 4{,}096 \times 2 \text{ bytes} = 32{,}768 \text{ bytes} = 32 \text{ KiB}
$$

A forward pass over 4,096 tokens through 32 MoE layers moves $4{,}096 \times 32 \times 32\text{ KiB} = 4$ GiB, all on the critical path. Within one server, fast GPU links make this manageable. Across servers it often dominates, which is why large MoE training systems place experts carefully and overlap communication with compute. See [why split a model](/learn/inference-and-serving/speculative-and-parallel) for how expert parallelism compares with tensor and pipeline parallelism.

## When MoE is worth it

| Situation | MoE helps? | Why |
|---|---|---|
| Pretraining with a fixed FLOP budget | Yes | More capacity per FLOP; Switch reported large speed-ups to the same quality as a dense baseline |
| High-throughput serving on a multi-GPU node | Yes | Large batches amortise expert reads; per-token compute is low |
| Single-user local inference, batch 1 | Mixed | Compute is low, but you still need memory for the total |
| Memory-limited device | No | A dense model with the same memory gives more quality per byte |
| Fine-tuning on a small dataset | Careful | Experts can overfit and routing can drift; many teams freeze the router |

## In practice

- **Quote both numbers.** "47B total, 13B active, top-2 of 8" tells an engineer the memory, the FLOPs and the routing all at once.
- **Batch size invariance breaks.** Routing and capacity limits depend on which other tokens share the batch. With token dropping, the same prompt can produce slightly different outputs depending on who else is in the batch. Dropless serving avoids this.
- **Offloading idle experts is hard.** Because routing changes every token, keeping some experts in CPU memory means waiting on PCIe transfers mid-step. It works for batch-1 local use, and it is slow.
- **Monitor experts in production.** A shift in traffic can push most tokens onto a few experts. Per-expert token counts are a cheap and useful dashboard metric.

```quiz
{"q": "An MoE model has $N = 16$ experts per layer and top-$k = 2$ routing, with roughly uniform routing. At decode batch size $b = 8$, about what fraction of each layer's expert weights is read per step?", "options": ["About 66%", "About 12.5%, since each token uses 2 of 16", "100%, since every expert is always read", "About 100%, since 8 tokens × 2 experts = 16"], "answer": 0, "explain": "$(N-k)/N = 14/16 = 0.875$ and $0.875^8 \\approx 0.344$, so the fraction read is $1 - 0.344 \\approx 0.66$. 12.5% is the batch-1 figure. 16 assignments do not cover 16 experts, because several tokens pick the same expert."}
```

```quiz
{"q": "A team serving a 47B-total, 13B-active MoE sees decode step times close to a dense 47B model, not a 13B one. What is the most likely reason?", "options": ["Decode is memory-bound, and at their batch size every step reads nearly all expert weights", "The router is too expensive to compute", "Top-2 routing doubles the FLOPs relative to the active count", "The auxiliary loss is still being computed at inference time"], "answer": 0, "explain": "Decode time follows bytes read. Once the batch is more than a handful of tokens, almost every expert is touched each step, so all 47B parameters stream through memory. The router is about $d \\times N$ parameters per layer and negligible. The FLOPs already reflect top-2 in the 13B active figure."}
```
