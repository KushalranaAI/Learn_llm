---
title: Sizing the funnel from a latency and cost budget
minutes: 8
---

A retrieval funnel has four dials: how many candidates each retriever fetches, whether to rerank, how many candidates $N$ to rerank, and how many passages $k$ to keep. Choosing them by feel is how systems end up either slow or leaky. This topic turns the choice into arithmetic: a latency budget, a cost budget and a recall target.

## The latency budget

Work backwards from what the product needs. Suppose the whole answer must start streaming within 1,000 ms (time to first token) and the LLM's own prefill takes 450 ms for a typical prompt. That leaves 550 ms for everything else; allow 100 ms for network and orchestration, and the retrieval funnel has about 450 ms. Subtract the fixed stages:

$$
t_{\text{rerank}} \le T_{\text{budget}} - t_{\text{embed}} - t_{\text{search}} - t_{\text{fuse}}
$$

and, since rerank time is linear in candidates, $N_{\max} = t_{\text{rerank}} / t_{\text{doc}}$ where $t_{\text{doc}}$ is the per-candidate cost.

```steps
Worked example: choosing N
Suppose a tighter funnel budget of 250 ms (the product has a stricter target than the 450 ms above). Query embedding 20 ms, hybrid search (BM25 and dense in parallel) 30 ms, RRF fusion 2 ms. Remaining for reranking: $250 - 20 - 30 - 2 = 198$ ms.
---
The reranker costs 1.54 ms per candidate (from the previous topic's 154 ms for 100 pairs). $N_{\max} = 198 / 1.54 \approx 128$.
---
Leave headroom for tail latency (p95 is often 1.5x the median): use $N = 80$, expecting $80 \times 1.54 = 123$ ms at the median and about 185 ms at p95.
---
Check the recall side with the labelled set: if recall@80 is within about a point of recall@128, the smaller $N$ was free.
```

## The cost budget

Embedding the query is nearly free (a fraction of a cent per thousand queries). Search is infrastructure you already pay for. The big variable costs are the reranker and the LLM prompt. With an illustrative hosted-reranker price of \$2 per 1,000 searches for up to 100 documents each, 1 million queries a day cost \$2,000 a day. The LLM side is driven by $k$: each extra passage of 400 tokens adds $400 \times 3 / 10^6 = \$0.0012$ per request at an illustrative \$3 per million input tokens, which at a million requests a day is \$1,200 a day per passage. Reducing $k$ from 8 to 5 by reranking well saves $3 \times 1{,}200 = \$3{,}600$ a day, which can outweigh the reranker's own bill.

| Design | Rerank cost / day (1M queries) | Prompt cost from chunks / day | Total retrieval + context |
|---|---|---|---|
| No rerank, $k = 8$ | \$0 | \$9,600 | \$9,600 |
| Rerank $N=100$, $k = 5$ | \$2,000 | \$6,000 | \$8,000 |
| Rerank $N=50$, $k = 5$ (half price) | \$1,000 | \$6,000 | \$7,000 |

If recall@5 after reranking matches or beats recall@8 without it, reranking is a quality gain that also pays for itself. This is a common outcome, not a guarantee: measure it.

## A decision procedure

```steps
How to choose N, k and the retrievers
**Measure the first stage.** On your labelled queries, compute recall@N for N = 10, 25, 50, 100, 200 for BM25, dense and hybrid.
---
**Pick the retriever** whose recall@50 is highest (usually hybrid). Check which query types each fails on before dropping a retriever entirely.
---
**Add a reranker** and measure recall@k and nDCG@10 for k = 3, 5, 8 across N. Plot recall against latency.
---
**Choose the knee**: the smallest $N$ whose recall is within a point of the plateau, and the smallest $k$ whose answer accuracy is within a point of the best (evaluate with the generator, using the accuracy equation).
---
**Set guard rails**: a hard cap on N (to bound latency), a timeout that falls back to the unreranked order, and alarms on recall measured with a daily canary set.
```

## See it

```sim
rerank-depth
{"candidates": 80, "k": 5, "firstStage": "hybrid", "rerankerAuc": 0.97, "msPerDoc": 1.5}
```

This sets up the design above: hybrid first stage, 80 candidates, 1.5 ms per document. Check the displayed latency against the arithmetic. Then try $N = 20$ and $N = 200$ and note the recall at each; find the smallest $N$ that stays within one point of the best recall for $k=5$. Switch `k` from 5 to 10 and see what happens to the benefit of reranking: when $k$ is large, plain retrieval already catches most of the ceiling.

## In practice

Put a timeout on the reranker. If it exceeds its budget, fall back to the fused order and log the event; a slow reranker should degrade quality slightly, not take the whole answer down. Cache reranker results for popular queries if your traffic repeats. And keep the evaluation set honest: tune $N$ and $k$ on one half of the labelled questions and report on the other half, so you do not reward a setting that merely memorised your examples.

```quiz
{"q": "Budget 300 ms for the funnel. Embedding takes 25 ms, search 35 ms, fusion 5 ms. The reranker costs 2 ms per candidate. What is the maximum N at the median?", "options": ["117", "150", "235", "300"], "answer": 0, "explain": "Remaining time is $300 - 25 - 35 - 5 = 235$ ms, and $235 / 2 = 117.5$, so at most 117 candidates. 150 divides the whole budget by 2 and ignores the fixed stages."}
```

```quiz
{"q": "Reranking lets you cut k from 8 to 5 without losing answer accuracy. What is the main cost effect, besides the reranker bill?", "options": ["Retrieval gets cheaper", "Fewer prompt tokens per request: about 3 x 400 fewer input tokens", "Embedding gets cheaper", "None: k does not affect cost"], "answer": 1, "explain": "Each passage is part of the LLM's input. Three fewer passages of 400 tokens remove 1,200 input tokens per request, which often outweighs the reranker's price."}
```
