---
title: RoPE, position as rotation
minutes: 9
---

In the part 2 GPT, position enters exactly once: `x = tok_emb(idx) + pos_emb(pos)`, a learned vector per position added at the bottom of the network. It has two weaknesses you can see in the code. `pos_emb` is an `nn.Embedding(block_size, n_embd)`, so position `block_size` simply has no row, and the model cannot run past its training length. And the information is absolute: "I am at position 57" rather than "that word is three tokens behind me".

**Rotary position embedding (RoPE)** deletes `pos_emb` entirely. In `part_3/model_modern.py` the line is literally commented out. Instead, inside every attention layer, each query and key is **rotated** by an angle proportional to its position, just before the dot product. Values are not touched. The conceptual introduction, with a two-dimensional example, is in [Position information](/learn/model-foundations/transformer-block). Here we derive why the score becomes relative, then build it.

## The maths

Split a head's query $\mathbf{q} \in \mathbb{R}^{d_h}$ into $d_h/2$ pairs. Pair $i$ of a token at position $m$ is rotated by the angle $m\theta_i$, where

$$
\theta_i = \text{base}^{-2i/d_h}, \qquad i = 0, 1, \dots, \tfrac{d_h}{2} - 1, \qquad \text{base} = 10000
$$

The first pair spins at 1 radian per token; the last barely moves. With $d_h = 128$ the slowest pair has $\theta_{63} = 10000^{-126/128} \approx 1.15 \times 10^{-4}$, a wavelength of $2\pi/\theta_{63} \approx 54{,}000$ tokens. Fast pairs resolve "next to me"; slow pairs resolve "a few thousand tokens away".

**Why the score depends only on the offset.** Write pair $i$ as a complex number: $q = q_1 + i\,q_2$. Rotating by angle $\phi$ is multiplying by $e^{i\phi}$, and the 2-D dot product of two vectors is $\operatorname{Re}(q\,\bar{k})$. So for a query at position $m$ and a key at position $n$:

$$
\operatorname{Re}\!\big(q e^{im\theta}\;\overline{k e^{in\theta}}\big) = \operatorname{Re}\!\big(q\,\bar{k}\; e^{i(m-n)\theta}\big)
$$

The absolute positions $m$ and $n$ have disappeared; only $m - n$ remains. Summing over all pairs, the full score $\mathbf{q}_m^\top \mathbf{k}_n$ is a function of the two vectors and the offset alone.

```steps
Worked example: $d_h = 4$, base 10000
**Frequencies.** $\theta_0 = 10000^{0} = 1$ and $\theta_1 = 10000^{-2/4} = 0.01$ rad per token.
---
**Vectors.** Take $\mathbf{q} = \mathbf{k} = (1, 0, 1, 0)$: both pairs point along the first axis. Unrotated, $\mathbf{q}^\top\mathbf{k} = 2$.
---
**Query at 5, key at 3.** Offset 2. Pair 0 contributes $\cos(2 \times 1) = -0.416$; pair 1 contributes $\cos(2 \times 0.01) = 0.9998$. Score $= 0.584$.
---
**Query at 105, key at 103.** Same offset, same score, 0.584. The positions grew by 100, nothing changed.
---
**Query at 103, key at 3.** Offset 100. Pair 0: $\cos(100) = 0.862$, effectively random after 16 full turns. Pair 1: $\cos(1) = 0.540$, still a smooth function of distance. Score $= 1.403$. Long-range information lives in the slow pairs.
```

## The code

Precompute $\cos(m\theta_i)$ and $\sin(m\theta_i)$ for every position once, then rotate.

```python
import torch

class RoPECache:
    def __init__(self, d_h: int, max_pos: int, base: float = 10000.0):
        inv_freq = 1.0 / (base ** (torch.arange(0, d_h, 2).float() / d_h))   # (d_h/2,) = theta_i
        t = torch.arange(max_pos).float()                                      # (max_pos,)
        freqs = torch.outer(t, inv_freq)                                       # (max_pos, d_h/2) = m*theta_i
        self.cos, self.sin = freqs.cos(), freqs.sin()

def apply_rope(x, cos, sin):            # x: (B, h, n, d_h); cos, sin: (n, d_h/2)
    x1, x2 = x[..., ::2], x[..., 1::2]  # even and odd coordinates = the pairs, (B, h, n, d_h/2)
    out = torch.empty_like(x)
    out[..., ::2]  = x1 * cos - x2 * sin
    out[..., 1::2] = x1 * sin + x2 * cos
    return out                          # (B, h, n, d_h)
```

Inside attention, after projecting and splitting heads:

```python
pos = torch.arange(start_pos, start_pos + n)    # absolute positions of these n tokens
cos, sin = rope.cos[pos], rope.sin[pos]          # (n, d_h/2)
q = apply_rope(q, cos, sin)                       # (B, h,    n, d_h)
k = apply_rope(k, cos, sin)                       # (B, h_kv, n, d_h)
```

The full version is `llm_from_scratch/part_3/rope_custom.py`, used from `attn_modern.py`. Details that only show up in the code:

- **`start_pos` matters.** During cached generation only the newest token is fed in, so its position is the cache length, not 0. Get this wrong and every new token is rotated as if it were the first.
- **Keys are rotated before they are cached.** A cached key already carries its own position. Rotating the whole cache again each step would be wrong (and wasteful).
- **Pairing convention.** This code pairs coordinates $(0,1), (2,3), \dots$ (interleaved). Hugging Face Llama code pairs $(0, d_h/2), (1, d_h/2 + 1), \dots$ (split halves). Both are valid RoPE, but they are not interchangeable: weights trained with one produce garbage with the other.
- **Use the `base` you were given.** An earlier version of the repo's `RoPECache` accepted a `base` argument and stored it, but `_build` hardcoded `10000.0`, so changing the base, a common context-extension trick, silently did nothing. `_build` now computes `inv_freq = 1.0 / (self.base ** (...))`. The general lesson: a constructor argument that no test varies may be ignored without anyone noticing.
- **No table limit.** `get()` rebuilds the tables at double size when a position exceeds `max_pos`, so there is no hard maximum like `pos_emb` had. The model is still only *trained* on angles up to its training length, though.

```bughunt
{"q":"Training and the first generated token are fine. After that, cached generation drifts away from uncached generation of the same prompt, even with greedy decoding. Click the line with the bug.","code":"B, T, C = x.shape\nq = self.wq(x).view(B, T, self.n_head, self.d_head).transpose(1, 2)\nk = self.wk(x).view(B, T, self.n_kv_head, self.d_head).transpose(1, 2)\nv = self.wv(x).view(B, T, self.n_kv_head, self.d_head).transpose(1, 2)\nqpos = torch.arange(0, T, device=x.device)\ncos, sin = self.rope_cache.get(qpos)\nq = apply_rope_single(q, cos, sin)\nk = apply_rope_single(k, cos, sin)\nif kv_cache is not None:\n    k = torch.cat([kv_cache.k, k], dim=2)\n    v = torch.cat([kv_cache.v, v], dim=2)","bug":5,"explain":"The positions ignore `start_pos`. In training and prefill `start_pos` is 0, so nothing looks wrong. In a decode step only the newest token is fed in (`T = 1`), and this line rotates it as position 0 instead of its real position, so its query and key carry the wrong angle and every score against the (correctly rotated) cached keys uses the wrong offset. Fix: `qpos = torch.arange(start_pos, start_pos + T, device=x.device)`. The cached-versus-uncached greedy test from the KV cache topic catches it immediately."}
```

## Cost and parameters

| | Learned `pos_emb` (part 2) | RoPE (part 3) |
|---|---|---|
| Parameters | `block_size` $\times d$ ($256 \times 256 = 65{,}536$ for the default) | 0 |
| Applied | once, to the input | to $\mathbf{q}$ and $\mathbf{k}$ in every layer |
| Score depends on | absolute positions | offset $m - n$ only |
| Positions beyond training length | crash (index out of range) | run, quality degrades |

```sim
attention-heatmap
{"head": "previous", "causal": true}
```

The heatmap shows hand-designed attention patterns rather than RoPE itself, but with the "previous token" head selected, look at the diagonal band just below the main diagonal. That pattern means "attend to offset 1", and it is exactly what RoPE makes easy: the same rotation difference at every position, so one set of weights can express it everywhere.

## In practice

Test the relative property directly: rotate random $\mathbf{q}, \mathbf{k}$ at positions $(5, 3)$ and $(40, 38)$ and assert the dot products match to about $10^{-6}$. Running this against the repo's code gives 0.03367 for both. Shape-only tests, like the repo's `test_rope_apply.py`, pass even if the rotation is wrong.

```quiz
{"q": "With $d_h = 64$ and base 10000, what is $\\theta_i$ for pair $i = 16$?", "options": ["$0.01$ rad per token", "$0.1$ rad per token", "$10^{-4}$ rad per token", "$16/64 = 0.25$ rad per token"], "answer": 0, "explain": "$\\theta_{16} = 10000^{-2 \\cdot 16/64} = 10000^{-0.5} = 0.01$. The tempting $10^{-4}$ forgets the factor $2i/d_h$ and uses exponent $-1$, which is the limit approached by the last pair, not pair 16."}
```

```quiz
{"q": "In the cached decode loop you accidentally call attention with `start_pos=0` on every step. Shapes are all correct. What goes wrong?", "options": ["Every new token's query and key are rotated as position 0, so offsets to cached keys are wrong and generation degrades", "Nothing, because RoPE is relative and absolute positions cancel", "The KV cache is overwritten each step", "PyTorch raises a shape error"], "answer": 0, "explain": "Positions cancel only when each vector is rotated by its own true position. Cached keys carry positions 0..t-1, but the new query claims position 0, so the computed offsets are wrong. Nothing crashes, which is why the bug is caught only by comparing cached and uncached outputs."}
```
