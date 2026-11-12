---
title: Reading a leaderboard with error bars
minutes: 8
---

A leaderboard is a sorted list, and sorting hides uncertainty. Model A at 82.0% sits one row above model B at 80.0%, and the eye reads "A is better". But both numbers are estimates from a finite sample of questions, and the ordering can easily be noise. Reading a leaderboard well means asking, for every pair you care about, "is this gap bigger than the error bars?"

Sports tables have the same problem. Two football teams one point apart after ten games are not reliably different in strength; the same gap after the whole season means more. Number of questions plays the role of number of games.

## The maths: the error bar on a difference

Each score has a standard error $\text{SE}_A$, $\text{SE}_B$ (previous topic). If the two models were scored on **different** random question sets, the difference has

$$
\text{SE}_{A-B} = \sqrt{\text{SE}_A^2 + \text{SE}_B^2}
$$

Leaderboards almost always score models on the **same** questions, and per-question results are correlated: questions hard for one model tend to be hard for the other. With correlation $\rho$ between per-question scores,

$$
\text{SE}_{A-B} = \sqrt{\text{SE}_A^2 + \text{SE}_B^2 - 2\rho\,\text{SE}_A\,\text{SE}_B}
$$

Pairing removes shared question difficulty, so the error bar shrinks. Anthropic's write-up on evaluation statistics reports correlations of roughly 0.3 to 0.7 between frontier models on popular benchmarks.

```steps
Is 82% vs 80% on 500 questions a real gap?
$\text{SE}_A = \sqrt{0.82 \times 0.18 / 500} = 0.0172$. $\text{SE}_B = \sqrt{0.80 \times 0.20 / 500} = 0.0179$.
---
Treated as independent: $\text{SE}_{A-B} = \sqrt{0.0172^2 + 0.0179^2} = 0.0248$. The gap of 0.02 is $0.02 / 0.0248 = 0.81$ standard errors. Not significant.
---
Paired with $\rho = 0.5$: $\text{SE}_{A-B} = \sqrt{0.000296 + 0.000320 - 2 \times 0.5 \times 0.0172 \times 0.0179} = \sqrt{0.000308} = 0.0176$. Now $z = 1.14$.
---
Paired with $\rho = 0.7$: variance $0.000616 - 0.000431 = 0.000185$, $\text{SE}_{A-B} = 0.0136$, $z = 1.47$. Still short of 1.96. On 500 questions a 2-point gap is not established, even with pairing.
```

Two more effects make published bars too narrow. **Clustering**: when several questions share a passage or a source document, they are not independent, and Anthropic's analysis found clustered standard errors on popular evals can be more than three times the naive ones. **Sampling noise**: a model run with temperature above zero gives different answers on a rerun; averaging several runs per question reduces that component.

## Rank is the least reliable number on the page

| Model | Score | 95% CI | Statistically better models | Rank range |
|---|---|---|---|---|
| A | 82.0 | 78.6 to 85.4 | none | 1 to 3 |
| B | 80.0 | 76.5 to 83.5 | none | 1 to 3 |
| C | 79.2 | 75.6 to 82.8 | none | 1 to 3 |
| D | 71.0 | 67.0 to 75.0 | A, B, C | 4 |

A useful convention, used by arena-style leaderboards, is to report each model's rank as one plus the number of models that are statistically better than it. Under that rule A, B and C all share rank 1: the table says "three models tie at the top, one is clearly behind", which is the honest summary.

```sim
ab-significance
{"pA": 0.80, "pB": 0.82, "n": 500, "alpha": "0.05"}
```

This reproduces the 80% vs 82% comparison. Look at the p-value, then raise the sample size until the gap becomes significant: you need a few thousand questions for an unpaired comparison of a 2-point gap. Then set the two rates 5 points apart and see how much smaller $n$ can be.

## In practice

Before acting on a leaderboard gap, check: the number of items, whether intervals are shown (and whether they account for clustering), whether all models were run with the same protocol, and the date of each entry, since hosted models change behind a fixed name. For decisions that matter, rerun the top candidates yourself on your own questions, paired, with several samples per question. The [paired comparisons](/learn/evaluation/comparing-systems/paired-comparisons) topic shows how.

```quiz
{"q": "Two models are 3 points apart. Each score has SE = 0.02, and per-question results correlate at ρ = 0.6. What is the SE of the difference?", "options": ["0.040", "0.028", "0.018", "0.012"], "answer": 2, "explain": "Var = 0.02² + 0.02² − 2 × 0.6 × 0.02 × 0.02 = 0.0004 + 0.0004 − 0.00048 = 0.00032, so SE = 0.0179. The gap is 0.03/0.018 = 1.7 SE, still below 1.96. 0.028 ignores the pairing."}
```

```quiz
{"q": "Why is an unpaired error bar on a difference usually too pessimistic for a leaderboard?", "options": ["Leaderboards use more questions than papers", "Both models answer the same questions and their per-question results are positively correlated, which cancels shared difficulty", "Leaderboard scores have no sampling noise", "Models are always run at temperature 0"], "answer": 1, "explain": "Positive correlation ρ subtracts 2ρ·SE_A·SE_B from the variance of the difference. The other options are false: leaderboard scores do have noise, and many runs use non-zero temperature."}
```
