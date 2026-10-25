---
title: Latency percentiles and why the mean lies
minutes: 8
---

Imagine telling a user "the average wait is 1.8 seconds" when one request in twenty takes nearly ten. The average describes nobody's experience. Latency distributions have a long right tail, so we report **percentiles**: the p95 is the value that 95% of requests are faster than.

## Computing percentiles by hand

Sort $n$ latencies from smallest to largest. With the **nearest-rank** method, the $p$th percentile is the value at position

$$
k = \lceil p/100 \cdot n \rceil
$$

where $\lceil\cdot\rceil$ rounds up. Here are 20 request latencies in seconds, already sorted:

| Rank | 1–5 | 6–10 | 11–15 | 16–20 |
|---|---|---|---|---|
| Latency (s) | 0.6, 0.7, 0.7, 0.8, 0.8 | 0.9, 0.9, 1.0, 1.0, 1.1 | 1.1, 1.2, 1.3, 1.4, 1.6 | 1.8, 2.1, 2.9, 4.8, 9.5 |

- **p50**: $k = \lceil 0.5 \times 20 \rceil = 10$, so the 10th value, **1.1 s**.
- **p95**: $k = \lceil 0.95 \times 20 \rceil = 19$, so the 19th value, **4.8 s**.
- **p99**: $k = \lceil 0.99 \times 20 \rceil = 20$, so the 20th value, **9.5 s**.
- **mean**: the sum is 36.2, so the mean is $36.2/20 = 1.81$ s.

The mean (1.81 s) is higher than the median because of a few slow requests, and it is much lower than the tail. Neither the mean nor the median tells you that one request in twenty takes nearly 5 s. A sample of 20 is also far too small to trust a p99: with 20 points, the p99 is simply the maximum. Use thousands of requests per window.

## Why the tail matters more than it seems

A page or an agent often makes several calls, and the user waits for the slowest. If each call independently has probability $q$ of being "slow" (beyond its p99, so $q = 0.01$), the chance that at least one of $k$ calls is slow is

$$
P(\text{at least one slow}) = 1 - (1 - q)^{k}
$$

With $k = 10$ calls: $1 - 0.99^{10} = 1 - 0.904 = 0.096$. A p99 event for one call becomes a **9.6% event** for the whole task. An agent making 30 calls is slow $1 - 0.99^{30} = 26\%$ of the time. This is the tail-at-scale effect, and it is why agent workflows need to watch the p99 of their individual steps.

```steps
Reading a latency dashboard
Look at p50 first: it is the typical experience, and it moves when the system changes.
---
Look at p95 and p99: they move when queues, retries or slow requests change. A fast-rising p99 with a flat p50 means a sick minority.
---
Break down by dimension (model, feature, tenant, prompt length). The p99 of a pooled graph often hides one bad group.
---
For LLMs, split total latency into time to first token and per-token time. Rising TTFT means queueing or long prompts; rising per-token time means a loaded decode.
---
Compare to the SLO, not to yesterday: yesterday may also have been bad.
```

## Do not average percentiles

If three servers report a p99 of 2, 2 and 8 seconds, the pooled p99 is **not** the mean 4 s. Percentiles do not combine by averaging. Instead, record **histograms** (counts of requests in latency buckets), which can be added across servers and time windows, and compute percentiles from the merged histogram. A typical set of bucket edges for LLM calls is 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30 seconds.

## LLM-specific latency metrics

| Metric | What it measures | Typical alert |
|---|---|---|
| TTFT | time until the first token streams | p95 above 1.5 s |
| TPOT | gap between streamed tokens | p95 above 60 ms |
| Total time | whole answer | p99 above a feature limit |
| Queue time | waiting before the call starts | any sustained growth |

Because output length varies hugely, compare latency **per output token** across runs, or bucket by output length, before concluding that the model got slower.

## In practice

State latency targets as percentile statements: "p95 time to first token under 1.2 s, p99 total under 12 s for answers up to 400 tokens". Without a percentile and a length, a target cannot be checked. Alert on sustained breaches over several minutes, not single slow requests.

```quiz
{"q": "Ten sorted latencies in seconds: 1, 1, 1, 2, 2, 2, 3, 3, 10, 20. What is the p90 by the nearest-rank method?", "options": ["10", "20", "3", "4.5"], "answer": 0, "explain": "k = ⌈0.9 × 10⌉ = 9, the 9th value, which is 10. The maximum, 20, is the p100. The mean of the values, 4.5, is not a percentile."}
```

```quiz
{"q": "A task makes 20 independent calls, each with a 2% chance of being slow. What is the chance that at least one is slow?", "options": ["About 33%", "About 40%", "2%", "About 20%"], "answer": 0, "explain": "1 − 0.98²⁰ = 1 − 0.668 = 0.332, about 33%. Multiplying 2% by 20 gives 40%, which overcounts because several slow calls can happen in the same task."}
```
