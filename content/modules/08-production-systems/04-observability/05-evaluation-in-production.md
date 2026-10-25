---
title: Measuring quality in production
minutes: 8
---

Latency, cost and errors are easy to read from logs. **Quality** is not: a wrong but fluent answer returns a 200 status in 400 ms. To know whether the system is good you have to grade some of its real answers, continuously. The offline evaluation set tells you what to expect before launch; **production evaluation** tells you what is actually happening.

## Four sources of quality signal

| Signal | Cost | Coverage | Bias |
|---|---|---|---|
| Automatic checks (schema valid, citations exist, tests pass) | very low | 100% | only catches structural failures |
| User feedback (thumbs, edits, regenerate, escalate to human) | free | 1–5% of users | skews to angry or delighted |
| LLM-as-judge on sampled traffic | low | 5–10% | judge bias, drifts with judge version |
| Human review of a random sample | high | 0.1% | the ground truth to calibrate the rest |

Use them in layers: cheap signals to detect change fast, the judge to scale, the human sample to keep the judge honest. The judging lesson in the evaluation module explains how to measure judge agreement.

## How big a sample do you need?

To estimate a pass rate $p$ to within a margin $m$ at 95% confidence, you need

$$
n = \frac{z^2\, p\,(1 - p)}{m^2}
$$

where $z = 1.96$ for 95% confidence. If you believe $p \approx 0.90$ and want $\pm 3$ points ($m = 0.03$):

$$
n = \frac{1.96^2 \times 0.90 \times 0.10}{0.03^2} = \frac{3.8416 \times 0.09}{0.0009} = \frac{0.3457}{0.0009} \approx 384
$$

About **385 graded answers** per period. If you grade 400 per week, each weekly pass rate is known to about ±3 points. Halving the margin to ±1.5 points quadruples the sample to about 1,537, because $n$ scales as $1/m^2$. When $p$ is unknown use $p = 0.5$, which maximises $p(1-p)$ and gives the safest answer ($n = 3.8416 \times 0.25/0.0009 \approx 1{,}067$).

## Detecting a drop

Say the pass rate has been 90%, and this week 400 sampled answers show 372 correct ($93\%$), then next week 348 correct ($87\%$). Is the second week a real drop? The standard error at $p = 0.9$, $n = 400$ is

$$
\text{SE} = \sqrt{\frac{0.9 \times 0.1}{400}} = 0.015
$$

so a deviation of $3$ points is $2\text{ SE}$: borderline, worth watching. A drop to 80% would be $6.7\,\text{SE}$ and unambiguous. To react quickly to small regressions you need larger samples or more targeted ones (stratify by feature and tenant). The online evaluation lesson goes deeper on A/B tests and drift.

```steps
A production evaluation loop
Define a rubric for each feature: what counts as a pass (correct, grounded, on-policy, right format).
---
Sample: draw 5% of traffic at random each day, plus all thumbs-down and guardrail hits.
---
Grade with automatic checks first, then a judge model on the rest. Humans grade 100 to 200 per week, including some the judge graded, to measure agreement.
---
Report pass rate with a confidence interval, sliced by feature, model version, prompt version and tenant.
---
Alert when the interval's upper edge falls below the SLO, then investigate with the trace and payload of failing samples.
```

## Quality drift

Quality can drop with no change on your side: the provider silently updates a model, the user population shifts, a data source goes stale, or a new attack pattern appears. Watch leading indicators besides the graded pass rate: answer length, refusal rate, share of `finish_reason = length`, retrieval hit rate, and the thumbs-down rate. A change in any of them with no deploy is a prompt to check the model version and the input mix.

## In practice

Feed production failures back into your evaluation set: every graded failure with a clear reason is a new test case. Over a year this builds a regression set that reflects the real distribution of user requests, which is far more valuable than the set you wrote before launch. Keep the judge model and prompt versioned too, otherwise a change in the judge looks like a change in quality.

```quiz
{"q": "You expect a pass rate near 80% and want it estimated to ±5 points with 95% confidence (z = 1.96). Approximately how many graded samples do you need?", "options": ["About 246", "About 61", "About 385", "About 1,000"], "answer": 0, "explain": "n = 1.96² × 0.8 × 0.2/0.05² = 3.8416 × 0.16/0.0025 ≈ 246. The 385 figure is for p = 0.9 with ±3 points; the 61 comes from forgetting to square the margin."}
```

```quiz
{"q": "You want to halve your margin of error from ±4 to ±2 points. What happens to the required sample size?", "options": ["It quadruples", "It doubles", "It halves", "It stays the same"], "answer": 0, "explain": "n ∝ 1/m², so halving m multiplies n by 4. Doubling would be right only if the margin scaled linearly with n."}
```
