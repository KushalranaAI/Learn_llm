---
title: Failure modes, trade-offs and what an interviewer probes
minutes: 10
---

A building's main water valve is the most useful and the most dangerous fixture in it. One turn shuts off every leak at once, and one stuck valve leaves every flat dry. A gateway is the same: centralising model calls makes routing, quotas and accounting possible, and it also makes the gateway something that can break every LLM feature in the company in one go. The final step of the framework asks what fails, how the design degrades, and which trade-offs you chose on purpose.

## Availability in series and in parallel

Components on the request path multiply: if each must work, overall availability is the product. Redundant alternatives combine the other way: the request fails only if all of them fail. With availabilities $A_i$ and independent failures:

$$
A_{series} = \prod_i A_i, \qquad A_{parallel} = 1 - \prod_i (1 - A_i)
$$

**Worked example.** Provider 1 delivers 99.5% and provider 2 delivers 99.0% for a comparable model. With automatic fallback, the model layer reaches $1 - (0.005 \times 0.01) = 0.99995$. The gateway itself, at 99.95%, sits in series in front of it:

$$
A = 0.9995 \times 0.99995 \approx 0.99945
$$

That is about $0.00055 \times 43{,}200 \approx 24$ minutes of failure per 30-day month, and almost all of it is the gateway's own 21.6 minutes. The lesson: after one fallback provider, the gateway is the weak link, so its availability is where engineering effort goes. Independence is also optimistic. Two providers can share a cloud region, and a bad prompt release breaks both; fallbacks protect against provider outages, not against your own mistakes. More on fallbacks is in [Fallbacks and Graceful Degradation](/learn/production-systems/fallbacks).

## Failure modes and responses

| Failure | What users see without a plan | Design response |
|---|---|---|
| Provider outage or slow TTFT | Errors or timeouts across many products | Timeout on first token, fallback route, circuit breaker per provider |
| Provider rate limit hit (429) | Random failures at peak | Per-tenant quotas below bought limits; spread across provider accounts and regions |
| Retry storm | A partial outage becomes total | Retry budgets in the SDK, jittered backoff, gateway sheds load |
| Gateway bad deploy | Every LLM feature down | Canary per zone, automatic rollback, SDK can bypass to a static fallback for critical apps |
| Quota store down | All requests rejected | Fail open with local per-instance limits |
| Noisy tenant | Everyone's latency rises | Token buckets, concurrency caps, batch priority class |
| Cost runaway (looping agent) | Surprise bill | Per-tenant budgets with alerts and hard stops |
| Cache serving stale or wrong answers | Silent quality drop | TTLs, flush on version change, semantic cache opt-in and audited |

**Retry storms deserve the maths.** If each client retries up to 3 times and a fraction $f$ of attempts fail, the expected attempts per request are $1 + f + f^2 + f^3$. At $f = 0.5$ that is 1.875 times the normal load, arriving exactly when the provider is struggling; at $f = 1$ it is 4 times. A **retry budget** (retries may be at most 10% of requests over a window) caps the load at 1.1 times regardless of $f$.

## Trade-offs to state explicitly

| Decision | Option A | Option B | Choose A when |
|---|---|---|---|
| Gateway placement | Central shared service | Library/sidecar in each app | You need global quotas, caching and one audit trail |
| Routing | Up-front router | Cascade with verifier | Latency SLOs are tight |
| Semantic cache | Off by default | On by default | Prompts carry user-specific data |
| Quota enforcement | Shared counters (exact) | Local counters (approximate) | Provider limits are tight and expensive |
| Payload logging | Sampled, redacted | Full | Data contains customer PII |
| Hosting | Provider APIs | Self-hosted pool | Traffic is spiky and prices are low (topic 1: \$151k API vs \$339k GPUs) |
| Cost reporting | Showback | Chargeback | Numbers are not yet trusted by finance |

## What an interviewer probes

```steps
The follow-up questions to expect
"The gateway is a single point of failure. What do you do?" Multi-zone deployment with at least N+2 instances, stateless instances with pushed config, canary deploys, and for the most critical apps an SDK escape hatch that calls a pre-approved fallback route directly if the gateway is unreachable.
---
"How much latency does the gateway add, and how do you know?" A budget per step (about 7 ms, or 27 ms with a semantic lookup), measured as a separate histogram from model latency, alerted on its own p99.
---
"Team X launches a backfill and everyone slows down. Walk me through it." Token-bucket quotas in tokens, not requests; concurrency caps; a batch priority class or batch API; max-min fair sharing when capacity is short; 429s with retry-after.
---
"How do you cut the bill by half without hurting quality?" Static routing of easy routes to the small model, a cascade where a cheap verifier exists, prefix caching via prompt layout, exact caching; each change gated on an evaluation set per route.
---
"How do you make sure tenants never see each other's data?" Tenant in every cache key, per-tenant semantic indexes, scoped credentials, tenant-filtered log access, redaction before logging, and tests that try cross-tenant reads.
---
"Finance asks why the support team's bill doubled." Usage events with feature tags, a versioned price table, showback dashboards by feature, and the shared-cost allocation rule written down.
```

## Scaling path

Start with a thin gateway (auth, one adapter per provider, usage events, static routes) because that alone fixes credentials and cost visibility. Add quotas when the first noisy-neighbour incident happens, fallbacks when the first provider outage happens, caching once you can measure repeat rates, and dynamic routing last, once evaluation sets per route exist. Interviewers respond well to this phasing: it shows you know which parts pay for themselves first.

## In practice

Run regular **game days**: deliberately fail a provider, the quota store or one zone, and check that the design behaves as the table says. Most platforms discover at least one dependency that was supposed to fail open and actually fails closed. Then try the whole design yourself in the sandbox below: put a gateway in front of two providers, set tenant quotas, turn on caching and watch cost, latency and availability as you inject an outage.

```quiz
{"q": "Two independent providers have 99.5% and 99.0% availability, with automatic fallback, behind a gateway with 99.95% availability. What is the end-to-end availability, approximately?", "options": ["99.50%", "99.945%", "99.995%", "98.46%"], "answer": 1, "explain": "The providers in parallel give $1 - 0.005 \\times 0.01 = 0.99995$; in series with the gateway, $0.9995 \\times 0.99995 \\approx 0.99945$. 99.995% forgets the gateway; 98.46% multiplies all three as if they were in series."}
```

```quiz
{"q": "Clients retry failed calls up to 3 times. During a partial outage, half of all attempts fail. How much does load on the provider rise?", "options": ["1.5 times", "1.875 times", "4 times", "Not at all, failed calls are free"], "answer": 1, "explain": "Expected attempts $= 1 + 0.5 + 0.25 + 0.125 = 1.875$. Four times is the total-outage case $f = 1$. A retry budget capping retries at 10% of requests would hold load to 1.1 times."}
```

```sandbox
llm-gateway
```
