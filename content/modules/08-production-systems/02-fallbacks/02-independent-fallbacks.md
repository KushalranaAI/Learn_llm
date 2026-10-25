---
title: A second provider and the limits of independence
minutes: 8
---

Serial chains hurt availability. **Redundancy** helps it: if a second provider can serve the request when the first fails, the user only sees a failure when both are down at once. This is the **fallback** pattern: try the primary; on error or timeout, send the request to a secondary model, ideally on a different provider.

## The independent case

If the primary is up with probability $A_1$ and the fallback with $A_2$, and their failures are **independent**, the request fails only when both fail:

$$
A_{\text{combined}} = 1 - (1 - A_1)(1 - A_2)
$$

Here $(1 - A_1)$ is the primary's failure probability and $(1 - A_2)$ the fallback's. With $A_1 = 0.995$ and $A_2 = 0.99$:

$$
A_{\text{combined}} = 1 - 0.005 \times 0.01 = 1 - 0.00005 = 0.99995
$$

That is 99.995%, about $0.00005 \times 43{,}200 = 2.16$ minutes of downtime a month, down from 216 minutes for the primary alone. Redundancy bought two extra nines. This is the most powerful reliability tool you have, and it is also the most over-estimated, because it assumes independence.

## When independence fails

Real outages are often **correlated**. Two "different" providers may run on the same cloud region, serve the same open-weight model, depend on the same upstream auth service or hit the same global rate limit. Let $\rho$ be the chance that the fallback is also down given that the primary is down because of a shared cause. One simple way to model it:

$$
P(\text{fallback down} \mid \text{primary down}) = \rho + (1 - \rho)(1 - A_2), \qquad A_{\text{combined}} = 1 - (1 - A_1)\left[\rho + (1 - \rho)(1 - A_2)\right]
$$

With $\rho = 0.1$ and the same $A_1$, $A_2$: the bracket is $0.1 + 0.9 \times 0.01 = 0.109$, so

$$
A_{\text{combined}} = 1 - 0.005 \times 0.109 = 1 - 0.000545 = 0.999455
$$

Downtime is $0.000545 \times 43{,}200 \approx 23.5$ minutes, more than ten times worse than the independent estimate. A mere 10% shared-cause probability swamps the benefit of the second provider's own 99%.

| Correlation $\rho$ | Combined availability | Downtime per month |
|---|---|---|
| 0 (independent) | 99.995% | 2.2 min |
| 0.1 | 99.945% | 23.5 min |
| 0.5 | 99.75% | about 109 min |
| 1 (same cause) | 99.5% | 216 min |

At $\rho = 0.5$: bracket $= 0.5 + 0.5 \times 0.01 = 0.505$, failure $= 0.005 \times 0.505 = 0.002525$, availability 99.7475% and $0.002525 \times 43{,}200 \approx 109$ minutes. At $\rho = 1$ the fallback adds nothing at all.

```sim
fallback-availability
{"primaryAvail": 0.995, "fallbackAvail": 0.99, "correlation": 0.1}
```

Start at correlation 0 and note the combined availability, then slide it to 0.3 and watch the nines drain away. Next, raise the fallback availability from 0.99 to 0.9999 with correlation held at 0.3 and see how little it helps: the shared cause, not the fallback's own reliability, is the limit.

## Making fallbacks genuinely independent

- Use a different **provider and region**, not just a different model name on the same platform.
- Mind the **same weights** problem: two hosts serving one open-weight model share model-level bugs.
- Keep separate **credentials, quotas and billing** so one limit cannot starve both.
- Avoid a shared **gateway or proxy** as a single point of failure: it is a serial component in front of both.

## Fallbacks are not free

A fallback model is usually a different model, so quality, prompt format, tool-calling schema and output style can differ. A prompt tuned for the primary may behave worse on the fallback. Evaluate the fallback on your evaluation set, keep a prompt variant for it if needed, and log which model answered every request so you can see the quality cost.

## In practice

Run a regular **game day**: block the primary in a staging environment and check the fallback really takes over, with working credentials and acceptable quality. Fallback paths that are never exercised are broken more often than not by the time you need them.

```quiz
{"q": "A primary at 99% and a fully independent fallback at 99% are combined. What is the availability?", "options": ["99.99%", "99.9%", "99%", "98.01%"], "answer": 0, "explain": "1 − (0.01 × 0.01) = 1 − 0.0001 = 0.9999, or 99.99%. 98.01% is 0.99 × 0.99, which wrongly treats the two providers as serial dependencies instead of redundant ones."}
```

```quiz
{"q": "Two providers each have 99.9% availability, but they share a cloud region that causes every outage. What is the combined availability?", "options": ["Still 99.9%, the fallback adds nothing", "99.9999%", "99.99%", "99.8%"], "answer": 0, "explain": "With a fully shared cause (ρ = 1) both fail together, so the combined failure probability equals one provider's, 0.1%. The 99.9999% figure is the independent calculation, which is the tempting but wrong model here."}
```
