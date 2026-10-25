---
title: Measuring retrieval - recall, MRR and nDCG
minutes: 9
---

```callout-before
Before you start
You should know what a ranked list is: the retriever returns documents in order, best first. A calculator and base-2 logarithms ($\log_2 4 = 2$) are all the maths needed.
```

You cannot improve a retriever you cannot measure. "The results look good" does not survive the first change of embedding model. Retrieval metrics turn a ranked list and a set of known-relevant documents into numbers, so that two retrievers, or two settings, can be compared on the same questions.

Everything starts with a small **labelled set**: for each of 100 to 500 realistic questions, the passage(s) that actually answer it, called **relevant** documents. Building this set is the most valuable hour in any RAG project.

## Set-based metrics: precision and recall at k

For one query, let the retriever return a ranked list and take its first $k$ results, $\text{top}_k$. Let $\text{Rel}$ be the set of all relevant documents.

$$
\text{precision@}k = \frac{|\text{top}_k \cap \text{Rel}|}{k}, \qquad
\text{recall@}k = \frac{|\text{top}_k \cap \text{Rel}|}{|\text{Rel}|}
$$

Precision asks "how much of what I returned is useful?"; recall asks "how much of the useful material did I return?". For RAG, recall matters most at the retrieval stage: a missing passage cannot be reconstructed later (previous lesson's equation), while an irrelevant extra passage can usually be ignored by the model (at some cost).

## Rank-aware metrics: MRR and nDCG

Precision and recall ignore *where* in the top $k$ the relevant documents sit. Two rank-aware metrics fix that.

**Mean reciprocal rank (MRR)** looks only at the first relevant result. If it is at rank $r_i$ for query $i$ (the term is 0 if there is none), then over $Q$ queries:

$$
\text{MRR} = \frac{1}{Q}\sum_{i=1}^{Q} \frac{1}{r_i}
$$

**Normalised discounted cumulative gain (nDCG)** handles graded relevance (for example 0 = irrelevant, 1 = partly, 2 = good, 3 = perfect). The gain of each result is discounted by the log of its position, so lower results count less:

$$
\text{DCG@}k = \sum_{i=1}^{k} \frac{\text{rel}_i}{\log_2(i+1)}, \qquad \text{nDCG@}k = \frac{\text{DCG@}k}{\text{IDCG@}k}
$$

Here $\text{rel}_i$ is the relevance grade of the result at rank $i$, and IDCG is the DCG of the best possible ordering, so nDCG lies between 0 and 1.

## Worked examples

```steps
Recall and precision
A query has four relevant documents $\{A, C, E, G\}$. The retriever returns, in order: $A, B, C, D, E$.
---
Relevant in the top 5: $A, C, E$, so 3. $\text{precision@5} = 3/5 = 0.60$ and $\text{recall@5} = 3/4 = 0.75$. For $k = 3$ (A, B, C): 2 hits, so $\text{recall@3} = 2/4 = 0.50$.
---
Document $G$ never appears. Increasing $k$ from 5 to 10 could find it, raising recall at the cost of more passages in the prompt.
```

```steps
MRR over three queries
Query 1: the first relevant result is at rank 1, so $1/1 = 1.000$.
---
Query 2: first relevant result at rank 3, so $1/3 = 0.333$. Query 3: no relevant result in the list, so 0.
---
$\text{MRR} = (1 + 0.333 + 0)/3 = 0.444$.
```

```steps
nDCG@5 with graded relevance
The top five results have grades $[3, 0, 2, 0, 1]$. Discounts $1/\log_2(i+1)$ are $1, 0.631, 0.5, 0.431, 0.387$.
---
Gains $\text{rel}_i \times$ discount: $3 \times 1 = 3$; $0$; $2 \times 0.5 = 1.000$ (rank 3 has $\log_2 4 = 2$); $0$; $1 \times 0.387 = 0.387$. So $\text{DCG@5} = 4.387$.
---
The ideal order is $[3, 2, 1, 0, 0]$: $3 + 2/1.585 + 1/2 = 3 + 1.262 + 0.5 = 4.762$.
---
$\text{nDCG@5} = 4.387 / 4.762 = 0.921$. The loss comes from the irrelevant result at rank 2 pushing the grade-2 document down to rank 3, where it is discounted by half.
```

| Metric | Answers the question | Use it for |
|---|---|---|
| recall@k | Did the evidence make it into the top $k$? | Choosing $k$; the retrieval factor in RAG accuracy |
| precision@k | How much noise is in the top $k$? | Prompt cost, distraction |
| MRR | How early is the first good hit? | One-answer lookups, "I'm feeling lucky" |
| nDCG@k | Is the whole ordering good, with graded relevance? | Comparing rankers and rerankers |

## See it

```sim
retrieval-compare
{"preset": "getin", "method": "bm25", "k": 3}
```

The sim has labelled relevant documents for six queries and shows recall@k and MRR for the selected method, plus mean recall over all six. Switch the method between BM25, dense and hybrid on each preset and write down which wins on which query. Then raise $k$ from 1 to 5 and watch recall rise while precision falls.

## In practice

Report recall@k at the $k$ you actually send to the model (and at the wider $N$ you rerank from), nDCG@10 for comparing rankers, and MRR for lookup-style tasks. Report them on at least 100 queries, because small sets give noisy numbers (the next lessons come back to confidence intervals). Beware labels that treat only one passage as relevant when several would answer the question: your recall will be unfairly low and you may "fix" retrievers that were fine.

```quiz
{"q": "Three relevant documents exist for a query. The top 4 results contain 2 of them. What are precision@4 and recall@4?", "options": ["0.50 and 0.67", "0.67 and 0.50", "0.50 and 0.50", "0.67 and 0.67"], "answer": 0, "explain": "Precision $= 2/4 = 0.50$ (hits over results returned); recall $= 2/3 = 0.67$ (hits over all relevant). The tempting swap divides by the wrong denominator."}
```

```quiz
{"q": "Query A has its first relevant result at rank 2, query B at rank 4. What is MRR?", "options": ["0.375", "0.50", "0.25", "3"], "answer": 0, "explain": "$(1/2 + 1/4)/2 = 0.375$. Averaging the ranks (3) gives a number that gets worse when the retriever improves, which is why MRR averages reciprocals."}
```
