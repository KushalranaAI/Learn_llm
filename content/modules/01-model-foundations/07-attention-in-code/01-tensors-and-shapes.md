---
title: Tensors, shapes and nn.Linear
minutes: 8
---

```predict
{"q":"At GPT-2 small sizes (8 sequences of 1,024 tokens, width 768, 12 heads), how big is the attention score tensor compared with the token activations?","options":["About the same size","About 16 times larger","About 16 times smaller","About 1,000 times larger"],"answer":1,"reveal":"About 16 times larger: 402.7 MB against 25.2 MB, because the scores grow with $n^2$ rather than $n \\cdot d$. The shape table near the end of the topic lays out every tensor."}
```

Module 1 wrote attention as $\text{softmax}(QK^{\top}/\sqrt{d_k})V$, one sequence at a time. Real code never works on one sequence. It pushes a whole **batch** of sequences through the model at once, so every activation is a 3-D array, a **tensor**, and nearly every bug you will meet in this module is a tensor with the wrong shape or with the right shape but the wrong meaning.

The convention used throughout this course, and in most GPT-style code, is **(B, n, d)**: batch, sequence position, feature. A tensor of shape `(8, 1024, 768)` holds 8 sequences of 1,024 tokens, each token represented by 768 numbers. Read a shape left to right as "for each sequence, for each position, a vector". The companion repo names the middle axis `T` (for time); here it is $n$ to match the theory lessons.

The habit that makes transformer code debuggable is simple: **write the shape next to every line**. If you can say what every axis means after every operation, most bugs become visible before you run anything.

## The maths: nn.Linear is $xW^{\top} + b$

A PyTorch `nn.Linear(d_in, d_out)` stores a weight $W$ of shape $(d_\text{out}, d_\text{in})$ and a bias $b$ of length $d_\text{out}$, and computes

$$
y = x W^{\top} + b
$$

Note the transpose: the weight is stored output-first. The layer acts on the **last axis only**. Every leading axis is treated as "more rows", so an input of shape $(B, n, d_\text{in})$ becomes $(B, n, d_\text{out})$ with the same matrix applied to every token of every sequence.

**Worked example.** Let $d_\text{in} = 2$, $d_\text{out} = 3$, $x = (1, 2)$,

$$
W = \begin{pmatrix} 1 & 0 \\ 2 & 1 \\ 0 & -1 \end{pmatrix}, \quad b = (0.5,\ 0,\ 1)
$$

Each output is one row of $W$ dotted with $x$, plus a bias: $1\cdot1 + 0\cdot2 + 0.5 = 1.5$; $2\cdot1 + 1\cdot2 + 0 = 4$; $0\cdot1 - 1\cdot2 + 1 = -1$. So $y = (1.5, 4, -1)$. The layer has $3 \times 2 + 3 = 9$ parameters.

**Batched matmul.** `torch.matmul` (or `@`) on tensors with more than two axes multiplies the last two axes and treats the rest as a batch. The rule for the last two axes is the ordinary one: $(a, b) \mathbin{@} (b, c) \to (a, c)$, and the inner sizes must match. For attention scores:

$$
\underbrace{(B, n, d_h)}_{Q} \mathbin{@} \underbrace{(B, d_h, n)}_{K^{\top}} \to (B, n, n)
$$

one $n \times n$ score matrix per sequence.

## The code

```python
import torch
import torch.nn as nn

B, n, d = 2, 5, 16
x = torch.randn(B, n, d)                 # (B, n, d)

proj = nn.Linear(d, 3 * d, bias=False)   # weight: (3d, d) = (48, 16)
print(proj.weight.shape)                 # torch.Size([48, 16])

y = proj(x)                              # (B, n, 3d) = (2, 5, 48)

q = torch.randn(B, n, 4)                 # (B, n, d_h)
k = torch.randn(B, n, 4)                 # (B, n, d_h)
scores = q @ k.transpose(-2, -1)         # (B, n, d_h) @ (B, d_h, n) -> (B, n, n)
assert scores.shape == (B, n, n)
```

Two details matter. `k.transpose(-2, -1)` swaps only the last two axes; `k.T` on a 3-D tensor reverses *all* axes and is deprecated for that reason. And `assert` on shapes is cheap: a few of them in a forward pass catch most wiring mistakes the first time the code runs.

## Shape bookkeeping at a glance

These are the shapes you will see in this lesson, for GPT-2 small sizes ($B = 8$, $n = 1{,}024$, $d = 768$, $h = 12$, $d_h = 64$):

| Tensor | Shape | Elements | float32 memory |
|---|---|---|---|
| Token activations | $(B, n, d)$ | 6.3M | 25.2 MB |
| Q, K or V for all heads | $(B, h, n, d_h)$ | 6.3M | 25.2 MB |
| Attention scores | $(B, h, n, n)$ | 100.7M | 402.7 MB |
| FFN hidden activations | $(B, n, 4d)$ | 25.2M | 100.7 MB |

The score tensor is 16 times larger than the activations because it grows with $n^2$ rather than $n \cdot d$. That one row of the table is why long contexts are expensive, and why fused kernels such as FlashAttention avoid storing it at all.

## In practice

- **Print shapes, not values.** When something breaks, a line like `print(name, t.shape, t.dtype, t.device)` after each step localises the problem faster than a debugger. The repo's attention classes have a `trace_shapes` flag for exactly this.
- **Broadcasting hides bugs.** Adding a $(n, d)$ tensor to a $(B, n, d)$ tensor silently copies it across the batch, which is what you want for position encodings. Adding an $(n, 1)$ tensor where you meant $(1, d)$ also succeeds and is wrong. If an operation "worked" but the loss behaves strangely, check what broadcast.
- **Same shape, wrong meaning.** With $B = n$ or $d = n$ (common in toy tests), a transposed tensor still has a valid shape. Use distinct sizes in tests, for example $B = 2$, $n = 5$, $d = 16$, so a swapped axis fails loudly.

```quiz
{"q": "You create `nn.Linear(512, 2048)` and pass an input of shape $(4, 100, 512)$. What are the shapes of the layer's weight and of the output?", "options": ["Weight $(2048, 512)$; output $(4, 100, 2048)$", "Weight $(512, 2048)$; output $(4, 100, 2048)$", "Weight $(2048, 512)$; output $(4, 2048, 512)$", "Weight $(512, 2048)$; output $(2048, 100, 4)$"], "answer": 0, "explain": "PyTorch stores the weight output-first, $(d_\\text{out}, d_\\text{in}) = (2048, 512)$, and computes $xW^{\\top}$, so only the last axis changes: $(4, 100, 512) \\to (4, 100, 2048)$. The tempting $(512, 2048)$ is the mathematical $W$ in $y = xW$, which is the transpose of what PyTorch stores."}
```

```quiz
{"q": "`q` has shape $(2, 6, 8)$ and `v` has shape $(2, 6, 8)$. Which expression produces a valid $(2, 6, 6)$ score tensor?", "options": ["`q @ v.transpose(-2, -1)`", "`q @ v`", "`q.transpose(-2, -1) @ v`", "`q @ v.T`"], "answer": 0, "explain": "$(2, 6, 8) \\mathbin{@} (2, 8, 6) \\to (2, 6, 6)$. `q @ v` fails because the inner sizes are 8 and 6. `q.transpose(-2, -1) @ v` is valid but gives $(2, 8, 8)$, a feature-by-feature matrix. `v.T` reverses all three axes to $(8, 6, 2)$, which does not even keep the batch axis in front."}
```
