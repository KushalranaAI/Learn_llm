---
title: Quotas, rate limits and fair sharing between tenants
minutes: 9
---

A shared kitchen in an office works until one team decides to cook for a hundred people at lunchtime. Nobody did anything wrong, yet everyone else waits an hour. The fix is not to ban big lunches; it is to book slots and cap how much of the kitchen any one team can hold at once.

On an LLM platform the kitchen is the platform's capacity: provider rate limits (requests and tokens per minute bought from each provider), self-hosted GPU throughput and the monthly budget. A tenant that launches a backfill job over a million documents can consume all of it and starve interactive products. This is the **noisy-neighbour** problem, and quotas are its cure. The general mechanics are in [Budgets, Rate Limits and Usage Controls](/learn/production-systems/budgets-and-rate-limits); here we design them for many tenants.

## Limit tokens, not just requests

Requests vary hugely in size: a classification call might be 300 tokens, a long-document summary 60,000. A requests-per-second limit lets one tenant consume 200 times another's share with the same count. Providers meter **tokens per minute**, so the platform should too: each tenant gets a token budget per unit time, plus a separate concurrency cap to protect against long-running streams.

## The token bucket, sized for tenants

A **token bucket** for tenant $i$ has a capacity $B_i$ (the maximum burst) and a refill rate $r_i$ (the sustained rate), both in LLM tokens. A request needing $x$ tokens is admitted if the bucket holds at least $x$, and then $x$ is removed. Over any window of length $T$ the tenant can consume at most

$$
U_i(T) \le B_i + r_i\,T
$$

where $U_i(T)$ is the tokens consumed in the window. The burst term $B_i$ lets a job start fast; the rate term $r_i T$ caps it in the long run.

**Worked example.** Give the document-indexing team $r = 10{,}000$ tokens/s (600,000 tokens per minute) and $B = 300{,}000$ tokens. Their job fires 50 requests of 6,000 tokens each at once: $50 \times 6{,}000 = 300{,}000$, exactly the burst, so all 50 are admitted immediately. After that the bucket refills at 10,000 tokens/s, so with requests averaging 2,400 tokens they can sustain $10{,}000 / 2{,}400 \approx 4.17$ requests per second. In any one minute they can use at most $300{,}000 + 10{,}000 \times 60 = 900{,}000$ tokens.

**Reserve, then settle.** The output length is unknown when the request arrives. The gateway reserves input tokens plus `max_tokens` and refunds the difference at the end. A request with 2,000 input tokens and `max_tokens = 400` reserves 2,400; if it produces 180 tokens, 220 are refunded and the true charge is 2,180. Tenants that set `max_tokens` to 8,000 "just in case" find their effective concurrency collapses, which is a useful nudge.

## When demand exceeds capacity: fair sharing

Quotas cap each tenant, but the sum of quotas usually exceeds real capacity (overbooking, like airlines), because tenants rarely peak together. When they do, the platform must divide what it has. The classic answer is **max-min fairness**: no tenant gets more than it asks for, and capacity is split so that the smallest allocation is as large as possible. With weights $w_i$ (priority or paid-for share), each tenant's fair share of capacity $C$ starts at

$$
f_i = \frac{w_i}{\sum_j w_j}\,C
$$

and any share a tenant does not use is redistributed among the others in proportion to their weights.

```steps
Splitting 100,000 tokens/s among three tenants
Capacity $C = 100{,}000$ tokens/s. Demands: A wants 20,000, B wants 50,000, C wants 60,000 (total 130,000, so someone must wait). Weights: A = 1, B = 2 (customer-facing), C = 1 (batch).
---
Initial weighted shares: $f_A = \tfrac{1}{4} \times 100{,}000 = 25{,}000$, $f_B = 50{,}000$, $f_C = 25{,}000$.
---
A only wants 20,000, so A gets 20,000 and 5,000 is left over. Remaining capacity is 80,000 for B and C, split 2 : 1, giving B 53,333 and C 26,667.
---
B only wants 50,000, so B gets 50,000 and the extra 3,333 goes to C. Final: A = 20,000, B = 50,000, C = 30,000, which sums to 100,000. Everyone who asked for less than their share is fully served; the batch tenant absorbs the shortfall.
```

## Priority classes

Weights are not enough when one kind of traffic must never wait. Most platforms add **priority classes**: interactive traffic is admitted first, batch traffic fills what is left and is preempted or queued when interactive demand rises. A batch API (submit a file of requests, collect results within hours) lets the platform run batch work in quiet periods, flattening the daily peak that sized the whole system.

| Control | Unit | Protects against |
|---|---|---|
| Token bucket per tenant | Tokens/s, burst | One tenant consuming everyone's provider rate limit |
| Concurrency cap per tenant | Open requests | Long streams exhausting gateway connections |
| Monthly budget per tenant | Dollars | Runaway cost from a bug or loop |
| Priority classes | Interactive vs batch | Batch jobs raising interactive latency |
| Global shed threshold | Platform-wide | Overload taking the gateway down |

## Where the counters live

With 9 gateway instances, a per-instance bucket would let a tenant use 9 times its quota. Shared counters live in an in-memory store in each region, updated atomically per request (the 2 ms in the request path). If that store is unreachable, each instance falls back to $r_i / n$ locally, where $n$ is the number of live instances: slightly unfair, but nobody is cut off and nobody runs unlimited.

## In practice

Return HTTP 429 with a `retry-after` value computed from the bucket ($\text{deficit} / r_i$ seconds), so well-behaved clients wait exactly as long as needed. Publish each tenant's live usage against its quota on a dashboard, because teams that can see their headroom file far fewer tickets. The common mistake is setting quotas once and forgetting them: review them monthly against actual usage and the provider limits you have bought.

```quiz
{"q": "A tenant's bucket has capacity $B = 300{,}000$ tokens and refill $r = 10{,}000$ tokens/s. What is the most it can consume in any 2-minute window?", "options": ["1,200,000 tokens", "1,500,000 tokens", "300,000 tokens", "1,800,000 tokens"], "answer": 1, "explain": "\\$B + rT = 300{,}000 + 10{,}000 \\times 120 = 1{,}500{,}000\\$. 1,200,000 forgets the initial burst; 300,000 counts only the burst."}
```

```quiz
{"q": "Capacity is 90 units. Three equal-weight tenants demand 10, 40 and 60. Under max-min fairness, what does the 60-unit tenant get?", "options": ["30", "40", "60", "26.7"], "answer": 1, "explain": "Equal shares are 30 each. The first tenant needs only 10, leaving 80 for the other two: 40 each. The second wants exactly 40, so the third gets the remaining 40. Answering 30 forgets to redistribute the unused 20."}
```
