---
title: Implementing an MoE layer
minutes: 9
---

You now have experts and a router. The MoE layer is the glue between them. It does three jobs, often called **dispatch**, **compute** and **combine**. Dispatch gathers, for each expert, the tokens that chose it. Compute runs each expert on its own small batch. Combine scales each result by its gate weight and adds it back into the right token's slot.

The tricky part is bookkeeping, not maths. A dense FFN takes a tensor of shape $(B, n, d)$ and returns the same shape, with every token doing identical work. In an MoE layer, each expert gets a different, variable-sized subset of tokens. You have to remember where each token came from so its output lands back in the right place.

The first move is to forget the batch and sequence structure. Routing is per token, so the layer flattens $(B, n, d)$ into $T = B \cdot n$ independent rows of width $d$. Position and sequence membership no longer matter inside the layer.

## The maths of one layer

For token $t$ with chosen set $\mathcal{T}_t$ and gate weights $g_{t,i}$:

$$
\mathbf{y}_t = \sum_{i \in \mathcal{T}_t} g_{t,i} \, E_i(\mathbf{x}_t)
$$

Turn it around and sum per expert instead of per token. Let $S_i = \{ t : i \in \mathcal{T}_t \}$ be the tokens that picked expert $i$. Then expert $i$ runs once on the stacked rows $X_{S_i}$, a matrix of shape $|S_i| \times d$, and

$$
\sum_{i=1}^{N} |S_i| = k \cdot T
$$

because every token appears in exactly $k$ of the sets. On average $|S_i| = kT/N$. With $B = 4$, $n = 1{,}024$, $N = 8$ and $k = 2$: $T = 4{,}096$, there are $8{,}192$ token-expert pairs, and an average expert sees $1{,}024$ tokens.

Each pair costs one expert forward pass. For the repo's SwiGLU expert with hidden size $4d$, that is $2 \times 12d^2 = 24d^2$ FLOPs, so the whole layer costs about $24d^2 \cdot kT$ FLOPs plus the router's $2dN \cdot T$.

## A worked dispatch

```steps
Six tokens, $N = 4$ experts, $k = 2$
**Gate output.** `idx` (shape $6 \times 2$) has rows: t0 → (1, 3), t1 → (0, 1), t2 → (3, 2), t3 → (1, 0), t4 → (2, 3), t5 → (1, 2).
---
**Group by expert.** Expert 0: {t1, t3}. Expert 1: {t0, t1, t3, t5}. Expert 2: {t2, t4, t5}. Expert 3: {t0, t2, t4}. Sizes 2 + 4 + 3 + 3 = 12 = $k \cdot T$.
---
**Compute.** Expert 1 runs once on a $4 \times d$ matrix built from rows t0, t1, t3, t5. Expert 0 runs on a $2 \times d$ matrix. No expert sees all six tokens.
---
**Combine.** Token t1's output is $g_{1,0}\,E_0(\mathbf{x}_1) + g_{1,1}\,E_1(\mathbf{x}_1)$, the first term from expert 0's batch and the second from expert 1's. Every output row receives exactly two contributions.
```

## The repo's layer

From `llm_from_scratch/part_5/moe.py`, with shapes in course notation:

```python
class MoE(nn.Module):
    def __init__(self, dim, n_expert, k=1, mult=4, swiglu=True, dropout=0.0):
        super().__init__()
        self.n_expert, self.k = n_expert, k
        self.gate = TopKGate(dim, n_expert, k=k)
        self.experts = nn.ModuleList(
            [ExpertMLP(dim, mult=mult, swiglu=swiglu, dropout=dropout) for _ in range(n_expert)])

    def forward(self, x):                       # x: (B, n, d)
        B, n, d = x.shape
        x_flat = x.reshape(B * n, d)            # (T, d)
        idx, w, aux = self.gate(x_flat)         # (T, k), (T, k), scalar
        y = torch.zeros_like(x_flat)            # (T, d)
        for e in range(self.n_expert):
            for slot in range(self.k):
                sel = (idx[:, slot] == e)       # (T,) bool: tokens whose slot-th choice is e
                if sel.any():
                    y_e = self.experts[e](x_flat[sel])       # (|sel|, d)
                    y[sel] += w[sel, slot:slot+1] * y_e      # weight (|sel|, 1) broadcasts over d
        return y.view(B, n, d), aux             # (B, n, d), scalar
```

Three details are worth reading closely.

- `x_flat[sel]` with a boolean mask **gathers** rows into a new, smaller tensor. That is the dispatch.
- `w[sel, slot:slot+1]` keeps a trailing dimension of size 1, shape $(|sel|, 1)$, so it broadcasts across the $d$ features. Writing `w[sel, slot]` would give shape $(|sel|,)$ and fail to broadcast against $(|sel|, d)$.
- `y[sel] += ...` **scatters** the result back. It is safe here because a boolean mask never selects the same row twice.

The layer returns `aux` alongside the output, so the transformer block must pass it up to the training loop. The full file is `llm_from_scratch/part_5/moe.py`.

```bughunt
{"q":"With `k = 1` this layer matches the repo exactly. With `k = 2` it runs and trains, but each token's output is only ever one expert's output, scaled by one gate weight. Click the line with the bug.","code":"B, n, d = x.shape\nx_flat = x.reshape(B * n, d)\nidx, w, aux = self.gate(x_flat)\ny = torch.zeros_like(x_flat)\nfor e in range(self.n_expert):\n    for slot in range(self.k):\n        sel = (idx[:, slot] == e)\n        if sel.any():\n            y_e = self.experts[e](x_flat[sel])\n            y[sel] = w[sel, slot:slot+1] * y_e\nreturn y.view(B, n, d), aux","bug":10,"explain":"The combine must **accumulate**: `y[sel] += ...`. With `=`, a token's two chosen experts write to the same row of `y` in two different iterations, and whichever expert has the higher index overwrites the other. Nothing fails because shapes are identical, and with `k = 1` each row is written once, so the bug only appears with top-2 routing. The output is a single expert scaled by its gate weight, and the overwritten expert gets no gradient for that token. Fix: `y[sel] += w[sel, slot:slot+1] * y_e`."}
```

## A faster dispatch

The double loop runs an expert up to $k$ times, once per slot, and scans all $T$ tokens $N \cdot k$ times to build masks. Production code instead sorts the $kT$ assignments by expert once, then runs each expert a single time:

```python
def moe_dispatch_sorted(x_flat, idx, w, experts):
    T, k = idx.shape
    flat_e = idx.reshape(-1)                                    # (T*k,) expert per assignment
    flat_t = torch.arange(T, device=x_flat.device).repeat_interleave(k)  # (T*k,) token id
    flat_w = w.reshape(-1, 1)                                   # (T*k, 1)
    order = torch.argsort(flat_e)                               # group assignments by expert
    counts = torch.bincount(flat_e, minlength=len(experts)).tolist()
    y = torch.zeros_like(x_flat)                                # (T, d)
    start = 0
    for e, c in enumerate(counts):
        if c == 0:
            continue
        sel = order[start:start + c]; start += c               # (c,) assignment ids
        tok = flat_t[sel]                                       # (c,) token rows
        y.index_add_(0, tok, flat_w[sel] * experts[e](x_flat[tok]))  # combine
    return y
```

`index_add_` accumulates rows even when the same token appears more than once, which makes it the right tool for the combine step. Grouped GEMM kernels go one step further and run all experts in a single kernel launch.

## Testing it

Two checks catch most bugs. The first is shapes: input and output are both $(B, n, d)$. The second is a reduction to the dense case. With $N = 1$ and $k = 1$, the softmax over one expert is exactly 1, so the layer must equal its single expert:

```python
moe = MoE(dim=32, n_expert=1, k=1)
x = torch.randn(2, 5, 32)
y, aux = moe(x)
assert torch.allclose(y, moe.experts[0](x.view(-1, 32)).view(2, 5, 32), atol=1e-6)
assert abs(aux.item() - 1.0) < 1e-6          # one expert is trivially balanced
```

The repo's tests in `llm_from_scratch/part_5/tests/` check the shapes of the gate and the MoE forward pass. Run them with `python orchestrator.py --demo` from inside `part_5/`.

## In practice

- **Experts see small batches.** With $T = 4{,}096$ and $N = 64$, $k = 2$, each expert averages 128 tokens. Small matrix multiplications use the GPU poorly, which is why fine-grained MoE models depend on grouped GEMM kernels.
- **Return the aux loss from every layer.** A common bug is to compute it in the gate and then drop it in the block's `forward`. Training still runs, and routing collapses without warning.
- **Look at the loop if training is slow.** The repo's version launches up to $N \cdot k$ expert calls per layer and syncs on `sel.any()`, which forces a GPU-to-CPU transfer. It is written for clarity, and the sorted version above is the first optimisation to make.

```quiz
{"q": "An MoE layer receives $x$ of shape $(B, n, d) = (8, 512, 1024)$ with $N = 16$ experts and top-$k = 2$. How many token rows does an average expert process?", "options": ["512", "256", "4,096", "8,192"], "answer": 0, "explain": "$T = 8 \\times 512 = 4{,}096$ tokens, which give $kT = 8{,}192$ token-expert pairs, spread over 16 experts: $8{,}192 / 16 = 512$. 256 forgets that each token goes to two experts. 8,192 is the total across all experts, not the average per expert."}
```

```quiz
{"q": "In the repo's loop, someone replaces `w[sel, slot:slot+1]` with `w[sel, slot]`. What happens?", "options": ["A shape error: $(|sel|,)$ cannot broadcast against $(|sel|, d)$, because the weight must be a column of shape $(|sel|, 1)$", "Nothing changes; the two expressions are identical", "The gate weights get applied to the wrong experts", "The aux loss becomes zero"], "answer": 0, "explain": "Integer indexing drops the dimension, giving shape $(|sel|,)$. Broadcasting aligns trailing dimensions, so it tries to match $|sel|$ with $d$ and fails, unless $|sel|$ happens to equal $d$, in which case it silently scales the wrong axis. The slice `slot:slot+1` keeps shape $(|sel|, 1)$. The values are the same, which is why the change looks harmless."}
```
