---
title: The gating network
minutes: 8
---

The router is the receptionist from the hospital analogy. It is the cheapest part of the layer and the one that decides everything. For each token it answers two questions: **which** experts should handle this token, and **how much** should each one's answer count?

The router is one linear layer. It turns the token vector $\mathbf{x} \in \mathbb{R}^d$ into $N$ scores, one per expert, called **router logits**. A softmax turns the logits into a probability distribution over experts. Then it makes a hard choice: keep the $k$ largest probabilities and discard the rest. This is **top-k routing**. The kept probabilities become the weights used to mix the chosen experts' outputs.

The hard choice is what makes the layer sparse. It is also what makes training subtle, because "pick the top 2" has no gradient. The router learns only through the soft weights attached to the experts it picked.

## In everyday life

A cricket captain faces a new batter. He does not bowl all his bowlers, and he does not pick at random. He studies the batter, rates each bowler for this batter, and picks the best two. Then he decides how the overs are shared, giving more to the higher-rated one. Afterwards he sees how the chosen bowlers did, and that shapes his next choice.

In a mixture of experts, the **router** (or **gate**) is the captain. For each **token** (a piece of a word), it gives every expert a score and turns the scores into shares that add up to one. **Top-k routing** keeps only the k best experts, here the best two, and ignores the rest. The kept shares are **renormalised**, meaning rescaled so they again add up to one, and the layer's answer is the blend of the chosen experts' answers, weighted by those shares.

Unlike a real captain, the router learns only about bowlers it picked. Experts left out get no feedback for that token.

**Where you meet it.** Inside a language model's layer, the router decides for each token which experts handle it. If it picks poorly, the wrong expert works on the token and the layer's answer is worse. A good router sends each kind of token to the experts that handle it well and blends their answers by how confident it was.

```scene
title: A captain picks two bowlers
step: 👀 The captain studies the new batter | the router reads the token
step: 📊 He rates every bowler for this batter | router scores called logits
step: 🧮 He turns the ratings into shares that add up to one | softmax
step: 🏆 He keeps the two best bowlers, and the others rest | top-k selection
step: 📏 He rescales the two shares so they add up to one again | renormalising the gate weights
step: 🏏 The overs are shared by those shares, and results are blended | weighted sum of expert outputs
takeaway: The router scores every expert, keeps the best few, and blends their answers by their shares.
```

## The equations

With router weights $W_g \in \mathbb{R}^{N \times d}$ and bias $\mathbf{b}_g \in \mathbb{R}^N$:

$$
\mathbf{z} = W_g \mathbf{x} + \mathbf{b}_g, \qquad p_i = \frac{e^{z_i}}{\sum_{j=1}^{N} e^{z_j}}
$$

Let $\mathcal{T}$ be the set of indices of the $k$ largest $p_i$. The gate weights are the kept probabilities, usually **renormalised** so they sum to 1:

$$
g_i = \frac{p_i}{\sum_{j \in \mathcal{T}} p_j} \quad (i \in \mathcal{T}), \qquad g_i = 0 \ \ \text{otherwise}
$$

The layer output is the weighted sum of the chosen experts $E_i$:

$$
\mathbf{y} = \sum_{i \in \mathcal{T}} g_i \, E_i(\mathbf{x})
$$

A useful identity: renormalising the top-$k$ softmax probabilities is the same as taking a softmax over only the top-$k$ logits. The global denominator cancels:

$$
\frac{p_i}{\sum_{j \in \mathcal{T}} p_j} = \frac{e^{z_i}/Z}{\sum_{j \in \mathcal{T}} e^{z_j}/Z} = \frac{e^{z_i}}{\sum_{j \in \mathcal{T}} e^{z_j}}
$$

So the renormalised weights depend only on the logits of the chosen experts. Mixtral implements its router this way: top-$k$ on the logits, then a softmax over those $k$.

## A worked example

```steps
Routing one token, $N = 4$, $k = 2$
**Logits.** The router produces $\mathbf{z} = (2.0,\ 1.0,\ 0.5,\ -1.0)$ for experts 0 to 3.
---
**Softmax.** $e^{\mathbf{z}} = (7.389,\ 2.718,\ 1.649,\ 0.368)$, which sums to $12.124$. So $\mathbf{p} = (0.609,\ 0.224,\ 0.136,\ 0.030)$.
---
**Top-2.** The two largest are experts 0 and 1, with $p_0 + p_1 = 0.834$. Experts 2 and 3 are not run at all for this token.
---
**Renormalise.** $g_0 = 0.609 / 0.834 = 0.731$ and $g_1 = 0.224 / 0.834 = 0.269$. Check with the identity: $e^{2}/(e^{2} + e^{1}) = 7.389/10.107 = 0.731$.
---
**Combine.** $\mathbf{y} = 0.731\,E_0(\mathbf{x}) + 0.269\,E_1(\mathbf{x})$. Without renormalising, the output would be $0.609\,E_0 + 0.224\,E_1$, about 17% smaller in total weight.
```

## The router in code

Adapted from `llm_from_scratch/part_5/gating.py`. The repo calls the token count $S$ and the expert count $E$; here they are $T = B \cdot n$ and $N$:

```python
import torch, torch.nn as nn

class TopKGate(nn.Module):
    def __init__(self, dim: int, n_expert: int, k: int = 1):
        super().__init__()
        self.k = k
        self.w_g = nn.Linear(dim, n_expert, bias=True)

    def forward(self, x):                        # x: (T, d), T = B*n tokens
        logits = self.w_g(x)                     # (T, N)
        probs = torch.softmax(logits, dim=-1)    # (T, N)
        topk_vals, topk_idx = torch.topk(probs, k=self.k, dim=-1)  # (T, k), (T, k)
        # repo returns topk_vals as-is (sum <= 1); renormalising is one line:
        # topk_vals = topk_vals / topk_vals.sum(-1, keepdim=True)
        return topk_idx, topk_vals               # plus an aux loss, next topic
```

Notice the repo **does not** renormalise. Its docstring says the weights "sum ≤ 1 per token". With $k = 1$ that choice matters, as the second quiz shows. The full version, including the load-balancing loss, is `llm_from_scratch/part_5/gating.py`.

## How the router learns

`torch.topk` returns indices, and indices carry no gradient. The router's parameters receive gradient only through `topk_vals`, the weights $g_i$ that multiply the chosen experts' outputs. If expert 0's output turned out to help the loss, the gradient increases $g_0$, which raises $z_0$ for similar tokens. Over time the router learns to send each kind of token to the experts that handle it well.

The router never gets direct feedback about experts it did not pick. Shazeer et al. (2017) added learned noise to the logits before the top-$k$ ("noisy top-k gating") so that near-miss experts get picked sometimes and receive gradient. Later models mostly dropped the noise and relied on load-balancing losses instead (next topic).

| Variant | Weights for chosen experts | Used by |
|---|---|---|
| Top-1, raw probability | $g_i = p_i$ | Switch Transformer |
| Top-2, renormalised | $g_i = p_i / (p_a + p_b)$ | GShard, Mixtral |
| Top-$k$, raw probability | $g_i = p_i$, sum $\le 1$ | the repo's `TopKGate` |

## In practice

- **Compute the router in float32.** Router logits feed an exponential, and small precision errors change which expert wins. Many MoE codebases cast the router input and weights to fp32 even when the rest of the model runs in bf16.
- **Routing is per token, not per sequence.** Two adjacent tokens in the same sentence often go to different experts. Studies of Mixtral's routing found experts specialise more by syntax and token type than by topic. Do not expect a "maths expert" and a "biology expert".
- **The router is tiny.** For Mixtral it is $4{,}096 \times 8 \approx 33$K parameters per layer, about 0.02% of one expert. It is the cheapest layer in the model and the one whose mistakes are costliest.

```quiz
{"q": "With top-2 routing and renormalised weights, the two chosen experts have logits $z_a$ and $z_b$ with $z_a - z_b = \\ln 3 \\approx 1.10$. What are their gate weights?", "options": ["0.75 and 0.25", "Cannot be computed without the other experts' logits", "0.5 and 0.5", "0.73 and 0.27"], "answer": 0, "explain": "Renormalised top-$k$ weights equal a softmax over the chosen logits only: $g_a = e^{z_a}/(e^{z_a} + e^{z_b}) = 1/(1 + e^{-\\ln 3}) = 1/(1 + 1/3) = 0.75$. The other logits cancel out of the ratio, so you do not need them. 0.73 and 0.27 is what a logit gap of exactly 1.0 gives."}
```

```quiz
{"q": "You set $k = 1$, renormalise the gate weights and train with no auxiliary loss. Training runs, but the router weights never change. Why?", "options": ["With one expert, the renormalised weight is always exactly 1, so the output does not depend on the router and no gradient reaches it", "Softmax cannot be differentiated when $k = 1$", "The experts absorb all the gradient because they have more parameters", "Top-1 routing requires a bias in the router"], "answer": 0, "explain": "$g_i = p_i / p_i = 1$ regardless of the logits, so $\\mathbf{y} = E_i(\\mathbf{x})$ and $\\partial \\mathbf{y}/\\partial W_g = 0$. Only the non-differentiable top-1 choice depends on the router. That is why Switch Transformer uses $g_i = p_i$ without renormalising for $k = 1$. Softmax itself is differentiable for any $k$."}
```
