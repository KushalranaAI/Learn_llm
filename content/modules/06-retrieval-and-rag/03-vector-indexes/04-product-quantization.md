---
title: Product quantisation - shrinking vectors 32x
minutes: 8
---

Describing a colour as three 32-bit floats is more precision than you need to tell two reds apart. A palette of 256 named colours, and a one-byte index into it, is almost as good and a twelfth the size. **Quantisation** does this for embeddings: replace each exact vector with a short code that points into a learned codebook. **Product quantisation (PQ)** does it in a way that scales to hundreds of dimensions.

## The idea

Splitting a $d$-dimensional vector into $m$ equal **sub-vectors** of $d/m$ dimensions each, you learn a separate small codebook of $K$ centroids (usually $K = 256$) for each slice with k-means. A stored vector is then just the list of $m$ centroid indices, one per slice:

$$
\mathbf{x} = [\mathbf{x}^{(1)}, \dots, \mathbf{x}^{(m)}] \;\longrightarrow\; \text{code} = (c_1, \dots, c_m), \quad c_j = \arg\min_{k} \lVert \mathbf{x}^{(j)} - \mathbf{u}^{(j)}_k \rVert
$$

where $\mathbf{u}^{(j)}_k$ is centroid $k$ of slice $j$. Each index needs $\log_2 K = 8$ bits, so a code takes $m$ bytes. The effective number of representable vectors is $K^m$ (here $256^{96}$, astronomically many) even though you only store $m \cdot K$ centroids: that is the "product" in the name.

## The memory saving

```steps
Worked example: 768-dimensional float32 vectors
Original size: $768 \times 4 = 3{,}072$ bytes per vector.
---
Choose $m = 96$ sub-vectors of $768 / 96 = 8$ dimensions, $K = 256$ centroids each. Code size: $96 \times 1 = 96$ bytes.
---
Compression: $3072 / 96 = 32\times$. For $N = 10^7$ vectors: $10^7 \times 96 = 0.96$ GB instead of $30.7$ GB.
---
The codebooks themselves are tiny: $m \cdot K \cdot (d/m) \cdot 4 = 96 \times 256 \times 8 \times 4 = 786{,}432$ bytes, about 0.79 MB, shared by all vectors.
```

The general formula: compression ratio $= \dfrac{32\,d}{8m} = \dfrac{4d}{m}$ for float32 input and 8-bit codes. Choosing $m$ is the accuracy dial: more sub-vectors mean finer approximation and a larger code.

## Distances without decompressing

At query time you never rebuild the full vectors. For the query, precompute a table of squared distances from each of its $m$ slices to the $K$ centroids of that slice (cost $m \cdot K \cdot d/m = K \cdot d$ multiply-adds). The distance to any stored vector is then the sum of $m$ table lookups:

$$
\lVert \mathbf{q} - \mathbf{x} \rVert^2 \approx \sum_{j=1}^{m} T_j[c_j], \qquad T_j[k] = \lVert \mathbf{q}^{(j)} - \mathbf{u}^{(j)}_k \rVert^2
$$

This is called **asymmetric distance computation**: the query is exact, the stored vectors are compressed. Per stored vector it costs $m = 96$ additions instead of 768 multiply-adds.

```steps
A tiny quantisation by hand
Take $d = 4$ and $m = 2$ slices of 2 dimensions, each with centroids $A = (1,0)$, $B = (0,1)$, $C = (1,1)$, $D = (0,0)$ (so 2 bits per slice).
---
Stored vector $\mathbf{x} = (0.9, 0.1 \mid 0.2, 0.8)$. Slice 1 is nearest to $A$ (squared distance $0.01 + 0.01 = 0.02$). Slice 2 is nearest to $B$ (squared distance $0.04 + 0.04 = 0.08$). Code $= (A, B)$, which decodes to $(1, 0, 0, 1)$.
---
Query $\mathbf{q} = (0.8, 0.2 \mid 0.1, 0.9)$. Table 1 entry for $A$: $0.04 + 0.04 = 0.08$. Table 2 entry for $B$: $0.01 + 0.01 = 0.02$. Estimated squared distance $= 0.08 + 0.02 = 0.10$.
---
True squared distance: $(0.8-0.9)^2 + (0.2-0.1)^2 + (0.1-0.2)^2 + (0.9-0.8)^2 = 0.04$. The estimate (0.10) is too large: quantisation error. It matters only if it reorders neighbours.
```

## The accuracy cost and the rerank fix

Compression loses information, so PQ lowers recall: neighbours whose true distances are close can swap places. The standard remedy is **rerank with full vectors**: use the compressed index to fetch, say, the top 200 candidates, then fetch their original (possibly disk-resident) float vectors and recompute exact distances to choose the final top 10. This recovers most of the loss at the price of 200 extra reads.

PQ combines naturally with IVF (**IVF-PQ**): IVF narrows the scan to a few lists, PQ makes each list compact. For $10^7$ vectors with 96-byte codes plus an 8-byte ID each, memory is about $10^7 \times 104 = 1.04$ GB, versus 30.7 GB flat.

| Representation | Bytes / vector ($d = 768$) | 10M vectors | Typical effect on recall |
|---|---|---|---|
| float32 | 3,072 | 30.7 GB | exact |
| float16 | 1,536 | 15.4 GB | almost none |
| int8 (scalar) | 768 | 7.7 GB | small |
| PQ, $m = 96$ | 96 | 0.96 GB | noticeable; mostly recovered by reranking |
| PQ, $m = 48$ | 48 | 0.48 GB | larger loss |

## In practice

Try float16 or int8 scalar quantisation first: a 2x to 4x saving with very little recall loss, and no training step. Reach for PQ when memory is the binding constraint, as at hundreds of millions of vectors. Always measure recall@10 against the flat baseline with and without the rerank step; never assume the compressed number holds on your data. Some embedding models are also trained to survive truncation to fewer dimensions, which is another way to shrink vectors; check your model's documentation before cutting dimensions.

```quiz
{"q": "Vectors have d = 1,024 float32 dimensions. You use PQ with m = 128 sub-vectors and 8-bit codes. What is the compression ratio?", "options": ["8x", "32x", "4x", "128x"], "answer": 1, "explain": "Original: $1024 \\times 4 = 4096$ bytes. Code: 128 bytes. Ratio $= 4096/128 = 32$. This equals $4d/m = 4096/128$."}
```

```quiz
{"q": "After PQ lowers your recall@10 from 0.97 to 0.86, what is the standard way to recover most of it?", "options": ["Increase K to 2 for each codebook", "Fetch more candidates (e.g. 200) from the compressed index and rerank them with exact distances on the original vectors", "Remove IVF", "Use fewer sub-vectors"], "answer": 1, "explain": "Reranking with full-precision vectors corrects order errors caused by quantisation for the few candidates that matter. Fewer sub-vectors would compress more and lose more accuracy."}
```
