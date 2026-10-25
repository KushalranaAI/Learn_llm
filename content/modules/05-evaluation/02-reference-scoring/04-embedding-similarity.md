---
title: Semantic similarity with embeddings
minutes: 8
---

Exact match and n-gram metrics fail on paraphrases because they compare words. **Embedding similarity** compares meanings, or at least an approximation of them. An embedding model maps each text to a vector of a few hundred or a few thousand numbers, trained so that texts with similar meaning land near each other. "The refund arrives within five days" and "You'll get your money back in under a week" share almost no words but end up with nearby vectors.

To score an answer, embed the prediction and the reference and measure how closely the two vectors point in the same direction. That measure is **cosine similarity**. It is cheap (one embedding call per text, often cached for references), handles paraphrase well, and gives a smooth score instead of a hard 0 or 1.

## The maths: cosine similarity

For vectors $\mathbf{a}, \mathbf{b} \in \mathbb{R}^{d}$:

$$
\cos(\mathbf{a}, \mathbf{b}) = \frac{\mathbf{a}\cdot\mathbf{b}}{\lVert\mathbf{a}\rVert\,\lVert\mathbf{b}\rVert} = \frac{\sum_{j=1}^{d} a_j b_j}{\sqrt{\sum_j a_j^2}\ \sqrt{\sum_j b_j^2}}
$$

It is the cosine of the angle $\theta$ between the vectors: 1 when they point the same way, 0 when they are perpendicular, $-1$ when opposite. Vector length does not matter, only direction. Many embedding APIs return **unit vectors** ($\lVert\mathbf{a}\rVert = 1$), in which case cosine is simply the dot product.

```steps
Cosine by hand in three dimensions
Take $\mathbf{a} = (2, 1, 0)$ and $\mathbf{b} = (1, 1, 1)$.
---
Dot product: $2 \cdot 1 + 1 \cdot 1 + 0 \cdot 1 = 3$.
---
Lengths: $\lVert\mathbf{a}\rVert = \sqrt{4 + 1 + 0} = \sqrt 5 = 2.236$; $\lVert\mathbf{b}\rVert = \sqrt{3} = 1.732$.
---
$\cos = 3 / (2.236 \times 1.732) = 3/3.873 = 0.775$.
---
Scale $\mathbf{a}$ to $(20, 10, 0)$: the dot product becomes 30 and $\lVert\mathbf{a}\rVert$ becomes 22.36, so the cosine is still $30/(22.36 \times 1.732) = 0.775$. Only direction counts.
```

To turn similarity into pass/fail you need a threshold $\tau$: pass if $\cos(\mathbf{e}(\hat y), \mathbf{e}(y)) \ge \tau$, where $\mathbf{e}(\cdot)$ is the embedding function. The threshold is model-specific. Many embedding models place almost all real sentences at cosines between roughly 0.5 and 1, so "0.7" can mean "unrelated" for one model and "close paraphrase" for another. Pick $\tau$ the same way as in lesson 1: label 100 or so pairs as same/different meaning, and choose the threshold that best separates them.

## See it

```sim
metric-compare
{"pair": "paraphrase", "normalise": true}
```

The simulation starts on a paraphrase: semantic similarity is high while exact match is 0 and token F1 is middling. Now switch to *Negation* ("No, the free plan does not include exports" vs "Yes, the free plan includes exports") and *One word wrong*: both answers are wrong, and the semantic score barely drops. The toy embeddings in the sim are simpler than a real embedding model, but real models show the same weakness.

## Where embedding similarity fails

Embeddings summarise topic and general meaning. They are much weaker at the small details that often decide correctness:

| Pair | Lexical F1 | Cosine (typical) | Same meaning? |
|---|---|---|---|
| "refund in 5 days" / "money back within a week" | low | high | roughly yes |
| "is safe for children" / "is not safe for children" | high | high | **no** |
| "the fee is 15 dollars" / "the fee is 50 dollars" | high | high | **no** |
| "Alice paid Bob" / "Bob paid Alice" | 1.0 | very high | **no** |
| a correct answer / the same answer plus a wrong extra claim | medium | high | **no** |

Three causes: **negation and numbers** barely move a sentence vector, **word order and roles** (who did what to whom) are partly lost, and **one vector for a whole paragraph** averages away a single wrong claim. There is also a subtler risk: an embedding model is itself a model with its own blind spots, so its errors are correlated with the errors of the LLM you are grading when both share training data.

## Variants worth knowing

- **BERTScore** matches each token of the candidate to its most similar token in the reference using contextual embeddings, then computes precision, recall and F1 over those soft matches. It is finer-grained than one sentence vector but shares the same weakness on negation and numbers.
- **Claim-level similarity**: split the answer and reference into short claims and match claims one by one. A wrong claim then cannot hide inside a long paragraph.

## In practice

Embedding similarity is a good **filter** and a weak **judge**. Use it to group near-duplicate answers, to flag outputs that have drifted far from the reference, or as one signal among several. When correctness hinges on a number, a date, a name or a yes/no, extract that field and check it exactly; use embeddings for the rest. Always calibrate the threshold on labelled pairs from your own domain and report which embedding model you used, because scores from different models are not comparable.

```quiz
{"q": "Two unit vectors are $\\mathbf{a} = (0.6, 0.8)$ and $\\mathbf{b} = (0.8, 0.6)$. What is their cosine similarity?", "options": ["0.96", "1.40", "0.48", "0.00"], "answer": 0, "explain": "For unit vectors cosine equals the dot product: $0.6 \\times 0.8 + 0.8 \\times 0.6 = 0.48 + 0.48 = 0.96$. 0.48 counts only one of the two terms; 1.40 adds the components instead of multiplying them."}
```

```quiz
{"q": "An eval uses cosine ≥ 0.85 against the reference as 'correct'. Which wrong answer is it most likely to pass?", "options": ["An answer on a completely different topic", "An empty answer", "An answer identical to the reference except that 'approved' became 'not approved'", "An answer in a different script that the embedding model does not support"], "answer": 2, "explain": "A single negation changes meaning completely but leaves the sentence vector almost unchanged, so cosine stays high. Off-topic and empty answers score low and are caught."}
```
