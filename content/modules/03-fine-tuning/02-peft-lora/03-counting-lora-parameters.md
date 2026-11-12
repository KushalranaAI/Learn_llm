---
title: Counting LoRA parameters, rank and targets
minutes: 8
---

For one adapted matrix of shape $d_{\text{out}} \times d_{\text{in}}$, a rank-$r$ LoRA adds $B$ ($d_{\text{out}} \times r$) and $A$ ($r \times d_{\text{in}}$):

$$
P_{\text{LoRA}} = r\,(d_{\text{in}} + d_{\text{out}}) \qquad \text{versus} \qquad P_{\text{full}} = d_{\text{in}}\, d_{\text{out}}
$$

The ratio is $r\,(d_{\text{in}} + d_{\text{out}})/(d_{\text{in}} d_{\text{out}})$. For a square matrix $d \times d$ it is $2r/d$.

```steps
One 4096 x 4096 matrix at rank 8
Full update: $4096 \times 4096 = 16{,}777{,}216$ parameters.
---
LoRA $r = 8$: $8 \times (4096 + 4096) = 65{,}536$ parameters.
---
Ratio: $65{,}536 / 16{,}777{,}216 = 0.39\%$, which equals $2r/d = 16/4096$.
---
Doubling the rank doubles the adapter size exactly: $r = 16$ gives $131{,}072$ parameters per matrix. Cost is linear in $r$, while expressiveness has diminishing returns.
```

## Which matrices to adapt

A transformer block has seven big linear maps (SwiGLU MLP, as in Llama-style models): the attention projections $W_Q, W_K, W_V, W_O$ and the MLP's gate, up and down projections. The original LoRA paper adapted only $W_Q$ and $W_V$. Later practice, notably QLoRA, found that adapting **all linear layers** gives clearly better quality at a given rank.

For Llama-2-7B ($d = 4096$, MLP width $11008$, 32 layers, full multi-head attention so $W_K, W_V$ are also $4096 \times 4096$) at $r = 16$:

| Target set | Per-layer parameters | Total (32 layers) | Share of 6.74B |
|---|---|---|---|
| $W_Q, W_V$ | $2 \times 16 \times 8192 = 262{,}144$ | 8.39M | 0.12% |
| All attention ($Q,K,V,O$) | $4 \times 16 \times 8192 = 524{,}288$ | 16.8M | 0.25% |
| Attention + MLP | $524{,}288 + 3 \times 16 \times (4096 + 11008) = 1{,}249{,}280$ | 40.0M | 0.59% |

Check the last row: the MLP matrices are $4096 \times 11008$ (gate, up) and $11008 \times 4096$ (down), each with $d_{\text{in}} + d_{\text{out}} = 15{,}104$, so $3 \times 16 \times 15{,}104 = 724{,}992$ extra per layer. Adding the attention part gives $1{,}249{,}280$, and $\times 32 = 39{,}976{,}960 \approx 40.0\text{M}$.

With grouped-query attention the $K$ and $V$ projections are narrower (for example $4096 \times 1024$), so they cost less. The simulation's default, Llama-3-8B with all linear layers at $r = 16$, adds $16 \times 81{,}920 = 1{,}310{,}720$ per layer and $41.9$M overall, about 0.52% of 8.03B parameters.

```sim
lora-params
{"model": "llama3-8b", "method": "lora", "rank": 16, "targets": "all", "gpu": "l4"}
```

Try this. First, switch "Adapted matrices" to $W_Q, W_V$ only and see the trainable count drop by about 6x. Second, double the rank from 16 to 32 and confirm the adapter size doubles. Third, set the rank to 256: the trainable share rises to about 8%, and the memory advantage over full fine-tuning starts to erode (adapter states are $16$ bytes per trainable parameter, like any trained weights).

## Choosing the rank

There is no formula; it is an empirical dial.

| Rank | When it fits |
|---|---|
| 4 to 8 | Style, format, narrow classification; small data |
| 16 to 64 | General SFT, moderate domain adaptation (the common range) |
| 128 to 256 | Hard domain shifts, large datasets; approaching full fine-tuning cost |

Results typically saturate: going from $r = 8$ to $64$ often changes little on narrow tasks, because the needed update really is low-rank. If quality is poor, raising the rank is less effective than adding more target matrices, improving data, or raising the learning rate. Biderman et al. (2024) found LoRA often learns less than full fine-tuning on hard code and maths tasks, but also forgets less of the base model's abilities.

## Learning rate

LoRA uses a higher learning rate than full fine-tuning because the adapter starts from zero and has few parameters: typically $10^{-4}$ to $3\times10^{-4}$ (compared with $10^{-5}$ to $2 \times 10^{-5}$ for full fine-tuning), with warmup and cosine decay as usual.

## In practice

Before launching, print the trainable parameter count and compare it with $\sum r(d_{\text{in}} + d_{\text{out}})$ over your target matrices. If the numbers differ, an unintended set of layers is adapted. The lab below asks you to choose a rank, targets and GPU for a fine-tune within a memory limit.

```lab
lora-budget
```

```quiz
{"q": "A rank-32 LoRA adapts a $5120 \\times 5120$ matrix. How many trainable parameters does it add?", "options": ["163,840", "327,680", "26,214,400", "1,024"], "answer": 1, "explain": "$r(d_{\\text{in}} + d_{\\text{out}}) = 32 \\times 10{,}240 = 327{,}680$. 163,840 uses a single dimension ($32 \\times 5120$), forgetting that both $A$ and $B$ exist."}
```

```quiz
{"q": "A 32-layer model adapts $W_Q$ and $W_V$ (both $4096 \\times 4096$) at rank 8. How many parameters in total?", "options": ["2.1M", "4.2M", "8.4M", "0.5M"], "answer": 1, "explain": "Per matrix $8 \\times 8192 = 65{,}536$; two matrices per layer give $131{,}072$; $\\times 32 = 4{,}194{,}304 \\approx 4.2$M."}
```
