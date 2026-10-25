---
title: Guard metrics and deciding to proceed
minutes: 8
---

A canary is only as good as the rule that reads it. **Guard metrics** are the numbers you watch during a rollout, with thresholds that say "continue", "hold" or "roll back". Decide them **before** the rollout, not while staring at a graph and hoping.

## Fast metrics and slow metrics

Some failures show up in minutes, others only after humans or judges have looked at the answers:

| Speed | Metric | Why it is quick or slow |
|---|---|---|
| Fast (minutes) | error rate, timeouts, 429s | every request is labelled instantly |
| Fast | invalid-output rate (schema, parse) | deterministic check |
| Fast | p95 and p99 latency, TTFT | measured per request |
| Fast | tokens per request, cost per request | measured per request |
| Fast | guardrail block rate | measured per request |
| Medium (hours) | refusal rate, answer length distribution | needs a few thousand requests |
| Slow (hours to days) | judge-graded pass rate | sampled and graded |
| Slow | user feedback, escalation to humans | users react later |

Gate the **early** stages of the canary on the fast metrics, and keep the slow ones as the gate for the final ramp. Many quality regressions only appear in the slow metrics, so do not call the canary "clean" until they have enough data.

## Comparing the canary with the control

Always compare the canary against a **concurrent control**, not against yesterday, because load and traffic mix change through the day. Take the control's error rate as the baseline $p_0$. Suppose $p_0 = 0.5\%$ and the canary has served $n = 6{,}000$ requests. You expect $np_0 = 30$ errors. You observe 54 (0.9%). Is that real?

Treat the canary's error count as approximately normal with mean $np_0$ and variance $np_0(1 - p_0)$:

$$
z = \frac{x - n p_0}{\sqrt{n\,p_0\,(1 - p_0)}} = \frac{54 - 30}{\sqrt{6000 \times 0.005 \times 0.995}} = \frac{24}{\sqrt{29.85}} = \frac{24}{5.46} = 4.4
$$

where $x$ is the observed error count. A $z$ of 4.4 is far beyond chance (roughly 1 in 200,000 under the baseline rate), so the canary is genuinely worse. Had you seen 38 errors, $z = 8/5.46 = 1.5$: unremarkable noise.

## The danger of peeking

If you check a graph every few minutes and roll back at the first moment a test looks significant, you will see false alarms. Each look at a 5% threshold is a fresh chance of a false alarm. If you looked 10 times, treating the looks as independent (an approximation, since consecutive looks share data), the chance of at least one false alarm is

$$
1 - 0.95^{10} = 1 - 0.599 = 40\%
$$

Two remedies are standard. For **safety metrics** it is acceptable to be jumpy: a false rollback is cheap, so alarm on a modest $z$ (say 3) and accept the occasional unnecessary rollback. For **go decisions** (promoting to the next stage) require a pre-set sample size or a sequential testing method that accounts for repeated looks. Different directions, different costs, different thresholds.

```steps
Define the guard rules before you start
List the metrics and their thresholds: error rate no more than baseline plus 0.5 points, p95 latency no more than baseline plus 15%, invalid-output rate no more than baseline plus 0.3 points.
---
Set a minimum sample size per stage, from the canary sizing rule: here 6,000 requests, or 60 minutes at 100 requests per minute.
---
Write the action for each outcome: breach means automatic rollback, near-threshold means hold and extend, clean means promote.
---
Decide who is on call during the rollout and how to reach them.
---
Record the rules in the release ticket so the decision is traceable afterwards.
```

## Segment views

An overall average can hide harm to one group: a change that improves 90% of requests by 2% and breaks 3% of customers is "up" on average. Slice the guard metrics by tenant, language, feature and request length, and require that **no slice** exceeds its threshold. With many slices you will also see some random breaches; use a larger threshold or minimum size per slice, such as at least 200 requests before a slice is judged.

## Quality guard metrics for LLMs

Besides generic ones, add checks for the specific risks of your change. A prompt change that targets tone needs a tone check. A router change needs the share routed small and the graded quality of small-routed answers. A retrieval change needs the citation rate and the groundedness score. Choose one or two metrics per change that map directly to what you modified.

## In practice

Automate the decision where you can: a rollout controller that compares canary with control every minute, rolls back on a breach and promotes when thresholds hold for the required window. Humans still own the thresholds and review slow metrics, but the rollback itself should not wait for someone to wake up.

```quiz
{"q": "The control error rate is 1%. A canary has served 2,500 requests and shows 40 errors. Expected errors are 25 with a standard deviation of about 4.97. What is z, approximately?", "options": ["About 3.0", "About 1.5", "About 0.6", "About 15"], "answer": 0, "explain": "z = (40 − 25)/4.97 ≈ 3.0. A result three standard deviations above baseline is unlikely to be chance. 15 is the raw difference in counts, not divided by the standard deviation."}
```

```quiz
{"q": "Why compare the canary to a concurrent control rather than to last week's metrics?", "options": ["Traffic mix, load and provider conditions change over time, so only simultaneous traffic is a fair comparison", "Last week's metrics are never stored", "A concurrent control is cheaper", "Control traffic is always larger"], "answer": 0, "explain": "Metrics like latency and error rate vary with time of day, load and provider health. A concurrent control experiences the same conditions, so any difference is attributable to the change."}
```
