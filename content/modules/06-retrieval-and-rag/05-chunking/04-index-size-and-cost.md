---
title: Index size, storage and embedding cost
minutes: 7
---

Before building an index, estimate it. Teams that skip this step discover at deployment that the plan needs 400 GB of RAM or a four-figure embedding bill. Every number is a product of a few quantities you already know: chunks, dimensions, bytes and tokens.

## The formulas

For $D$ documents, each producing $c$ chunks, the collection has $N = D\,c$ chunks. The vector store holds one vector per chunk:

$$
\text{vector bytes} = N \cdot d \cdot b, \qquad
\text{text bytes} \approx N \cdot \bar{s} \cdot 4
$$

where $d$ is the embedding dimension, $b$ the bytes per number (4 for float32, 2 for float16, 1 for int8), $\bar{s}$ the average chunk length in tokens, and roughly 4 bytes of text per token. The embedding bill covers every token you send to the embedding model, including overlap:

$$
\text{tokens embedded} = D \,(L + (c-1)\,o), \qquad \text{cost} = \frac{\text{tokens embedded}}{10^{6}} \cdot p_{\text{embed}}
$$

Here $L$ is document length in tokens, $o$ the overlap, and $p_{\text{embed}}$ the price per million tokens.

```steps
Worked example: a 50,000-document knowledge base
$D = 50{,}000$ documents of $L = 3{,}000$ tokens, chunk size $s = 512$, overlap $o = 64$, embedding dimension $d = 1024$.
---
Chunks per document: $c = \lceil (3000 - 64)/448 \rceil = \lceil 6.55 \rceil = 7$. Collection: $N = 50{,}000 \times 7 = 350{,}000$ chunks.
---
Vectors in float32: $350{,}000 \times 1024 \times 4 = 1.43 \times 10^9$ bytes $= 1.43$ GB. In float16: $0.72$ GB. With int8: $0.36$ GB.
---
Raw text: about $350{,}000 \times 512 \times 4 \approx 0.7$ GB. An HNSW graph with $M = 16$ adds $350{,}000 \times 128 \approx 45$ MB. Total under 3 GB: this fits in memory on a single small machine.
---
Embedding tokens: $50{,}000 \times (3000 + 6 \times 64) = 50{,}000 \times 3384 = 1.69 \times 10^{8}$. At an illustrative \$0.02 per million tokens: $169 \times 0.02 = \$3.38$. Indexing is cheap; time is the real cost, and re-embedding after a model change repeats it.
```

Scale it by 1,000 (50 million documents) and the vectors alone are 1.43 TB in float32, which is where [Vector Indexes](/learn/retrieval-and-rag/vector-indexes) (compression, sharding) becomes necessary.

## What each decision multiplies

| Decision | Effect on $N$ | Effect on memory | Effect on embed cost |
|---|---|---|---|
| Chunk size $s$ halved | about 2x | about 2x | slightly more (more overlap tokens) |
| Overlap 0 to 12.5% of $s$ | about 1.14x | about 1.14x | about 1.14x |
| Dimension $d$ 1024 to 384 | none | 2.7x smaller | none |
| float32 to int8 vectors | none | 4x smaller | none |
| Index extra fields (title, summary) per chunk | none | slightly more | more tokens |

Notice that **chunk size and dimension multiply**: halving $s$ and doubling $d$ cancels out in memory, but the first changes retrieval behaviour while the second changes embedding quality. Do not tune memory first; fix quality, then compress.

## Incremental indexing

Collections change. A good indexing pipeline stores, for every chunk, a content hash, the source document ID and a version. On an update it re-chunks only changed documents, deletes old chunk IDs and inserts new ones, rather than rebuilding everything. Heading-aware chunking helps because an edit changes only the chunks of the affected section, while fixed windows shift every chunk after the edit.

## In practice

Estimate memory for the index you intend to run (vectors, graph, text, metadata) and for the peak during a rebuild, when the old and new indexes coexist. A common mistake is storing the full text only in the vector database; keep it in a document store keyed by chunk ID if text is large, and return IDs from search. Record the embedding model name and version, the chunker version and the parameters with the index: you will need them when you change anything.

```quiz
{"q": "200,000 chunks of 768-dimensional float16 vectors. How much memory do the vectors need?", "options": ["About 0.3 GB", "About 0.6 GB", "About 1.2 GB", "About 3 GB"], "answer": 0, "explain": "$200{,}000 \\times 768 \\times 2 = 3.07 \\times 10^8$ bytes $\\approx 0.31$ GB. Using 4 bytes per number (float32) gives 0.61 GB; float16 uses 2."}
```

```quiz
{"q": "Documents are 2,000 tokens, chunks are 500 with overlap 100. How many tokens are sent to the embedding model per document?", "options": ["2,000", "2,400", "2,500", "2,300"], "answer": 1, "explain": "$c = \\lceil (2000 - 100)/400 \\rceil = 5$ chunks, so tokens $= L + (c-1)\\,o = 2000 + 4 \\times 100 = 2400$. 2,500 is $5 \\times 500$, which counts the short last chunk as full."}
```
