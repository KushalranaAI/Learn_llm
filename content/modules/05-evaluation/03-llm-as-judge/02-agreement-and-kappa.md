---
title: Agreement with humans and Cohen's kappa
minutes: 9
---

To trust a judge you compare it with people. Take a sample of outputs that humans have labelled pass or fail, run the judge on the same sample, and count how often they give the same verdict. That share is the **agreement rate** (also called percent agreement), $p_o$.

Agreement alone can flatter a judge badly. Imagine 95% of outputs are good. A "judge" that ignores the output and always says *pass* agrees with humans 95% of the time. It has learned nothing. Some agreement happens **by chance** whenever both raters say *pass* a lot, so we need a measure that subtracts the agreement you would expect from two raters guessing with their own pass rates. That measure is **Cohen's kappa**, $\kappa$.

## The maths

Put the two raters' verdicts in a 2×2 table with $N$ items. Let $p_o$ be the observed share of items where they agree. If the judge says *pass* with overall rate $q_J$ and the human with rate $q_H$, then two raters choosing independently would both say *pass* with probability $q_J q_H$ and both say *fail* with probability $(1 - q_J)(1 - q_H)$. The **chance agreement** is

$$
p_e = q_J\, q_H + (1 - q_J)(1 - q_H)
$$

and kappa is the share of the possible improvement over chance that was actually achieved:

$$
\kappa = \frac{p_o - p_e}{1 - p_e}
$$

$\kappa = 1$ is perfect agreement, $\kappa = 0$ is no better than chance, and negative values mean systematic disagreement. For more than two categories, $p_e$ sums $q_J(k)\,q_H(k)$ over every category $k$.

```steps
Kappa for 100 judged outputs
Counts: both pass 60; judge pass, human fail 10; judge fail, human pass 5; both fail 25.
---
Observed agreement: $p_o = (60 + 25)/100 = 0.85$.
---
Marginals: judge passes $60 + 10 = 70$, so $q_J = 0.70$; human passes $60 + 5 = 65$, so $q_H = 0.65$.
---
Chance agreement: $p_e = 0.70 \times 0.65 + 0.30 \times 0.35 = 0.455 + 0.105 = 0.56$.
---
$\kappa = (0.85 - 0.56)/(1 - 0.56) = 0.29/0.44 = 0.66$.
```

| | Human pass | Human fail | Total |
|---|---|---|---|
| **Judge pass** | 60 | 10 | 70 |
| **Judge fail** | 5 | 25 | 30 |
| **Total** | 65 | 35 | 100 |

Now the trap. Take a system where nearly everything passes: both pass 90, judge pass/human fail 4, judge fail/human pass 3, both fail 3. Agreement is higher, $p_o = 0.93$, but $q_J = 0.94$, $q_H = 0.93$, so $p_e = 0.94 \times 0.93 + 0.06 \times 0.07 = 0.878$ and

$$
\kappa = \frac{0.93 - 0.878}{1 - 0.878} = 0.42
$$

The judge agrees more often yet is worse at the thing you need: spotting the rare failures. It caught only 3 of the 7 human fails.

## How to read a kappa

A widely quoted rough scale (from Landis and Koch) calls 0.41 to 0.60 *moderate*, 0.61 to 0.80 *substantial* and above 0.80 *almost perfect*. Better than any fixed scale is a direct comparison: have two humans label the same items and compute their kappa. If humans agree with each other at $\kappa = 0.7$, a judge at 0.65 is close to the ceiling the task allows; a judge at 0.4 is not.

## See it

```sim
judge-agreement
{"accuracy": 0.85, "positionBias": 0, "verbosityBias": 0, "tieBand": 0, "swapAverage": false, "seed": 11}
```

This starts with an unbiased judge of skill 0.85. Note the agreement and kappa. Lower the judge skill to 0.65 and watch kappa fall much faster than agreement: chance agreement stays, so kappa strips away more of what remains. Then raise **Position bias** to 0.6 and watch both drop, even though the judge's underlying skill did not change.

## In practice

Report agreement, kappa and the full 2×2 table, and also the judge's precision and recall for the *fail* class: in most evals, catching failures is the point. Compute everything on a sample that reflects the real mix of outputs, and with at least a couple of hundred items; kappa from 30 items has an uncertainty of several tenths. If kappa is low, read the disagreements: they usually reveal an ambiguous rubric item that humans also disagree on.

```quiz
{"q": "Judge and human agree on 80 of 100 items. The judge passes 50% of items and the human passes 60%. What is kappa?", "options": ["0.80", "0.60", "0.50", "0.40"], "answer": 1, "explain": "$p_e = 0.5 \\times 0.6 + 0.5 \\times 0.4 = 0.30 + 0.20 = 0.50$. $\\kappa = (0.80 - 0.50)/(1 - 0.50) = 0.60$. Reporting 0.80 confuses agreement with kappa."}
```

```quiz
{"q": "A judge that always outputs 'pass' is tested on a set where humans pass 90%. What are its agreement and kappa?", "options": ["90% and 0.90", "90% and 0", "50% and 0", "100% and 1"], "answer": 1, "explain": "It agrees on the 90% humans passed, so $p_o = 0.9$. With $q_J = 1$: $p_e = 1 \\times 0.9 + 0 \\times 0.1 = 0.9$, so $\\kappa = 0/(0.1) = 0$. Kappa correctly reports that it knows nothing."}
```
