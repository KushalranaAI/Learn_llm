---
title: Fine-tuning break-even arithmetic
minutes: 9
---

Suppose diagnosis says the remaining failures are behavioural, retrieval and prompting are tuned, and a fine-tuned small model could replace a large one. Is it worth the money? That is an arithmetic question with four ingredients: what you save per request, how many requests you serve, what the fine-tune costs up front and what it costs to keep.

## The saving per request

Let the current setup (large model, long prompt) cost $c_0$ per request, and the fine-tuned setup (small tuned model, short prompt) cost $c_1$. The saving is

$$
\Delta c = c_0 - c_1
$$

Take $c_0 = \$0.010$ and $c_1 = \$0.002$ (a tuned small model with a 200-token prompt, including any hosting premium per request). Then $\Delta c = \$0.008$ per request. Measure $c_0$ and $c_1$ the same way, including retries and the share of traffic that falls back to the large model.

## The up-front cost

The one-time cost $C$ is more than the training run. Count everything:

| Item | Assumption | Cost |
|---|---|---|
| Labelling and curating data | 3,000 examples at \$1.50 each | \$4,500 |
| Training runs (several, with tuning) | compute for adapters on a small model | \$600 |
| Evaluation set, judging, red-team checks | 40 hours of engineering at \$100 | \$4,000 |
| **Total one-time cost $C$** | | **\$9,100** |

Engineer time usually dominates the compute. The hardest cost to estimate is data: good training examples are written or reviewed by people who understand the task.

## Break-even volume

The fine-tune pays for itself when the cumulative saving equals the up-front cost. The number of requests needed is

$$
N^{*} = \frac{C}{\Delta c} = \frac{9{,}100}{0.008} = 1{,}137{,}500 \text{ requests}
$$

At a volume of $V = 200{,}000$ requests per month, the gross monthly saving is $V\,\Delta c = 200{,}000 \times 0.008 = \$1{,}600$, so ignoring ongoing costs the payback time is

$$
T = \frac{C}{V\,\Delta c} = \frac{9{,}100}{1{,}600} = 5.7 \text{ months}
$$

## Include the ongoing cost

A fine-tuned model is a thing you maintain. Say serving it costs an extra fixed \$500 a month (a dedicated endpoint, monitoring, on-call share). Then the net monthly saving is $V\,\Delta c - M$ and

$$
T = \frac{C}{V\,\Delta c - M} = \frac{9{,}100}{1{,}600 - 500} = \frac{9{,}100}{1{,}100} = 8.3 \text{ months}
$$

where $M$ is the monthly maintenance cost. The break-even is very sensitive to volume, because $M$ is fixed while the saving scales with $V$:

| Monthly volume $V$ | Gross saving $V\,\Delta c$ | Net after $M = \$500$ | Payback time |
|---|---|---|---|
| 50,000 | \$400 | −\$100 | never |
| 100,000 | \$800 | \$300 | 30.3 months |
| 200,000 | \$1,600 | \$1,100 | 8.3 months |
| 1,000,000 | \$8,000 | \$7,500 | 1.2 months |

Check the 100,000 row: $9{,}100/300 = 30.3$. Below the volume where $V\,\Delta c = M$, which is $V = 500/0.008 = 62{,}500$ requests a month, the fine-tune **never** pays back. Fine-tuning is a high-volume play.

```steps
Run the break-even check
Measure the current cost per request $c_0$ and the achievable tuned cost $c_1$, on the same traffic. Compute $\Delta c = c_0 - c_1$.
---
List every one-time cost: data, compute, evaluation, engineering. Sum to $C$.
---
List ongoing costs per month: hosting, monitoring, periodic retraining. Sum to $M$.
---
Estimate monthly volume $V$ conservatively. Compute the net saving $V\,\Delta c - M$. If it is zero or negative, stop.
---
Compute the payback $T = C/(V\,\Delta c - M)$. Compare with the lifetime you expect before the base model changes (often 12 to 24 months).
```

## What the arithmetic leaves out

The calculation values only dollars, so test it against these factors:

- **Quality**: if the tuned small model is a point or two worse than the large one, the cost saved should be weighed against the quality lost (use the quality-cost frontier from the first lesson). If quality improves, the benefit may exceed the saving.
- **Latency**: a smaller model with a shorter prompt is faster, and some products pay for speed.
- **Risk**: a tuned model is a new thing to validate, monitor and secure.
- **Opportunity cost**: the same 40 hours of engineering might fix retrieval for a bigger gain.
- **Alternatives for the same saving**: routing easy traffic to a small untuned model, prompt caching or shorter outputs may capture most of $\Delta c$ without any training.

## In practice

Require the break-even calculation in the proposal for any fine-tune, with the volume, cost and quality assumptions written down and reviewed. Revisit the numbers after launch: real volume and real maintenance are usually different from the estimate, and a fine-tune that no longer pays should be retired in favour of a simpler setup.

```quiz
{"q": "A fine-tune costs \\$12,000 up front. It saves \\$0.006 per request and you serve 400,000 requests per month, with \\$600 per month of maintenance. How long until it pays back?", "options": ["About 6.7 months", "5 months", "About 8.3 months", "Never"], "answer": 0, "explain": "Net monthly saving = 400,000 × 0.006 − 600 = 2,400 − 600 = \\$1,800, and 12,000/1,800 = 6.7 months. Ignoring maintenance gives 12,000/2,400 = 5 months."}
```

```quiz
{"q": "At what monthly volume does the saving just cover a \\$400 monthly maintenance cost when each request saves \\$0.004?", "options": ["100,000 requests", "10,000 requests", "1,000,000 requests", "1,600 requests"], "answer": 0, "explain": "V × 0.004 = 400 gives V = 100,000. Below that, the fine-tune loses money every month regardless of how large the one-time cost is."}
```
