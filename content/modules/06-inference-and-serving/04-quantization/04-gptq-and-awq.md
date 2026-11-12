---
title: Smarter rounding with GPTQ and AWQ
minutes: 8
---

Round-to-nearest treats every weight as equally important. It is not: a weight that multiplies a large, frequently active input matters far more than one that multiplies inputs near zero. The methods in this topic are **post-training quantization (PTQ)**: take a trained model, run a few hundred sample texts through it (the **calibration set**), and use what you learn about the inputs to quantize more cleverly. No retraining is needed, and they typically work on one layer at a time.

## What we are minimising

For one linear layer with weights $W$ and calibration inputs $X$ (columns are token activations), the output is $WX$. After quantization the output is $\hat{W}X$. What matters is the error in the **output**, not in the weights:

$$
\min_{\hat{W}} \; \lVert WX - \hat{W}X \rVert_F^2
$$

$\lVert \cdot \rVert_F$ is the Frobenius norm (square root of the sum of squared entries). Rounding each weight to its nearest level minimises $\lVert W - \hat{W} \rVert$, which is a different, and worse, objective. A weight's error is amplified by the size of the inputs it meets.

A small illustration: two weights $w = (0.50, 0.50)$ meet inputs $x = (10, 0.1)$. If quantization moves the first weight by $0.04$ the output changes by $0.4$; moving the second by $0.04$ changes it by $0.004$. The first weight is 100 times more important, though the weights themselves look identical.

## GPTQ: round, measure, compensate

**GPTQ** quantizes a layer one column of $W$ at a time. After rounding a column, it knows the error it just introduced and *adjusts the not-yet-quantized columns to cancel it*, using second-order information from the layer's Hessian $H = 2XX^\top$ (the matrix that measures how sensitive the output is to each weight, and how weights interact). Roughly:

1. Quantize column $j$ to its nearest level, get error $e_j$.
2. Update the remaining columns $k > j$: $W_{:,k} \leftarrow W_{:,k} - e_j \cdot (H^{-1})_{jk}/(H^{-1})_{jj}$.
3. Repeat for the next column.

The update spreads each rounding error over the weights that can still compensate for it. Weights that see large inputs get rounded carefully; later ones absorb the leftover.

```steps
Error compensation on two weights
A neuron computes $y = w_1 x_1 + w_2 x_2$ with $w = (0.46, 0.46)$, and calibration inputs where $x_1 \approx x_2 = x$ (strongly correlated). The quantization grid has step 0.1, so allowed values are $0, 0.1, 0.2, \dots$. The exact output is $0.92x$.
---
Plain rounding: $0.46 \to 0.5$ and $0.46 \to 0.5$. Output $1.00x$, an error of $0.08x$: both errors point the same way and add up.
---
GPTQ-style: round $w_1$ to $0.5$ (error $+0.04$). Because $x_2$ moves with $x_1$, the second weight can cancel it: update $w_2 \leftarrow 0.46 - 0.04 = 0.42$.
---
Round the updated $w_2$: $0.42 \to 0.4$. Output $(0.5 + 0.4)x = 0.90x$, an error of $0.02x$, four times smaller than plain rounding.
---
Real layers have thousands of correlated columns, so there are many chances to cancel errors. This is why GPTQ stays accurate at 4 bits (and usable at 3) where plain rounding degrades.
```

GPTQ takes minutes to a few hours on a large model on one GPU, and produces INT4 (and INT3) models with a small quality loss compared with naive rounding, which often noticeably degrades at 4 bits for large models and badly at 3.

## AWQ: protect the important channels

**Activation-aware Weight Quantization (AWQ)** starts from an observation: a small fraction (about 1%) of weight channels, the ones that meet large activations, account for most of the quantization damage. Keeping those in 16 bits would work but would make the format irregular and slow. AWQ instead *scales them up before quantizing*, which makes their relative rounding error smaller, and scales the corresponding activations down to compensate:

$$
y = w x = \left( w \cdot \sigma \right) \left( \frac{x}{\sigma} \right) \approx Q(w \sigma) \cdot \frac{x}{\sigma}
$$

with $\sigma > 1$ the scale chosen for that channel from the calibration activations (larger for channels with larger typical activations), and $Q$ the quantizer.

```steps
Scaling a salient channel by 2
INT4 group step $s = 0.10$ (set by other weights in the group). A salient weight $w = 0.14$ sees large activations.
---
Without scaling: $0.14/0.10 = 1.4 \to 1$, dequantized $0.10$. Error $0.04$, about 29% of the weight.
---
With $\sigma = 2$: $w\sigma = 0.28$, $0.28/0.10 = 2.8 \to 3$, dequantized $0.30$, which maps back to $0.30/2 = 0.15$. Error $0.01$, about 7%, a four-fold improvement.
---
The activation is divided by 2 at run time (folded into the preceding layer's output), so the product is unchanged. The cost: the group's step is now unaffected as long as $\sigma w$ stays within the group's range; if it would not, the step grows for everyone, so AWQ searches for the best $\sigma$ per channel on calibration data.
```

## Comparing the families

| Method | Idea | Needs | Typical use |
|---|---|---|---|
| Round to nearest | Round each weight independently | Nothing | INT8, quick baselines |
| GPTQ | Minimise output error, compensate with remaining weights | Calibration data, Hessian | 4-bit and 3-bit weights |
| AWQ | Scale salient channels using activation statistics | Calibration data | 4-bit weights, fast kernels |
| QLoRA / NF4 | 4-bit grid shaped like a normal distribution, for fine-tuning | None | Training memory, covered in the training module |

## See it

```sim
quantization
{"paramsB": 8, "format": "int4", "groupSize": "128", "outliers": true, "seed": 5}
```

The sim uses simple round-to-nearest, so it shows the error these methods start from. Note the INT4 relative error with outliers on, then compare with NF4, whose levels are placed more densely near zero where most weights live: a better-shaped grid is another way to cut error without more bits. GPTQ and AWQ push in the same direction using calibration data.

## In practice

Calibration data should resemble real traffic: a quantized model calibrated on Wikipedia can underperform on code or on another language. A few hundred to a thousand varied samples is typical. Pre-quantized checkpoints (labelled GPTQ, AWQ and so on) are available for most popular open models; you generally pick one, then evaluate it on your own tasks (topic 6) rather than trusting a generic benchmark.

```quiz
{"q": "Why does GPTQ minimise $\\lVert WX - \\hat{W}X\\rVert$ rather than $\\lVert W - \\hat{W}\\rVert$?", "options": ["A weight's error is amplified by the inputs it multiplies, so layer-output error is what affects the model", "It is cheaper to compute", "The weights themselves are never stored", "Because $X$ is always smaller than $W$"], "answer": 0, "explain": "The same weight error matters 100 times more on an input that is 100 times larger. Minimising output error accounts for that; minimising weight error treats every weight alike. It is in fact more expensive to compute, which is why it needs calibration data."}
```

```quiz
{"q": "In AWQ, a salient channel's weights are multiplied by $\\sigma = 2$ before INT4 quantization. What happens to the activation on that channel?", "options": ["It is divided by 2, so the product $wx$ is unchanged", "It is also multiplied by 2", "It is dropped", "It is quantized to INT2"], "answer": 0, "explain": "Scaling the weight up must be undone on the input side so that $(w\\sigma)(x/\\sigma) = wx$. The benefit comes from the scaled weight's smaller relative rounding error."}
```
