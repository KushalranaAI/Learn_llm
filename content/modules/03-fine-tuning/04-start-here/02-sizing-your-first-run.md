---
title: Sizing your first run
minutes: 8
---

Before you write a training script, answer one question: will it fit on the GPU you have? Most failed first runs fail here, with an out-of-memory error ten seconds in. The answer depends on which parameters you train and how many bytes each one costs. There are three common setups: **full fine-tuning** (train every weight), **LoRA** (freeze the model and train small low-rank adapters), and **QLoRA** (LoRA on top of a base model stored in 4 bits).

## Full fine-tuning: 16 bytes per parameter

With mixed-precision Adam, each trainable parameter needs:

| Item | Bytes |
|---|---|
| bf16 weight used in the forward pass | 2 |
| bf16 gradient | 2 |
| fp32 master copy of the weight | 4 |
| Adam first moment $m$ (fp32) | 4 |
| Adam second moment $v$ (fp32) | 4 |
| **Total** | **16** |

So the model states alone take $16N$ bytes for $N$ parameters, before any activations. For an 8B model that is $16 \times 8 \times 10^9 = 128$ GB: more than one 80 GB GPU. Full fine-tuning of an 8B model needs several GPUs with the states sharded across them ([Training at Scale](/learn/training-and-adaptation/training-at-scale) shows how).

## LoRA: train a sliver, freeze the rest

LoRA replaces the update to a weight matrix $W \in \mathbb{R}^{d_{out} \times d_{in}}$ with a low-rank product $BA$, where $B \in \mathbb{R}^{d_{out} \times r}$ and $A \in \mathbb{R}^{r \times d_{in}}$. Each adapted matrix adds

$$r\,(d_{in} + d_{out}) \text{ trainable parameters.}$$

**Worked example: Llama-3-8B, rank $r = 16$, all linear layers.** The model has $L = 32$ layers, $d = 4096$, an MLP width of 14,336, and grouped-query attention with 8 key/value heads of size 128, so $W_k$ and $W_v$ map 4096 to 1024.

```steps
Counting LoRA parameters for one layer
Attention: $W_q$ and $W_o$ are $4096 \times 4096$, so each adds $16 \times (4096 + 4096) = 131{,}072$. $W_k$ and $W_v$ are $4096 \to 1024$, so each adds $16 \times (4096 + 1024) = 81{,}920$.
---
MLP: gate, up and down projections each connect 4096 and 14,336, so each adds $16 \times (4096 + 14336) = 294{,}912$.
---
One layer: $2(131{,}072) + 2(81{,}920) + 3(294{,}912) = 1{,}310{,}720$.
---
All 32 layers: $32 \times 1{,}310{,}720 = 41{,}943{,}040 \approx 41.9$M trainable parameters, about 0.5% of the 8B model.
```

Memory is now the frozen bf16 base, $2 \times 8 \times 10^9 = 16$ GB, plus $16$ bytes for each of the 41.9M adapter parameters (about 0.67 GB), plus activations. That fits on a 24 GB GPU at modest batch sizes. QLoRA stores the frozen base in 4 bits, about 0.5 bytes per weight, which brings the base to roughly 5 to 6 GB (the large embedding and output matrices usually stay in 16 bits) and lets the same run fit on a 16 GB card.

```sim
lora-params
{"model": "llama3-8b", "method": "lora", "rank": 16, "targets": "all", "gpu": "l4"}
```

Check that the trainable count matches the 41.9M above. Switch the method to **full** and watch the memory jump past what an L4 can hold. Then switch to **qlora** and see how much room it frees. Finally, try targeting only the query and value matrices: far fewer parameters, which is often enough for a format or style change.

## Which one to pick

| Setup | Trainable share | Memory for an 8B model | Use when |
|---|---|---|---|
| Full fine-tuning | 100% | ~128 GB of states, multi-GPU | Large distribution shift, plenty of data and GPUs |
| LoRA | ~0.1–1% | ~17 GB plus activations | The default for task and style adaptation |
| QLoRA | ~0.1–1% | ~6 GB plus activations | A single consumer or small cloud GPU |

## In practice

Start with LoRA at rank 8 to 16 on all linear layers. It is cheap, the adapter file is tens of megabytes, and you can keep several adapters for one base model. Move to full fine-tuning only if a careful LoRA run plateaus below your quality bar on the evaluation set. Activations, not weights, are what usually push a run over the limit: they grow with batch size times sequence length, so halve the micro-batch and use [gradient accumulation](/learn/model-foundations/scaling-the-training-loop) before you reach for a bigger GPU.

```lab
lora-budget
```

```quiz
{"q": "How many trainable parameters does LoRA with rank $r = 8$ add to one $4096 \\times 4096$ matrix?", "options": ["65,536", "32,768", "16,777,216", "131,072"], "answer": 0, "explain": "$r(d_{in} + d_{out}) = 8 \\times (4096 + 4096) = 65{,}536$. The full matrix has $4096^2 \\approx 16.8$M entries, so this is 0.4% of it. 32,768 counts only one of the two factors."}
```

```quiz
{"q": "Roughly how much memory do the model states take for full fine-tuning of a 3B model with mixed-precision Adam?", "options": ["48 GB", "6 GB", "12 GB", "24 GB"], "answer": 0, "explain": "At 16 bytes per trainable parameter: $16 \\times 3 \\times 10^9 = 48$ GB, before activations. 6 GB is just the bf16 weights; it leaves out the gradients, the fp32 master copy and both Adam moments."}
```
