---
title: Per-tenant quotas and fair sharing
minutes: 8
---

If your product serves many customers (**tenants**) from one provider account, the provider's limit is shared among all of them. Without per-tenant limits, one customer running a bulk import can consume the whole allowance and every other customer sees errors. This is the **noisy neighbour** problem, and the fix is a quota per tenant.

## Static shares

The simplest policy gives tenant $i$ a share proportional to a weight $w_i$ (often tied to the plan they pay for):

$$
Q_i = C \cdot \frac{w_i}{\sum_j w_j}
$$

where $C$ is the total capacity (say tokens per minute) and $Q_i$ the quota. With $C = 100{,}000$ TPM and three tenants with weights 1, 1 and 2:

$$
Q_A = 100{,}000 \times \tfrac14 = 25{,}000, \quad Q_B = 25{,}000, \quad Q_C = 100{,}000 \times \tfrac24 = 50{,}000
$$

Static shares are predictable but wasteful: if tenant C is idle, 50% of capacity is unused while A and B are throttled.

## Work-conserving fairness: max-min

A better rule is **max-min fairness**: give everyone an equal share, let tenants who need less take only what they need, and redistribute the leftover among those who want more. Suppose capacity $C = 100{,}000$ and demands are $d_A = 10{,}000$, $d_B = 40{,}000$ and $d_C = 80{,}000$ tokens per minute.

```steps
Max-min allocation of 100,000 TPM
Start with an equal share: $100{,}000/3 \approx 33{,}333$ each.
---
Tenant A needs only 10,000, so A takes 10,000. That leaves $90{,}000$ for the other two: $45{,}000$ each.
---
Tenant B needs only 40,000, below its 45,000, so B takes 40,000. That leaves $50{,}000$ for C.
---
Tenant C wants 80,000 but receives 50,000, the rest of the capacity.
---
Final allocation: A 10,000, B 40,000, C 50,000. All 100,000 is used, nobody gets less than the equal share unless they asked for less, and C's heavy demand cannot hurt A or B.
```

Weights combine with this: allocate in proportion to $w_i$ instead of equally in each round, and cap each tenant at its demand. That is **weighted max-min fairness**, and it is how most shared-capacity schedulers work.

## Bursts and the bucket per tenant

Quotas are usually enforced with one token bucket per tenant, with refill rate $r_i = Q_i$ per second and a capacity $b_i$ that permits reasonable bursts. A tenant allowed 25,000 tokens per minute has $r_i = 25{,}000/60 \approx 417$ tokens per second; a bucket of 25,000 lets it spend a whole minute's quota instantly. A smaller bucket of 5,000 limits the instant spike to 12 seconds of sustained traffic. Choose the bucket by asking what the worst acceptable burst is for the *other* tenants.

```sim
token-bucket
{"pattern": "spike", "trafficRate": 8, "refillRate": 10, "bucketSize": 30}
```

Treat this simulation as one tenant. Change the pattern to spike and find the bucket size at which the spike is absorbed, then think about what that bucket would mean if 50 tenants did the same thing simultaneously.

## Hierarchy of limits

Real platforms stack several limits, and a request must pass all of them:

| Level | Protects against | Typical form |
|---|---|---|
| Per user | one user hammering | requests per minute |
| Per tenant | one customer starving others | tokens per minute, weighted |
| Per feature | batch jobs starving chat | priority class |
| Global | provider account limit | gateway bucket just under the provider's |
| Spend | runaway bills | daily and monthly budget |

## What to do on rejection

Tell the tenant exactly what happened and when to retry: a 429 with a `Retry-After`, and a clear message ("your plan allows 25,000 tokens per minute"). For paid tiers consider queueing a short while rather than rejecting. Never silently degrade one tenant's quality to protect another without telling them.

## In practice

Start with generous per-tenant limits and tighten from data, because limits that are too strict generate support tickets while limits that are too loose generate incidents. Dashboard the **top tenants by token share**: in most B2B products the top 1% of tenants consume 30% to 60% of the tokens, and you want to know who they are before they hit a limit.

```quiz
{"q": "Capacity is 90,000 TPM and three tenants have equal weights. Demands are 20,000, 50,000 and 100,000. What does max-min fairness give the third tenant?", "options": ["35,000", "40,000", "30,000", "50,000"], "answer": 0, "explain": "Equal share is 30,000. The first tenant needs only 20,000, which leaves 70,000 for the other two: 35,000 each. Both want more than 35,000, so both are capped at 35,000. The 30,000 option stops at the first equal split without redistributing the first tenant's unused 10,000."}
```

```quiz
{"q": "Why is a pure static per-tenant share wasteful?", "options": ["Idle tenants' unused capacity cannot be used by busy tenants", "It lets one tenant starve the others", "It requires every tenant to have the same weight", "It cannot enforce any limit"], "answer": 0, "explain": "Static shares reserve capacity whether or not it is used, so a busy tenant is throttled while another's share sits idle. It does protect against starvation, which is its strength."}
```
