---
title: One attention head, line by line
minutes: 10
---

The [Attention](/learn/model-foundations/attention) lesson worked out a single head by hand: project each token into a query, a key and a value; score every query against every key; scale; mask the future; softmax; take the weighted average of the values. In PyTorch each of those sentences becomes one line. The whole head is about ten lines of code, and every line is a place a bug can hide, so this topic goes through them one at a time with the shapes attached.

The head here is the **single-head self-attention** module from the companion repo. It takes activations of shape $(B, n, d)$ and returns outputs of shape $(B, n, d_h)$ plus the attention weights $(B, n, n)$, which are useful for inspection and tests.

## The maths

$$
Q = XW_Q^{\top},\quad K = XW_K^{\top},\quad V = XW_V^{\top}, \qquad
\text{out} = \text{softmax}\!\left(\frac{QK^{\top}}{\sqrt{d_h}} + M\right)V
$$

with $W_Q, W_K, W_V$ stored as `nn.Linear(d, d_h)` weights of shape $(d_h, d)$, and $M_{ij} = -\infty$ when key $j$ is after query $i$, else 0. The softmax runs along the **key axis** (the last axis), so each query's weights sum to 1.

**Worked example.** Take $n = 3$ tokens and $d_h = 4$, so the scale is $1/\sqrt{4} = 1/2$. Skip the projections and pick $Q$, $K$ and $V$ directly:

$$
Q = \begin{pmatrix} 1&0&0&0 \\ 0&1&1&0 \\ 2&2&0&0 \end{pmatrix}, \quad
K = \begin{pmatrix} 1&1&0&0 \\ 0&0&1&1 \\ 1&0&1&0 \end{pmatrix}, \quad
V = \begin{pmatrix} 1&0&0&0 \\ 0&1&0&0 \\ 0&0&1&0 \end{pmatrix}
$$

$V$ is one-hot on purpose: each output row will literally display that token's attention weights.

```steps
Row by row, as the code computes it
**Scores.** Row 3 is $\mathbf{q}_3 \cdot \mathbf{k}_j$: $(2,2,0,0)\cdot(1,1,0,0) = 4$, $\cdot(0,0,1,1) = 0$, $\cdot(1,0,1,0) = 2$. Scaled by $1/2$: $(2, 0, 1)$. Row 2: $\mathbf{q}_2 = (0,1,1,0)$ gives $(1, 1, 1)$, scaled $(0.5, 0.5, 0.5)$.
---
**Mask.** `masked_fill` writes $-\infty$ above the diagonal. Row 1 becomes $(\cdot, -\infty, -\infty)$; row 2 becomes $(0.5, 0.5, -\infty)$; row 3 has no future and is untouched.
---
**Softmax, row 3.** $e^2 = 7.389$, $e^0 = 1$, $e^1 = 2.718$; total $11.107$. Weights $(0.665, 0.090, 0.245)$.
---
**Softmax, rows 1 and 2.** Row 1 has one finite entry, so its weight is $(1, 0, 0)$ whatever the score. Row 2 has two equal entries: $(0.5, 0.5, 0)$.
---
**Weighted sum.** $\text{out} = wV$. With one-hot values, row 3's output is $(0.665, 0.090, 0.245, 0)$: mostly token 1, a quarter of itself, a little of token 2.
```

## The code

```python
import math, torch, torch.nn as nn, torch.nn.functional as F

class SingleHeadSelfAttention(nn.Module):
    def __init__(self, d: int, d_h: int):
        super().__init__()
        self.q = nn.Linear(d, d_h, bias=False)
        self.k = nn.Linear(d, d_h, bias=False)
        self.v = nn.Linear(d, d_h, bias=False)

    def forward(self, x):                                   # x: (B, n, d)
        B, n, _ = x.shape
        q, k, v = self.q(x), self.k(x), self.v(x)           # each (B, n, d_h)
        scores = q @ k.transpose(-2, -1) / math.sqrt(q.size(-1))   # (B, n, n)
        mask = torch.triu(torch.ones(n, n, dtype=torch.bool,
                                     device=x.device), diagonal=1)  # (n, n), True = future
        scores = scores.masked_fill(mask, float("-inf"))    # mask broadcasts over B
        w = F.softmax(scores, dim=-1)                       # (B, n, n), rows sum to 1
        return w @ v, w                                     # (B, n, d_h), (B, n, n)
```

`torch.triu(..., diagonal=1)` keeps the entries strictly above the diagonal, the future keys, as `True`. `masked_fill` replaces those scores with $-\infty$, and $e^{-\infty} = 0$ removes them from the softmax. The repo builds the mask once as shape $(1, 1, n, n)$ in `attn_mask.py` so the same helper broadcasts against single-head $(B, n, n)$ and multi-head $(B, h, n, n)$ scores. The full version is `llm_from_scratch/part_1/single_head.py`; `attn_numpy_demo.py` does the same computation in NumPy with fixed weights so you can check every intermediate.

```bughunt
{"q":"This head from `single_head.py` trains, every shape is right and nothing warns, but the model can see the future. Click the line with the bug.","code":"B, T, _ = x.shape\nq = self.q(x)\nk = self.k(x)\nv = self.v(x)\nscale = 1.0 / math.sqrt(q.size(-1))\nattn = torch.matmul(q, k.transpose(-2, -1)) * scale\nmask = causal_mask(T, device=x.device)\nattn.masked_fill(mask.squeeze(1), float('-inf'))\nw = F.softmax(attn, dim=-1)\nout = torch.matmul(w, v)\nreturn out, w","bug":8,"explain":"`masked_fill` is **not** in place: it returns a new tensor, and this line throws that tensor away. `attn` still holds the unmasked scores, so the softmax spreads weight over future keys. Symptom: training loss falls far faster than it should (each position can read the byte it is asked to predict), then generation is gibberish because at sampling time the future is not there. Fix: `attn = attn.masked_fill(mask.squeeze(1), float('-inf'))` (or the in-place `masked_fill_`). The test that catches it: change the last token of the input and check that the outputs at earlier positions do not change."}
```

## See it

```sim
attention-heatmap
{"head": "previous", "causal": true, "scale": 1}
```

Each row of the heatmap is one row of `w`. With the mask on, the upper-right triangle is empty, exactly what `masked_fill` produces. Turn the scale down to 0.1 and watch the rows flatten towards uniform: that is what a missing or doubled $\sqrt{d_h}$ factor does in the other direction. Then switch the mask off and check that the last row does not change.

## In practice

- **At initialisation attention is nearly uniform.** Run `attn_numpy_demo.py`: with weights around 0.1 the scaled scores are around 0.01, and the second row's weights come out $(0.4994, 0.5006, 0)$. A freshly initialised model averages its context; training is what sharpens the rows.
- **Wrong softmax axis.** `F.softmax(scores, dim=1)` on a $(B, n, n)$ tensor normalises over queries instead of keys. Shapes are fine, nothing crashes, and the model trains badly. A one-line test catches it: `assert torch.allclose(w.sum(-1), torch.ones(B, n))`.
- **Fully masked rows give NaN.** If padding masks out every key for some query, the softmax computes $0/0$. Causal masks never do this (the diagonal is always allowed), but combined padding masks can.
- **Use the fused kernel in real training.** `F.scaled_dot_product_attention(q, k, v, is_causal=True)` computes the same thing without materialising the $n \times n$ matrix. Write the explicit version first so you can test the fused one against it.

```quiz
{"q": "For the second query, the scaled scores before masking are $(0,\\ \\ln 3,\\ 5)$ over keys 1-3. What are its attention weights after the causal mask and softmax?", "options": ["$(0.25, 0.75, 0)$", "$(0.007, 0.020, 0.973)$", "$(0.5, 0.5, 0)$", "$(0, 1, 0)$"], "answer": 0, "explain": "Key 3 is in the future for query 2, so its score becomes $-\\infty$ and its weight 0 regardless of the 5. The rest: $e^0 = 1$ and $e^{\\ln 3} = 3$, total 4, giving $(0.25, 0.75)$. The second option is the unmasked softmax, dominated by the future key: the leak the mask exists to prevent."}
```

```quiz
{"q": "A colleague builds the mask with `torch.triu(torch.ones(n, n, dtype=torch.bool), diagonal=0)`. What goes wrong?", "options": ["The diagonal is masked too, so each token cannot attend to itself and the first row is all $-\\infty$, which makes its softmax NaN", "Nothing, `diagonal=0` and `diagonal=1` are equivalent for boolean tensors", "The mask now hides the past instead of the future", "Only the last token is affected"], "answer": 0, "explain": "`diagonal=0` keeps the main diagonal as well, so position $i$ cannot see key $i$. Row 1 then has no allowed key at all, and softmax over all $-\\infty$ is $0/0$ = NaN, which spreads through the network. It does not flip past and future: the lower triangle is still allowed."}
```
