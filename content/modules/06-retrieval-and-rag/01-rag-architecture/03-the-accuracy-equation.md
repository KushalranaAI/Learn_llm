---
title: The accuracy equation and the choice of k
minutes: 8
---

A relay race is won or lost at the handover. Two fast runners who drop the baton lose to two average runners who pass it cleanly. RAG has exactly one handover: retrieval passes evidence to the generator. The previous topic gave the equation for it; this topic uses it to make the most important early decision in a RAG system, how many chunks $k$ to retrieve.

## Naming the two factors

The retrieval factor is measured by **recall@k**: the fraction of questions for which at least one passage containing the answer appears in the top $k$ results. (Formally recall@k is the share of all relevant passages found in the top $k$; for single-answer questions the two coincide.) The generation factor is **faithfulness**: given the evidence in context, how often the answer is correct and supported by it. So:

$$
\text{Acc}(k) \approx \text{recall@}k \times \text{faith}(k)
$$

Both factors depend on $k$, in opposite directions:

- **recall@k rises with $k$**. Every extra slot is another chance to catch the right passage. It can never decrease.
- **faith(k) tends to fall with $k$**. More passages means more near-misses and contradictions in the prompt, and a long context makes it harder for the model to find and use the one passage that matters (the "lost in the middle" effect from [Choosing Context](/learn/prompt-and-context/context-selection)).

## A worked trade-off

Suppose you measured a system on 300 labelled questions. Chunks are 400 tokens, plus 300 tokens of instructions and 50 of question.

| $k$ | recall@k | faith(k) | Acc ≈ product | Prompt tokens |
|---|---|---|---|---|
| 1 | 0.55 | 0.93 | 0.512 | 750 |
| 3 | 0.75 | 0.92 | 0.690 | 1,550 |
| 5 | 0.84 | 0.91 | 0.764 | 2,350 |
| 10 | 0.91 | 0.88 | 0.801 | 4,350 |
| 20 | 0.95 | 0.83 | 0.789 | 8,350 |

Check one row: at $k = 10$, $0.91 \times 0.88 = 0.8008$, and the prompt is $300 + 10 \times 400 + 50 = 4{,}350$ tokens. Accuracy peaks around $k = 10$ and then *falls*, because the recall gained from 10 to 20 ($+0.04$) is smaller than the faithfulness lost ($-0.05$). Going from 5 to 10 buys $3.7$ points of accuracy for $85\%$ more prompt tokens. Whether that is worth it is a cost decision, not a quality one.

```callout-math
Which factor should you improve?
The accuracy gain from improving one factor is proportional to the *other* factor: $\partial\,\text{Acc} / \partial\,\text{recall} = \text{faith}$ and $\partial\,\text{Acc} / \partial\,\text{faith} = \text{recall}$. With recall 0.70 and faithfulness 0.90, raising recall to 0.90 gives $0.90 \times 0.90 = 0.81$, while raising faithfulness to 0.95 gives only $0.70 \times 0.95 = 0.665$. Fix the weaker factor first: it is multiplied by the stronger one.
```

## See it

The simulation multiplies a retrieval recall curve by generator faithfulness and shows the resulting accuracy alongside prompt size, cost and latency.

```sim
rag-pipeline
{"k": 5, "chunkTokens": 300, "retriever": "dense", "faithfulness": 0.92}
```

Try three things. Raise $k$ step by step and watch accuracy climb, flatten and then dip as the context grows. Then hold $k$ fixed and lower faithfulness: notice that no amount of recall rescues a generator that ignores its context. Finally, set recall high and faithfulness high and look at the cost and latency columns: the best accuracy setting is often not the one you can afford at your traffic.

## In practice

Production systems rarely send 20 raw chunks to the model. The usual pattern is to **retrieve wide and pass narrow**: fetch 50 to 100 candidates cheaply (high recall), rerank them with a more accurate model, and give the LLM only the top 3 to 8 (high faithfulness, short prompt). That pattern breaks the trade-off in the table above, and you will build it in [Hybrid Search and Reranking](/learn/retrieval-and-rag/hybrid-and-reranking).

Measure both factors separately from the start. Recall@k needs a set of questions labelled with the passage that answers them; faithfulness needs answers checked against their context. With both numbers in hand, a drop in accuracy after a change points straight at the half that broke.

```quiz
{"q": "Recall@5 is 0.95 and faithfulness is 0.70. Which single improvement raises accuracy more: recall to 1.00, or faithfulness to 0.80?", "options": ["Recall to 1.00, because perfect retrieval is always best", "Faithfulness to 0.80", "They are equal", "Neither changes accuracy"], "answer": 1, "explain": "Baseline $0.95 \\times 0.70 = 0.665$. Perfect recall gives $1.00 \\times 0.70 = 0.70$ (+3.5 points). Faithfulness 0.80 gives $0.95 \\times 0.80 = 0.76$ (+9.5 points). The weaker factor is the better lever."}
```

```quiz
{"q": "In the table, why does accuracy drop from k = 10 to k = 20 even though recall rises?", "options": ["Recall@k can decrease as k grows", "Faithfulness falls by more (0.88 → 0.83) than recall rises (0.91 → 0.95), so the product shrinks", "The prompt exceeds the context window", "The reranker removes the right passage"], "answer": 1, "explain": "$0.91 \\times 0.88 = 0.801$ versus $0.95 \\times 0.83 = 0.789$. Recall@k is monotone non-decreasing, so the drop must come from the generator getting worse at using a longer, noisier context."}
```
