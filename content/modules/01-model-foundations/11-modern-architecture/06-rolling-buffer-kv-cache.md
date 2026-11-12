---
title: The rolling-buffer KV cache
minutes: 8
---

The sliding window from the previous topic decides which keys a token *attends to*. It does not, by itself, decide what the cache *keeps*. If you only mask, the cache handed back to the generate loop still grows by one token per step, and memory is exactly what it was without the window. (The repo's first version did exactly that; `attn_modern.py` now trims its cache to the sinks plus the last $W$ positions after every step.)

A **rolling-buffer cache** stores only what the window can ever need: the $s$ sink tokens plus the latest $W$ tokens. When token $W + s$ arrives, the oldest window entry is overwritten. Think of a security camera that records onto a fixed loop of tape: it always holds the last 24 hours, and nobody has to rewind or copy anything to keep it that way. Mistral 7B's reference implementation uses this, so its cache never exceeds $W = 4096$ positions per layer.

## The maths

Allocate $s + W$ slots once. A token at absolute position $p$ goes to slot

$$
\text{slot}(p) = \begin{cases} p & p < s \quad \text{(sinks, never overwritten)} \\ s + \big((p - s) \bmod W\big) & p \ge s \end{cases}
$$

With $s = 0$ this is just $p \bmod W$. Memory per sequence is fixed at $2 \cdot L \cdot h_{kv} \cdot d_h \cdot b \cdot (s + W)$ bytes.

```steps
Filling a buffer with $s = 1$, $W = 3$ (4 slots)
**Positions 0 to 3.** Position 0 is the sink, slot 0. Positions 1, 2, 3 go to slots $1 + (0, 1, 2) = 1, 2, 3$. Buffer: $[0, 1, 2, 3]$, now full.
---
**Position 4.** Slot $1 + (3 \bmod 3) = 1$. It overwrites position 1, the oldest window token. Buffer: $[0, 4, 2, 3]$.
---
**Position 5.** Slot $1 + (4 \bmod 3) = 2$, overwriting 2. Buffer: $[0, 4, 5, 3]$.
---
**Position 6.** Slot 3, overwriting 3. Buffer: $[0, 4, 5, 6]$: the sink plus the last three tokens, which is exactly row 6 of the mask in the previous topic.
---
**Position 7.** Slot 1 again. The write pointer cycles through slots 1 to 3 forever; slot 0 is never touched.
```

### Why scrambled order is fine

After position 5 the buffer reads $[0, 4, 5, 3]$, not in time order. Attention does not care. The output for one query is

$$
\mathbf{o} = \sum_{j} \frac{e^{\mathbf{q} \cdot \mathbf{k}_j / \sqrt{d_h}}}{\sum_{j'} e^{\mathbf{q} \cdot \mathbf{k}_{j'} / \sqrt{d_h}}}\, \mathbf{v}_j
$$

a sum over a *set* of key/value pairs, which is the same in any order. Two conditions make this safe:

1. **Position is already inside the keys.** RoPE rotated each key by its own position before it was cached, so slot order carries no meaning the model relies on.
2. **No mask during decode.** Every cached token is in the past of the new query, so the single decode query may attend to all filled slots.

## The code

The repo's `RollingKV` keeps the time order by concatenating and cropping:

```python
def step(self, k_new, v_new):                      # k_new: (B, h_kv, 1, d_h)
    self.k = torch.cat([self.k, k_new], dim=2)     # (B, h_kv, t + 1, d_h), allocates and copies
    if self.k.size(2) > self.window + self.sink:
        self.k = torch.cat([self.k[:, :, :self.sink], self.k[:, :, -self.window:]], dim=2)
    ...                                            # same for v
```

The full version is `llm_from_scratch/part_3/kv_cache.py`. It bounds memory correctly, which the repo's test checks (with $W = 4$, $s = 2$ the cache never exceeds 6 slots). But each step allocates two new tensors and copies all $s + W$ entries. A circular buffer writes one slot in place:

```python
class RingKV:
    def __init__(self, B, h_kv, W, d_h, sink=0, dtype=torch.float16, device="cuda"):
        self.k = torch.zeros(B, h_kv, sink + W, d_h, dtype=dtype, device=device)   # allocated once
        self.v = torch.zeros_like(self.k)
        self.W, self.sink, self.n = W, sink, 0                                       # n = tokens seen

    def slot(self, p):
        return p if p < self.sink else self.sink + (p - self.sink) % self.W

    def append(self, k_t, v_t):                    # (B, h_kv, 1, d_h), already RoPE-rotated at position n
        j = self.slot(self.n)
        self.k[:, :, j] = k_t[:, :, 0]             # one slot written, nothing copied
        self.v[:, :, j] = v_t[:, :, 0]
        self.n += 1

    def view(self):                                # what the next query attends to
        filled = min(self.n, self.sink + self.W)
        return self.k[:, :, :filled], self.v[:, :, :filled]
```

Fed the same 13 random keys and values with $W = 4$, $s = 2$, this buffer and the repo's `RollingKV` give attention outputs equal to within $10^{-6}$ at every step, even though their slots are ordered differently. That is the order-invariance argument, tested.

| | Growing cache | `RollingKV` (cat + crop) | `RingKV` (circular) |
|---|---|---|---|
| Memory after $t$ tokens | $O(t)$ | $O(s + W)$ | $O(s + W)$, fixed |
| Bytes copied per step | $O(t)$ with `cat` | $O(s + W)$ | one slot |
| Allocations per step | 2 | up to 4 | 0 |
| Slots in time order | yes | yes | no (not needed) |

## Positions in a stream that never ends

The repo rotates keys by their absolute position and lets `RoPECache` grow its tables, so after a million tokens the query sits at position 1,000,000 and the sink at 0, an offset the model never saw in training. StreamingLLM handles this differently: it assigns positions by place *within the cache*, so offsets stay within $s + W$. That requires caching keys *before* rotation and re-rotating the whole buffer at each step, more compute in exchange for always-familiar offsets. For a model trained with the window, like Mistral 7B, absolute positions are fine within its trained range; for streaming a full-attention model indefinitely, cache-relative positions are what keep it stable.

## See it

```sim
kv-cache-memory
{"model": "mistral-7b", "seqLen": 4096, "batch": 64}
```

At 4,096 tokens, the cap of a $W = 4096$ rolling buffer, 64 concurrent streams fit next to the weights. Raise the context to 32,768: with a growing cache only a fraction of those streams still fit. With a rolling buffer the 4,096 figure is the memory for every stream no matter how long it runs, so the batch you can serve is fixed in advance.

## In practice

- **Prefill longer than the window.** A prompt of 10,000 tokens with $W = 4096$ must be prefilled with the banded mask, and only the last $W$ (plus sinks) keys written to the buffer. Mistral's reference code prefills in chunks of $W$ for this reason.
- **Predictable memory** is the operational win: a server can admit a fixed number of streams without worrying that one long chat will exhaust the GPU.
- **Paged caches generalise this.** Engines such as vLLM split the cache into fixed-size blocks so a windowed model can release whole blocks once they slide out of range.

```quiz
{"q": "A circular buffer has $s = 2$ sink slots and $W = 4$ window slots. Which slot does the token at position 13 overwrite?", "options": ["Slot 5", "Slot 1", "Slot 3", "Slot 0"], "answer": 0, "explain": "$\\text{slot}(13) = 2 + ((13 - 2) \\bmod 4) = 2 + 3 = 5$. The tempting $13 \\bmod 4 = 1$ (or $13 \\bmod 6 = 1$) ignores the sink offset and would overwrite a sink slot, the one thing the buffer must never do."}
```

```quiz
{"q": "Why can a decode step attend over a ring buffer whose slots are out of time order without reordering them?", "options": ["Each key already carries its position via RoPE, and attention is a weighted sum over a set, so order does not change the result", "The softmax sorts keys by position internally", "The causal mask reorders them", "It cannot; the outputs are slightly wrong and nobody notices"], "answer": 0, "explain": "Permuting key/value pairs together permutes the terms of the sum, which leaves it unchanged, and position information lives in the rotated keys, not in their slot. The causal mask does not reorder anything, and during single-token decode no mask is applied at all."}
```
