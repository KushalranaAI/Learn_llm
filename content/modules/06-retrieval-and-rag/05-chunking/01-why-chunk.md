---
title: Why we chunk, and what a chunk size costs
minutes: 8
---

```callout-before
Before you start
You should know that the retriever returns whole stored passages, that each passage is embedded as one vector, and that the embedding model has a maximum input length (often 512 tokens).
```

Imagine filing a 300-page manual under a single label, "Product manual". Any question about it, from "how do I reset the router?" to "what is the warranty?", can only be answered by handing over all 300 pages. Now imagine filing every paragraph under its own label. Questions find the right paragraph, but a paragraph torn from its context ("It must be done before step 4") may no longer make sense. **Chunking** is the choice of filing unit, and it is the cheapest, most overlooked lever in RAG quality.

## Three pressures on chunk size

1. **Embedding models have a hard input limit.** Text beyond the limit (often 512 tokens, sometimes 8,192) is silently truncated, so the end of a long chunk is invisible to search.
2. **Dilution.** One vector must represent everything in the chunk. The more unrelated content it holds, the weaker its similarity to a question about any single part.
3. **Prompt budget.** Retrieved chunks go into the prompt. Large chunks cost tokens and bury the useful sentence; small chunks may lack the context needed to answer.

## Dilution, with numbers

A simple model shows the effect. Suppose a chunk of $n$ sentences has embedding equal to the average of its sentences' vectors, where the one relevant sentence has unit vector $\mathbf{u}$ (the query vector is also $\mathbf{u}$) and the other $n-1$ sentences are unrelated (orthogonal) unit vectors $\mathbf{v}_i$:

$$
\mathbf{c} = \frac{1}{n}\Big(\mathbf{u} + \sum_{i=1}^{n-1} \mathbf{v}_i\Big), \qquad
\cos(\mathbf{q}, \mathbf{c}) = \frac{\mathbf{u}\cdot\mathbf{c}}{\lVert\mathbf{u}\rVert\,\lVert\mathbf{c}\rVert} = \frac{1/n}{\sqrt{n}/n} = \frac{1}{\sqrt{n}}
$$

since $\lVert \mathbf{c} \rVert = \frac{1}{n}\sqrt{1 + (n-1)} = \frac{\sqrt{n}}{n}$.

| Sentences in chunk $n$ | 1 | 4 | 16 | 100 |
|---|---|---|---|---|
| $\cos(\mathbf{q}, \mathbf{c}) = 1/\sqrt{n}$ | 1.00 | 0.50 | 0.25 | 0.10 |

A real transformer does not literally average sentences, and neighbouring sentences are usually related rather than orthogonal, so the decay is gentler. But the direction is right and well documented: a fact buried in a long chunk scores lower against its own question than the same fact in a short chunk, and can be outranked by a short chunk that is only loosely relevant.

## The opposite failure: too small

Shrink chunks to a single sentence and the dilution disappears, but new failures appear:

- **Lost antecedents**: "This limit does not apply to enterprise accounts." Which limit? The sentence alone is meaningless to the retriever and to the model.
- **Answers that span sentences**: the question and its condition ("refunds are available ... unless the plan is monthly") end up in different chunks, so only half is retrieved.
- **More chunks**: more vectors to store and search (next topics), and more candidate noise.

```mermaid
flowchart LR
  A["Too small: lost context, split answers"] --- B["Sweet spot: one idea, self-contained"] --- C["Too large: diluted vectors, costly prompts"]
```

## See it

```sim
chunking
{"strategy": "fixed", "chunkSize": 120, "overlap": 0}
```

The sim splits a long admin guide into chunks and marks six key facts. With fixed windows of 120 tokens and no overlap, see which facts are cut in half by a boundary. Change the chunk size to 60, then to 400, and watch both the chunk count and the number of split facts change. Which size is best depends on both numbers, which is the point of the next topic.

## In practice

A starting point many teams use: 200 to 500 tokens per chunk for prose, with 10 to 20% overlap, tuned against labelled questions. The right number depends on your documents (legal clauses want bigger chunks than FAQ answers) and on what your embedding model was trained on. Also check the model's maximum length: chunking at 800 tokens for a 512-token model means the last 300 tokens of every chunk are never searched. Treat chunk size as a hyperparameter to be measured, not a constant to be copied from a tutorial.

```quiz
{"q": "In the dilution model, a chunk contains 9 sentences and only one is relevant to the query (the rest are orthogonal). What is the cosine similarity between the query and the chunk?", "options": ["1/9 = 0.11", "1/3 = 0.33", "9", "1/81"], "answer": 1, "explain": "$\\cos = 1/\\sqrt{n} = 1/\\sqrt{9} = 1/3$. Answering 1/9 forgets that the chunk's norm also shrinks with the number of sentences, so the similarity falls as $1/\\sqrt{n}$, not $1/n$."}
```

```quiz
{"q": "Your embedding model accepts 512 tokens but you index 900-token chunks. What happens?", "options": ["The model splits each chunk automatically", "The embedding only reflects roughly the first 512 tokens; later content is effectively unsearchable", "Indexing fails with an error in all libraries", "Retrieval quality improves because chunks are richer"], "answer": 1, "explain": "Most pipelines truncate silently. The last 388 tokens never influence the vector, so facts there cannot be found by similarity, even though they are in the stored text."}
```
