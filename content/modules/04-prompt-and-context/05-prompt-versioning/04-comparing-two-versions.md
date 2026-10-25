---
title: Is the new version really better?
minutes: 9
---

You rewrite a prompt and run the golden set. Version A passes 176 of 200 (88%). Version B passes 186 of 200 (93%). Five points, and B looks like a clear win. Is it? Or could two identical prompts, tested on a different 200 cases each, plausibly differ by that much by chance?

The honest answer comes from asking how large a difference noise alone would produce, and comparing the observed difference with that.

## The maths: a two-proportion test

Let the observed pass rates be $\hat{p}_A$ and $\hat{p}_B$ on $n$ cases each. The difference $d = \hat{p}_B - \hat{p}_A$ has standard error

$$
\text{SE}(d) = \sqrt{\frac{\hat{p}_A(1-\hat{p}_A)}{n} + \frac{\hat{p}_B(1-\hat{p}_B)}{n}}, \qquad z = \frac{d}{\text{SE}(d)}
$$

The statistic $z$ counts how many standard errors the difference is away from zero. A two-sided test at significance level $\alpha = 0.05$ calls the difference significant when $|z| > 1.96$.

```steps
A 5-point improvement on 200 cases per version
$\hat{p}_A = 0.88$, $\hat{p}_B = 0.93$, so $d = 0.05$.
---
$\text{SE}(d) = \sqrt{\dfrac{0.88 \times 0.12}{200} + \dfrac{0.93 \times 0.07}{200}} = \sqrt{0.000528 + 0.0003255} = \sqrt{0.0008535} = 0.0292$.
---
$z = 0.05 / 0.0292 = 1.71$. That is below 1.96, so the **two-sided p-value is about 0.087**: not significant at the 5% level.
---
Meaning: if the two prompts were truly equal, a gap this large would appear by chance roughly 9% of the time. It is suggestive, not proof.
```

The result is not "B is not better". It is "this test cannot tell". That distinction is the **power** of the test: the probability of detecting a real difference of a given size. With 200 per arm and a true difference of exactly 5 points (88% vs 93%), the power is only about 40%. You would miss a real 5-point improvement six times out of ten.

To plan a test, the sample size per version needed to detect a true difference between rates $p_A$ and $p_B$ with significance $\alpha$ (two-sided, $z_{\alpha/2} = 1.96$) and power 80% ($z_{\beta} = 0.84$) is

$$
n = \frac{(z_{\alpha/2} + z_\beta)^2 \,\big[p_A(1-p_A) + p_B(1-p_B)\big]}{(p_B - p_A)^2}
$$

For $p_A = 0.88$ and a smaller target $p_B = 0.91$ (3 points): $n = \dfrac{(1.96 + 0.84)^2 \times (0.1056 + 0.0819)}{0.03^2} = \dfrac{7.84 \times 0.1875}{0.0009} \approx 1{,}633$ cases per version. Rounding $z$ slightly differently gives 1,635. Detecting a 3-point gain at 88% needs about 1,600 cases per arm, eight times the golden set above.

```sim
ab-significance
{"pA": 0.88, "pB": 0.93, "n": 200, "alpha": "0.05"}
```

The sim starts at exactly the example above: 88% against 93% with 200 cases each. Read the z-score and the p-value (about 1.71 and 0.087), then raise the samples per arm. Find the smallest sample size where the difference becomes significant (roughly 265 per arm for this gap). Then set B to 0.91 and find the sample size you need now. The minimum detectable effect, the smallest gap the test can reliably see, shrinks as the sample grows.

## A sharper tool: compare on the same cases

A and B are usually run on the **same** golden cases. Many cases are easy for both and hard for both; they carry no information about which prompt is better. What matters is the **discordant** cases, where exactly one version passes. Counting them gives **McNemar's test**.

Suppose that, of the 200 cases, 6 pass only under A and 16 pass only under B (this reproduces 176 versus 186 passes). Under the null hypothesis that the prompts are equal, each discordant case is equally likely to favour either version, like a fair coin. With 22 discordant cases, the chance of 16 or more going to B is a binomial tail:

$$
P(X \ge 16 \mid n = 22, p = 0.5) \approx 0.026, \qquad \text{two-sided } p \approx 2 \times 0.026 = 0.052
$$

Pairing gives a p-value of about 0.052 instead of 0.087, because it ignores the noise from cases both versions handle identically. It is closer to the 5% line, but still not past it. The practical lesson stands: a 5-point gain on 200 cases is borderline evidence, and collecting more cases, or looking at the 22 discordant cases by hand to see what B fixed and what it broke, is more informative than trusting the headline numbers.

```callout-tip
Read the discordant cases
Before any statistics, open the 6 cases where only A passed and the 16 where only B passed. If B's wins share a pattern (all refund requests) and A's wins share another (all non-English), you have learned more than a p-value can say, and you can write the next prompt change with that in mind.
```

## In practice

- **Decide the comparison before you look.** Choose the metric, the sample size and the threshold first. Trying many variants and reporting the best one inflates false wins (the next topic quantifies it).
- **Same cases, same settings.** Fix temperature and seed where you can, run both versions on identical inputs, and pair the results.
- **Require a practical size.** A significant 0.5-point gain that costs 400 extra tokens is not worth shipping. Set a minimum effect that matters, and a cost or latency budget.

```quiz
{"q": "With pass rates 0.80 and 0.85 on 100 cases each, SE(d) = √(0.8×0.2/100 + 0.85×0.15/100) ≈ 0.0537. What is z, and is the difference significant at the 5% level (|z| > 1.96)?", "options": ["z ≈ 0.93; not significant", "z ≈ 1.96; just significant", "z ≈ 2.5; significant", "z ≈ 0.05; not significant"], "answer": 0, "explain": "z = 0.05 / 0.0537 ≈ 0.93, well under 1.96. A 5-point gap on only 100 cases per version is well within chance variation. Reporting 0.05 as z confuses the difference with the z-score."}
```

```quiz
{"q": "On the same 300 cases, 10 pass only under version A and 30 pass only under version B. What does McNemar-style reasoning say about the 40 discordant cases?", "options": ["Under no difference they would split about 20/20, so a 10/30 split is strong evidence for B", "The 260 cases both versions got the same should be included in the test", "10/30 is exactly what chance produces", "B is better by 30 points"], "answer": 0, "explain": "Only discordant cases carry information. Under equality each is a fair coin, so the expected split is 20/20. A 10/30 split has a two-sided p-value around 0.002. The net gain is (30 − 10)/300 ≈ 6.7 points, not 30."}
```
