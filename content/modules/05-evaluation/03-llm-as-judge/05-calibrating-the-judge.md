---
title: Calibrating a judge and correcting its pass rate
minutes: 8
---

Suppose the judge says 72% of outputs pass. Is the real pass rate 72%? Only if the judge never makes mistakes. A judge is a classifier, and classifiers have a **true positive rate** (the share of truly good outputs it passes, also called sensitivity) and a **false positive rate** (the share of truly bad outputs it wrongly passes). A judge that is lenient will overstate quality; one that is harsh will understate it.

You can estimate those two rates from a small human-labelled sample, and then use them to correct the number the judge reports on the thousands of items humans never saw. That is **judge calibration** in the sense of "calibrating a measuring instrument", the same idea as zeroing a scale.

## The maths: undoing the judge's errors

Let $p$ be the true pass rate we want. Let $\text{TPR}$ be the probability the judge passes an output that humans call good, and $\text{FPR}$ the probability it passes one humans call bad. The judge's observed pass rate $q$ is a mixture:

$$
q = p\cdot\text{TPR} + (1 - p)\cdot\text{FPR}
$$

Solve for $p$:

$$
p = \frac{q - \text{FPR}}{\text{TPR} - \text{FPR}}
$$

This is a standard correction for imperfect classifiers (it appears in epidemiology as the Rogan-Gladen estimator). It needs $\text{TPR} > \text{FPR}$, i.e. a judge better than chance.

```steps
Correcting a judge-reported 72%
First, calibrate on 200 human-labelled outputs: 140 humans call good, 60 bad.
---
The judge passes 126 of the 140 good ones: $\text{TPR} = 126/140 = 0.90$. It passes 12 of the 60 bad ones: $\text{FPR} = 12/60 = 0.20$.
---
On the full run the judge passes 72% of outputs: $q = 0.72$.
---
$p = (0.72 - 0.20)/(0.90 - 0.20) = 0.52/0.70 = 0.743$. The corrected pass rate is about 74%, not 72%.
---
Check by running it forward: $0.743 \times 0.90 + 0.257 \times 0.20 = 0.669 + 0.051 = 0.72$. It reproduces what the judge reported.
```

The correction here is small because the judge's mistakes partly cancel. Compare a judge with $\text{TPR} = 0.95$ and $\text{FPR} = 0.40$ reporting $q = 0.80$: $p = 0.40/0.55 = 0.727$. A lenient judge overstated quality by 7 points. In general, correction matters most when FPR is high or when the pass rate is near the extremes.

## Uncertainty gets worse, not better

Correcting the point estimate does not make it more precise. It divides the judge's noise by $\text{TPR} - \text{FPR}$, so a weak judge amplifies uncertainty: with $\text{TPR} - \text{FPR} = 0.7$ the standard error of $p$ is the standard error of $q$ divided by 0.7, about 43% larger. The TPR and FPR themselves come from a small sample and carry their own error. This is why validation sets should contain at least 100 human-labelled items in *each* class.

## Calibrating scores, not just verdicts

If the judge emits a score (for instance a 1 to 5 grade, or a probability), check it is **calibrated**: among items scored 4, does the share humans call good match what a 4 should mean? Bin the items by judge score and compare with the human pass rate in each bin:

| Judge score | Items | Human pass rate |
|---|---|---|
| 1–2 | 30 | 7% |
| 3 | 50 | 36% |
| 4 | 70 | 71% |
| 5 | 50 | 94% |

Here the judge is monotonic (higher scores are better), which is what matters for ranking. But a "4" means about 71% good, so "score ≥ 4 means pass" is a threshold you have *measured*, not assumed. Pick the cut-off that gives the precision and recall you need, exactly as in the thresholds topic of lesson 1.

```sim
judge-agreement
{"accuracy": 0.75, "positionBias": 0, "verbosityBias": 0, "tieBand": 0.3, "swapAverage": false, "seed": 11}
```

This setting gives a weaker judge that sometimes declines to choose (tie band 0.3). Move **Judge skill** between 0.65 and 0.95 and watch kappa; then widen the tie band and note how many verdicts become ties. A wide tie band raises precision on the verdicts it does give but leaves more pairs undecided.

## In practice

Keep a **gold set** of a few hundred human-labelled items. Re-run the judge on it whenever the judge prompt or model changes, and recompute TPR, FPR and kappa; this is a regression test for your measuring instrument. If the numbers move, scores before and after are not comparable until you correct or re-run them. Use judge-reported numbers for comparisons (where biases partly cancel) and corrected numbers when an absolute pass rate matters, such as a release gate or a report to stakeholders.

```quiz
{"q": "A judge has TPR 0.80 and FPR 0.10 and reports a pass rate of 0.45. What is the corrected pass rate?", "options": ["0.45", "0.50", "0.55", "0.35"], "answer": 1, "explain": "$p = (0.45 - 0.10)/(0.80 - 0.10) = 0.35/0.70 = 0.50$. Check: $0.5 \\times 0.8 + 0.5 \\times 0.1 = 0.45$."}
```

```quiz
{"q": "After correcting a judge's pass rate, what happens to the uncertainty of the estimate?", "options": ["It disappears", "It shrinks because humans were involved", "It grows, scaled up by roughly $1/(\\text{TPR} - \\text{FPR})$", "It is unchanged"], "answer": 2, "explain": "The correction divides the judge's sampling noise by $\\text{TPR} - \\text{FPR}$, which is less than 1, and the estimated TPR and FPR add their own error."}
```
