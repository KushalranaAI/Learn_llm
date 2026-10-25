---
title: Group-wise scales and the outlier problem
minutes: 8
---

One ruler for a whole weight matrix, millions of numbers long, is a bad idea if even one value is huge. The ruler must stretch to reach that value, every step becomes coarse, and all the ordinary weights get rounded to the same few marks. Two techniques fix this: use many small rulers (**groups**) and treat the biggest values specially (**outliers**).

## Why one outlier hurts

Take sixteen weights, fifteen of them ordinary (magnitude below 1.3) and one outlier of 8.0. With a single INT4 absmax scale:

$$
s = \frac{8.0}{7} = 1.143
$$

Every ordinary weight is rounded to a multiple of 1.143, and anything smaller than $s/2 = 0.57$ becomes exactly 0. In the example, 12 of the 16 weights collapse to zero and the others become $\pm 1.143$: the layer's information is gone.

Splitting into two groups of 8, each with its own scale, changes this:

```steps
Group size 8 versus one scale for all 16
Weights: group A $= [0.62, -0.31, 0.047, -1.27, 0.90, -0.05, 0.20, 0.33]$ and group B contains the outlier $8.0$ among small values.
---
One shared INT4 scale: $s = 8.0/7 = 1.143$. Group A dequantizes to $[1.143, 0, 0, -1.143, 1.143, 0, 0, 0]$. Nearly everything is lost.
---
Separate scales: group A gets $s_A = 1.27/7 = 0.181$ and keeps the accurate result from the previous topic (RMS error 0.043). Only group B suffers from its outlier.
---
Damage is contained to the group that contains the outlier. Smaller groups confine it more tightly.
```

## What groups cost

Every group stores its own scale, typically in 16 bits, so the effective bits per weight is

$$
q_{eff} = q + \frac{16}{g}
$$

with $g$ the group size (and $+32/g$ if a 16-bit zero-point is stored too).

| Group size $g$ | INT4 effective bits | Weight memory for 8B | Comment |
|---|---|---|---|
| per-tensor (no groups) | ~4.00 | 4.02 GB | Fragile; poor for LLMs |
| 128 | 4.125 | 4.14 GB | Common default |
| 64 | 4.25 | 4.27 GB | A bit more accurate |
| 32 | 4.5 | 4.52 GB | Highest accuracy, 12% more memory than no groups |

The trade-off is cheap: going from no groups to $g = 128$ costs about 3% more memory and typically recovers most of the quality lost to scale sharing. **Per-channel** quantization (one scale per output row) is the group size equal to a full row, a middle ground used for INT8.

## Outliers in real models

In large transformers a few feature dimensions of the *activations* have values tens of times bigger than the rest, and some weights are likewise much larger than typical. The LLM.int8() work found that these outliers are systematic (the same few channels, across many tokens) and matter a great deal for quality: zeroing them wrecks the model. Practical answers:

- **Mixed precision**: keep outlier columns in 16-bit and quantize the rest to 8-bit (the LLM.int8() approach), at some speed cost.
- **Smaller groups**: confine outliers' damage as above.
- **Move the difficulty**: rescale channels so weights and activations share the burden (the idea behind SmoothQuant and AWQ, next topics).

## See it

```sim
quantization
{"paramsB": 8, "format": "int4", "groupSize": "128", "outliers": true, "seed": 1}
```

The outlier toggle injects a small share of weights about 20 times larger than the rest, as real layers have. With INT4 and group size 128, note the relative error. Then try group size 32 (error falls, memory rises slightly), and group size per-tensor (the largest option) to see error blow up. Finally switch the outliers off and compare: how much of the error was caused purely by a handful of large weights?

## In practice

When someone quotes "4-bit" for a model, ask what group size and whether zero-points are stored: the file is actually 4.1 to 4.5 bits per weight. Check this against the memory figure on disk: $N \times q_{eff}/8$ should match the file size. Sizes that are far off usually mean some layers (embeddings, the output head, layer norms) were left in 16-bit, which is common and sensible: the embedding table is a small share of compute but sensitive to error.

```quiz
{"q": "An INT4 model uses group size 64 with one 16-bit scale per group. What are the effective bits per weight?", "options": ["4.25", "4.0", "4.5", "4.0625"], "answer": 0, "explain": "$q_{eff} = 4 + 16/64 = 4.25$. 4.0 ignores the scales; 4.5 is the group-size-32 case; 4.0625 would be a group size of 256."}
```

```quiz
{"q": "A single very large weight appears in a group quantized to INT4 with absmax scaling. What happens to the other weights in that group?", "options": ["Many round to zero or a coarse level, because the scale was stretched to fit the outlier", "Nothing, since each weight is quantized independently", "They are scaled up proportionally and stay accurate", "They are dropped from the model"], "answer": 0, "explain": "The scale is the group's absmax divided by 7, so a big outlier makes the step large and small weights round to zero. Weights are not quantized independently: they share the group's scale, which is exactly why small groups help."}
```
