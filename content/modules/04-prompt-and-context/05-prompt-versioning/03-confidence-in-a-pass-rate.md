---
title: Confidence intervals for a pass rate
minutes: 8
---

Your golden set returns 184 passes out of 200 cases. The pass rate is 92%. But that is one sample: run the same prompt on another 200 equally good cases and you might see 89% or 95%. A **confidence interval** puts honest bounds on that wobble. It says: given what we observed, these are the true pass rates that remain plausible.

Reporting "92%" with no interval invites two mistakes. Declaring that a version with 93% beats one with 92% (the difference is well inside the noise), and being falsely reassured by a high number from a small set.

## The maths: two intervals

Let $\hat{p} = K/n$ be the observed pass rate. The simple **normal (Wald) interval** is

$$
\hat{p} \pm z \sqrt{\frac{\hat{p}(1 - \hat{p})}{n}}
$$

with $z = 1.96$ for 95% confidence.

```steps
Worked example: 184 passes in 200 cases
$\hat{p} = 184 / 200 = 0.92$.
---
Standard error: $\sqrt{0.92 \times 0.08 / 200} = \sqrt{0.000368} = 0.01918$.
---
Margin: $1.96 \times 0.01918 = 0.0376$. Interval: $0.92 \pm 0.0376$, that is **88.2% to 95.8%**.
---
So a 92% measured on 200 cases is compatible with a true rate anywhere from about 88% to 96%.
```

The Wald interval behaves badly when $\hat{p}$ is near 0 or 1, which is exactly where good prompts live. At 50 passes out of 50, it says $1.00 \pm 0$, a width of zero, which is absurd: 50 successes do not prove the true rate is 100%. The **Wilson interval** fixes this. With $\tilde{p} = \dfrac{\hat{p} + z^2/(2n)}{1 + z^2/n}$ and half-width $h = \dfrac{z}{1 + z^2/n}\sqrt{\dfrac{\hat{p}(1-\hat{p})}{n} + \dfrac{z^2}{4n^2}}$, it is $\tilde{p} \pm h$.

| Passes / cases | Observed | Wald 95% | Wilson 95% |
|---|---|---|---|
| 184 / 200 | 92.0% | 88.2% to 95.8% | 87.4% to 95.0% |
| 48 / 50 | 96.0% | 90.6% to 100% | 86.5% to 98.9% |
| 50 / 50 | 100% | 100% to 100% | 92.9% to 100% |

The Wilson interval is more cautious near the edges and never claims certainty. For the perfect 50 / 50 run, it says the true pass rate could be as low as about 93%.

```callout-key
The rule of three
If you see zero failures in $n$ independent trials, the 95% upper bound on the true failure rate is about $3/n$. After 50 clean cases, the failure rate could still be as high as 6%. After 300 clean cases, about 1%. "No failures in testing" is a statement about how much you tested.
```

## Reading intervals for decisions

- **A threshold check.** If your requirement is "at least 90% of tickets triaged correctly", the lower bound of the interval is what you should compare with 90%, not the point estimate. With 184 / 200 the Wilson lower bound is 87.4%, so you cannot yet claim 90%.
- **Overlap is not a test.** Two intervals can overlap and the difference can still be significant, so use the comparison test in the next topic rather than eyeballing.
- **More cases, tighter interval.** Quadrupling $n$ halves the width. Going from 200 to 800 cases at the same 92% brings the Wald half-width from 3.8 to 1.9 points.

```sim
ab-significance
{"pA": 0.92, "pB": 0.92, "n": 200, "alpha": "0.05"}
```

The sim starts with identical pass rates of 92% and 200 cases per arm, so the difference is zero. Read the interval around each pass rate and note how wide it is. Then raise the number of samples to 800 and then 3,200 and watch each interval narrow by half each time.

## In practice

Report pass rates as "92% (88 to 95, n = 200)". When someone asks whether a result is good enough, the interval's lower bound is the number that answers. In dashboards, draw error bars on pass-rate charts; a line that jitters by 2 points week to week is usually noise, and error bars show it.

```quiz
{"q": "A prompt passes 60 of 60 golden cases. What is the best statement about its true failure rate?", "options": ["With 95% confidence it is at most about 5%, since 3/60 = 5%", "It is exactly 0%", "It is at most 0.5%", "Nothing can be said from 60 cases"], "answer": 0, "explain": "The rule of three gives an upper bound of about 3/n = 3/60 = 5%. Concluding 0% mistakes 'no failures observed' for 'no failures possible'."}
```

```quiz
{"q": "Observed 92% on 200 cases gives a 95% interval of about 88% to 96%. Your requirement is 'at least 90%'. What can you claim?", "options": ["Not yet: the interval includes values below 90%, so more cases are needed", "Yes, because 92% is above 90%", "Yes, because the intervals overlap with 90%", "No, because 92% is below 96%"], "answer": 0, "explain": "The lower bound, about 88%, is below the requirement, so the data does not yet exclude a true rate under 90%. Judging by the point estimate ignores sampling noise."}
```
