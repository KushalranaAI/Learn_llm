---
title: Calibration: does 80% confident mean 80% right?
minutes: 8
---

A weather forecaster who says "70% chance of rain" is useful only if, across all the days they said 70%, it rained on about 70% of them. If it rained on 40% of those days, their numbers are not probabilities you can act on, however accurate they sound. The property you want is called **calibration**: stated confidence matches observed accuracy.

Hallucination is not a disaster if you can tell when it is likely. A model whose confidence is calibrated hands you that signal for free: answer when it is confident, check or abstain when it is not. A model that is confidently wrong as often as it is confidently right gives you nothing to work with.

## The definition

Let $\hat{p}$ be the model's confidence in its answer (for example the probability of the chosen option in a multiple-choice question, or the product of probabilities of the answer tokens) and let $Y$ be 1 if the answer is correct and 0 if not. The model is **perfectly calibrated** if

$$
P(Y = 1 \mid \hat{p} = p) = p \quad \text{for every } p \in [0, 1]
$$

In words: among all answers given with confidence $p$, a fraction $p$ is correct.

You cannot check this for every exact value of $p$, so you group answers into **bins** of confidence and build a **reliability table**. For each bin $b$ with $n_b$ answers, compute the average confidence $\text{conf}_b$ and the accuracy $\text{acc}_b$ (fraction correct). The **expected calibration error** summarises the gaps, weighting each bin by its size:

$$
\text{ECE} = \sum_{b=1}^{M} \frac{n_b}{N}\,\big|\text{acc}_b - \text{conf}_b\big|
$$

where $M$ is the number of bins and $N = \sum_b n_b$ the total number of answers. ECE is 0 for a perfectly calibrated model and grows as confidence and accuracy drift apart.

## Worked example

A model answers 1,000 questions. Grouped by confidence:

| bin | $n_b$ | $\text{conf}_b$ | $\text{acc}_b$ | gap $\lvert\text{acc}_b - \text{conf}_b\rvert$ | weighted $\frac{n_b}{N}\cdot\text{gap}$ |
|---|---|---|---|---|---|
| 0.5–0.6 | 100 | 0.55 | 0.50 | 0.05 | 0.0050 |
| 0.6–0.7 | 150 | 0.65 | 0.60 | 0.05 | 0.0075 |
| 0.7–0.8 | 250 | 0.75 | 0.66 | 0.09 | 0.0225 |
| 0.8–0.9 | 300 | 0.85 | 0.74 | 0.11 | 0.0330 |
| 0.9–1.0 | 200 | 0.95 | 0.82 | 0.13 | 0.0260 |
| **total** | 1,000 | | | | **ECE = 0.094** |

Add the last column: $0.005 + 0.0075 + 0.0225 + 0.033 + 0.026 = 0.094$. The model's average confidence is $0.785$ but its overall accuracy is $0.691$. In every bin accuracy is below confidence, and the gap widens as confidence rises. This pattern is called **overconfidence**: the answers it is "95% sure" of are right only 82% of the time.

```steps
Building a reliability table from raw answers
For each question, record the model's confidence $\hat{p}$ and whether the answer was right ($Y = 1$ or $0$).
---
Sort answers into bins by $\hat{p}$, for example 10 bins of width 0.1. Skip or merge bins with very few answers; their accuracy is too noisy to read.
---
In each bin, average the confidences to get $\text{conf}_b$ and average the $Y$ values to get $\text{acc}_b$.
---
Plot $\text{acc}_b$ against $\text{conf}_b$. Perfect calibration is the diagonal; points below it mean overconfidence, above it underconfidence.
---
Compute ECE as the size-weighted average distance from the diagonal.
```

## What we know about LLM calibration

Research on large pretrained models found that their probabilities on multiple-choice answer options are reasonably well calibrated: the next-token objective is a proper scoring rule, which rewards honest probabilities. Post-training for helpfulness and instruction following has been reported to make calibration worse, pushing models towards confident answers. Two practical caveats follow. First, confidence is easy to read on a single-token answer (one letter for a multiple-choice option), and much harder for a free-form paragraph, where many token probabilities mix facts with phrasing. Second, a model's *verbal* confidence ("I'm fairly sure...") is generated text and is not the same as its token probabilities; the two can disagree.

## See it

```sim
sampling
{"temperature": 1, "topP": 1}
```

The probability of the top token is the model's confidence if you decode greedily. Change the temperature from 1 to 0.5 and the top probability rises, though nothing about what the model knows has changed. Temperature rescales confidence; if a model is overconfident at $T = 1$, raising $T$ slightly can improve calibration. Fitting one temperature on a held-out set to minimise calibration error is a standard fix called **temperature scaling**.

## In practice

Before you build anything that relies on confidence (abstention, routing to a bigger model, human review), measure calibration on a few hundred labelled examples from your own task. Use the probability of a short, constrained answer where you can: a class label, a yes/no, an option letter. Report ECE alongside accuracy, and look at the table, not just the number, because one large overconfident bin matters more than many small gaps. A common mistake is to compute confidence from the whole generated answer, where the probability of filler words drowns the probability of the one fact that matters.

```quiz
{"q": "A bin of 200 answers has average confidence 0.90 and accuracy 0.75, out of 1,000 answers in total. What does this bin contribute to ECE?", "options": ["0.15", "0.03", "0.18", "0.135"], "answer": 1, "explain": "Weighted gap = $\\frac{200}{1000} \\times |0.75 - 0.90| = 0.2 \\times 0.15 = 0.03$. 0.15 is the unweighted gap; ECE weights each bin by its share of answers."}
```

```quiz
{"q": "In a reliability plot, every point lies above the diagonal. What does that mean?", "options": ["The model is overconfident", "The model is underconfident: it is right more often than its confidence says", "The model is perfectly calibrated", "The model's accuracy is below 50%"], "answer": 1, "explain": "Above the diagonal means $\\text{acc}_b > \\text{conf}_b$: answers given with 60% confidence are right more than 60% of the time. Overconfidence is the opposite, points below the diagonal, as in the worked example."}
```
