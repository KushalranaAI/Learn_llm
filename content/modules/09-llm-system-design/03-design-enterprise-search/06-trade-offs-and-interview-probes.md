---
title: Trade-offs and what the interviewer probes
minutes: 9
---

Once the design is on the board, the interviewer shifts from "what" to "why not the other way". For enterprise search the pressure points are freshness against cost, security against recall, and answer generation against plain search. Come with the alternative, the number that decides between them, and your default.

## Where the money goes

First, keep the budget in view. Using the hypothetical prices from earlier topics:

| Component | Monthly cost | Share |
|---|---|---|
| Answer generation (160,000 queries a day, \$0.0061 each) | \$29,280 | 77% |
| Reranker (3 GPUs) | \$5,475 | 14% |
| Index nodes (8 nodes) | \$2,920 | 8% |
| Ongoing embedding (about \$6 a day) | \$180 | under 1% |
| **Total** | **\$37,855** | |

Generation dominates, so the biggest levers are about not generating, or generating less.

## Trade-off 1: generate an answer, or just show results

Many enterprise queries are lookups ("travel policy 2025"): the user wants the link, not a paragraph. If a classifier (or a simple rule on query shape and top-score confidence) sends 30% of queries to results-only, generation cost falls to $29{,}280 \times 0.70 = \$20{,}496$ a month, a saving of \$8,784. It also makes those queries faster. The risk is a wrong classification that withholds an answer the user wanted; make "Generate an answer" a one-click button on results pages as the safety valve.

## Trade-off 2: context size

Passing 8 chunks costs $T_{in} = 500 + 8 \times 500 = 4{,}500$ tokens; passing 5 costs $3{,}000$.

$$
\text{cost per query} = T_{in}\,p_{in} + T_{out}\,p_{out} = 3{,}000 \times 10^{-6} + 400 \times 4 \times 10^{-6} = \$0.0046
$$

At 160,000 queries a day that is \$736 against \$976, saving \$240 a day or **\$7,200 a month**. Whether to take it depends on how much answer accuracy the last three chunks buy: measure groundedness and answer correctness at 5 and at 8 on the labelled set, and choose the knee. Better reranking is the way to keep quality while passing fewer chunks.

## Trade-off 3: freshness against cost and complexity

| Freshness target | Mechanism | Cost and risk |
|---|---|---|
| Daily | Nightly crawl | Simplest; stale all day; deletes linger |
| 15 minutes | Webhooks plus 10-minute polling | Moderate; needs per-source work |
| Near real time (seconds) | Streaming change feeds into the index | Costly engineering; sources often cannot support it |

Embedding spend barely changes across these (\$6 a day at 1% churn), so the choice is about engineering and source API limits, not money. Permissions deserve a faster target than content because a stale ACL is a security problem and stale content is only an annoyance.

## Trade-off 4: permission strategy

| Option | Security | Recall for restricted users | Latency |
|---|---|---|---|
| Post-filter only | Good if the final live check exists | Poor at small visibility $f$ | Wasted over-fetch |
| Pre-filter in the index | Good | Good until $f$ is very small | Rises roughly as $1/f$ |
| Live check against the source for every candidate | Strongest | Same as the stage before it | One call per candidate; source rate limits |
| Mirror plus final live check on top 8 | Strong | Good | Small |

The last row is the defensible default: a fast mirrored ACL for retrieval, and a live check on the few chunks that will actually be shown.

## Trade-off 5: one index or many

A single shared index is simpler to operate and gives the best cross-source ranking. Per-tenant or per-department indexes give stronger isolation and simpler deletion (drop the index) at the cost of duplicated infrastructure and fragmented ranking. For a single company, one index with ACL fields is normal. For a product serving many customer companies, separate indexes per customer are common precisely because "a bug in the filter" must not become "a leak across companies".

## What interviewers probe

| Probe | What a strong answer contains |
|---|---|
| "A user says the answer is wrong." | Trace has query, chunk ids and versions, scores; check whether retrieval or generation failed; add the query to the labelled set |
| "How do you prevent leaking HR documents?" | ACL on every chunk, deny by default, pre/post filter strategy with the $1/f$ maths, final live check, canary probes, derived content inherits ACL |
| "Employee leaves a group; when does it take effect?" | Separate fast ACL sync (5 minutes), short principal cache, live check on final chunks |
| "BM25 or embeddings?" | Both, fused with RRF, since lookup and semantic queries differ; show by-query-type recall |
| "Search got slower after the launch." | Per-stage latency breakdown; shard stragglers, hedged requests, reranker queue, filter selectivity |
| "Cut the bill by 30%." | Results-only routing, 5 chunks instead of 8, prompt caching, a small model for easy answers, with quality checks |
| "How do you test it?" | Labelled queries (about 400), recall@k, nDCG, groundedness, citation precision, plus a 30,000-probe leak suite |

```steps
A two-minute closing summary
Goal: find and synthesise company knowledge fast, and never show anyone content they cannot open.
---
Scale: 160,000 queries a day, about 9 QPS at peak, 60 million chunks, about 54 GB of int8 index across 4 shards with 2 replicas.
---
Design: connectors with fast ACL sync, hybrid BM25 plus embeddings with RRF, reranker on 30 candidates, live permission check, cited generation.
---
Cost: about \$37,900 a month at hypothetical prices, 77% of it generation; levers are results-only routing and fewer chunks.
---
Risks: leaks from stale ACLs or derived content, stale documents from silent connector failures; mitigated by canary probes, lag alerts and the final check.
```

## In practice

Candidates who do well in this case say early that the permissions are an invariant, not a metric, and then spend their time on the mechanism that enforces it. Those who stay on embeddings and chunk sizes miss what makes enterprise search different from a demo. Close by stating what you would build first: connectors for two sources, hybrid retrieval, ACL fields and the leak test, with generation added after the retrieval metrics are healthy.

```quiz
{"q": "Generation costs \\$29,280 a month. If 30% of queries are answered with results only, no generation, what is the new generation cost?", "options": ["\\$8,784", "\\$20,496", "\\$22,840", "\\$29,280"], "answer": 1, "explain": "Only 70% of queries generate: 29,280 × 0.70 = \\$20,496. The saving is \\$8,784, which is the tempting wrong answer because it is the amount removed, not the amount left."}
```

Now build and stress-test a production retrieval pipeline yourself: tune recall, latency and cost, and see what a slow vector store does to it.

```sandbox
rag-production
```
