---
title: LayerNorm and RMSNorm
minutes: 7
---

A sound engineer recording a quiet singer and then a loud drummer turns the input gain up for one and down for the other, so the mixer always receives a signal of about the same strength. The music is unchanged; only its scale is.

Inside a transformer the residual stream keeps growing, because every block adds to it. After a few dozen additions some coordinates can be far larger than others, and their size changes from token to token. If each sub-layer read the raw stream, its weights would have to cope with inputs at wildly different scales. **Normalisation** is the gain knob. Before attention and before the FFN, the block rescales each token's vector to a standard size. A small set of learned per-dimension weights then sets the scale the sub-layer actually prefers.

This works **per token**, across the $d$ features of one vector. It does not mix tokens and it does not depend on the batch. That is why it behaves the same in training and in inference, one token at a time.

## LayerNorm

For one token's vector $\mathbf{x} = (x_1, \dots, x_d)$:

$$
\mu = \frac{1}{d}\sum_{i=1}^{d} x_i, \qquad \sigma^2 = \frac{1}{d}\sum_{i=1}^{d} (x_i - \mu)^2, \qquad y_i = \gamma_i \frac{x_i - \mu}{\sqrt{\sigma^2 + \epsilon}} + \beta_i
$$

- $\mu$ and $\sigma^2$ are the mean and variance of this token's features.
- $\epsilon$ is a tiny constant, such as $10^{-5}$, that prevents division by zero.
- $\gamma$ (gain) and $\beta$ (bias) are learned vectors of length $d$, so a LayerNorm has $2d$ parameters.

The output has mean 0 and variance 1 before $\gamma$ and $\beta$ are applied.

## RMSNorm

**RMSNorm** skips the mean subtraction and the bias. It only divides by the root-mean-square:

$$
\text{RMS}(\mathbf{x}) = \sqrt{\frac{1}{d}\sum_{i=1}^{d} x_i^2 + \epsilon}, \qquad y_i = \gamma_i \frac{x_i}{\text{RMS}(\mathbf{x})}
$$

It has $d$ parameters and is slightly cheaper to compute. In practice it trains about as well as LayerNorm, which is why Llama-family models use it.

## Worked example

Take $\mathbf{x} = (2, 4, 6, 8)$, with $d = 4$, $\gamma = 1$, $\beta = 0$ and $\epsilon$ ignored.

```steps
LayerNorm and RMSNorm by hand
**Mean.** $\mu = (2+4+6+8)/4 = 5$.
---
**Variance.** Deviations are $-3, -1, 1, 3$; squares $9, 1, 1, 9$; mean $\sigma^2 = 20/4 = 5$, so $\sigma = \sqrt5 \approx 2.236$.
---
**LayerNorm output.** $(x_i - 5)/2.236 = (-1.342, -0.447, 0.447, 1.342)$. The mean is 0 and the variance is 1.
---
**RMSNorm.** The mean square is $(4 + 16 + 36 + 64)/4 = 30$, so $\text{RMS} = \sqrt{30} \approx 5.477$. The output is $x_i/5.477 = (0.365, 0.730, 1.095, 1.461)$. It is not centred, but its RMS is exactly 1.
---
**Scale invariance.** Double the input to $(4, 8, 12, 16)$ and both outputs are unchanged. The sub-layer no longer sees how loud the stream has become.
```

```python
import math
x = [2, 4, 6, 8]
mu = sum(x) / len(x)
var = sum((a - mu) ** 2 for a in x) / len(x)
print([round((a - mu) / math.sqrt(var), 3) for a in x])   # [-1.342, -0.447, 0.447, 1.342]
rms = math.sqrt(sum(a * a for a in x) / len(x))
print([round(a / rms, 3) for a in x])                      # [0.365, 0.73, 1.095, 1.461]
```

## Where the norms sit

| Model | Norm | Position | Norm params per block |
|---|---|---|---|
| Original transformer (2017) | LayerNorm | after each residual add (post-norm) | $2 \times 2d$ |
| GPT-2 | LayerNorm | before each sub-layer (pre-norm), plus one at the end | $2 \times 2d = 3{,}072$ for $d = 768$ |
| Llama 2 | RMSNorm | pre-norm, plus one at the end | $2 \times d = 8{,}192$ for $d = 4{,}096$ |

The norms are a tiny share of parameters: 3,072 out of about 7.1 million per GPT-2 block. They still matter a great deal for whether training stays stable.

## See it

```sim
transformer-params
```

Find the normalisation line in the per-block breakdown, then raise $d$. Norm parameters grow linearly in $d$, while attention and FFN grow with $d^2$. At $d = 4{,}096$ the norms are well under 0.01% of the block.

## In practice

- **Keep norms in higher precision.** Squaring and averaging thousands of values can overflow or lose precision in 16-bit formats. Mixed-precision code usually computes the statistics in fp32.
- **Don't decay $\gamma$.** Many training setups exclude norm gains and biases from weight decay. Shrinking $\gamma$ toward zero would quietly silence a sub-layer.
- **A common bug.** Normalising over the wrong axis, across the sequence instead of the feature dimension, still runs. But it leaks information between tokens, which breaks causal masking.

```quiz
{"q": "Apply RMSNorm (with $\\gamma = 1$, $\\epsilon$ ignored) to $\\mathbf{x} = (3, 4)$. What is the output?", "options": ["About $(0.849, 1.131)$", "$(0.6, 0.8)$", "$(-1, 1)$", "$(3, 4)$"], "answer": 0, "explain": "Mean square $= (9 + 16)/2 = 12.5$, so RMS $= \\sqrt{12.5} \\approx 3.536$, giving $(0.849, 1.131)$. $(0.6, 0.8)$ divides by the vector's length (5), not by its root-mean-square. $(-1, 1)$ is what LayerNorm gives, because it subtracts the mean."}
```

```quiz
{"q": "How many parameters do the two LayerNorms inside one GPT-2 small block have ($d = 768$)?", "options": ["3,072", "1,536", "768", "589,824"], "answer": 0, "explain": "Each LayerNorm has a gain and a bias of length $d$: $2 \\times 768 = 1{,}536$. There are two per block, so 3,072. 1,536 counts only one norm. 589,824 is $d^2$, which would be a full weight matrix."}
```
