---
title: Absmax and zero-point quantization by hand
minutes: 8
---

Squeezing real numbers into a few integers means choosing a ruler. Imagine measuring heights with a ruler marked only in whole centimetres: you pick the ruler's length to cover the tallest person, and everyone is rounded to the nearest mark. A longer ruler covers more people but each mark is further apart, so everyone is measured less precisely. Quantization has exactly that tension.

## Symmetric (absmax) quantization

To store weights $w$ as signed $b$-bit integers in $[-q_{max}, q_{max}]$, where $q_{max} = 2^{b-1} - 1$ ($127$ for 8 bits, $7$ for a symmetric 4-bit range), take the largest absolute value as the ruler's end:

$$
s = \frac{\max_i |w_i|}{q_{max}}, \qquad q_i = \operatorname{round}\!\left(\frac{w_i}{s}\right), \qquad \hat{w}_i = s \cdot q_i
$$

$s$ is the **scale** (the real value of one integer step), $q_i$ the stored integer and $\hat{w}_i$ the dequantized approximation. The rounding error of one weight is at most half a step, $|w_i - \hat{w}_i| \le s/2$.

```steps
INT8 absmax, then INT4, on eight weights
Weights: $[0.62, -0.31, 0.047, -1.27, 0.90, -0.05, 0.20, 0.33]$. The largest magnitude is $1.27$.
---
INT8: $s = 1.27/127 = 0.01$. Integers: $[62, -31, 5, -127, 90, -5, 20, 33]$. Dequantized: $[0.62, -0.31, 0.05, -1.27, 0.90, -0.05, 0.20, 0.33]$. The worst error is $0.003$ (the weight 0.047 becomes 0.05); the RMS error is $0.0011$.
---
INT4 (range $-7$ to $7$): $s = 1.27/7 = 0.1814$. Integers: $[3, -2, 0, -7, 5, 0, 1, 2]$. Dequantized: $[0.544, -0.363, 0, -1.27, 0.907, 0, 0.181, 0.363]$.
---
INT4 errors: $0.076, 0.053, 0.047, 0, 0.007, 0.05, 0.019, 0.033$. RMS error $0.043$, about 7% of the weights' own RMS size ($0.618$). INT8's is about 0.2%.
---
Going from 8 to 4 bits multiplies the step by $127/7 \approx 18$, because only 15 levels remain instead of 255.
```

For rounding errors spread evenly over a step, the error variance is $s^2/12$, so the error's RMS is $s/\sqrt{12} \approx 0.29\, s$. Because $s \propto 2^{-b}$ for a fixed range, every extra bit cuts the error in half, about 6 dB of signal-to-quantization-noise ratio per bit: INT8 has roughly 24 dB more headroom than INT4.

## Asymmetric (zero-point) quantization

If a tensor's values are not centred on zero (activations after a ReLU-like function are all positive, for instance), the symmetric ruler wastes marks on values that never occur. **Asymmetric** quantization maps $[w_{min}, w_{max}]$ onto the unsigned integers $[0, 2^b - 1]$ using a scale and a **zero-point** $z$, the integer that represents real zero:

$$
s = \frac{w_{max} - w_{min}}{2^b - 1}, \qquad z = \operatorname{round}\!\left(\frac{-w_{min}}{s}\right), \qquad q = \operatorname{clip}\!\left(\operatorname{round}\!\left(\frac{w}{s}\right) + z,\; 0,\; 2^b - 1\right), \qquad \hat{w} = s\,(q - z)
$$

```steps
Zero-point INT8 on a skewed range
Values lie in $[-0.4, 1.2]$; 8 bits means integers $0$ to $255$.
---
Scale: $s = (1.2 - (-0.4))/255 = 1.6/255 = 0.006275$.
---
Zero-point: $z = \operatorname{round}(0.4/0.006275) = \operatorname{round}(63.75) = 64$.
---
Quantize $w = 0.5$: $q = \operatorname{round}(0.5/0.006275) + 64 = 80 + 64 = 144$. Dequantize: $\hat{w} = 0.006275 \times (144 - 64) = 0.502$.
---
Compare with a symmetric ruler over the same data: $s = 1.2/127 = 0.00945$, a step 51% larger, because the symmetric range must reach $\pm 1.2$ and wastes the part below $-0.4$.
```

The price of a zero-point is a little more arithmetic in the matrix multiply (correction terms involving $z$). Weight matrices in LLMs are roughly centred on zero, so weights are usually quantized symmetrically; activations, with their skewed distributions, more often get a zero-point.

## See it

```sim
quantization
{"paramsB": 8, "format": "int8", "groupSize": "128", "outliers": false, "seed": 3}
```

The sim runs the same procedure on random weights and reports the relative error and SQNR. Compare INT8 with INT4: the SQNR should drop by roughly 24 dB (4 bits at about 6 dB each), matching the step-size argument. Then try INT3 and INT2 and see how sharply error grows once only a handful of levels remain.

## In practice

Frameworks store, for each quantized tensor (or group of weights), the integers plus the scale (and zero-point if used). At inference the kernel either dequantizes weights into BF16 just before the multiply, reading fewer bytes from HBM, or multiplies integers directly on hardware that supports it. One bug to know: truncating instead of rounding introduces a systematic bias toward zero; always round to nearest.

```quiz
{"q": "Weights have a maximum absolute value of 2.54. What is the INT8 absmax scale, and what integer does the weight 1.00 map to?", "options": ["$s = 0.02$; $q = 50$", "$s = 0.02$; $q = 127$", "$s = 0.04$; $q = 25$", "$s = 0.01$; $q = 100$"], "answer": 0, "explain": "$s = 2.54/127 = 0.02$ and $1.00/0.02 = 50$. A weight is mapped relative to the maximum, so 1.00 (about 39% of 2.54) lands near 39% of 127, not at 127."}
```

```quiz
{"q": "Moving a tensor from 8-bit to 4-bit absmax quantization (ranges $\\pm127$ and $\\pm7$), by about what factor does the step size, and so the rounding error, grow?", "options": ["About 18 times", "2 times", "4 times", "About 8 times"], "answer": 0, "explain": "The step is $\\max|w|/q_{max}$, so it scales by $127/7 \\approx 18$. Guessing 2 or 4 forgets that 4 fewer bits means $2^4 = 16$ times fewer levels."}
```
