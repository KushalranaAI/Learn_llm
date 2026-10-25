---
title: Tuning an index to a budget
minutes: 8
---

Choosing an index is a three-way budget problem. You want high **recall**, low **latency** and low **memory**, and every setting buys one at the expense of another. Experienced engineers do not pick a favourite algorithm; they write down the three targets, measure, and move the knobs until all three are met.

## A procedure that works

```steps
Tuning loop
**Fix the targets.** For example: recall@10 at least 0.95 against exact search, p95 search latency under 20 ms, memory under 64 GB.
---
**Build ground truth.** Sample 1,000 to 10,000 real queries and compute their exact top-10 with a flat index (on a GPU, or a one-off overnight job).
---
**Start from a default.** HNSW with $M = 16$, efConstruction 200, efSearch 64 is a good first guess; for IVF, $n_{\text{list}} \approx 4\sqrt{N}$ and $n_{\text{probe}} = 16$.
---
**Sweep the query-time knob** (efSearch or nprobe) and plot recall against latency. This is cheap because no rebuild is needed.
---
**If the recall ceiling is too low**, rebuild with a larger $M$ or $n_{\text{list}}$, or move to higher-precision vectors. **If memory is too high**, quantise (int8, then PQ with reranking).
```

## Memory budgeting

Memory is usually the first constraint to bind. For $N = 10^8$ vectors of $d = 1{,}024$:

| Setup | Bytes per vector | Total |
|---|---|---|
| Flat float32 | $4096$ | 409.6 GB |
| Flat float16 | $2048$ | 204.8 GB |
| Flat int8 | $1024$ | 102.4 GB |
| IVF-PQ, $m = 128$ | $128 + 8$ (code + ID) | 13.6 GB |
| HNSW, $M = 32$, float32 | $4096 + 2 \times 32 \times 4 = 4352$ | 435.2 GB |

Check HNSW: layer-0 links $2M \times 4 = 256$ bytes, so $4096 + 256 = 4352$ bytes and $10^8 \times 4352 = 435.2$ GB. The graph adds about 6% to the vectors; the vectors dominate. This is why large systems store HNSW graphs over compressed vectors or use IVF-PQ plus a small rerank store.

## Filters: the hidden recall killer

Real queries carry **metadata filters**: tenant, language, document type, "updated after 2024", and always the permission check. There are two ways to apply them:

- **Post-filtering**: run the ANN search, then drop results that fail the filter. Simple, but if the filter is selective you may be left with nothing.
- **Pre-filtering (or filtered search)**: restrict the search to eligible vectors as it runs. Better results, but support varies and restrictive filters can disconnect an HNSW graph, hurting recall.

```steps
Worked example: how much to fetch under post-filtering
A tenant owns 1% of the collection, so a filter passes a fraction $s = 0.01$ of vectors. You want $k = 10$ results.
---
The expected number surviving from the top $k'$ ANN results is $k' \cdot s$. To expect 10 survivors, $k' = 10 / 0.01 = 1{,}000$.
---
For a permissions filter that passes $0.1\%$ of documents, $k' = 10{,}000$. At that point a flat scan of the eligible subset (or a per-tenant index) is cheaper than inflating $k'$.
---
Rule of thumb: when the filter is very selective, build separate indexes per tenant or partition the collection by the filter field; when it is mild, over-fetch by $1/s$ and cut down afterwards.
```

## See it

```sim
hnsw-recall
{"index": "hnsw", "vectors": 10000000, "dim": 768, "M": 16, "efSearch": 128}
```

At ten million vectors, set a recall target of about 0.95 and find the smallest efSearch that reaches it. Then raise $N$ to 100 million and note how the recall at the same efSearch moves, and how memory rises. Try $M = 32$ and compare memory and recall. Finally switch to IVF and find the nprobe that matches the HNSW recall, and compare the latency of the two.

```callout-tip
Do the lab
The lab gives you a collection, a recall target and a latency budget. Sweep the query-time knobs first, then rebuild only if the ceiling is too low.
```

```lab
tune-the-index
```

## In practice

Re-measure after every change to the data or the embedding model. Recall is a property of a particular index over particular data, and clusters or graphs built on last quarter's documents degrade quietly as the corpus shifts. Log recall on a canary query set regularly, and remember that index recall is only the first filter: a 0.97-recall index of a poor embedding model is still a poor retriever, so continue to track retrieval metrics (next lesson) as well.

```quiz
{"q": "Each tenant owns about 0.5% of the vectors and you post-filter ANN results by tenant. How many ANN results should you fetch to expect 10 for a given tenant?", "options": ["About 50", "About 500", "About 2,000", "About 10"], "answer": 2, "explain": "$k' = 10 / 0.005 = 2{,}000$. Fetching 10 would return, on average, 0.05 results for the tenant. 500 corresponds to a 2% filter."}
```

```quiz
{"q": "You must hold 200 million 768-dimensional float32 vectors in under 40 GB of RAM. What is the most plausible design?", "options": ["Flat float32 index", "HNSW over float32 vectors", "IVF-PQ (for example 96-byte codes, about 21 GB) with a full-vector rerank store on disk", "A smaller k"], "answer": 2, "explain": "Flat float32 needs $2\\times10^8 \\times 3072 = 614$ GB, and HNSW adds links on top. IVF-PQ at about 104 bytes per vector is $2\\times10^8 \\times 104 \\approx 21$ GB; the on-disk originals serve reranking."}
```
