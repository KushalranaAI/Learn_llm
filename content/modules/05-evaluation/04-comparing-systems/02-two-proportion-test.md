---
title: Is B really better than A? The two-proportion z-test
minutes: 9
---

You changed the prompt. The old one scored 78% and the new one 82%, each on 500 fresh examples. Is the 4-point gain real, or the sort of gap that two draws from the same system produce by luck? A **hypothesis test** answers this by asking a precise question: if the two systems were truly identical, how often would random sampling alone produce a gap this large or larger?

That probability is the **p-value**. The assumption "no real difference" is the **null hypothesis**. A small p-value says the data would be surprising under the null; it does not say how big or important the difference is, and it is not the probability that the null is true.

## The maths

Let system A pass $x_A$ of $n_A$ items and B pass $x_B$ of $n_B$, with observed rates $\hat p_A = x_A/n_A$ and $\hat p_B = x_B/n_B$. Under the null, both share one true rate, estimated by the **pooled** rate $\bar p = (x_A + x_B)/(n_A + n_B)$. The standard error of the difference under the null is

$$
\mathrm{SE}_0 = \sqrt{\bar p(1 - \bar p)\left(\frac{1}{n_A} + \frac{1}{n_B}\right)}, \qquad z = \frac{\hat p_B - \hat p_A}{\mathrm{SE}_0}
$$

$z$ counts how many standard errors the observed gap lies from zero. For a **two-sided** test the p-value is $2\,(1 - \Phi(|z|))$ where $\Phi$ is the standard normal cumulative distribution. As landmarks, $|z| = 1.96$ gives $p = 0.05$ and $|z| = 2.58$ gives $p = 0.01$.

```steps
78% vs 82% on 500 each
$x_A = 390$, $x_B = 410$, $n_A = n_B = 500$. Gap $= 0.82 - 0.78 = 0.04$.
---
Pooled rate: $\bar p = (390 + 410)/1000 = 0.80$.
---
$\mathrm{SE}_0 = \sqrt{0.8 \times 0.2 \times (1/500 + 1/500)} = \sqrt{0.16 \times 0.004} = \sqrt{0.00064} = 0.0253$.
---
$z = 0.04/0.0253 = 1.58$. Two-sided $p = 2(1 - \Phi(1.58)) = 0.114$.
---
Not significant at 0.05. A 4-point gap on 500 + 500 items is within what chance produces about 11% of the time. A 95% interval for the gap is $0.04 \pm 1.96 \times 0.0253 = (-0.0095, +0.0895)$: it includes zero, and it also includes a 9-point gain.
```

The last point is important. "Not significant" means the data cannot rule out zero, not that the true effect is zero. The interval says the real gain could be anywhere from slightly negative to quite large. You need more data (see the sample-size topic) or a smarter test.

## See it

```sim
ab-significance
{"pA": 0.78, "pB": 0.82, "n": 500, "alpha": "0.05"}
```

This is exactly the example above, so check the z, p-value and difference against your hand calculation. Then try three things. Raise $n$ to 1,500 with the same rates: the gap is unchanged but $z$ grows by $\sqrt{3}$ to 2.74 and the p-value falls below 0.01. Return to $n = 500$ and raise **Pass rate B** to 0.85: the gap is 7 points and the result becomes significant. Finally watch the **power** and **minimum detectable effect** readouts, which the sample-size topic explains.

## Reading the result honestly

| What you see | What it means | Common mistake |
|---|---|---|
| $p < 0.05$ | data unlikely under "no difference" | calling it "95% sure B is better" |
| $p > 0.05$ | data consistent with no difference | concluding "no difference" |
| tiny $p$, tiny gap | real but maybe negligible effect | shipping for a 0.3-point gain that costs 3× more |
| large gap, large $p$ | too little data | discarding a good idea |

Decide beforehand what size of improvement matters (the **minimum effect of interest**), and judge the interval against it. A change is worth shipping when the interval for the gap is mostly above the size that pays for itself.

Two more habits. Decide the test and the stopping point before looking: checking the p-value after every batch of examples and stopping when it dips below 0.05 inflates false positives badly (the "peeking" problem). And use a **one-sided** test only when you would act on an improvement and ignore a regression; for model changes, regressions matter, so use two-sided.

## In practice

Many LLM evals run both systems on the *same* examples. That is not two independent samples, and the unpaired test above throws away information. The next topic shows a test that uses the pairing and, for the same data, reaches a firm conclusion where this test could not.

```quiz
{"q": "System A passes 600 of 1,000 and B passes 640 of 1,000. Pooled rate is 0.62. What is $z$?", "options": ["0.04", "1.84", "2.61", "0.62"], "answer": 1, "explain": "$\\mathrm{SE}_0 = \\sqrt{0.62 \\times 0.38 \\times 0.002} = \\sqrt{0.000471} = 0.0217$ and $z = 0.04/0.0217 = 1.84$. That is $p \\approx 0.065$, not significant at 0.05."}
```

```quiz
{"q": "A test gives p = 0.03. Which statement is correct?", "options": ["There is a 3% chance the new prompt is not better", "If the systems were identical, a gap this large or larger would occur about 3% of the time", "The new prompt is better by 97%", "The effect is large"], "answer": 1, "explain": "A p-value is a probability about the data under the null, not about the hypothesis, and says nothing about effect size."}
```
