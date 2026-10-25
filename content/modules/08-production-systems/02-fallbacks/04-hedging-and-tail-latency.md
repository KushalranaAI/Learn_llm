---
title: Hedged requests and the p99
minutes: 7
---

Timeouts react after a long wait. **Hedging** acts earlier: if the first request has not returned after a short delay, send a second copy (to the same or another provider) and use whichever answer arrives first. The slow tail of latency is mostly bad luck on one request, so a second request gets a fresh roll of the dice.

## The idea in one line

Suppose a single request exceeds $x$ seconds with probability $P(L > x)$. If you launch a second, independent request at time $d$ and take the first answer, the user waits more than $x$ only if the first request is slow past $x$ and the second is slow past $x - d$:

$$
P(\text{hedged latency} > x) = P(L > x)\cdot P(L > x - d)
$$

Here $L$ is a single request's latency, $d$ is the **hedge delay** and independence is assumed. Two small probabilities multiply into a very small one.

## A worked example

Take measured single-request percentiles: $P(L > 1.5\text{ s}) = 0.05$ (the p95 is 1.5 s), $P(L > 4\text{ s}) = 0.01$ (the p99 is 4 s) and $P(L > 2.5\text{ s}) = 0.02$. Hedge after $d = 1.5$ s.

The chance the hedged request takes more than 4 s:

$$
P(\text{hedged} > 4) = P(L > 4)\cdot P(L > 2.5) = 0.01 \times 0.02 = 0.0002
$$

So only 0.02% of requests exceed 4 s, against 1% before: the old p99 of 4 s becomes roughly the p99.98. The extra cost: a second request is sent only when the first is still running at 1.5 s, which is the 5% of requests with $L > 1.5$ s. Load and spend go up by about 5%.

| Strategy | Requests exceeding 4 s | Extra requests sent |
|---|---|---|
| No hedging | 1% | 0% |
| Hedge after p95 (1.5 s) | 0.02% | about 5% |
| Hedge after p50 (0.8 s) | smaller still | about 50% |

Hedging at the median would cut the tail further but would add half again to your bill and load, which is rarely sensible. The usual choice is to hedge around the p90 to p95.

```steps
Add hedging to an LLM call
Measure the latency distribution of the call and read off the p95: say 1.5 s. That is the hedge delay $d$.
---
Send request 1. If it returns before $d$, you are done and spent nothing extra.
---
At $d$, send request 2 to a second provider or replica. Take the first full response (or the first token if streaming) and cancel the other.
---
Check the cost: extra spend $\approx P(L > d) \times c = 0.05 \times c$.
---
Check you are not hedging during an outage: if more than about 10% of requests need hedges, the system is overloaded and hedging will make it worse. Disable it.
```

## Limits of hedging for LLMs

- **Cost**: unlike a read from a database, a duplicate LLM request costs real money for every token. Cancel the loser as soon as the winner finishes, and note that many providers still bill tokens already generated.
- **Non-determinism**: two answers can differ. That is fine for most chat features and a problem when the answer triggers an action, so hedge only side-effect-free calls.
- **Capacity**: hedges raise load exactly when the system is slow. Combine them with a budget (hedge at most 5% of traffic) and with the circuit breaker in the next topic.
- **Rate limits**: a hedge counts against your tokens-per-minute quota too.

## In practice

Hedging is most useful for short, latency-critical calls such as classification, routing and autocomplete, where requests are cheap and the tail is painful. For long generations, the better first lever is streaming plus a time-to-first-token timeout and fallback. Track the **hedge rate** and **hedge win rate**: if the second request almost never wins, the delay is too long or hedging is not helping.

```quiz
{"q": "A single request exceeds 5 s with probability 2%. A hedged copy, launched at 1 s, exceeds 4 s with probability 5%. Assuming independence, what fraction of hedged requests exceed 5 s?", "options": ["0.1%", "7%", "2%", "0.01%"], "answer": 0, "explain": "P = P(L > 5) × P(L > 4) = 0.02 × 0.05 = 0.001, or 0.1%. Adding the probabilities (7%) would be right for 'either fails', but the user only waits if both are slow."}
```

```quiz
{"q": "You hedge at the p90 of latency. Roughly how much extra traffic does hedging generate?", "options": ["About 10%", "About 90%", "About 1%", "None, the second request is free"], "answer": 0, "explain": "A hedge is sent only when the first request is still running at the p90, which is the slowest 10% of requests. 90% would be the fraction that finished early and needed no hedge."}
```
