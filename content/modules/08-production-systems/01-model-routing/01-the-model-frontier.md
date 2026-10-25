---
title: The quality, cost and latency frontier
minutes: 7
---

```callout-before
Before you start
You need a pass rate from an evaluation set (the fraction of test cases a model gets right) and the idea that each request costs money and takes time. Nothing else.
```

Choosing a model for a feature feels like choosing a car: you want it fast, cheap and good, and you cannot have all three at the maximum. A large frontier model answers hard questions well but is slow and expensive. A small model is quick and cheap and fails on the tricky cases. The engineering question is never "which model is best?" but "which model is best **for this feature, at this budget, under this latency limit**?"

To answer it you measure every candidate on the same three axes. **Quality** is the pass rate on your own evaluation set, not a public leaderboard, because leaderboards measure someone else's task. **Cost** is the average price of one request at your real prompt and output lengths. **Latency** is how long a user waits, usually a percentile such as p50 or p95.

## Dominance and the frontier

Model $i$ **dominates** model $j$ when it is at least as good on every axis and strictly better on at least one:

$$
q_i \ge q_j, \quad c_i \le c_j, \quad t_i \le t_j, \quad \text{with at least one strict inequality}
$$

Here $q$ is quality (pass rate), $c$ is cost per request in dollars and $t$ is latency in seconds. A dominated model is never the right choice: whatever you care about, the dominating model gives you that and more. The models that nobody dominates form the **Pareto frontier**. Your choice always lies on it.

Here are four hypothetical candidates measured on the same 1,000-case evaluation set:

| Model | Quality $q$ | Cost $c$ per request | p50 latency $t$ |
|---|---|---|---|
| Small | 78% | \$0.0006 | 0.6 s |
| Medium | 86% | \$0.0030 | 1.2 s |
| Medium-B | 84% | \$0.0045 | 1.5 s |
| Large | 92% | \$0.0120 | 2.5 s |

Medium-B is dominated by Medium: lower quality ($84 < 86$), higher cost ($0.0045 > 0.0030$) and slower ($1.5 > 1.2$). Cross it off. Small, Medium and Large are all on the frontier, because each is the best available at some trade-off.

## The price of a quality point

Walking along the frontier, each step buys quality at a price. The **marginal cost per quality point** between two neighbours is

$$
m = \frac{c_{\text{upper}} - c_{\text{lower}}}{q_{\text{upper}} - q_{\text{lower}}}
$$

with $q$ measured in percentage points. From Small to Medium: $m = (0.0030 - 0.0006)/(86 - 78) = 0.0024 / 8 = \$0.0003$ per point per request. From Medium to Large: $m = (0.0120 - 0.0030)/(92 - 86) = 0.0090/6 = \$0.0015$ per point per request, five times more.

Scale that to traffic. At one million requests a month, each quality point between Medium and Large costs $10^6 \times 0.0015 = \$1{,}500$ a month. Whether that is worth it depends on what a failure costs your business: a wrong answer in a casual chat feature is cheap, a wrong figure in an invoice extraction is not.

```steps
Pick a model under constraints
Write the constraints first. Say the product needs quality $q \ge 85\%$ and p50 latency $t \le 2$ s.
---
Remove dominated models. Medium-B goes; Small, Medium and Large remain.
---
Remove models that break a constraint. Small fails quality ($78 < 85$). Large fails latency ($2.5 > 2$).
---
Among the survivors, take the cheapest. Only Medium remains: $86\%$, $\$0.0030$, $1.2$ s.
---
Record the headroom. Medium clears the quality bar by just 1 point, so re-evaluate it whenever the prompt or the traffic changes.
```

## Why one model is rarely the answer

The table hides something important: quality is an average over requests of very different difficulty. On easy requests Small may be right 97% of the time; on hard ones it may fall to 40%. If you could send each request to the cheapest model that handles it, you would beat every single point on the frontier. That is the idea behind **cascades** and **routers**, the subject of the rest of this lesson.

## In practice

Teams keep a small **model scorecard** for each feature: the evaluation pass rate, the cost per request at the measured median prompt and output lengths, and p50 and p95 latency, refreshed whenever a provider releases a new version. The most common mistake is comparing models by their price per million tokens alone. Two models with the same token price can differ in cost per request by 2× if one writes twice as many output tokens to reach the same answer, which is why you measure cost on your own traffic.

```quiz
{"q": "Model X: 88% quality, \\$0.004 per request, 1.0 s. Model Y: 88% quality, \\$0.005 per request, 0.9 s. Which statement is true?", "options": ["X dominates Y because it is cheaper", "Y dominates X because it is faster", "Neither dominates the other: both are on the frontier", "They are identical, so either can be removed"], "answer": 2, "explain": "Dominance needs at least as good on every axis. X is cheaper but slower; Y is faster but dearer, so neither dominates. Saying X dominates ignores that it loses on latency."}
```

```quiz
{"q": "Model P costs \\$0.002 at 80% quality; model Q costs \\$0.008 at 84%. What is the marginal cost per quality point, and what does one point cost per month at 2 million requests?", "options": ["\\$0.0015 per point; \\$3,000 per month", "\\$0.006 per point; \\$12,000 per month", "\\$0.0015 per point; \\$1,500 per month", "\\$0.0001 per point; \\$200 per month"], "answer": 0, "explain": "(0.008 − 0.002)/(84 − 80) = 0.006/4 = \\$0.0015 per point per request, and 2,000,000 × 0.0015 = \\$3,000. The \\$0.006 option forgets to divide by the 4 points gained."}
```
