---
title: Calibrating judges in practice, and correcting for their errors
minutes: 9
---

The [agreement and kappa](/learn/evaluation/llm-as-judge/agreement-and-kappa) topic showed how to measure whether a model judge agrees with people beyond chance. This topic turns that into a working procedure for a product team, and adds one step most teams skip: once you know how a judge errs, you can correct the pass rate it reports.

A bathroom scale is a good analogy. If you know it reads 2 kg heavy, you do not throw it away; you subtract 2 kg. A judge with known error rates is still useful, as long as you have measured those rates and adjust for them.

## The procedure

```steps
Calibrating one judge for one criterion
Label: a domain expert gives PASS/FAIL to 100 to 200 outputs for this criterion, chosen to include plenty of failures (oversample them if they are rare).
---
Split: about 20% as a train pool (few-shot examples for the judge prompt), 40% dev (iterate on the prompt), 40% test (touch once, at the end).
---
Iterate on dev: run the judge, read every disagreement, sharpen the question or add an example. Stop when dev agreement stops improving.
---
Measure on test: report the 2×2 table, the true positive rate, the true negative rate and Cohen's kappa. Freeze the judge prompt and model version.
---
Re-check periodically: when the judge model, the product or the input mix changes, label a fresh sample and re-measure.
```

Keep the judge's question narrow and its output binary, and have it write a short reason before the verdict so disagreements are easy to diagnose.

## The two rates that matter

Treat PASS as the positive class. For the judge:

- **True positive rate** $\text{TPR} = P(\text{judge PASS} \mid \text{truly passes})$: how often good outputs are recognised.
- **True negative rate** $\text{TNR} = P(\text{judge FAIL} \mid \text{truly fails})$: how often bad outputs are caught.

Most judges are lenient: TPR is high and TNR lower. Kappa summarises both, but the two rates tell you which way the judge is wrong, and that is what you need to correct it.

## The maths: correcting the reported pass rate

Let $\theta$ be the true pass rate. The judge reports PASS for true passes with probability TPR and for true fails with probability $1 - \text{TNR}$, so the observed pass rate is

$$
q = \theta \cdot \text{TPR} + (1 - \theta)(1 - \text{TNR})
$$

Solving for $\theta$ gives the corrected estimate (in epidemiology this is known as the Rogan-Gladen estimator):

$$
\hat\theta = \frac{q + \text{TNR} - 1}{\text{TPR} + \text{TNR} - 1}
$$

```steps
A lenient judge, corrected
Measured on the test split: $\text{TPR} = 0.95$, $\text{TNR} = 0.60$. The judge misses 40% of real failures.
---
On this week's run the judge reports $q = 0.785$ (78.5% pass).
---
$\hat\theta = (0.785 + 0.60 - 1)/(0.95 + 0.60 - 1) = 0.385 / 0.55 = 0.70$.
---
The true pass rate is about 70%, not 78.5%. A dashboard showing the raw judge number would overstate quality by 8.5 points.
---
Caveat: TNR was estimated from the failures in your labelled sample. With only 30 labelled failures, $\text{SE}(\text{TNR}) = \sqrt{0.6 \times 0.4 / 30} = 0.089$, so the correction is itself uncertain. Label more failures before trusting the corrected number to a point.
```

The correction only works when $\text{TPR} + \text{TNR} > 1$, meaning the judge is better than a coin flip. As that sum approaches 1 the denominator shrinks and small errors in $q$ explode: a sign the judge needs work, not a correction.

```sim
judge-agreement
{"accuracy": 0.8, "positionBias": 0, "verbosityBias": 0.4, "tieBand": 0, "swapAverage": false, "seed": 7}
```

This judge has a verbosity bias. Note its agreement and kappa, then set the verbosity bias to 0 and see how much of the error came from that one bias. Then lower the accuracy to 0.65 and watch kappa fall faster than raw agreement.

## In practice

Report judge-graded results with the judge's TPR and TNR beside them, and use the corrected rate when comparing to a target. Comparisons between two system versions graded by the *same* judge are more robust than absolute numbers, because a constant bias partly cancels, but only if the judge's error rates do not differ between the versions (a judge biased towards longer answers will favour the version that writes more). Re-run calibration after any judge model upgrade: a new judge is a new instrument.

```quiz
{"q": "A judge has TPR = 0.95 and TNR = 0.75. It reports an 80% pass rate. What is the corrected true pass rate?", "options": ["About 78.6%", "80%", "76%", "About 84.2%"], "answer": 0, "explain": "θ = (q + TNR − 1)/(TPR + TNR − 1) = (0.80 + 0.75 − 1)/(0.95 + 0.75 − 1) = 0.55/0.70 = 0.786. Dividing by TPR alone (0.80/0.95 = 84.2%) ignores the failures the judge lets through, which push the observed rate up, not down."}
```

```quiz
{"q": "Why oversample failures when building a judge's calibration set?", "options": ["Failures are more interesting to read", "TNR is estimated only from true failures; if they are rare, a natural sample gives too few to measure it precisely", "It makes the judge stricter", "Kappa requires equal class sizes"], "answer": 1, "explain": "With a 5% failure rate, 200 natural samples hold only about 10 failures, so TNR would have an SE near 0.15. Oversampling failures makes TNR measurable. It does not change the judge itself, and kappa does not require balanced classes."}
```
