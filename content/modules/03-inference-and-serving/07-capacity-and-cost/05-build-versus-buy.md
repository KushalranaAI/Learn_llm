---
title: Hosted API or your own GPUs, the break-even
minutes: 8
---

Calling a hosted model costs nothing until you use it, then costs in proportion to your tokens. Running your own GPUs costs a lot up front (every month, whether or not traffic arrives) and then very little per extra token. Like renting versus buying anything, the answer depends on how much you use it.

## The break-even formula

Let $V$ be requests per month. A hosted API charges a per-request price $p_{req}$ (from the cost-per-request formula), so

$$
\text{Cost}_{API}(V) = p_{req}\,V
$$

Self-hosting costs a fixed monthly amount: $G$ GPUs at $c$ dollars per GPU-hour for about 730 hours a month, plus fixed operating costs $F$ (engineering time, monitoring, storage, networking), with $G$ set by *peak* demand, not by $V$:

$$
\text{Cost}_{self} = G\,c\cdot 730 + F
$$

Self-hosting wins when $V$ exceeds the break-even volume

$$
V^{*} = \frac{G\,c \cdot 730 + F}{p_{req}}
$$

```steps
Break-even for the chat workload
Self-host: $G = 11$ H100s at \$2.50/hour (the earlier fleet sized for 100 requests/s peak): $11 \times 2.50 \times 730 = \$20{,}075$ per month. Fixed operating cost $F = \$10{,}000$ per month. Total \$30,075.
---
Hosted alternative: a comparable small model at \$0.15 per million input and \$0.60 per million output tokens. For 1,000 input and 300 output tokens: $0.00015 + 0.00018 = \$0.00033$ per request.
---
Break-even volume: $V^* = 30{,}075/0.00033 = 91.1$ million requests per month. Over a month of $2.628$ million seconds ($730 \times 3600$) that is an average of $34.7$ requests per second.
---
Our average load was 40 requests/s ($105$ million requests/month): the API would cost $105.1\text{M} \times 0.00033 = \$34{,}690$ against \$30,075 self-hosted. Only 13% apart: close to break-even, and the decision rests on other factors.
---
At an average of 10 requests/s (26 million requests/month) the API costs about \$8,670 per month, while a fleet sized for a 2.5x peak (about 3 GPUs, \$5,475) plus the fixed \$10,000 costs \$15,475: the API wins clearly.
```

The shape is a classic: below $V^*$ pay per use, above it own the fleet. The fixed cost $F$ is often what tips small teams toward APIs: a platform engineer's time across serving, on-call, upgrades and capacity work is real money even if no invoice shows it.

## Utilisation is the hidden variable

The break-even above assumes the self-hosted fleet is sized for peak and idle off-peak. Raise utilisation by running offline or batch work in the valleys and the fleet's cost is spread across more tokens, lowering the effective self-hosted price per request and moving $V^*$ down. Conversely, an API's per-token price already includes the provider's utilisation, which at scale can be very high because they pool many customers with different daily peaks. That pooling is a real advantage no single team can match.

## Beyond cost

| Factor | Favours hosted API | Favours self-hosting |
|---|---|---|
| Volume | Low or spiky | High and steady |
| Model quality needed | Frontier capability | An open model is good enough (or fine-tuned for your task) |
| Latency control | Provider's SLO | Tuned stack, co-location, custom batching, speculative decoding |
| Data constraints | Provider terms acceptable | Data must stay in your environment |
| Operational burden | Little | Substantial: scaling, upgrades, on-call |
| Cost predictability | Scales with usage | Fixed, regardless of use |
| Customisation | Limited fine-tuning options | Full control, any adapter or quantization |

A hybrid is common: self-host the high-volume, well-understood workloads with a steady baseline load, and use APIs for rare tasks, frontier-model needs and overflow at peak. The gateway lessons in the production modules show how to route between them.

## See it

```sim
gpu-capacity
{"qps": 40, "promptTokens": 1000, "outputTokens": 300, "model": "llama3-8b", "gpu": "h100", "batch": 64, "targetUtil": 0.7, "gpuPrice": 2.5}
```

Read the monthly cost the sim reports for an average load of 40 requests per second, and compare it with the API figure of about \$34,700 in the walkthrough. Then reduce the request rate to 10 and see how the sim's cost falls (fewer GPUs) while the fixed engineering cost, which the sim does not include, stays. Increase the price per GPU-hour to 5 and find the request rate at which self-hosting stops being cheaper than the API.

## In practice

Run the numbers with *your* measured per-GPU capacity, *your* peak-to-average ratio and an honest estimate of operating cost, and revisit them every few quarters: API prices fall quickly, open models improve, and GPU prices move. It is cheap to start on an API and put a thin abstraction in front so that a model can later be moved in-house when the break-even volume is clearly exceeded. It is expensive to buy a fleet for traffic that never arrives.

```quiz
{"q": "Self-hosting costs \\$24,000 per month in total. A hosted API costs \\$0.0004 per request. What monthly volume is the break-even?", "options": ["60 million requests", "6 million requests", "96 million requests", "600 million requests"], "answer": 0, "explain": "$V^* = 24{,}000/0.0004 = 60{,}000{,}000$. Slipping a decimal gives 6 million or 600 million; always check the order of magnitude against a plausible requests-per-second figure (60 million per month is about 23 requests/s)."}
```

```quiz
{"q": "Which change moves the self-hosting break-even volume down (making self-hosting attractive at lower volume)?", "options": ["Filling the fleet's idle off-peak hours with batch work", "Doubling the fixed engineering cost", "Cutting the hosted API's price in half", "Sizing the fleet for a higher peak"], "answer": 0, "explain": "More useful work from the same fixed spend lowers self-hosted cost per request. A higher fixed cost, a cheaper API or a larger fleet all push the break-even volume up."}
```
