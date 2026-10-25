---
title: Loss falls as a power law
minutes: 7
---

```callout-before
Before you start
You need the pretraining loss from the previous lesson and a working memory of logarithms: $\log(xy) = \log x + \log y$ and $\log(x^k) = k \log x$.
```

Train a family of language models that differ only in size, each on plenty of data, and plot the final loss against the number of parameters. The points do not scatter. They fall on a smooth curve so regular that you can fit it on small models and predict the loss of a model a hundred times larger before training it. The same happens when you vary the amount of data, or the total compute. This regularity is what people mean by **scaling laws**, and it turned training large models from a gamble into an engineering plan.

The shape of the curve is a **power law**: every time you multiply the model size by a constant factor, the loss (more precisely, the part of the loss that can still be removed) shrinks by a constant factor. Doubling helps, but each doubling helps by the same ratio, so the absolute gains get smaller and smaller.

## The equation

A power law with an irreducible floor looks like this:

$$
L(N) = E + \frac{A}{N^{\alpha}}
$$

Here $N$ is the number of parameters, $L$ the loss, $E$ the **irreducible loss** (the entropy of text itself: even a perfect model cannot predict a coin flip someone wrote down), $A$ a constant setting the scale, and $\alpha > 0$ the **exponent** that says how fast loss falls. The term $A/N^{\alpha}$ is the **reducible loss**.

Multiply $N$ by a factor $k$ and the reducible loss is multiplied by $k^{-\alpha}$:

$$
\frac{A/(kN)^{\alpha}}{A/N^{\alpha}} = k^{-\alpha}
$$

With $\alpha = 0.34$ (the value fitted in the Chinchilla paper for the parameter term), doubling the model multiplies the reducible loss by $2^{-0.34} \approx 0.79$: a 21% cut. Making it ten times larger multiplies it by $10^{-0.34} \approx 0.46$. Notice what does **not** happen: the loss never drops below $E$, however large $N$ becomes.

## Why log-log plots show straight lines

Take logs of the reducible part, $L - E = A N^{-\alpha}$:

$$
\log(L - E) = \log A - \alpha \log N
$$

That is a straight line in $\log N$ with slope $-\alpha$. So on axes where both scales are logarithmic, a power law is a line, and its steepness is the exponent. This is the plot you will see in every scaling paper, and the one you can make yourself from a handful of small runs.

```steps
Reading an exponent off two runs
Suppose you know $E$ and measure the reducible loss $L - E$ for two model sizes: $0.50$ at $N = 10^8$ and $0.35$ at $N = 10^9$.
---
The slope on a log-log plot is $\dfrac{\log_{10}(0.35) - \log_{10}(0.50)}{\log_{10}(10^9) - \log_{10}(10^8)} = \dfrac{\log_{10}(0.70)}{1} = -0.155$.
---
So $\alpha \approx 0.155$: each tenfold increase in parameters multiplies the reducible loss by $10^{-0.155} \approx 0.70$.
---
Predict $N = 10^{11}$, two more decades: $0.35 \times 0.70^2 \approx 0.17$. That is the whole method in miniature, with the obvious caveat that two points cannot tell you whether the line keeps going.
```

## Three axes, one regularity

The same pattern appears for **data** $D$ (tokens) when the model is large enough, and for **compute** $C$ (FLOPs) when model size and data are chosen well for each budget. Early work (Kaplan et al., 2020) fitted separate power laws in $N$, $D$ and $C$ with small exponents, around 0.05 to 0.1 in their parameterisation without a floor. The exponents differ between papers because the setups and the formulas differ, but the qualitative message is the same everywhere:

| Axis | Grows | Reducible loss |
|---|---|---|
| Parameters $N$ | ×10 | × a constant below 1 |
| Tokens $D$ | ×10 | × a constant below 1 |
| Compute $C$ (well allocated) | ×10 | × a constant below 1 |

The scaling-laws simulation plots these curves. Open it now just to see the shape; the next topics explain the controls.

```sim
scaling-laws
```

Increase the model size by factors of 10 and watch the loss: each step is smaller than the last, and the curve flattens toward a floor. Then do the same with the number of tokens.

## In practice

Teams use scaling laws to make decisions before spending money: fit curves on runs costing hundreds of GPU-hours, then extrapolate to a run costing millions. They also use them to judge changes. An architecture or data tweak that shifts the whole line down (a constant-factor gain at every scale) is valuable; one that helps only small models and whose advantage shrinks with size usually is not worth adopting.

```quiz
{"q": "Reducible loss follows $A/N^{\\alpha}$ with $\\alpha = 0.5$. You make the model 4 times larger. What happens to the reducible loss?", "options": ["It halves", "It falls to a quarter", "It falls by 0.5", "It does not change"], "answer": 0, "explain": "The factor is $4^{-0.5} = 1/2$. A quarter would need $\\alpha = 1$. A power law multiplies the loss by a factor; it does not subtract a fixed amount."}
```

```quiz
{"q": "On a log-log plot of reducible loss against parameters, model family X has a steeper line than family Y. What does that mean?", "options": ["X has a larger exponent α, so it gains more from each increase in size", "X has a higher irreducible loss", "X is always better than Y at every size", "X was trained on more data"], "answer": 0, "explain": "The slope of the log-log line is $-\\alpha$, so steeper means a larger exponent and faster improvement with scale. It says nothing about the floor $E$, and X can still be worse at small sizes if its line starts higher."}
```
