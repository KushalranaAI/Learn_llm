---
title: Availability and the arithmetic of nines
minutes: 7
---

```callout-before
Before you start
You need independent-event probabilities: if two things each happen with probability $p$ and $q$ and do not influence each other, both happen with probability $pq$.
```

An LLM feature depends on a chain of things that must all work: your gateway, the provider's API, the vector database, the tool backends. Any one of them being down breaks the request. **Availability** is the fraction of time (or of requests) that a component works:

$$
A = \frac{\text{uptime}}{\text{uptime} + \text{downtime}}
$$

Engineers describe it in "nines". 99% is two nines, 99.9% is three nines. The numbers look close and are not: each extra nine cuts allowed downtime by 10×.

## From a percentage to minutes

In a 30-day month there are $30 \times 24 \times 60 = 43{,}200$ minutes. Downtime allowed is $(1 - A) \times 43{,}200$:

| Availability | Nines | Downtime per 30 days |
|---|---|---|
| 99% | two | 432 min (7.2 h) |
| 99.5% | | 216 min (3.6 h) |
| 99.9% | three | 43.2 min |
| 99.95% | | 21.6 min |
| 99.99% | four | 4.32 min |

Check one row: $(1 - 0.999) \times 43{,}200 = 0.001 \times 43{,}200 = 43.2$ minutes. Many LLM API providers publish or deliver somewhere around 99.5% to 99.9% in practice, which is three and a half hours to 43 minutes of trouble every month. If your product promises more than the provider delivers, you need a plan.

## Serial dependencies multiply

When every component must work, the system's availability is the product of the parts:

$$
A_{\text{system}} = \prod_{i=1}^{k} A_i
$$

Here $k$ is the number of components in the chain and $A_i$ the availability of component $i$. Take a gateway at 99.95%, an LLM provider at 99.5% and a vector database at 99.9%:

$$
A_{\text{system}} = 0.9995 \times 0.995 \times 0.999 = 0.99351
$$

That is 99.35%, or $0.00649 \times 43{,}200 \approx 280$ minutes (about 4.7 hours) of downtime a month. The chain is worse than its weakest link, and every dependency you add can only lower it. This is the reason to count dependencies carefully and to give the least reliable one (usually the model provider) a backup.

```mermaid
flowchart LR
  U[User] --> G["Gateway 99.95%"] --> P["LLM provider 99.5%"] --> V["Vector DB 99.9%"] --> R[Answer]
```

## Availability for LLM calls is more than "up"

A provider can be "up" and still give you an unusable service. For an LLM feature, count a request as **failed** if any of these happen:

- an error status (5xx, or 429 rate-limited);
- no response within your latency limit;
- a response that fails validation (malformed JSON, empty output, refusal that your product treats as a failure).

Measure availability as the fraction of requests that succeeded under that definition, not the provider's dashboard colour. Your users experience your definition.

```steps
Compute your real availability
Count every request over a week: say 1,000,000.
---
Count errors (5xx and 429): 3,000. Count timeouts beyond your limit: 1,500. Count invalid outputs: 500.
---
Failures total $3000 + 1500 + 500 = 5000$, so $A = 1 - 5000/1{,}000{,}000 = 99.5\%$.
---
Translate it: $0.005 \times 10{,}080$ minutes in a week is about 50 minutes of equivalent downtime.
---
Compare with the promise you made. If the target is 99.9%, you are 5× over budget on failures.
```

## In practice

Teams that treat a provider's published uptime as their own are surprised the first time a regional incident or a quiet rate-limit episode hits. Keep your own measured availability per provider and per model. A single model can be degraded while the provider's status page shows green, because the provider reports infrastructure health, not the health of the one model you call.

```quiz
{"q": "A system needs a gateway (99.9%) and a provider (99.5%), both working. What is the system availability?", "options": ["About 99.4%", "99.7%", "99.9%", "About 99.0%"], "answer": 0, "explain": "Serial components multiply: 0.999 × 0.995 = 0.994005, about 99.4%. The 99.7% option averages the two numbers, but a chain is always worse than its weakest part, not between the parts."}
```

```quiz
{"q": "How much downtime per 30-day month does 99.95% availability allow?", "options": ["21.6 minutes", "43.2 minutes", "4.32 minutes", "2.16 hours"], "answer": 0, "explain": "(1 − 0.9995) × 43,200 = 0.0005 × 43,200 = 21.6 minutes. 43.2 minutes is the figure for 99.9%, one nine fewer."}
```
