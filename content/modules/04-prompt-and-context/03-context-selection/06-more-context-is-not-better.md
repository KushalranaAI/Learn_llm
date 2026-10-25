---
title: More context is not always better
minutes: 8
---

It is tempting to treat the context window as free space: if a question might need ten documents, include twenty to be safe. Three things push back. Every token costs money and adds to prefill latency. Passages that are not relevant act as **distractors**, and models are measurably less accurate on reasoning questions when irrelevant text is mixed in. And, as the previous topics showed, adding material changes the position of everything else. The sensible question is how much context maximises value, which is usually well below the maximum that fits.

There are two opposing forces as you include more retrieved chunks $k$:

- **Coverage rises.** Retrieval **recall@k**, the chance that the needed passage is among the top $k$, can only go up as $k$ grows, with diminishing returns.
- **Usability falls.** Given that the needed passage is present, the chance the model uses it correctly, $g(k)$, drops with more distractors.

## The maths: an optimum $k$

Combining them, the probability of a correct answer is approximately

$$
a(k) = \text{recall@}k \times g(k)
$$

and the total expected cost per request, with $\ell$ tokens per chunk, a fixed prompt of $F$ tokens, input price $p_{\text{in}}$ and error cost $e$, is

$$
J(k) = (F + k\,\ell)\,p_{\text{in}} + \big(1 - a(k)\big)\,e
$$

Worked numbers: $F = 1{,}000$, $\ell = 400$, $p_{\text{in}} = \$3$ per 1M tokens, error cost $e = \$0.05$. Suppose measured recall@$k$ and a distractor penalty of $g(k) = 0.95 - 0.015\,(k - 1)$:

| $k$ | recall@$k$ | $g(k)$ | $a(k)$ | Token cost | Error cost | $J(k)$ |
|---|---|---|---|---|---|---|
| 1 | 0.60 | 0.950 | 0.570 | \$0.0042 | \$0.0215 | \$0.0257 |
| 3 | 0.78 | 0.920 | 0.718 | \$0.0066 | \$0.0141 | \$0.0207 |
| 5 | 0.88 | 0.890 | 0.783 | \$0.0090 | \$0.0108 | **\$0.0198** |
| 8 | 0.92 | 0.845 | 0.777 | \$0.0126 | \$0.0111 | \$0.0237 |
| 12 | 0.94 | 0.785 | 0.738 | \$0.0174 | \$0.0131 | \$0.0305 |

Going from $k = 5$ to $k = 12$ makes the prompt nearly twice as long (3,000 to 5,800 tokens) for about 4.5 points *less* accuracy, and the cost per request is 54% higher. Accuracy peaks near $k = 5$ because the gain in recall (from 0.88 to 0.94) is outweighed by the loss in usability (from 0.89 to 0.785). The optimum is not a property of the model alone: with a higher error cost $e$, the best $k$ moves to the right; with a stronger reranker that lifts recall at small $k$, it moves left.

```callout-math
The curve shape is illustrative
The distractor penalty $g(k)$ here is a simple straight line chosen for the example. Real curves depend on your model, on how similar distractors are to the answer, and on chunk quality. The method matters: measure $a(k)$ for several values of $k$ on your own golden set, then compute $J(k)$.
```

```sim
context-position
{"contextTokens": 4096, "position": 50, "model": "older"}
```

Start at a 4k context and note recall for a middle fact (about 73%). Increase the context length step by step to 8k, 16k and 32k. Recall for the same fact in the same relative position falls at every step, and at 32k it has collapsed (about 25%), because this older model was trained on shorter contexts. Then switch to the long-context model and repeat: the fall is gentler, but still present. More context is a cost you pay in accuracy as well as dollars.

## What to do about it

1. **Retrieve wide, then rerank and cut.** Fetch 30 candidates, rerank, and include the top 4 to 6. Reranking costs a few milliseconds and a little money, and buys a much smaller prompt.
2. **Set a relevance floor.** Drop any chunk whose score is far below the best. Do not pad to a fixed $k$.
3. **Let the model ask for more.** An agent that can call a search tool again when the first results are insufficient is better than one that front-loads 20 documents.
4. **Tune $k$ per query type.** A narrow lookup needs 2 to 3 chunks; a broad summarisation question may need 10. A single global $k$ is a compromise.
5. **Use the budget equation as a guard**, not a goal. The ceiling $k_{\max}$ from the first topic is only an upper bound.

## In practice

Teams usually discover this the hard way: a retrieval change that raises recall@10 produces an answer-quality *drop* in end-to-end evaluation, because the extra passages dilute the generator. This is why RAG is evaluated end to end (module 6) rather than only on retrieval metrics.

```quiz
{"q": "Recall@k rises from 0.88 to 0.94 when k goes from 5 to 12, but the generator's accuracy given the gold passage falls from 0.89 to 0.785. What is the end-to-end accuracy at k = 12?", "options": ["0.738", "0.94", "0.785", "0.88"], "answer": 0, "explain": "End-to-end accuracy is recall × usability = 0.94 × 0.785 = 0.738, lower than 0.88 × 0.89 = 0.783 at k = 5. Quoting recall alone (0.94) ignores the distractor penalty."}
```

```quiz
{"q": "Which change most directly moves the cost-optimal number of retrieved chunks to a larger value?", "options": ["A higher cost per wrong answer", "A higher input price per token", "Longer chunks", "A shorter system prompt"], "answer": 0, "explain": "Raising the error cost makes each point of accuracy worth more relative to the tokens that buy it, so more chunks pay off. A higher token price or longer chunks make each chunk dearer and push the optimum left. The system prompt is a fixed cost that does not change the marginal comparison."}
```
