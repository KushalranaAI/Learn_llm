---
title: Requirements and the first estimate
minutes: 9
---

```callout-before
Before you start
This case follows the framework from [A Framework for LLM System Design](/learn/llm-system-design/design-framework). You should be comfortable with chunking and embedding vectors from the retrieval module. All prices are hypothetical.
```

"Design a system that lets employees ask questions over all of our company's documents." This is the enterprise version of RAG, and it differs from the support-bot case in three ways that the interviewer will expect you to notice within minutes. The corpus is **huge and messy** (wikis, shared drives, tickets, chat exports, PDFs). Every document has **permissions**, and showing a salary spreadsheet to the wrong person is a far worse failure than a wrong answer. And the queries are **diverse**: some want one exact document ("the 2025 travel policy"), some want a synthesised answer ("how do we handle data-deletion requests in the EU?").

## Clarify

| Question | Assumed answer | Why it matters |
|---|---|---|
| Users? | 50,000 employees, 40% use it daily | Query load |
| Usage? | 8 queries per daily user | Query load and cost |
| Sources? | Wiki, drive, ticketing, code docs: about 20M documents | Connectors, index size |
| Document size? | 1,500 tokens on average | Chunks, embedding cost |
| Permissions? | Per-document ACLs from each source, groups up to thousands of members | Retrieval must respect them |
| Freshness? | New docs searchable in 15 min; revoked access effective in 5 min | Ingestion design |
| Output? | Ranked documents plus a cited synthesised answer | Two products on one index |
| Latency? | Results under 1 s p95; answer first token under 1.5 s | Reranker and model budget |

Turn the security requirement into a hard rule: **no answer may contain content from a document the asking user cannot open**. It is not a quality metric to be traded off; it is an invariant.

## Estimate the load

Queries per day: $Q = 50{,}000 \times 0.4 \times 8 = 160{,}000$. The naive average is $160{,}000 / 86{,}400 = 1.85$ QPS, but office tools do not spread over 24 hours. If 80% of queries land in an 8-hour working window, the working-hours average is

$$
\text{QPS}_{work} = \frac{0.8\,Q}{8 \times 3{,}600} = \frac{128{,}000}{28{,}800} \approx 4.4
$$

and with a further 2x for the Monday-morning peak, about **9 QPS**. This is a case where the default 3x peak factor would be wrong: the shape of the working day matters more than the daily total. Query load is modest; the corpus is what is big.

## Estimate the corpus and index

Let $D$ be documents, $\bar{\ell}$ mean tokens per document, $c$ chunk size in tokens, $d$ embedding dimension and $b$ bytes per value.

$$
N = \frac{D\,\bar{\ell}}{c}, \qquad S_{vec} = N\,d\,b
$$

```steps
Index sizing, step by step
Corpus tokens: $20\text{M} \times 1{,}500 = 30$ billion tokens (about 120 GB of raw text at roughly 4 bytes per token).
---
Chunks of 500 tokens: $N = 30\text{B} / 500 = 60$ million chunks.
---
Vectors at $d = 768$ in float32: $60\text{M} \times 768 \times 4 = 184$ GB. Quantised to int8: $46$ GB. Product-quantised to 64 bytes per vector: $3.8$ GB (with a recall cost).
---
HNSW graph links with 32 neighbours of 4 bytes each: $60\text{M} \times 128 = 7.7$ GB extra.
---
Embedding the whole corpus once at the hypothetical \$0.02 per 1M tokens: $30{,}000 \times 0.02 = \$600$. Daily churn of 1% of documents is 300M tokens: \$6 a day.
```

An int8 HNSW index of about 54 GB does not need to sit on one box; split it into 4 shards of about 14 GB, each with 2 replicas for availability, and keep the float32 originals on disk for re-ranking or rebuilding.

## Estimate the answer cost

Each answer sends instructions plus 8 retrieved chunks: $T_{in} = 500 + 8 \times 500 = 4{,}500$ tokens, and returns about $T_{out} = 400$.

$$
\text{cost/day} = Q\,(T_{in}\,p_{in} + T_{out}\,p_{out}) = 160{,}000 \times (4{,}500 \times 10^{-6} + 400 \times 4 \times 10^{-6}) = \$976
$$

| Quantity | Value |
|---|---|
| Queries / day | 160,000 |
| Peak QPS (working-hours shape) | about 9 |
| Documents / chunks | 20 M / 60 M |
| Vector storage float32 / int8 | 184 GB / 46 GB |
| One-off embedding cost | \$600 |
| Answer cost / day / month | \$976 / \$29,280 |
| Answer cost per query | \$0.0061 |
| Per employee per month | about \$0.59 |

Fifty-nine cents per employee per month is far below the value of one saved search, so cost will not decide this design. Recall, permissions and freshness will.

## In practice

The first surprise in real deployments is that the 20M documents contain huge duplication: copied slides, exported versions, the same policy in five drives. Near-duplicate detection at ingestion (hashing shingles of text) often removes a quarter of the corpus and, more importantly, stops five copies of an outdated document from crowding out the current one in the top results.

```quiz
{"q": "160,000 queries a day, 80% of them within an 8-hour working window. What is the average QPS during working hours?", "options": ["1.85", "4.4", "5.6", "13.3"], "answer": 1, "explain": "0.8 × 160,000 / (8 × 3,600) = 128,000 / 28,800 ≈ 4.4. 1.85 spreads the load over 24 hours, which badly underestimates office traffic; 5.6 puts all the traffic in the window."}
```

```quiz
{"q": "60 million chunks with 768-dimensional embeddings. How much memory do the vectors need in int8?", "options": ["About 4.6 GB", "About 46 GB", "About 184 GB", "About 460 GB"], "answer": 1, "explain": "60M × 768 × 1 byte ≈ 46 GB. Float32 (4 bytes) would be 184 GB. Graph links and metadata come on top."}
```
