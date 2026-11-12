---
title: RMSNorm, the cheaper normaliser
minutes: 7
---

```predict
{"q":"RMSNorm drops LayerNorm's mean subtraction and bias. Train the tiny GPT once with each. How do the two loss curves compare?","options":["RMSNorm is clearly worse, since it skips a step","They overlap within noise","RMSNorm reaches a much lower loss"],"answer":1,"reveal":"They overlap within noise. The benefit is speed, not quality: one fewer pass over each vector and half the parameters per norm. The savings section below shows where the time goes."}
```

The GPT you trained in [Train a Tiny GPT](/learn/model-foundations/train-a-tiny-gpt) has three `nn.LayerNorm` layers per stack position: one before attention, one before the feed-forward network, and `ln_f` before the output head. Each one centres a token's vector (subtract the mean), scales it to unit variance, then applies a learned gain and bias. The first change on the road to a Llama-style model is to swap them all for **RMSNorm**.

RMSNorm keeps only the half of LayerNorm that turned out to matter. It rescales each token's vector so its root-mean-square is 1, then multiplies by a learned gain. No mean subtraction, no bias. The argument of the paper that introduced it is that LayerNorm's success comes from **re-scaling invariance** (the sub-layer no longer cares how loud the residual stream is), while **re-centring** contributes little. Drop the re-centring and you save a reduction and $d$ parameters per norm, and models train about as well.

The theory, with a worked LayerNorm-versus-RMSNorm comparison, is in [LayerNorm and RMSNorm](/learn/model-foundations/transformer-block). Here the focus is the dozen lines of code and the numerical details that only appear once you write them.

## The maths

For one token's vector $\mathbf{x} \in \mathbb{R}^d$ with learned gain $\boldsymbol{\gamma} \in \mathbb{R}^d$:

$$
\text{RMS}(\mathbf{x}) = \sqrt{\frac{1}{d}\sum_{i=1}^{d} x_i^2 + \epsilon}, \qquad y_i = \gamma_i \,\frac{x_i}{\text{RMS}(\mathbf{x})}
$$

Compare LayerNorm, which needs the mean $\mu$ first and then the variance around it:

$$
\mu = \frac{1}{d}\sum_i x_i, \qquad \sigma^2 = \frac{1}{d}\sum_i (x_i - \mu)^2, \qquad y_i = \gamma_i \frac{x_i - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta_i
$$

LayerNorm makes two passes over the vector (one for $\mu$, one for $\sigma^2$) and stores $2d$ parameters. RMSNorm makes one pass and stores $d$.

```steps
Both norms on $\mathbf{x} = (1, 2, 3, 6)$, $\boldsymbol{\gamma} = 1$, $\epsilon$ ignored
**RMSNorm.** Mean square $= (1 + 4 + 9 + 36)/4 = 12.5$, so $\text{RMS} = \sqrt{12.5} \approx 3.536$. Output $\approx (0.283, 0.566, 0.849, 1.697)$.
---
**LayerNorm, pass 1.** $\mu = 12/4 = 3$.
---
**LayerNorm, pass 2.** Deviations $(-2, -1, 0, 3)$, squares $(4, 1, 0, 9)$, $\sigma^2 = 14/4 = 3.5$, $\sigma \approx 1.871$. Output $\approx (-1.069, -0.535, 0, 1.604)$.
---
**What differs.** RMSNorm's output keeps the sign pattern and the mean of the input (all positive here); LayerNorm's is centred on 0. Both are unchanged if you multiply $\mathbf{x}$ by any positive constant, which is the property the block actually needs.
```

When the input already has mean zero, $\sigma^2$ equals the mean square and the two norms give identical outputs. RMSNorm bets that the network can live without forcing that mean to zero itself.

## The code

This replaces `nn.LayerNorm(n_embd)` in `ln1` and `ln2` of every block.

```python
import torch
import torch.nn as nn

class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float = 1e-6):  # 1e-8 rounds to 0 in fp16
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))                    # gamma, (d,)
    def forward(self, x: torch.Tensor) -> torch.Tensor:               # x: (B, n, d)
        # compute in float32 so the mean of squares neither overflows nor loses eps under fp16/bf16
        xf = x.float()
        inv_rms = xf.pow(2).mean(dim=-1, keepdim=True).add(self.eps).rsqrt()   # (B, n, 1)
        return (xf * inv_rms).to(x.dtype) * self.weight                # (B, n, d)
```

This is `llm_from_scratch/part_3/rmsnorm.py`. Two details in it are easy to get wrong, and an earlier version of the repo got both:

- **`eps` must survive the dtype.** The earlier version used `eps = 1e-8`. In fp32 that is harmless. In fp16 it rounds to exactly 0 (the smallest fp16 number is about $6 \times 10^{-8}$), so an all-zero vector would divide by zero. The repo now uses $10^{-6}$; Llama-family models use $10^{-5}$ or $10^{-6}$.
- **Square in fp32.** The earlier version squared `x` in whatever dtype arrived. In fp16 any activation above 256 overflows when squared ($300^2 = 90{,}000 > 65{,}504$, the fp16 maximum), the RMS becomes infinite and the output becomes zeros. Casting to fp32 for the statistics and back to the input dtype afterwards, as above, is the standard fix.

Also look at the final norm in `part_3/model_modern.py`: `self.ln_f = RMSNorm(n_embd) if use_rmsnorm else nn.LayerNorm(n_embd)`. An earlier version used `nn.Identity()` there, so the modern model had **no final norm** before the output head. Llama keeps one, and for a reason: with pre-norm blocks the residual stream itself is never normalised, so its scale can drift with depth and the head would see it raw. (Checkpoints saved before the fix have no `ln_f.weight`; part 4 refuses to load them strictly and tells you to retrain, which takes about 1.5 minutes for the demo.)

```bughunt
{"q":"A model with this RMSNorm reaches a suspiciously low training loss, but its samples are much worse than the loss suggests. Click the line with the bug.","code":"class RMSNorm(nn.Module):\n    def __init__(self, dim: int, eps: float = 1e-6):\n        super().__init__()\n        self.eps = eps\n        self.weight = nn.Parameter(torch.ones(dim))\n    def forward(self, x: torch.Tensor) -> torch.Tensor:\n        xf = x.float()\n        inv_rms = xf.pow(2).mean(dim=1, keepdim=True).add(self.eps).rsqrt()\n        return (xf * inv_rms).to(x.dtype) * self.weight","bug":8,"explain":"`dim=1` on a `(B, n, d)` tensor averages over the **sequence**, not the features. `keepdim=True` gives shape `(B, 1, d)`, which broadcasts, so nothing fails. But every token is now scaled by statistics that include later tokens: the norm leaks the future past the causal mask, which is why training loss is too good and generation (where the future does not exist yet) disappoints. Fix: `mean(dim=-1, keepdim=True)`, one RMS per token, shape `(B, n, 1)`."}
```

## Where the savings come from

| | LayerNorm (part 2) | RMSNorm (part 3) |
|---|---|---|
| Reductions over $d$ | 2 (mean, then variance) | 1 (mean square) |
| Parameters per norm | $2d$ | $d$ |
| Output centred? | yes | no |
| Invariant to rescaling $\mathbf{x}$ | yes | yes |
| Invariant to shifting $\mathbf{x}$ by a constant | yes | no |

Parameters are negligible either way: at $d = 128$ the tiny GPT's three LayerNorms hold $3 \times 256 = 768$ numbers out of hundreds of thousands. The saving that matters is time. Normalisation is **memory-bound**: it reads the whole activation tensor and does a few operations per element. One fewer reduction and no bias read is a measurable cut in a kernel that runs twice per layer, every step. On large models the gain is a few percent of step time, not a revolution, but it is free.

## In practice

- **Swap and check the loss curve.** The repo's README suggests training the tiny GPT twice, once with each norm, and comparing. Expect the curves to overlap within noise. If RMSNorm is clearly worse, suspect a bug (normalising over `dim=1`, the sequence, instead of `dim=-1`).
- **Keep norm gains out of weight decay**, exactly as with LayerNorm. Decaying $\gamma$ towards 0 slowly silences a sub-layer.
- **Converting checkpoints.** A LayerNorm checkpoint cannot be loaded into an RMSNorm model: the bias $\beta$ has nowhere to go, and the network was trained to expect centred inputs. Changing the norm means retraining.

```quiz
{"q": "For which input do RMSNorm and LayerNorm (both with $\\gamma = 1$, $\\beta = 0$, $\\epsilon$ ignored) give exactly the same output?", "options": ["$(3, -1, -2, 0)$", "$(1, 2, 3, 6)$", "$(5, 5, 5, 5)$", "$(1, 1, 1, 2)$"], "answer": 0, "explain": "$(3, -1, -2, 0)$ has mean 0, so LayerNorm's variance equals the mean square and nothing is subtracted: the two formulas coincide. $(5, 5, 5, 5)$ is the tempting trap: RMSNorm maps it to $(1, 1, 1, 1)$, but LayerNorm subtracts the mean and gets $(0, 0, 0, 0)$ divided by a zero standard deviation."}
```

```quiz
{"q": "A model runs in fp16 and one token's residual vector contains an entry of 400. The RMSNorm computes `x.pow(2).mean(...)` without casting. What happens to that token?", "options": ["$400^2$ overflows to infinity, the RMS is infinite and the normalised vector becomes all zeros", "Nothing: RMSNorm is scale-invariant so large values are fine", "The value is clipped to 256 and the output is slightly wrong", "eps prevents any numerical problem"], "answer": 0, "explain": "$400^2 = 160{,}000$ exceeds the fp16 maximum of 65,504, so the square is inf, the mean is inf and $x / \\infty = 0$. Scale invariance holds mathematically, but the intermediate square still has to be representable, which is why implementations compute the statistic in fp32. eps only guards against division by zero."}
```
