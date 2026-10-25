---
title: Exponential backoff and jitter
minutes: 9
---

When a service is overloaded or briefly down, the worst thing a client can do is hammer it. An agent that retries instantly, three times, against a service that is already struggling adds load exactly when load is the problem. **Backoff** means waiting between retries, and waiting longer each time. **Jitter** means adding randomness to those waits so that many clients do not retry in lockstep.

Picture a shop doorway after the doors reopen following a power cut. If everyone steps forward at the same instant, they jam the door and nobody gets in. If each person waits a different, random moment, the crowd trickles through. Jitter is the random moment.

## The formula

For retry number $a$ (counting from 0 for the first retry), with a base delay $b$ and a cap $C$:

$$
d_a = \min\!\big(C,\; b \cdot 2^{a}\big)
$$

That is **exponential backoff**: the ceiling doubles with each failed attempt but never exceeds the cap. Then add jitter. Two common forms:

- **Full jitter**: wait a random time uniformly between 0 and the ceiling: $\;\text{wait}_a \sim U(0,\, d_a)$.
- **Additive jitter**: wait the ceiling plus a small random amount: $\;\text{wait}_a = d_a + U(0, j)$, where $j$ is a jitter window.

With $b = 0.5$ s and $C = 30$ s the ceilings are:

| Retry $a$ | $b\cdot 2^a$ | $d_a = \min(30, \cdot)$ |
|---|---|---|
| 0 | 0.5 | 0.5 |
| 1 | 1 | 1 |
| 2 | 2 | 2 |
| 3 | 4 | 4 |
| 4 | 8 | 8 |
| 5 | 16 | 16 |
| 6 | 32 | **30** (capped) |
| 7 | 64 | **30** (capped) |

Total waiting if all of the first six retries are needed (without jitter): $0.5 + 1 + 2 + 4 + 8 + 16 = 31.5$ s. With full jitter the expected wait for each retry is half its ceiling, so the expected total is $15.75$ s.

## Why jitter matters: the retry storm

Suppose 1,000 clients all fail at the same instant, because a shared service went down and came back. Without jitter they are synchronised: they all retry after exactly $d_a$, so the service sees 1,000 requests at once, fails again, and they all back off to the next ceiling and return together. Each wave is as large as the first.

```steps
Worked example: 1,000 clients, base 1 s, third retry (a = 2)
Ceiling: $d_2 = \min(30, 1 \times 2^2) = 4$ s.
---
Without jitter: all 1,000 retry at exactly $t = 4$ s. The server sees a spike of 1,000 requests in one instant.
---
With full jitter: retry times are uniform over $[0, 4]$ s, so the average load is $1{,}000 / 4 = 250$ requests per second.
---
If the service can handle 300 requests per second, the synchronised spike (1,000) overwhelms it and the jittered load (250) fits. Same clients, same policy, different outcome. At the next retry ($a = 3$) the window is 8 s and the load drops to 125 per second.
```

A quick simulation of this exact setup gives a peak of 1,000 requests in one second without jitter, and about 265 in the busiest second with full jitter, close to the 250 average.

## See it

```sim
retry-backoff
{"strategy": "fixed", "outageSec": 20, "retryWindow": 30, "baseDelay": 1, "capacityX": 1.5}
```

The simulation starts with fixed retries against a 20-second outage. Read the peak load and the fraction of requests eventually served. Now switch the strategy to exponential: the number of attempts per request falls, but the retries still arrive in synchronised waves. Finally switch to jitter and compare peak load and time to recovery. Then lower the capacity headroom and see which strategies cope when the server has less spare room.

## The code

```python
import random

def backoff(attempt, base=0.5, cap=30.0, jitter="full"):
    ceiling = min(cap, base * 2 ** attempt)
    if jitter == "full":
        return random.uniform(0, ceiling)
    if jitter == "additive":
        return ceiling + random.uniform(0, base)
    return ceiling

def call_with_retries(fn, max_attempts=4, retryable=(TimeoutError, ConnectionError)):
    for attempt in range(max_attempts):
        try:
            return fn()
        except retryable:
            if attempt == max_attempts - 1:
                raise
            # time.sleep(backoff(attempt)) in real code
```

Note the `retryable` tuple: only transient error types are retried. A `ValueError` for a bad argument propagates immediately (previous topic).

## In practice

Respect a server's own hint: if a 429 or 503 response carries a `Retry-After` header, wait at least that long instead of using your formula. Cap total attempts (three or four is typical for interactive paths) and total time (the deadline from the last topic). Retry at **one** layer only. And remember that retries multiply: if the model layer, the framework and the tool each retry 3 times, one failure costs up to $3^3 = 27$ attempts against an already struggling service.

```quiz
{"q": "Base delay 2 s, cap 20 s, no jitter. What is the ceiling delay before retry number 4 (counting from 0)?", "options": ["20 s", "32 s", "8 s", "16 s"], "answer": 0, "explain": "2 × 2⁴ = 32 s, but the cap limits it to min(20, 32) = 20 s. Answering 32 forgets the cap; 16 is 2 × 2³, which is retry number 3."}
```

```quiz
{"q": "2,000 clients retry after the same failure with a ceiling of 5 s. With full jitter, roughly how many requests per second does the server see on average?", "options": ["2,000", "400", "10,000", "5"], "answer": 1, "explain": "Full jitter spreads the retries uniformly over [0, 5] s, so 2,000 / 5 = 400 per second. Without jitter, all 2,000 would arrive at the same instant."}
```
