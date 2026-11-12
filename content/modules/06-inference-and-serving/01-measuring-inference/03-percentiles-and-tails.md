---
title: Percentiles and the tail
minutes: 8
---

If you stand in ten queues at a supermarket and nine move quickly but one takes twenty minutes, you do not remember the supermarket as "average two and a half minutes". You remember the twenty-minute queue. Users treat software the same way: a slow response is memorable, a fast one is invisible.

Averages hide exactly the experiences people remember. Latency distributions for LLM endpoints are **right-skewed**: most requests land in a narrow band, and a thin tail stretches far to the right (a long prompt, a cold cache, a request stuck behind a burst). So we describe latency with **percentiles**.

## Definition

The **$p$-th percentile** of a set of measurements is the value below which $p$ percent of them fall. The **p50** (median) is the typical experience, the **p95** is what one request in twenty is worse than, and the **p99** is what one request in a hundred is worse than. The slow end of the distribution is called the **tail**, and p99 is often called **tail latency**.

One simple, exact rule is the **nearest-rank** method. Sort the $n$ measurements ascending, $x_{(1)} \le x_{(2)} \le \dots \le x_{(n)}$. Then

$$
P_p = x_{(r)}, \qquad r = \left\lceil \frac{p}{100}\, n \right\rceil
$$

where $\lceil \cdot \rceil$ rounds up to the next whole number and $x_{(r)}$ is the $r$-th smallest value.

```steps
Percentiles from twenty TTFTs
Twenty measured TTFTs in ms, already sorted: 180, 190, 200, 205, 210, 215, 220, 230, 240, 250, 260, 270, 280, 300, 320, 350, 400, 520, 900, 2400.
---
Mean: the values sum to 8,140, so the mean is $8140/20 = 407$ ms. Only 3 of the 20 requests are actually that slow or slower.
---
p50: $r = \lceil 0.50 \times 20 \rceil = 10$, so $P_{50} = x_{(10)} = 250$ ms.
---
p95: $r = \lceil 0.95 \times 20 \rceil = 19$, so $P_{95} = x_{(19)} = 900$ ms.
---
p99: $r = \lceil 0.99 \times 20 \rceil = \lceil 19.8 \rceil = 20$, so $P_{99} = x_{(20)} = 2400$ ms. With only 20 samples, "p99" is just the maximum, which is why tail percentiles need many samples.
```

One outlier (2,400 ms) dragged the mean from about 300 ms to 407 ms. The median ignored it, and the p99 is entirely about it. Each statistic answers a different question; none of them is "the latency".

Libraries often interpolate between ranks instead of using the nearest rank. NumPy's default `np.percentile(x, 50)` returns 255 ms here, halfway between the 10th and 11th values. With thousands of samples the methods agree closely; with twenty they do not, which is another reason to collect enough data.

## Why the tail compounds

A single user action often triggers several model calls: a query rewrite, a retrieval step, a generation, a safety check. If the action waits for all of them, it is slow whenever *any* of them is slow. If each call independently has probability $q$ of landing in its own slow tail, the chance that at least one of $k$ calls is slow is

$$
P(\text{at least one slow}) = 1 - (1 - q)^k
$$

With $q = 0.01$ (each call's p99) and $k = 10$ calls, that is $1 - 0.99^{10} = 1 - 0.904 = 0.096$: almost one action in ten hits somebody's p99. With $k = 100$ (an agent making many calls), $1 - 0.99^{100} = 0.634$. The per-call p99 has become the *typical* experience. This is why engineers who build agents or pipelines care about p99 and p99.9, not p50.

| Calls per action $k$ | Chance one hits a p99 | Chance one hits a p95 |
|---|---|---|
| 1 | 1.0% | 5.0% |
| 5 | 4.9% | 22.6% |
| 10 | 9.6% | 40.1% |
| 50 | 39.5% | 92.3% |

## See it

```sim
latency-breakdown
{"model": "llama3-8b", "gpu": "h100", "promptTokens": 2000, "outputTokens": 300, "queueMs": 20}
```

Add queue time and watch it shift every phase that comes after it. Queueing is the main source of tail latency on a loaded server: when requests arrive in a burst, the last one in the burst waits for all the others. Increase the queue delay as if a burst had arrived and notice that TTFT, not TPOT, absorbs it.

## Code: percentiles from logs

```python
import numpy as np

ttft_ms = np.array([180, 190, 200, 205, 210, 215, 220, 230, 240, 250,
                    260, 270, 280, 300, 320, 350, 400, 520, 900, 2400])

def nearest_rank(x, p):
    s = np.sort(x)
    r = int(np.ceil(p / 100 * len(s)))   # 1-based rank
    return s[r - 1]

for p in (50, 95, 99):
    print(p, nearest_rank(ttft_ms, p), np.percentile(ttft_ms, p))
print("mean", ttft_ms.mean())
```

## In practice

Production teams set targets on percentiles, for example "p95 TTFT under 800 ms and p95 TPOT under 50 ms", and alert when a rolling window breaks them. Three habits keep the numbers honest. Collect enough samples: to estimate p99 you want at least several hundred to a thousand requests per window, so that the top 1% contains several points rather than one. Never average percentiles across servers or time windows (the mean of two p99s is not the p99 of the combined data); merge the raw samples or use a histogram that can be merged. And report percentiles separately for prompt-length buckets, because a p99 driven by a few 100k-token prompts tells you nothing about short chats.

```quiz
{"q": "You have 200 latency samples. Using the nearest-rank method, which sorted position is the p95?", "options": ["The 190th", "The 195th", "The 10th", "The 199th"], "answer": 0, "explain": "$r = \\lceil 0.95 \\times 200 \\rceil = 190$. The 10th position is the p5 (counting from the fast end); 195 or 199 would be percentiles above 97%."}
```

```quiz
{"q": "Each of 4 sequential model calls in a pipeline has a p95 latency of 1 s. Assuming independence, roughly how often does at least one call exceed 1 s?", "options": ["About 19%", "5%", "20% exactly", "About 81%"], "answer": 0, "explain": "$1 - 0.95^4 = 1 - 0.815 = 0.185$, about 19%. Saying 5% ignores compounding; 4 × 5% = 20% is a close but slightly high approximation that breaks down for larger $k$; 81% is the chance that *none* is slow."}
```
