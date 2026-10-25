---
title: Evaluating the retriever - context precision and recall
minutes: 8
---

```callout-before
Before you start
You should know recall@k, precision@k and the idea of a labelled evaluation question from [Measuring retrieval](/learn/retrieval-and-rag/hybrid-and-reranking). This topic restates them in the vocabulary RAG evaluation tools use.
```

When a RAG answer is wrong, the first question is "did the model have what it needed?". Evaluating the retriever on its own answers that question without running the generator at all, which makes it fast, cheap and repeatable. Two measurements do most of the work: how much of the needed evidence reached the prompt (**context recall**), and how much of what reached the prompt was useful (**context precision**).

## Definitions

Each evaluation item has a question and the **needed facts**: the facts (or the answer's supporting claims) required for a complete answer. The retriever returns $k$ chunks; a chunk is **relevant** if it contains at least one needed fact.

$$
\text{context recall} = \frac{\text{needed facts present in the retrieved context}}{\text{needed facts}}, \qquad
\text{context precision@}k = \frac{\text{relevant chunks among the } k}{k}
$$

Context recall is the retrieval factor in the accuracy equation, generalised to answers that need several facts. Context precision measures noise: low precision wastes tokens and raises the chance the model is distracted by a near-miss.

**Rank-aware context precision** also rewards putting relevant chunks first, using average precision: for each relevant chunk, take the precision at its rank, then average those values.

$$
\text{AP@}k = \frac{1}{R}\sum_{i=1}^{k} P@i \cdot \mathbb{1}[\text{chunk } i \text{ is relevant}]
$$

where $R$ is the number of relevant chunks in the top $k$ and $\mathbb{1}[\cdot]$ is 1 when the condition holds, else 0.

```steps
Worked example
A question needs 4 facts. The top 5 chunks are, in order: relevant (fact 1), relevant (fact 2), irrelevant, relevant (fact 3), irrelevant. Fact 4 is nowhere.
---
Context recall: 3 of the 4 needed facts are present, so $3/4 = 0.75$. The missing fourth fact caps the answer's completeness.
---
Context precision@5: 3 relevant chunks out of 5, so $3/5 = 0.60$.
---
Average precision: relevant chunks sit at ranks 1, 2 and 4. $P@1 = 1/1 = 1$, $P@2 = 2/2 = 1$, $P@4 = 3/4 = 0.75$. $\text{AP} = (1 + 1 + 0.75)/3 = 0.917$. Had the same three relevant chunks arrived in the order irrelevant, relevant, relevant, irrelevant, relevant (ranks 2, 3 and 5), $P@2 = 1/2$, $P@3 = 2/3$, $P@5 = 3/5$, and $\text{AP} = (0.5 + 0.667 + 0.6)/3 = 0.589$: same chunks, worse order.
```

## Reading the pair of numbers

| Context recall | Context precision | Diagnosis | Typical fix |
|---|---|---|---|
| Low | High | Few chunks, all relevant, but evidence missing | Increase $N$ or $k$, hybrid search, query rewriting, better chunking |
| High | Low | Evidence present but buried in noise | Reranker, smaller $k$, MMR, relevance threshold |
| Low | Low | Retrieval is broadly failing | Check embedding model, tokenisation, chunking; look at examples |
| High | High | Retriever is fine | Look at generation and data freshness |

Recall and precision pull against each other as $k$ changes: raising $k$ never lowers recall and usually lowers precision. Report both at the $k$ you actually send to the model.

## How to label needed facts cheaply

Writing the needed facts by hand for 200 questions is a day of work and the most valuable day you will spend. Faster routes: take questions from real logs and have a subject-matter expert mark the passage that answers each; or generate questions from chunks with an LLM and keep the source chunk as ground truth (cheap, but biased towards questions that match the chunk's wording, so mix in real user questions). When an LLM judges relevance instead of a human, verify it on a sample of 50 against human labels first.

## See it

```sim
rag-pipeline
{"k": 5, "chunkTokens": 300, "retriever": "hybrid", "faithfulness": 0.92}
```

Treat the sim's retrieval recall as context recall. Sweep $k$ from 1 to 10 and watch recall rise with diminishing returns while the number of tokens in the prompt grows linearly. Choose the smallest $k$ that reaches a recall target of 0.9, then compare retrievers (BM25, dense, hybrid) at that $k$.

## In practice

Track context recall as the headline retriever metric in your regression suite, and context precision as the cost and distraction metric. A change that improves answer accuracy but lowers context recall is suspicious: it may have fixed generation on your sample while making retrieval more fragile. Keep the evaluation questions in version control with the labelled facts, and re-run the retriever evaluation on every change to chunking, embeddings, index parameters or the fusion method.

```quiz
{"q": "A question needs 5 facts; the top 8 chunks contain 4 of them spread across 6 relevant chunks. What are context recall and context precision@8?", "options": ["0.80 and 0.75", "0.75 and 0.80", "0.80 and 0.50", "1.00 and 0.75"], "answer": 0, "explain": "Recall $= 4/5 = 0.80$ (facts present over facts needed). Precision $= 6/8 = 0.75$ (relevant chunks over chunks retrieved). Swapping them is the usual slip."}
```

```quiz
{"q": "Context recall is 0.55 and context precision is 0.90. Which change is most likely to help?", "options": ["Add a reranker to remove noise", "Increase candidate depth or add BM25 to find more of the evidence", "Lower k", "Make the answer prompt stricter"], "answer": 1, "explain": "High precision with low recall means the retriever returns relevant material but not enough of it. A reranker and a smaller $k$ target precision, which is already high."}
```
