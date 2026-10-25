---
title: The token bucket
minutes: 8
---

```callout-before
Before you start
This topic uses the word "token" in a second sense. A **bucket token** is a permit to make a request. It is not an LLM token. Context will make it clear, and the two are connected in the next topic.
```

A rate limiter has two jobs that pull in opposite directions. It must stop one client from consuming everything, and it must not punish ordinary bursty behaviour: a user who clicks three times in a second is not an attack. The **token bucket** does both with two numbers.

Imagine a bucket that holds at most $b$ permits (its **capacity**). A tap drops permits into it at $r$ permits per second (the **refill rate**). Each request must take a permit (or several) out of the bucket to proceed. If the bucket is empty the request is rejected or has to wait. An idle client's bucket fills up to $b$, which is exactly the allowance for a burst.

## The rule

Let $s(t)$ be the number of permits in the bucket at time $t$. After an idle interval $\Delta$, it refills but never overflows:

$$
s(t + \Delta) = \min\bigl(b,\; s(t) + r\,\Delta\bigr)
$$

A request costing $k$ permits is admitted if $s \ge k$, and then $s \leftarrow s - k$. Otherwise it is rejected (or queued).

```steps
A bucket by hand: b = 5, r = 1 per second, each request costs 1
At $t = 0$ the bucket is full: $s = 5$. Four requests arrive together. All are admitted and $s = 1$.
---
At $t = 1$: refill $s = \min(5, 1 + 1) = 2$. Three requests arrive. Two are admitted ($s = 0$), one is rejected.
---
At $t = 2$: $s = \min(5, 0 + 1) = 1$. One request arrives and is admitted, $s = 0$.
---
Quiet until $t = 5$: $s = \min(5, 0 + 3) = 3$. The bucket has recovered 3 permits.
---
Admitted so far: $4 + 2 + 1 = 7$ requests in 2 seconds. The bound $b + rT = 5 + 1 \times 2 = 7$ is met exactly.
```

## Two numbers, two guarantees

Over any window of length $T$, the bucket admits at most

$$
N_{\max}(T) = b + r\,T
$$

requests: the full bucket $b$ plus whatever is refilled during the window. For long windows the $rT$ term dominates, so the **long-run rate** is capped at $r$. For short windows the allowance is the **burst size** $b$. With $b = 30$ and $r = 10$ per second, a burst can push 30 requests through at once, but in any 3 seconds no more than $30 + 10 \times 3 = 60$ get through, and in any minute no more than $30 + 600 = 630$.

| Parameter | Controls | Too small | Too large |
|---|---|---|---|
| $r$ (refill) | sustained rate | rejects normal traffic | no protection |
| $b$ (capacity) | burst tolerance | rejects harmless bursts | permits damaging spikes |

## See it

```sim
token-bucket
{"pattern": "bursty", "trafficRate": 8, "refillRate": 10, "bucketSize": 30}
```

The traffic here averages below the refill rate but arrives in bursts. Try three things. First, shrink the bucket from 30 to 5 and watch rejections climb even though average traffic is under the limit: the bucket is too small for the bursts. Second, set the pattern to steady and raise traffic above the refill rate: now the bucket empties and stays empty, and the rejection rate approaches $1 - r/\lambda$. Third, set a spike pattern and find the smallest bucket that absorbs it.

## Token bucket versus fixed windows

A simple "100 requests per minute" counter that resets on the minute has a flaw: a client can send 100 requests at 12:00:59 and 100 more at 12:01:00, so 200 requests in two seconds are within the rules. The token bucket cannot be gamed like that, because the allowance in any window is bounded by $b + rT$, whatever the clock does. A related method, the **leaky bucket**, smooths output to a constant rate instead of allowing bursts.

## In practice

Implement the bucket lazily: store only the current level and the last-update timestamp, and apply the refill formula when a request arrives. That needs two numbers per client, whether you have ten clients or ten million, and fits in a Redis hash with an atomic script. Return the time until the next permit in a `Retry-After` header so clients can wait precisely instead of guessing.

```quiz
{"q": "A bucket has capacity 20 and refills at 5 permits per second, and starts full. What is the most it can admit in any 10-second window?", "options": ["70", "50", "20", "25"], "answer": 0, "explain": "N_max = b + rT = 20 + 5 × 10 = 70. The 50 answer ignores the initial burst allowance, and 20 ignores the refill during the window."}
```

```quiz
{"q": "Traffic is a steady 12 requests per second against a limiter with r = 10 per second and a large bucket. Once the bucket has drained, roughly what fraction of requests is rejected?", "options": ["About 17%", "About 20%", "About 0%, the bucket is large", "About 83%"], "answer": 0, "explain": "Long-run admitted rate is capped at r = 10 out of 12 offered, so the rejected fraction is 1 − 10/12 ≈ 17%. A big bucket only delays the effect; it cannot raise the long-run rate."}
```
