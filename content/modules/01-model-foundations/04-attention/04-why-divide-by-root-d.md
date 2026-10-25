---
title: Why divide by the square root of d
minutes: 7
---

Imagine judging a contest by adding up scores from many judges. With three judges the totals spread over a small range; with three hundred, the totals spread much wider, simply because more numbers are being added. If you then picked winners with a rule tuned for three judges, one contestant would win by a landslide every time, whether or not they deserved it.

A dot product is that kind of sum: $d_k$ products added together. As the head dimension grows, raw scores spread out, and softmax, which exponentiates them, turns a moderate spread into an all-or-nothing choice. The $\sqrt{d_k}$ in the attention formula is the correction that keeps the spread the same at any width.

## The variance argument

Assume, as is roughly true at initialisation, that the components of a query $\mathbf{q}$ and a key $\mathbf{k}$ are independent with mean $0$ and variance $1$. The score is

$$
s = \mathbf{q} \cdot \mathbf{k} = \sum_{i=1}^{d_k} q_i k_i
$$

Each term $q_i k_i$ has mean $0$ (the factors are independent with mean 0) and variance $\mathbb{E}[q_i^2]\,\mathbb{E}[k_i^2] = 1 \times 1 = 1$. Variances of independent terms add, so

$$
\operatorname{Var}(s) = d_k, \qquad \operatorname{std}(s) = \sqrt{d_k}
$$

Dividing by $\sqrt{d_k}$ rescales the standard deviation back to $1$:

$$
\operatorname{Var}\!\left(\frac{s}{\sqrt{d_k}}\right) = \frac{d_k}{d_k} = 1
$$

For a typical head dimension $d_k = 64$, unscaled scores have a standard deviation of $\sqrt{64} = 8$. A quick simulation (20,000 random 64-dimensional pairs) gives a measured standard deviation of about $8.0$, matching the derivation.

## Why a large spread is bad

Large score gaps make softmax **saturate**: almost all weight lands on one position. That hurts in two ways. The model loses the ability to blend information, and the gradient through softmax nearly vanishes, so learning stalls. For two scores with weight $p$ on the first, the derivative of $p$ with respect to the score gap is $p(1 - p)$.

```steps
Saturation, by hand
Scores $(1, 0)$: $p = e^1/(e^1 + 1) \approx 0.731$. Gradient factor $p(1-p) \approx 0.731 \times 0.269 \approx 0.197$. Healthy.
---
Scores $(8, 0)$, the typical gap for unscaled $d_k = 64$: $p = e^8/(e^8 + 1) \approx 0.99966$. Gradient factor $\approx 0.00034$, nearly 600 times smaller.
---
Four unscaled scores $(10, -3, 5, -8)$: softmax $\approx (0.993, 0.000, 0.007, 0.000)$. Effectively a hard choice.
---
The same scores divided by $\sqrt{64} = 8$: $(1.25, -0.375, 0.625, -1)$, softmax $\approx (0.544, 0.107, 0.291, 0.057)$. The ranking is identical, but the weights are soft and the gradients flow.
```

Scaling never changes *which* key wins; it changes how decisively. The model can still learn sharp attention by making $\mathbf{q}$ and $\mathbf{k}$ larger where that helps, but it starts from a regime where gradients work.

| $d_k$ | std of raw score | std after $\div\sqrt{d_k}$ |
|---|---|---|
| 4 | 2 | 1 |
| 64 | 8 | 1 |
| 128 | about 11.3 | 1 |

## See it

```sim
attention-heatmap
```

Use the temperature/scale control as a stand-in for "how big are the scores". At the scaled setting rows have several warm cells. Turn the scaling off (or push the scale up) and watch each row collapse to one bright cell: that is saturation. Every row still sums to 1; it is just spending all of it in one place.

## In practice

- **Sharpening is sometimes wanted**, and models learn it. Many trained heads are very peaked (a "previous token" head puts almost all weight on position $i-1$). The scale factor only sets the starting point.
- **Very long contexts revive the problem in another form.** With tens of thousands of keys, even unit-variance scores give tiny weights to everything, so attention gets diluted. Some long-context methods adjust the scale with context length; the principle is the same variance reasoning.
- **Precision matters.** Large unscaled scores in 16-bit arithmetic can overflow. Scaling and the subtract-the-max trick together keep attention numerically safe.

```quiz
{"q": "Query and key components are independent with mean 0 and variance 1, and $d_k = 128$. What is the standard deviation of the unscaled score $\\mathbf{q}\\cdot\\mathbf{k}$?", "options": ["About 11.3", "128", "1", "64"], "answer": 0, "explain": "The variance is $d_k = 128$, so the standard deviation is $\\sqrt{128} \\approx 11.3$. 128 is the variance, not the standard deviation; dividing by $\\sqrt{d_k}$ is what would bring it to 1."}
```

```quiz
{"q": "You remove the $\\sqrt{d_k}$ scaling from a model with $d_k = 64$ and train from scratch. What is the most likely symptom early in training?", "options": ["Attention rows become nearly one-hot and learning in attention layers is slow, because softmax gradients are tiny", "Attention becomes uniform over all tokens", "The attention weights no longer sum to 1", "Nothing changes, because softmax is scale-invariant"], "answer": 0, "explain": "Unscaled scores have a standard deviation around 8, which saturates softmax: almost all weight on one key and gradient factors near zero. Uniform attention is the opposite effect (scores too small). Rows still sum to 1, and softmax is shift-invariant, not scale-invariant."}
```

```lab
attention-by-hand
```
