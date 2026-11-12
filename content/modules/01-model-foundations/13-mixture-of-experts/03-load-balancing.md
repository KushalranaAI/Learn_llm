---
title: Load balancing
minutes: 9
---

Left alone, a router tends to fall in love with one expert. It goes like this. At initialisation one expert happens to score slightly higher for many tokens. It gets picked more, so it receives more gradient updates and gets better. Because it is better, the router's gradient pushes even more tokens towards it. After a few hundred steps one or two experts do all the work and the rest are idle. This is **routing collapse**. You are paying the memory for $N$ experts and getting the capacity of one or two.

Collapse also hurts the hardware. Experts are usually spread across GPUs. If one expert receives 60% of the tokens, its GPU becomes the bottleneck and the others wait.

The fix is to add a small extra term to the loss that is smallest when tokens are spread evenly. This is the **auxiliary load-balancing loss**. The standard version comes from the Switch Transformer, and it is the one the repo implements.

## The Switch auxiliary loss

Over a batch of $T$ tokens, define two quantities per expert $i$:

$$
f_i = \frac{1}{T} \sum_{t=1}^{T} \mathbb{1}\big[\text{expert } i \text{ is token } t\text{'s top choice}\big], \qquad P_i = \frac{1}{T} \sum_{t=1}^{T} p_i(\mathbf{x}_t)
$$

$f_i$ is the **load**: the fraction of tokens actually dispatched to expert $i$ (as first choice). $P_i$ is the **importance**: the average router probability given to expert $i$. Both vectors sum to 1. The loss is

$$
\mathcal{L}_{\text{aux}} = \alpha \cdot N \sum_{i=1}^{N} f_i \, P_i
$$

with a small coefficient $\alpha$; Switch used $\alpha = 0.01$. The factor $N$ makes the balanced value independent of the number of experts. If routing is perfectly uniform, $f_i = P_i = 1/N$, and

$$
N \sum_{i=1}^{N} \frac{1}{N} \cdot \frac{1}{N} = N \cdot N \cdot \frac{1}{N^2} = 1
$$

Any imbalance pushes the sum above 1.

**Why two quantities?** $f_i$ comes from an argmax count, so it has no gradient. $P_i$ is a mean of softmax outputs, so it does. The gradient of the loss with respect to $P_i$ is $\alpha N f_i$. Experts with a high load get their probabilities pushed down hardest, and experts with no load get no push down. The count tells the loss *where* the imbalance is; the probability is the handle the gradient can pull.

## A worked example

Four experts, measured over one batch:

| Routing | $f$ (load) | $P$ (importance) | $\sum_i f_i P_i$ | $N \sum f_i P_i$ |
|---|---|---|---|---|
| Balanced | $(0.25, 0.25, 0.25, 0.25)$ | $(0.25, 0.25, 0.25, 0.25)$ | $0.25$ | **1.00** |
| Skewed | $(0.5, 0.25, 0.125, 0.125)$ | $(0.4, 0.3, 0.15, 0.15)$ | $0.2 + 0.075 + 0.019 + 0.019 = 0.3125$ | **1.25** |
| Collapsed | $(1, 0, 0, 0)$ | $(0.7, 0.1, 0.1, 0.1)$ | $0.7$ | **2.80** |

In the collapsed row, the gradient pushes only on $P_0$, with strength $\alpha N f_0 = 0.01 \times 4 \times 1 = 0.04$. Lowering $P_0$ means lowering expert 0's logit, which hands tokens to the others.

## The loss in code

From `llm_from_scratch/part_5/gating.py`, inside the gate's `forward` (repo names: `importance` is $P$, `load` is $f$, `E` is $N$):

```python
# probs: (T, N) softmax over experts; topk_idx: (T, k)
T, N = probs.shape
importance = probs.mean(dim=0)                      # (N,)  P_i, differentiable
hard1 = topk_idx[:, 0]                              # (T,)  each token's first choice
load = torch.zeros(N, device=probs.device)
load.scatter_add_(0, hard1, torch.ones_like(hard1, dtype=load.dtype))  # counts per expert
load = load / max(T, 1)                             # (N,)  f_i, no gradient
aux_loss = N * (importance * load).sum()            # scalar, 1.0 when balanced
```

The gate returns `aux_loss` without $\alpha$. The training loop adds it to the language-model loss, summed over every MoE layer:

```python
loss = ce_loss + 0.01 * sum(aux_losses)   # one aux term per MoE layer
```

## Capacity and dropped tokens

The auxiliary loss nudges routing towards balance, but it does not guarantee it on any given batch. For efficient hardware, frameworks like GShard and Switch gave each expert a fixed buffer, the **expert capacity**:

$$
C = \left\lceil \text{cf} \cdot \frac{k \, T}{N} \right\rceil
$$

where $\text{cf}$ is the **capacity factor**. With $\text{cf} = 1$ an expert holds exactly its fair share; with $\text{cf} = 1.25$ it has 25% headroom. Tokens routed to a full expert are **dropped**: they skip the expert and pass through on the residual connection unchanged.

```steps
Capacity for one batch
$T = 1{,}024$ tokens, $N = 8$ experts, $k = 1$, $\text{cf} = 1.25$.
---
Fair share: $1024 / 8 = 128$ tokens per expert. Capacity: $1.25 \times 128 = 160$.
---
The router sends 300 tokens to expert 3. It processes the first 160 and drops 140.
---
Those 140 tokens get no FFN update in this layer, about 14% of the batch. Raising cf to 2.0 (capacity 256) would drop only 44, but every expert's buffer, and its padded compute, grows by 60%.
```

The repo's `MoE` has no capacity limit: each expert processes however many tokens it is sent. This is called **dropless** routing. It is simpler and loses no tokens, but the work per expert varies from batch to batch. Mixtral-style inference stacks and libraries such as MegaBlocks take this approach with variable-size kernels.

## In practice

- **Watch the routing histogram.** The repo's `demo_moe.py` prints `torch.bincount(idx[:, 0], minlength=N)`. Log this per layer during training. A healthy run has every expert's share within a factor of about 2 of $1/N$. An aux loss sitting near 1.0 also means balance.
- **Too large an $\alpha$ hurts quality.** A huge aux weight makes the router spread tokens evenly regardless of content, which destroys specialisation. Values around $10^{-2}$ to $10^{-3}$ are typical.
- **Other stabilisers exist.** ST-MoE added a **router z-loss** that penalises large logits, which reduces instability in bf16. DeepSeek-V3 replaced the auxiliary loss with a per-expert bias added to the logits for selection only, adjusted up or down depending on whether that expert is under- or over-loaded.

```quiz
{"q": "With $N = 2$ experts, a batch gives load $f = (0.8, 0.2)$ and importance $P = (0.6, 0.4)$. What is $N \\sum_i f_i P_i$, before multiplying by $\\alpha$?", "options": ["1.12", "0.56", "1.00", "2.24"], "answer": 0, "explain": "$\\sum_i f_i P_i = 0.8 \\times 0.6 + 0.2 \\times 0.4 = 0.48 + 0.08 = 0.56$, then multiply by $N = 2$ to get 1.12, above the balanced value of 1. 0.56 forgets the factor $N$, which is what makes 1.0 the target for any number of experts."}
```

```quiz
{"q": "Why does the Switch loss multiply the load $f_i$ by the importance $P_i$ instead of just penalising the variance of $f$?", "options": ["$f_i$ is an argmax count with no gradient, so a loss in $f$ alone could not train the router; $P_i$ is differentiable and carries the push", "Variance is too expensive to compute on a GPU", "$P_i$ alone would be enough, and $f_i$ is only there for logging", "Multiplying makes the loss negative when experts are balanced"], "answer": 0, "explain": "Counting which expert won is a step function, so $\\partial f_i/\\partial W_g = 0$. The product uses $f_i$ as a fixed weight and $P_i$ as the differentiable handle: $\\partial \\mathcal{L}/\\partial P_i = \\alpha N f_i$. Using $P_i$ alone is tempting, but a router can have balanced average probabilities while its hard choices still all go to one expert."}
```
