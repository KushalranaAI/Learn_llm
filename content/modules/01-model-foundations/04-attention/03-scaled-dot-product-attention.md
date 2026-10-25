---
title: Scaled dot-product attention, worked by hand
minutes: 9
---

You now have all the pieces: queries and keys give scores, softmax turns scores into weights, and weights average the values. Put together, with one extra scaling factor, they form **scaled dot-product attention**, the formula at the centre of every transformer:

$$
\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{Q K^{\top}}{\sqrt{d_k}}\right) V
$$

Read it right to left in your head, left to right on paper:

- $Q \in \mathbb{R}^{n \times d_k}$, $K \in \mathbb{R}^{n \times d_k}$, $V \in \mathbb{R}^{n \times d_v}$: queries, keys and values for $n$ positions.
- $QK^{\top} \in \mathbb{R}^{n \times n}$: every query dotted with every key.
- $\sqrt{d_k}$: the square root of the key dimension. Dividing by it keeps scores in a sensible range (the next topic explains exactly why).
- $\text{softmax}$ is applied to **each row** separately, so row $i$ becomes position $i$'s weights $\alpha_{i1}, \dots, \alpha_{in}$, summing to 1.
- Multiplying by $V$ gives an $n \times d_v$ output: row $i$ is $\sum_j \alpha_{ij}\mathbf{v}_j$.

The best way to own this formula is to compute it once completely. The numbers below are chosen so every step can be checked with a calculator.

## The setup

Three tokens, "the", "cat", "sat", with $d_k = 4$ (so $\sqrt{d_k} = 2$) and $d_v = 2$:

| Token | Query $\mathbf{q}$ | Key $\mathbf{k}$ | Value $\mathbf{v}$ |
|---|---|---|---|
| the | $(1, 0, 1, 0)$ | $(1, 0, 1, 0)$ | $(1, 0)$ |
| cat | $(0, 2, 0, 0)$ | $(0, 1, 0, 1)$ | $(0, 1)$ |
| sat | $(1, 1, 1, 1)$ | $(2, 0, 0, 0)$ | $(1, 1)$ |

```steps
Attention for three tokens, every number
**Raw scores $QK^\top$.** Row "the": $\mathbf{q}\cdot\mathbf{k}_\text{the} = 1+0+1+0 = 2$, $\mathbf{q}\cdot\mathbf{k}_\text{cat} = 0$, $\mathbf{q}\cdot\mathbf{k}_\text{sat} = 2$. Row "cat": $0, 2, 0$. Row "sat": $2, 2, 2$. So $S = \begin{pmatrix}2&0&2\\0&2&0\\2&2&2\end{pmatrix}$.
---
**Scale by $\sqrt{d_k} = 2$.** $S/2 = \begin{pmatrix}1&0&1\\0&1&0\\1&1&1\end{pmatrix}$.
---
**Softmax row "the".** $e^1 \approx 2.718$, $e^0 = 1$, $e^1 \approx 2.718$; total $6.437$. Weights $\approx (0.422, 0.155, 0.422)$.
---
**Softmax rows "cat" and "sat".** Row "cat": $1, 2.718, 1$, total $4.718$, weights $\approx (0.212, 0.576, 0.212)$. Row "sat": all scores equal, so weights are exactly $(1/3, 1/3, 1/3)$.
---
**Weighted sum of values.** "the": $0.422(1,0) + 0.155(0,1) + 0.422(1,1) = (0.845, 0.578)$. "cat": $0.212(1,0) + 0.576(0,1) + 0.212(1,1) = (0.424, 0.788)$. "sat": $\tfrac13\big((1,0)+(0,1)+(1,1)\big) = (0.667, 0.667)$.
```

Look at what happened. "cat" attended mostly to itself, so its output leans toward its own value $(0, 1)$. "sat" had a query that matched every key equally, so it took a plain average. Each output row is a context-aware blend; in a real model it is added back to the token's vector (the residual connection, next lesson), so information has moved between positions.

## Check it in code

```python
import numpy as np
Q = np.array([[1,0,1,0],[0,2,0,0],[1,1,1,1]], float)
K = np.array([[1,0,1,0],[0,1,0,1],[2,0,0,0]], float)
V = np.array([[1,0],[0,1],[1,1]], float)
S = Q @ K.T / np.sqrt(K.shape[1])
W = np.exp(S - S.max(axis=1, keepdims=True))   # subtract max for numerical stability
W /= W.sum(axis=1, keepdims=True)
print(W.round(3))        # [[0.422 0.155 0.422] [0.212 0.576 0.212] [0.333 0.333 0.333]]
print((W @ V).round(3))  # [[0.845 0.578] [0.424 0.788] [0.667 0.667]]
```

Subtracting the row maximum before exponentiating does not change the result (it cancels in the division) but stops $e^{s}$ overflowing for large scores. Every real implementation does this.

## See it

```sim
attention-heatmap
```

The heatmap is the weight matrix $W$ from the steps above, for a longer sentence. Lower the temperature/scale control so scores are effectively multiplied up: rows sharpen until each one is nearly a single bright cell. Raise it and rows wash out toward uniform, like the "sat" row. That one knob shows why the scale factor matters.

## In practice

- **Shapes are the first thing to check.** Bugs in hand-written attention are almost always a transposed $K$, softmax over the wrong axis (columns instead of rows), or a missing $\sqrt{d_k}$. A quick test: every row of the weight matrix must sum to 1.
- **The $n \times n$ matrix is the expensive part.** Optimised kernels (FlashAttention and its successors) compute exactly this formula but in tiles, never storing the full matrix. Same answer, far less memory.

```quiz
{"q": "A query $\\mathbf{q} = (2, 0)$ meets keys $\\mathbf{k}_1 = (1, 0)$ and $\\mathbf{k}_2 = (0, 1)$, with $d_k = 2$. What is the attention weight on $\\mathbf{k}_1$?", "options": ["About 0.80", "About 0.88", "1.0", "0.5"], "answer": 0, "explain": "Raw scores $2$ and $0$; divide by $\\sqrt{2} \\approx 1.414$ to get $1.414$ and $0$. Softmax: $e^{1.414} \\approx 4.11$, so the weight is $4.11/5.11 \\approx 0.80$. Forgetting the scaling gives $e^2/(e^2+1) \\approx 0.88$."}
```

```quiz
{"q": "In the worked example, why did 'sat' receive exactly $(0.667, 0.667)$?", "options": ["Its query had the same dot product with every key, so softmax gave equal weights and the output is the mean of the values", "Because it is the last token", "Because its value vector is $(1, 1)$", "Because the scale factor was 2"], "answer": 0, "explain": "Equal scores give equal softmax weights of 1/3, so the output is the plain average of $(1,0)$, $(0,1)$ and $(1,1)$, which is $(2/3, 2/3)$. Its own value being $(1,1)$ is only one of the three terms."}
```

```lab
attention-by-hand
```
