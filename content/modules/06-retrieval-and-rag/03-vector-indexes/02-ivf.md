---
title: IVF - search only the nearest clusters
minutes: 8
---

A city postal service does not compare your letter's address with every house in the country. It sorts by region first, then district, then street, so a letter is only ever compared against the houses in a few places. **IVF** (inverted file index) does the same for vectors: split the space into regions, and at query time look only in the few regions nearest to the query.

## Building and querying

**Training.** Run **k-means** on a sample of the vectors to find $n_{\text{list}}$ **centroids** (cluster centres). Every stored vector is assigned to its nearest centroid, and each centroid keeps a list of its members: an inverted list, hence the name.

**Query.** Compare the query with all $n_{\text{list}}$ centroids (cheap, because there are few), pick the $n_{\text{probe}}$ nearest centroids, and run exact search only over the vectors in those lists.

```mermaid
flowchart LR
  Q["Query vector"] --> C["Compare with nlist centroids"]
  C --> P["Pick nprobe closest lists"]
  P --> S["Exact scan of those lists only"]
  S --> T["Top-k"]
```

## The scan count

If the $N$ vectors split evenly, each list holds $N / n_{\text{list}}$ vectors, and a query computes this many distances:

$$
\text{distances} = \underbrace{n_{\text{list}}}_{\text{centroids}} + \underbrace{n_{\text{probe}} \cdot \frac{N}{n_{\text{list}}}}_{\text{scanned vectors}}
$$

```steps
Worked example: 10 million vectors
$N = 10^7$ and $n_{\text{list}} = 4096$. Each list averages $10^7 / 4096 = 2{,}441$ vectors.
---
With $n_{\text{probe}} = 16$: scanned vectors $= 16 \times 2{,}441 = 39{,}062$, plus $4{,}096$ centroid comparisons, giving $43{,}158$ distances.
---
Exact search needs $10^7$. Speed-up in distance computations: $10^7 / 43{,}158 \approx 232\times$. You examined $16/4096 = 0.39\%$ of the data.
---
Now $n_{\text{probe}} = 64$: $64 \times 2{,}441 + 4{,}096 \approx 160{,}300$ distances, still $62\times$ fewer than exact, but four times the scanning of $n_{\text{probe}} = 16$.
```

The distance count is minimised when the two terms balance, which happens near $n_{\text{list}} \approx \sqrt{n_{\text{probe}} N}$. In practice people set $n_{\text{list}}$ between about $\sqrt{N}$ and $16\sqrt{N}$ (here $\sqrt{N} = 3{,}162$), larger for bigger collections.

## Why recall is below 1

A query's true nearest neighbour may sit just across a cluster boundary. If the query's nearest centroid is $A$ but the neighbour was assigned to centroid $B$, probing only $A$ misses it. Raising $n_{\text{probe}}$ checks more boundary regions and raises recall, at linear extra cost. Roughly: $n_{\text{probe}} = 1$ typically gives mediocre recall; probing a few percent of the lists typically gives high recall. The exact numbers depend on your data's clustering, so you measure them against the flat baseline.

| $n_{\text{probe}}$ | Lists scanned | Cost (relative) | Recall (typical shape) |
|---|---|---|---|
| 1 | 0.02% | 1x | low |
| 16 | 0.4% | ~16x | good |
| 64 | 1.6% | ~64x | higher |
| 4096 | 100% | exact search | 1.0 |

At $n_{\text{probe}} = n_{\text{list}}$ IVF degenerates to flat search: the knob smoothly spans from fast-and-sloppy to slow-and-exact.

## See it

```sim
hnsw-recall
{"index": "ivf", "vectors": 1000000, "dim": 768, "nprobe": 16}
```

The sim models IVF over a million vectors. Set the index to IVF and raise $n_{\text{probe}}$ from 1 upward: watch recall@10 climb with diminishing returns while latency rises roughly linearly. Then switch to Flat to see the exact baseline's latency for comparison.

## In practice

IVF indexes build quickly, use little memory beyond the vectors themselves, and are friendly to disk-based storage because each list is a contiguous block. Their weakness is that the clusters are learned from a sample: if your data drifts (new products, a new language), the centroids go stale and recall quietly falls until you retrain and rebuild. Keep $n_{\text{probe}}$ in the tuning loop, because it is a query-time parameter you can change without rebuilding anything.

```quiz
{"q": "N = 4,000,000 vectors, nlist = 2,000, nprobe = 10. How many distance computations does a query make (centroids plus scanned vectors)?", "options": ["22,000", "20,000", "2,000,000", "4,000,000"], "answer": 0, "explain": "Each list averages $4\\times10^6/2000 = 2000$ vectors, so scanned $= 10 \\times 2000 = 20{,}000$, plus 2,000 centroid comparisons $= 22{,}000$. 20,000 forgets the centroid step."}
```

```quiz
{"q": "Recall is too low. Which change needs no index rebuild and increases recall?", "options": ["Increase nlist", "Increase nprobe", "Change the embedding model", "Reduce k"], "answer": 1, "explain": "nprobe is a query-time setting: probing more lists catches neighbours near cluster boundaries. Changing nlist or the embedding model requires retraining or rebuilding the index."}
```
