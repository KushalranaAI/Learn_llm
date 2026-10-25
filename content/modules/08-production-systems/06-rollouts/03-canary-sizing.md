---
title: Canary sizing and the chance of seeing a failure
minutes: 9
---

A **canary** release sends a small share of live traffic to the new version while everyone else stays on the old one. The name comes from the canary in a coal mine: a small, sensitive early warning. The central engineering question is **how big the canary must be, and how long it must run, to notice a problem if there is one.**

## The chance of seeing at least one failure

Suppose the new version has a defect that affects a fraction $p$ of requests. Each request on the canary hits it independently. The probability that **none** of $n$ canary requests hits the defect is $(1 - p)^n$, so the probability of seeing **at least one** failure is

$$
P(\text{detect}) = 1 - (1 - p)^{n}
$$

where $p$ is the per-request failure probability of the defect and $n$ is the number of requests the canary has served. Take a defect that hits 1 request in 2,000 ($p = 0.0005$):

| Canary requests $n$ | $(1 - p)^n$ | $P(\text{at least one failure})$ |
|---|---|---|
| 1,000 | 0.606 | 39.4% |
| 3,000 | 0.223 | 77.7% |
| 6,000 | 0.050 | 95.0% |
| 10,000 | 0.0067 | 99.3% |

Check the 6,000 row: $0.9995^{6000} = e^{6000 \ln 0.9995} = e^{-3.0008} = 0.0497$, so $1 - 0.0497 = 95.0\%$. A canary of 1,000 requests would miss this defect 60% of the time. Rare defects need a lot of traffic to show up.

## Solving for the sample size

To reach a target detection probability $P$, solve for $n$:

$$
n = \frac{\ln(1 - P)}{\ln(1 - p)} \approx \frac{-\ln(1 - P)}{p}
$$

(the approximation holds for small $p$, since $\ln(1 - p) \approx -p$). For 95% detection, $-\ln(0.05) = 2.996$, which is the **rule of three**: you need about $3/p$ requests. For $p = 0.0005$: $n \approx 3/0.0005 = 6{,}000$. For a defect that hits 1 in 10,000 ($p = 0.0001$) you need about 30,000 canary requests.

## From requests to minutes

The canary receives a share $s$ of total traffic $\lambda$ (requests per minute), so it collects requests at rate $s\lambda$ and needs

$$
t = \frac{n}{s\,\lambda}
$$

minutes. With $\lambda = 2{,}000$ requests per minute and $s = 5\%$: the canary sees $100$ requests per minute, so $6{,}000/100 = 60$ minutes. At $s = 1\%$ (20 per minute) it needs 300 minutes (5 hours). At $s = 25\%$ (500 per minute), 12 minutes.

```sim
canary-rollout
{"canaryPct": 5, "durationMin": 60, "trafficPerMin": 2000, "bugRate": 0.0005, "alertThreshold": 1}
```

With these starting values the chance of seeing at least one failure in an hour is about 95%. Try these experiments. First, shrink the canary to 1% and note how detection probability falls. Second, set the duration to 300 minutes and see it return to about 95%. Third, raise the alert threshold to 3 bad requests, so that you need to see several failures before alarming, and watch both detection probability and time to detect worsen. Fourth, increase the bug rate to 0.005 and note how quickly even a tiny canary catches it.

## Alerting needs more than one failure

In practice one failure may be noise: the baseline already fails some requests. If you require at least $m$ bad requests before alarming, the number of failures in $n$ requests is approximately **Poisson** with mean $\mu = n p$, and

$$
P(X \ge m) = 1 - \sum_{k=0}^{m-1} \frac{e^{-\mu}\,\mu^{k}}{k!}
$$

With $n = 6{,}000$ and $p = 0.0005$, $\mu = 3$. For $m = 3$:

$$
P(X \ge 3) = 1 - e^{-3}\left(1 + 3 + \tfrac{9}{2}\right) = 1 - 0.0498 \times 8.5 = 1 - 0.423 = 0.577
$$

So requiring three failures cuts detection from 95% to 58% at the same size, because on average you expect only three failures at all. To catch it reliably at $m = 3$ you would need roughly twice the canary. The noise you want to filter and the sensitivity you want to keep pull against each other.

```steps
Size a canary
State the smallest regression you must catch: for example 1 in 1,000 requests failing ($p = 0.001$).
---
Choose the detection probability: 95%. By the rule of three, $n \approx 3/p = 3{,}000$ requests.
---
Account for the alert threshold. Requiring $m = 3$ failures needs a mean of about $\mu \approx 5.3$ for 90% probability of $X \ge 3$, so use $n \approx 5{,}300$.
---
Convert to time: at $s = 5\%$ of 2,000 requests per minute (100 per minute), that is about 53 minutes.
---
If that is too slow, raise the share $s$ rather than shortening the observation: both only help through $n$.
```

## The exposure side

A larger canary detects faster but exposes more users while it does. The number of users who experience a failure before detection is, on average, $n\,p$ (failures in the canary) — for example $6{,}000 \times 0.0005 = 3$ failed requests at a 5% canary, instead of $\approx 60$ per hour if the defect had gone to 100% of traffic. The canary shrinks **blast radius** by the factor $1/s$ = 20 at 5%.

## In practice

Slice canary traffic so it is representative: random by user, sticky (a user stays on one version for the whole canary, so conversations are not split across versions), and stratified by tenant. Do not canary only your internal users or your quietest region. For rare but severe failures (a safety problem at 1 in 100,000), a canary alone cannot be large enough; those need offline red-team testing and guardrails.

```quiz
{"q": "A defect fails 1 request in 1,000. How many canary requests give about a 95% chance of seeing at least one failure?", "options": ["About 3,000", "About 1,000", "About 300", "About 30,000"], "answer": 0, "explain": "The rule of three: n ≈ 3/p = 3/0.001 = 3,000. At exactly 1,000 requests the probability is only 1 − 0.999¹⁰⁰⁰ ≈ 63%."}
```

```quiz
{"q": "Traffic is 4,000 requests per minute and the canary gets 2%. How long to collect 6,000 canary requests?", "options": ["75 minutes", "7.5 minutes", "30 minutes", "120 minutes"], "answer": 0, "explain": "The canary receives 0.02 × 4,000 = 80 requests per minute, so 6,000/80 = 75 minutes. Using 4,000 per minute instead of the canary's share would give 1.5 minutes, a common slip."}
```
