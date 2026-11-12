---
title: Sliding-window attention and attention sinks
minutes: 9
---

With a KV cache, each decode step is cheap in FLOPs but still reads every cached key and value, and the cache grows by one token per step forever. The part 2 GPT side-stepped this by cropping its input to `block_size` tokens and recomputing; the cached model from the previous topic has no limit at all.

**Sliding-window attention** caps it: each token attends only to the most recent $W$ tokens. Memory and per-step work stop growing once the sequence passes $W$. Mistral 7B uses this with $W = 4096$. Information from further back is not lost entirely, because it travels upward through the layers: token $t$ in layer 2 reads tokens that, in layer 1, read tokens further back still. After $L$ layers the reach is about $L \cdot W$ tokens, $32 \times 4096 = 131{,}072$ for Mistral 7B.

There is a catch, found when people tried to stream a model trained with full attention past its window. The moment the very first tokens fell out of the window, the output collapsed into nonsense, even though those tokens were usually something meaningless like a beginning-of-sequence marker. The fix is to keep a handful of them forever. They are called **attention sinks**.

## The maths

A sliding window with $s$ sink tokens is a mask. For query position $i$ and key position $j$ (both 0-based):

$$
M_{ij} = \begin{cases} 0 & \text{if } j \le i \text{ and } \big(i - j < W \text{ or } j < s\big) \\ -\infty & \text{otherwise} \end{cases}
$$

The first condition is the causal mask. The second keeps the last $W$ positions (including $i$ itself) and the first $s$. Each query sees at most $W + s$ keys, so per-step attention costs $O(W + s)$ instead of $O(i)$, and the cache needs only $W + s$ slots.

The mask for $n = 7$, $W = 3$, $s = 1$ (rows are queries, columns keys, ✓ = allowed):

| | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| **0** | ✓ | | | | | | |
| **1** | ✓ | ✓ | | | | | |
| **2** | ✓ | ✓ | ✓ | | | | |
| **3** | ✓ | ✓ | ✓ | ✓ | | | |
| **4** | ✓ | | ✓ | ✓ | ✓ | | |
| **5** | ✓ | | | ✓ | ✓ | ✓ | |
| **6** | ✓ | | | | ✓ | ✓ | ✓ |

A band of width 3 along the diagonal, plus a column for the sink.

### Why the first tokens become sinks

Softmax weights must sum to 1. A head that has nothing useful to read for this token still has to put its weight *somewhere*. During training the first token is the one position every query can always see, so heads learn to park unused attention there, with a value vector that contributes little. It works like a "no-op" slot.

Take one query with a raw score of 4 on the sink and 0 on each of 4 window keys.

```steps
Removing a sink, numerically
**With the sink.** Weights $\propto (e^4, 1, 1, 1, 1) = (54.6, 1, 1, 1, 1)$. Normalised: sink 0.932, each window key 0.017.
---
**What the head outputs.** About 93% of a near-zero sink value plus 7% spread over real tokens: a small, deliberate contribution.
---
**Evict the sink.** Same scores on the 4 window keys: weights $(0.25, 0.25, 0.25, 0.25)$.
---
**The damage.** Each real token's weight jumped from 0.017 to 0.25, about 15 times. The head now injects a large average of values it meant to ignore, every layer, every head that relied on the sink. Downstream activations drift into ranges the model never saw in training.
```

Keeping the first $s$ tokens' keys and values, even 4 of them, restores that slot. That is the observation behind StreamingLLM, which streamed models trained with ordinary attention far past their training length with $s = 4$ and a fixed window.

## The code

The simplest way to enforce the window during decode is to crop the concatenated keys before attention:

```python
# k_all, v_all: (B, h_kv, t, d_h) after appending the new token
if self.sliding_window is not None and k_all.size(2) > self.sliding_window + self.attention_sink:
    s, W = self.attention_sink, self.sliding_window
    k_all = torch.cat([k_all[:, :, :s, :], k_all[:, :, -W:, :]], dim=2)   # (B, h_kv, s + W, d_h)
    v_all = torch.cat([v_all[:, :, :s, :], v_all[:, :, -W:, :]], dim=2)
```

For one query (decode) this is exactly the mask above. For a prompt longer than $W + s$ processed in one prefill pass (or for training), cropping is not enough: different queries need different keys, so you need the mask itself.

```python
def window_mask(n: int, W: int, s: int = 0, device=None):
    i = torch.arange(n, device=device).unsqueeze(1)   # (n, 1) query positions
    j = torch.arange(n, device=device).unsqueeze(0)   # (1, n) key positions
    return (j <= i) & ((i - j < W) | (j < s))           # (n, n) bool, True = may attend

y = F.scaled_dot_product_attention(q, k, v, attn_mask=window_mask(n, W, s, q.device))
```

The full version is `llm_from_scratch/part_3/attn_modern.py`, which uses one mask for everything: it builds `window_mask` from the absolute positions of the queries and keys, so the same rule serves training, prefill and cached decoding. That matters. An earlier version cropped the keys for the whole block and then applied `is_causal=True`, which misaligned the mask whenever a block of $n$ queries met a cropped key block of length $W + s$; generation with and without the cache drifted apart after about 80 tokens. The repo's `tests/test_sliding_window_cache.py` now checks that the cached and uncached paths give identical logits. The cache also keeps each key's position, and that is what lets the next topic crop it.

## What it saves

For Mistral 7B ($L = 32$, $h_{kv} = 8$, $d_h = 128$, bf16), each token costs $2 \times 32 \times 8 \times 128 \times 2 = 131{,}072$ bytes, 128 KiB. A 32,768-token conversation needs 4 GiB of cache with full attention, but only $4096 \times 128$ KiB $= 512$ MiB with $W = 4096$, an 8× saving that holds no matter how long the conversation runs.

```sim
kv-cache-memory
{"model": "mistral-7b", "seqLen": 32768, "batch": 16}
```

At 32,768 tokens and 16 sequences the full cache dwarfs the weights. Drag the context length down to 4,096: that is where a sliding-window cache stops growing, whatever the real conversation length.

## In practice

- **Training matters.** A model trained with full attention can be streamed with a window plus sinks, but its quality on tasks needing distant facts drops: the window forgets. Models trained with a window (Mistral 7B) are designed for it. Some later models mix windowed and full-attention layers.
- **Sinks are cheap.** Four extra cache slots out of thousands. If you ever implement a window, keep them.
- **Not a long-context fix.** A sliding window lets a model run indefinitely; it does not let it remember indefinitely.

```quiz
{"q": "With $W = 256$ and $s = 4$, which key positions can the query at position 1,000 attend to?", "options": ["0 to 3, and 745 to 1,000", "744 to 1,000", "0 to 3, and 744 to 999", "0 to 1,000"], "answer": 0, "explain": "The window condition $1000 - j < 256$ gives $j \\ge 745$, and it includes the query itself, so 745 to 1,000 is 256 positions. The sinks add 0 to 3. Starting at 744 gives 257 positions (an off-by-one), and excluding 1,000 forgets that a token attends to itself."}
```

```quiz
{"q": "Why does evicting the first token break a model streamed with a sliding window, even when that token is just a beginning-of-sequence marker?", "options": ["Heads learned to dump surplus softmax weight on it; without it the weight is redistributed onto real tokens and activations shift", "The first token holds a summary of the whole text", "RoPE needs position 0 as a reference angle", "The causal mask requires the first column to be visible"], "answer": 0, "explain": "Softmax must sum to 1, so idle heads park weight on the always-visible first token. Remove it and that mass is spread over the window, inflating every real token's contribution. The token is not a summary of the text, and RoPE is relative, so no absolute reference is needed."}
```
