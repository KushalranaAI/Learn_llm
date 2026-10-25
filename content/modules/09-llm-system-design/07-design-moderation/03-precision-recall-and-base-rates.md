---
title: Precision, recall and the base-rate trap
minutes: 10
---

A classifier with 95% recall and a 2% false-positive rate sounds excellent. On a platform where 0.5% of posts violate policy, **four out of five of the posts it flags are innocent.** This is the single most important number-sense point in moderation, and interviewers check whether you see it coming.

## Definitions

For one policy class, define the confusion counts over a day: $TP$ (violations flagged), $FP$ (fine posts flagged), $FN$ (violations missed), $TN$ (fine posts passed).

$$
\text{recall} = \frac{TP}{TP + FN}, \qquad
\text{FPR} = \frac{FP}{FP + TN}, \qquad
\text{precision} = \frac{TP}{TP + FP}
$$

Recall and FPR are properties of the classifier alone: they do not change with traffic mix. **Precision does change**, because it depends on how many fine posts there are. Let $\pi$ be the **base rate** (the share of posts that truly violate). Bayes' rule gives precision directly:

$$
\text{precision} = \frac{\text{recall}\cdot \pi}{\text{recall}\cdot \pi + \text{FPR}\cdot(1-\pi)}
$$

The numerator is the violations you catch per post; the denominator adds the innocent posts you flag per post. When $\pi$ is tiny, the second term in the denominator dominates unless FPR is tiny too.

```steps
Precision at a 0.5% base rate
Set recall $= 0.95$, FPR $= 0.02$, $\pi = 0.005$.
---
Caught violations per post: $0.95 \times 0.005 = 0.00475$.
---
Falsely flagged fine posts per post: $0.02 \times 0.995 = 0.0199$.
---
Precision $= 0.00475 / (0.00475 + 0.0199) = 0.00475 / 0.02465 = 0.1927$, so **19.3%**.
---
Over 50M posts a day: 250,000 violations, of which 237,500 are caught and 12,500 missed. The 2% FPR flags $0.02 \times 49{,}750{,}000 = 995{,}000$ fine posts. Total flagged: 1,232,500. Fewer than one in five is a real violation.
```

## What it does to the human queue

If every flagged post went to a reviewer at 30 seconds each, that is $1{,}232{,}500 \times 30 / 3{,}600 = 10{,}271$ hours a day, about **1,284 full-time reviewers**, of whom 80% spend their shift reading innocent posts. Now improve only the FPR, from 2% to 0.2%, keeping recall:

| FPR | Fine posts flagged | Total flagged | Precision | Reviewers (8 h shifts) |
|---|---|---|---|---|
| 2% | 995,000 | 1,232,500 | 19.3% | 1,284 |
| 0.2% | 99,500 | 337,000 | 70.5% | 351 |

Ten times fewer false positives cut the queue by almost four times and more than tripled precision. When violations are rare, **the false-positive rate is what you pay for**.

## See it

The simulation below places two score distributions (benign, violating) against a threshold and recomputes everything per 10,000 items. The starting parameters reproduce the 95% recall and 2% FPR above.

```sim
guardrail-threshold
{"threshold": 0.55, "separation": 3.7, "baseRate": 0.005, "costFalseBlock": 2, "costMiss": 100}
```

Try these in order. First, read precision and recall at the start: about 19% and 95%. Second, raise the threshold to 0.9: recall falls to about 36%, but precision rises to about 99%, because almost no fine post scores that high. Third, raise the base rate to 0.05 (a tenfold increase) at the original threshold, and watch precision jump: the same classifier is far more trustworthy on a more violating population. Fourth, lower the separation to 2.5 to see what a weaker model does to both curves at once.

## Choosing the threshold by cost

Different mistakes cost different amounts. Let $c_{FB}$ be the cost of a false block and $c_{M}$ the cost of a missed violation. The expected cost per item at a threshold is

$$
\text{cost} = (1-\pi)\,\text{FPR}\cdot c_{FB} + \pi\,(1-\text{recall})\cdot c_M
$$

The sim models scores as two bell curves a distance $d$ apart in log-odds space, and in that model the cost-minimising log-odds threshold is $x^\* = \frac{1}{d}\ln\frac{(1-\pi)\,c_{FB}}{\pi\,c_M}$. With $c_{FB}=2$, $c_M = 100$, $\pi = 0.005$, $d = 3.7$:

$$
x^\* = \frac{1}{3.7}\ln\frac{0.995 \times 2}{0.005 \times 100} = \frac{1}{3.7}\ln 3.98 = 0.373
$$

which is a score threshold of $\sigma(0.373) = 0.59$. Note how little the optimum moves from the default 0.55: the 50-to-1 cost ratio is almost cancelled by the 199-to-1 prevalence ratio. If misses were costed at 5,000 instead of 100, the optimum would fall to a score near 0.3, and the review queue would grow.

## Per-class, not global

Run the arithmetic **per class**. Spam is common (perhaps 3% of posts) so even a modest classifier has decent precision; self-harm is rare (0.05%), so the same FPR gives terrible precision, and the answer is a lower threshold plus human review, not automated removal. Report a table of recall, precision, and queue size per class; a single blended F1 hides the classes that matter.

## In practice

Production dashboards track **flag volume** and **precision from audited samples** next to recall. A sudden doubling of flags without a change in traffic usually means a classifier drift, a new slang term, or a data pipeline bug, not a doubling of violations. And remember the asymmetry in what you can measure: precision is estimable from what you flagged (review a sample), but recall requires labelling items you did not flag, which needs the stratified audits described later in this lesson.

```quiz
{"q": "Recall 90%, false-positive rate 1%, base rate 1%. What is the precision?", "options": ["About 90%", "About 47.6%", "About 9%", "About 99%"], "answer": 1, "explain": "Caught per post: 0.9 × 0.01 = 0.009. False flags per post: 0.01 × 0.99 = 0.0099. Precision = 0.009 / 0.0189 ≈ 0.476. Quoting 90% confuses precision with recall; 99% confuses it with 1 − FPR (specificity)."}
```

```quiz
{"q": "A classifier is deployed unchanged on a community whose true violation rate is ten times higher. Which metric changes?", "options": ["Recall rises and FPR falls", "Precision rises; recall and FPR are unchanged", "Nothing changes", "Recall falls; precision is unchanged"], "answer": 1, "explain": "Recall and FPR are conditional on the true class, so they stay the same. Precision depends on the mix of classes through the base rate and rises when violations are more common."}
```
