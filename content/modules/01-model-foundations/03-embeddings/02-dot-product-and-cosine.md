---
title: Similarity: dot product and cosine
minutes: 8
---

Two arrows drawn from the same point can agree (point the same way), disagree (point opposite ways) or be unrelated (sit at right angles). Embeddings are arrows in $d$-dimensional space, and the whole of semantic search, and a large part of attention, comes down to one question: how much do two arrows agree?

There are two standard answers. The **dot product** measures agreement *and* length together. **Cosine similarity** measures agreement only, by dividing the lengths out. Knowing which one a system uses, and why, saves a lot of confusing bugs.

## The dot product

For two vectors $\mathbf{a}$ and $\mathbf{b}$ with $d$ components each, the dot product multiplies matching components and adds:

$$
\mathbf{a} \cdot \mathbf{b} = \sum_{i=1}^{d} a_i b_i
$$

Geometrically it equals the product of the two lengths and the cosine of the angle $\theta$ between them:

$$
\mathbf{a} \cdot \mathbf{b} = \|\mathbf{a}\| \, \|\mathbf{b}\| \cos\theta, \qquad \|\mathbf{a}\| = \sqrt{\sum_i a_i^2}
$$

Here $\|\mathbf{a}\|$ is the **norm** (length) of $\mathbf{a}$. The dot product is large and positive when the vectors are long and aligned, zero when they are at right angles ($\cos 90^\circ = 0$), and negative when they point away from each other.

## Cosine similarity

Rearranging the second equation gives the cosine of the angle on its own:

$$
\cos(\mathbf{a}, \mathbf{b}) = \frac{\mathbf{a} \cdot \mathbf{b}}{\|\mathbf{a}\| \, \|\mathbf{b}\|} \in [-1, 1]
$$

It is $1$ for identical directions, $0$ for unrelated (orthogonal) ones and $-1$ for opposite ones, regardless of how long either vector is. Scaling $\mathbf{a}$ by $10$ multiplies the dot product by $10$ but leaves the cosine unchanged.

```steps
Cat, dog and car, by hand
Use three toy 3-D embeddings: cat $= (0.8, 0.6, 0.1)$, dog $= (0.7, 0.7, 0.2)$, car $= (0.1, 0.2, 0.9)$.
---
Dot products: cat · dog $= 0.8 \cdot 0.7 + 0.6 \cdot 0.7 + 0.1 \cdot 0.2 = 0.56 + 0.42 + 0.02 = 1.00$. cat · car $= 0.08 + 0.12 + 0.09 = 0.29$.
---
Norms: $\|\text{cat}\| = \sqrt{0.64 + 0.36 + 0.01} = \sqrt{1.01} \approx 1.005$. $\|\text{dog}\| = \sqrt{0.49 + 0.49 + 0.04} = \sqrt{1.02} \approx 1.010$. $\|\text{car}\| = \sqrt{0.01 + 0.04 + 0.81} = \sqrt{0.86} \approx 0.927$.
---
Cosines: cos(cat, dog) $= 1.00 / (1.005 \times 1.010) \approx 0.985$. cos(cat, car) $= 0.29 / (1.005 \times 0.927) \approx 0.311$. Cat and dog point almost the same way; cat and car are mostly unrelated.
```

## When the two disagree

Take $\mathbf{a} = (3, 4)$ and $\mathbf{b} = (4, 3)$. The dot product is $12 + 12 = 24$, both norms are $5$, so the cosine is $24/25 = 0.96$. Now double $\mathbf{a}$ to $(6, 8)$: the dot product becomes $48$, the cosine stays $0.96$.

| Measure | Sensitive to length? | Range | Typical use |
|---|---|---|---|
| Dot product | yes | any real number | attention scores, models trained with a dot-product objective |
| Cosine similarity | no | $[-1, 1]$ | semantic search, comparing documents of different lengths |
| Euclidean distance $\|\mathbf{a} - \mathbf{b}\|$ | yes | $[0, \infty)$ | some vector indexes, clustering |

For **unit vectors** (norm $1$) all three agree on the ranking, because the dot product *is* the cosine and

$$
\|\mathbf{a} - \mathbf{b}\|^2 = \|\mathbf{a}\|^2 + \|\mathbf{b}\|^2 - 2\,\mathbf{a}\cdot\mathbf{b} = 2 - 2\cos(\mathbf{a}, \mathbf{b})
$$

That identity is why production systems normalise embeddings once at write time and then use the cheaper dot product everywhere.

```python
import numpy as np
cat, dog, car = np.array([.8, .6, .1]), np.array([.7, .7, .2]), np.array([.1, .2, .9])
cos = lambda a, b: a @ b / (np.linalg.norm(a) * np.linalg.norm(b))
print(cat @ dog, cos(cat, dog))   # 1.0  0.985
print(cat @ car, cos(cat, car))   # 0.29 0.311
```

## See it

```sim
embedding-space
```

Pick a word and look at its nearest neighbours by cosine similarity. Then pick two words that are close in meaning and two that are not, and compare their cosine scores. In two dimensions you can see the angle directly: a small angle is a high cosine whatever the arrow lengths.

## In practice

- **Check whether your vectors are normalised.** Many embedding APIs return unit-length vectors, in which case dot product and cosine are the same number. If yours are not normalised and your vector database is set to dot product, long vectors (often from long or repetitive texts) will win searches they should not.
- **Absolute cosine values are model-specific.** One model may put unrelated sentences at $0.1$ and another at $0.7$. Never hard-code a threshold like "similar if above 0.8" without measuring it on your own data for that model.
- **Attention uses raw dot products** between query and key vectors, then rescales them (lesson 4). Lengths matter there on purpose: the model can make a key "louder" by making it longer.

```quiz
{"q": "Vectors $\\mathbf{a} = (1, 2, 2)$ and $\\mathbf{b} = (2, 0, 1)$. What is their cosine similarity?", "options": ["4/9 ≈ 0.444", "4/(3√5) ≈ 0.596", "4", "4/5 = 0.8"], "answer": 1, "explain": "Dot product $= 2 + 0 + 2 = 4$. $\\|\\mathbf{a}\\| = \\sqrt{1+4+4} = 3$ and $\\|\\mathbf{b}\\| = \\sqrt{4+0+1} = \\sqrt{5} \\approx 2.236$. So $\\cos = 4/(3 \\times 2.236) \\approx 0.596$. Answering 4 forgets to divide by the norms; 4/9 squares the first norm instead of multiplying the two."}
```

```quiz
{"q": "A search system ranks documents by raw dot product with the query embedding. Embeddings are not normalised. A long, repetitive document keeps ranking first for unrelated queries. What is the most likely cause?", "options": ["Its embedding has a large norm, which inflates every dot product", "Its embedding is orthogonal to the query", "Cosine similarity is always lower than the dot product", "The query was not tokenised"], "answer": 0, "explain": "The dot product equals $\\|\\mathbf{a}\\|\\|\\mathbf{b}\\|\\cos\\theta$, so a vector with a large norm scores highly even at a mediocre angle. Normalising vectors (or using cosine) removes the length effect. An orthogonal vector would score zero, not first."}
```
