---
title: Forecasting the bill
minutes: 7
---

"How much will this cost next quarter?" is a question finance will ask the week after launch. A forecast is not a guess; it is the cost formula from the first lesson multiplied out over users, requests and time, with honest ranges where you are unsure.

## The basic model

$$
C_{\text{month}} = U \cdot \rho \cdot D \cdot \bar c
$$

Here $U$ is the number of active users, $\rho$ the average requests per user per day, $D$ the number of days in the month and $\bar c$ the **mean** cost per request. A worked example: $U = 8{,}000$ users, $\rho = 5$ requests per day, $D = 30$ and $\bar c = \$0.01$:

$$
C_{\text{month}} = 8000 \times 5 \times 30 \times 0.01 = \$12{,}000
$$

That is 1.2 million requests a month at a cent each.

## Use the mean, not the median

Token counts are **heavy-tailed**: most prompts are short and a few are huge (a pasted document, a long conversation). The median request is cheap, but money is spent on the mean. Suppose cost per request has a median of \$0.006 but a mean of \$0.010 because of the tail. Forecasting with the median predicts $1.2\text{M} \times 0.006 = \$7{,}200$, which undershoots the real \$12,000 by 40%. Compute the mean from real logs, and separately track the p95 and p99 request cost so you know how much one outlier can cost.

## Growth compounds

If usage grows by a fraction $g$ each month, the cost in month $m$ is

$$
C_m = C_0 (1 + g)^m
$$

where $C_0$ is the current monthly cost. At \$12,000 and 15% monthly growth:

$$
C_6 = 12{,}000 \times 1.15^6 = 12{,}000 \times 2.3131 \approx \$27{,}757
$$

Six months of modest-looking growth more than doubles the bill. Always forecast two or three scenarios (low, expected, high growth) and show the range. The same arithmetic applies in reverse to unit economics: if a user pays \$20 a month and costs \$2.40 in model spend (25 requests a day for 30 days is 750 requests at a mean of \$0.0032), your gross margin from inference is $1 - 2.4/20 = 88\%$.

| Scenario | Monthly growth $g$ | Cost in month 6 |
|---|---|---|
| Low | 5% | $12{,}000 \times 1.05^6 \approx \$16{,}081$ |
| Expected | 15% | \$27,757 |
| High | 30% | $12{,}000 \times 1.30^6 \approx \$57{,}920$ |

Check the high case: $1.3^2 = 1.69$, $1.3^3 = 2.197$, $1.3^6 = 4.8268$, and $12{,}000 \times 4.8268 = \$57{,}922$. The spread between low and high is almost 4×, which is exactly why a single-number forecast is dangerous.

```steps
Build a cost forecast
List the request types (chat, summarise, extract) and for each the requests per user per day.
---
Measure the mean input and output tokens per type from real logs, and compute $\bar c$ per type with your price list.
---
Weight by traffic: $\bar c = \sum_k w_k \bar c_k$. Multiply by users, days and the growth scenario.
---
Add multipliers for retries (about 1.05 to 1.10), cache savings (a factor below 1) and planned price changes.
---
Compare to the budget and write down the assumptions next to the number, so it can be re-forecast when one changes.
```

## Sensitivity

Each input to the model has its own sensitivity. Prompt length is often the most dangerous because it is under your control and it creeps upwards: every added instruction, example and retrieved chunk raises $n_{\text{in}}$ on every request. A 20% increase in prompt tokens with input at 60% of the bill raises cost by roughly $0.2 \times 0.6 = 12\%$.

## In practice

Reforecast monthly against actuals and track **forecast error**: $|{\text{actual}} - {\text{forecast}}| / \text{forecast}$. Expect 20% to 30% in the first quarter. Break the bill down by feature and tenant: a forecast per feature is far more useful than one total, because it tells you which product decision to revisit when the number is too high.

```quiz
{"q": "10,000 users each make 4 requests per day for 30 days. The mean cost per request is \\$0.005. What is the monthly cost?", "options": ["\\$6,000", "\\$600", "\\$60,000", "\\$1,200"], "answer": 0, "explain": "10,000 × 4 × 30 = 1,200,000 requests, and 1,200,000 × 0.005 = \\$6,000. \\$60,000 is an order of magnitude too high, a slip with the decimal."}
```

```quiz
{"q": "Spend is \\$20,000 this month and grows 10% per month. What is the expected spend in month 3?", "options": ["\\$26,620", "\\$26,000", "\\$20,600", "\\$29,282"], "answer": 0, "explain": "20,000 × 1.1³ = 20,000 × 1.331 = \\$26,620. Adding 10% three times linearly (26,000) ignores compounding, and 29,282 is month 4."}
```
