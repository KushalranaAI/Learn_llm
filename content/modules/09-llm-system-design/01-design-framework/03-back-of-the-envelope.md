---
title: "Back-of-the-envelope: users to QPS, tokens and API cost"
minutes: 9
---

An estimate is a short chain of multiplications, each with a stated assumption. The goal is not precision; it is to land within a factor of two or three so you know which kind of system you are building. A design for 5 QPS and a design for 500 QPS share almost no components.

Think of it as a funnel: **users, then requests, then rates, then tokens, then money**. Each arrow is one multiplication you can say aloud.

## The chain

Let $U$ be daily active users, $m$ messages per user per day, $T_{in}$ and $T_{out}$ input and output tokens per request, and $\pi$ the **peak factor**: the ratio of peak to average traffic. Then:

$$
R = U\,m, \qquad \text{QPS}_{avg} = \frac{R}{86{,}400}, \qquad \text{QPS}_{peak} = \pi\,\text{QPS}_{avg}
$$

$$
\text{tokens/day}_{in} = R\,T_{in}, \qquad \text{cost/day} = R\left(T_{in}\,p_{in} + T_{out}\,p_{out}\right)
$$

where $R$ is requests per day, 86,400 is seconds per day, and $p_{in}, p_{out}$ are prices per token (a price of \$1.00 per million tokens is $p = 10^{-6}$ dollars per token).

```steps
The running example, one multiplication at a time
Requests per day: $R = 2{,}000{,}000 \times 5 = 10{,}000{,}000$.
---
Average rate: $10{,}000{,}000 / 86{,}400 = 115.7$ QPS. With peak factor $\pi = 3$: $347$ QPS.
---
Tokens per day: input $10\text{M} \times 1{,}500 = 15$ billion; output $10\text{M} \times 300 = 3$ billion.
---
Hypothetical large-model price, \$1.00 per 1M input and \$4.00 per 1M output: input $15{,}000 \times 1.00 = \$15{,}000$ per day; output $3{,}000 \times 4.00 = \$12{,}000$ per day. Total \$27,000 per day.
---
Per month (30 days): $27{,}000 \times 30 = \$810{,}000$. Per request: $\$27{,}000 / 10\text{M} = \$0.0027$.
```

Notice that output is only 17% of the tokens but 44% of the bill ($12{,}000 / 27{,}000$). Output tokens cost more and are generated one at a time, so output length is the first lever to look at. You can reproduce this chain interactively.

```sim
token-cost
```

Set requests per day to 10 million and compare the cost with prompt 1,500 and output 300 against prompt 1,500 and output 150. Then raise the price per 1M tokens and see how fast the monthly line scales: cost is linear in every factor, so a 2x error anywhere is a 2x error in the bill.

## Choosing the peak factor

The factor $\pi$ depends on the audience. Consumer apps with global users are flat-ish: $\pi \approx 2$ to $3$. Office tools concentrate traffic in working hours: if 80% of requests fall in 8 hours, the busy-period average is $0.8R/28{,}800$ seconds, which is $2.4\times$ the 24-hour average, before bursts. Batch pipelines can be shaped, so $\pi \approx 1$. State your choice: "peak factor 3, because launches and marketing spikes".

## Cheaper by design: caching

Many requests start with the same system prompt and instructions. Suppose 60% of input tokens are a shared prefix, and the provider charges 10% of the normal price for cached input (a hypothetical 90% discount). Input cost per day becomes

$$
15{,}000 \times \left(0.6 \times 0.1 + 0.4\right) = 15{,}000 \times 0.46 = \$6{,}900
$$

Total per day: $6{,}900 + 12{,}000 = \$18{,}900$, and per month **\$567,000**: a 30% saving from one design decision. Notice what is left: output is now 63% of the spend, so the next saving must come from shorter answers or a cheaper model for easy requests.

| Scenario | Per day | Per month | Versus baseline |
|---|---|---|---|
| Large model, no cache | \$27,000 | \$810,000 | 1.00 |
| Large model, 60% prefix cached at 90% off | \$18,900 | \$567,000 | 0.70 |
| Small model for everything (\$0.10 / \$0.40) | \$2,700 | \$81,000 | 0.10 |

The last row is a lesson in itself: a model ten times cheaper changes the bill by an order of magnitude, far more than any caching trick. Whether it keeps the quality is a question for the evaluation step.

## In practice

Say your assumptions before the numbers, round aggressively (116 QPS, not 115.74), and keep units on everything. Sanity-check against a known reference: \$0.0027 per request is a quarter of a cent, so a user who sends 5 messages a day costs about 1.4 cents a day. If the product earns more than that per user, the idea is viable; if it is a free app with no revenue per user, you have found your design constraint. The next topic turns the same traffic into GPUs; the lab below lets you practise the whole chain.

```lab
capacity-plan
```

```quiz
{"q": "3 million daily users send 4 messages each. What is the average QPS?", "options": ["About 36", "About 139", "About 417", "About 12,000"], "answer": 1, "explain": "3M × 4 = 12M requests per day; 12,000,000 / 86,400 ≈ 139 QPS. 417 is the peak at a factor of 3, not the average, and 36 comes from dividing by about 330,000 seconds instead of 86,400."}
```

```quiz
{"q": "Input is 15B tokens/day at \\$1.00 per 1M; output is 3B tokens/day at \\$4.00 per 1M. Which statement is true?", "options": ["Input costs more because there are five times more input tokens", "Output costs less because there are fewer output tokens", "Input costs \\$15,000 and output \\$12,000 per day, so output is a large share despite being few tokens", "They cost exactly the same"], "answer": 2, "explain": "Input: 15,000 × \\$1 = \\$15,000. Output: 3,000 × \\$4 = \\$12,000. Output tokens are priced four times higher, so 17% of the tokens produce 44% of the bill."}
```
