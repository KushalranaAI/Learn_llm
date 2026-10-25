---
title: Is the router actually helping?
minutes: 7
---

A router that sends 60% of traffic to a small model and keeps quality at 91.4% sounds good. But good compared with what? Two baselines tell you whether the router has learned anything: **random routing**, which sends the same fraction to the small model without looking at the request, and the **oracle**, which magically knows which requests the small model will get right. A useful router sits much closer to the oracle than to random.

## The random baseline

Random routing with fraction $f$ inherits each model's average quality:

$$
Q_{\text{random}}(f) = f\, q_s + (1 - f)\, q_\ell
$$

where $q_s$ and $q_\ell$ are the overall pass rates of the small and large models. Using the evaluation set from the previous topic ($q_s = 0.78$, $q_\ell = 0.92$) at $f = 0.6$:

$$
Q_{\text{random}} = 0.6 \times 0.78 + 0.4 \times 0.92 = 0.468 + 0.368 = 0.836
$$

The router at the same $f = 0.6$ achieved $0.914$. It is worth $91.4 - 83.6 = 7.8$ quality points at identical cost. That gap is the router's value.

## The oracle ceiling

The oracle sends a request to the small model exactly when the small model would be right. In the evaluation set that is 780 requests ($f = 0.78$). The other 220 go to the large model; suppose it gets 160 of those right. Then

$$
Q_{\text{oracle}} = \frac{780 + 160}{1000} = 0.94, \qquad c_{\text{oracle}} = 0.78 \times 0.001 + 0.22 \times 0.010 = 0.00078 + 0.0022 = \$0.00298
$$

The oracle is both better and cheaper than anything you can build, which makes it a ceiling, not a target. It tells you how much room is left: the best router could reach 94% at about \$0.003, while yours sits at 91.4% for \$0.0046.

| Strategy | $f$ (small) | Quality | Cost per request |
|---|---|---|---|
| Large only | 0% | 92.0% | \$0.0100 |
| Random routing | 60% | 83.6% | \$0.0046 |
| Your router, $\tau = 0.7$ | 60% | 91.4% | \$0.0046 |
| Oracle | 78% | 94.0% | \$0.00298 |

## Two kinds of router error

Think of the router as a classifier with two ways to be wrong.

- **Harmful downgrades**: routed to small, and the small model fails. These cost quality. At $\tau = 0.7$ that is $600 - 564 = 36$ requests.
- **Wasted escalations**: routed to large, but the small model would have been right. These cost money. The small model is right on 780 requests overall and 564 of those were routed small, so $780 - 564 = 216$ requests were escalated unnecessarily.

Each wasted escalation costs $c_\ell - c_s = 0.010 - 0.001 = \$0.009$ extra. Over 1,000 requests: $216 \times 0.009 = \$1.944$, or \$0.0019 per request, about 42% of the router's \$0.0046 per-request spend. That is where a better router would save money.

```steps
Build the evaluation set for a router
Sample real production requests, stratified by feature and customer, not just the easy ones you remember. A few hundred to a few thousand is typical.
---
Run both models on every request and grade both answers with the same rubric or judge.
---
Score every request with the router and sweep the threshold, recording $f$, quality and cost at each value.
---
Add the random and oracle rows at the same $f$ so the router's value and its headroom are visible.
---
Re-run the whole sweep whenever either model, the prompt or the router changes.
```

Now explore the trade-off interactively. The separation slider is a stand-in for how good the confidence signal is: at zero the check carries no information (random), at high values it approaches the oracle.

```sim
model-cascade
{"threshold": 0.7, "easyShare": 0.7, "separation": 2}
```

Set separation to 0 and note that quality at any threshold is no better than a blend of the two models. Then raise it to 4 and see how much cost you can remove at the same quality.

## In practice

The commonest failure is evaluating the router on data that looks like its training data. Hold out recent traffic, and break results down by segment: a router that is excellent on English support tickets and poor on code questions can look fine on average while one customer gets far worse answers. Report per-segment quality next to the overall number.

```quiz
{"q": "Small model quality is 70% and large is 90%. Random routing sends 50% to each. What quality does random routing achieve?", "options": ["80%", "70%", "90%", "63%"], "answer": 0, "explain": "Q = f·q_s + (1 − f)·q_ℓ = 0.5 × 0.70 + 0.5 × 0.90 = 0.80. Random routing simply averages the two models; any router worth deploying must beat this at the same f."}
```

```quiz
{"q": "On 1,000 requests the router escalates 150 requests that the small model would have answered correctly. With c_s = \\$0.002 and c_ℓ = \\$0.012, how much did those escalations waste?", "options": ["\\$1.50", "\\$1.80", "\\$0.30", "\\$2.10"], "answer": 0, "explain": "Each wasted escalation costs c_ℓ − c_s = \\$0.010 extra, so 150 × 0.010 = \\$1.50. \\$1.80 uses the full large-model price, forgetting that the small call would still have been paid."}
```
