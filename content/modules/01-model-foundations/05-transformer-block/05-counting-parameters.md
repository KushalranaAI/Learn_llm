---
title: Counting every parameter
minutes: 10
---

When a model card says "7B", that number is not marketing. You can derive it from four numbers in the config file: the width $d$, the number of layers $L$, the vocabulary size $V$ and the FFN hidden size $d_{ff}$. Being able to do this quickly is a core engineering skill. Parameter count sets memory (2 bytes per parameter in 16-bit), compute (about $2N$ FLOPs per generated token) and cost.

The trick is that almost everything is a matrix of size $d \times d$ or $d \times d_{ff}$, repeated $L$ times, plus one or two embedding tables of size $V \times d$.

## The rule of thumb, derived

Per block, ignoring the tiny biases and norms:

- **Attention:** $W_Q, W_K, W_V, W_O$, each $d \times d$ when every head has its own keys and values: $4d^2$.
- **FFN:** two matrices of $d \times 4d$: $8d^2$.

$$
N \approx \underbrace{12 \cdot L \cdot d^2}_{\text{blocks}} + \underbrace{V \cdot d}_{\text{embeddings}}
$$

$N$ is the total parameter count. If the output layer is not tied to the input embedding (see the next topic), add a second $V \cdot d$.

## GPT-2 small, exactly

Config: $d = 768$, $L = 12$, $V = 50{,}257$, 1,024 learned positions, $d_{ff} = 3{,}072$, biases everywhere, LayerNorm, output tied to the input embedding.

**Rule of thumb:** $12 \times 12 \times 768^2 = 84{,}934{,}656$, plus $50{,}257 \times 768 = 38{,}597{,}376$, gives **123,532,032**. That is already within 1% of the published 124M.

```steps
GPT-2 small, every parameter
**Attention per block.** $W_{QKV}$: $768 \times 2304 = 1{,}769{,}472$ plus bias $2{,}304$. $W_O$: $589{,}824$ plus bias $768$. Total $2{,}362{,}368$.
---
**FFN per block.** $768 \times 3072 + 3{,}072 + 3072 \times 768 + 768 = 4{,}722{,}432$.
---
**Norms per block.** Two LayerNorms $\times\ 2 \times 768 = 3{,}072$. Block total $= 7{,}087{,}872$. Times 12 layers $= 85{,}054{,}464$.
---
**Embeddings.** Token table $50{,}257 \times 768 = 38{,}597{,}376$. Position table $1{,}024 \times 768 = 786{,}432$. Final LayerNorm $1{,}536$.
---
**Total.** $85{,}054{,}464 + 38{,}597{,}376 + 786{,}432 + 1{,}536 = \mathbf{124{,}439{,}808}$. That is GPT-2 small's "124M". The output layer adds nothing, because it reuses the token table.
```

Notice that the embedding table is **31%** of GPT-2 small ($38.6\text{M} / 124.4\text{M}$). Small models with big vocabularies spend a lot of their budget on embeddings.

## Llama-2-7B, exactly

Config: $d = 4{,}096$, $L = 32$, 32 heads, $V = 32{,}000$, SwiGLU with $d_{ff} = 11{,}008$, RMSNorm, RoPE, no biases, output layer *not* tied.

| Component | Formula | Parameters |
|---|---|---|
| Attention per layer | $4d^2$ | 67,108,864 |
| SwiGLU FFN per layer | $3 \cdot d \cdot d_{ff}$ | 135,266,304 |
| Two RMSNorms per layer | $2d$ | 8,192 |
| **One block** | | **202,383,360** |
| 32 blocks | $\times 32$ | 6,476,267,520 |
| Input embedding | $V \cdot d$ | 131,072,000 |
| Output layer (untied) | $V \cdot d$ | 131,072,000 |
| Final RMSNorm | $d$ | 4,096 |
| **Total** | | **6,738,415,616** |

That is the "6.7B" (often rounded to "7B") on the model card. The rule of thumb $12Ld^2 + 2Vd = 6{,}442{,}450{,}944 + 262{,}144{,}000 = 6{,}704{,}594{,}944$ lands within 0.5%. It runs slightly low only because $3 \cdot d \cdot 11008$ is a little more than $8d^2$.

```python
def count(d, L, V, d_ff, gated, tied, pos=0, bias=True, norm="layer"):
    norm_p = 2 * d if norm == "layer" else d           # LayerNorm: gain + bias; RMSNorm: gain
    attn = 4 * d * d + (4 * d if bias else 0)
    ffn = (3 if gated else 2) * d * d_ff + ((d_ff + d) if bias else 0)
    block = attn + ffn + 2 * norm_p                     # two norms per block
    emb = V * d * (1 if tied else 2) + pos * d + norm_p # embeddings + final norm
    return L * block + emb

print(count(768, 12, 50257, 3072, gated=False, tied=True, pos=1024))                    # 124439808
print(count(4096, 32, 32000, 11008, gated=True, tied=False, bias=False, norm="rms"))    # 6738415616
```

## See it

```sim
transformer-params
```

Reproduce both models. Enter $d = 768$, 12 layers, 12 heads, vocabulary 50,257, FFN ratio 4, and confirm a total near 124M. Then enter $d = 4{,}096$, 32 layers, 32 heads, vocabulary 32,000, and an FFN that gives $d_{ff} = 11{,}008$, and look for about 6.7B. Finally, double $d$ while keeping $L$ fixed, and watch the block parameters grow about four times. That is the $d^2$ in the formula.

## In practice

- **Memory from parameters.** 6.74B parameters $\times$ 2 bytes $\approx$ **13.5 GB** in bf16, before any KV cache or activations. In int4 the same weights take about 3.4 GB.
- **Read the config, not the name.** Grouped-query attention shrinks $W_K$ and $W_V$, so attention is less than $4d^2$. Llama-3-8B has $d = 4{,}096$ and 8 KV heads of size 128, so its $W_K$ is $4096 \times 1024$, not $4096 \times 4096$. Its larger vocabulary and FFN are why it is "8B" despite the same width and depth as Llama-2-7B.
- **Embeddings dominate small models.** A 100M-parameter model with a 250,000-token vocabulary at $d = 512$ would spend 128M on one embedding table alone. That is more than the whole budget, so vocabulary size must scale with the model.

```quiz
{"q": "Using $N \\approx 12Ld^2 + Vd$, estimate the size of a model with $d = 2{,}048$, $L = 24$, $V = 50{,}000$ and tied embeddings.", "options": ["About 1.31B", "About 1.21B", "About 0.10B", "About 2.52B"], "answer": 0, "explain": "$12 \\times 24 \\times 2048^2 = 1{,}207{,}959{,}552$, and $50{,}000 \\times 2048 = 102{,}400{,}000$. The total is about 1.31B. 1.21B forgets the embeddings; 0.10B is the embeddings alone."}
```

```quiz
{"q": "A colleague counts Llama-2-7B's FFN as $8d^2$ per layer, like GPT-2. Roughly how far off is their FFN total across 32 layers?", "options": ["About 34M too low", "About 3.4B too low", "Exactly right", "About 34M too high"], "answer": 0, "explain": "The real SwiGLU FFN is $3 \\times 4096 \\times 11008 = 135{,}266{,}304$ per layer, against $8d^2 = 134{,}217{,}728$. That is a difference of 1,048,576 per layer, or about 33.6M over 32 layers. The estimate is close but slightly low."}
```
