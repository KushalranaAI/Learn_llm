---
title: Routers and choosing a threshold
minutes: 8
---

A cascade decides after seeing the small model's answer. A **router** decides before calling any model. It reads the request, predicts how hard it is, and sends it straight to one model. The advantage is that a hard request never pays for a wasted small-model call and never waits for one. The price is that the router must guess without seeing an answer, so it makes more mistakes than a good after-the-fact check.

Most routers produce a **score** $s(x) \in [0,1]$ for request $x$: an estimate of the probability that the small model will answer it correctly. A **threshold** $\tau$ turns the score into a decision:

$$
\text{route}(x) = \begin{cases} \text{small} & \text{if } s(x) \ge \tau \\ \text{large} & \text{otherwise} \end{cases}
$$

## Expected cost of a router

If a fraction $f$ of traffic scores at or above the threshold, and the router itself costs $c_r$ per request:

$$
\mathbb{E}[c] = c_r + f\, c_s + (1-f)\, c_\ell
$$

With $c_r = \$0.0001$ (a small classifier), $f = 0.6$, $c_s = \$0.001$ and $c_\ell = \$0.010$:

$$
\mathbb{E}[c] = 0.0001 + 0.6 \times 0.001 + 0.4 \times 0.010 = 0.0001 + 0.0006 + 0.004 = \$0.0047
$$

Raising $\tau$ lowers $f$ and raises cost; lowering $\tau$ does the opposite. The threshold is a single dial that slides you along a cost-quality curve.

## Picking the threshold from data

You cannot choose $\tau$ by intuition. You run both models on a labelled evaluation set, score every request with the router, and tabulate what each threshold would have done. Here is a hypothetical 1,000-request set where the small model is right on 780 requests overall and the large model on 920:

| $\tau$ | Routed small ($f$) | Small correct on those | Large correct on the rest | Overall quality | Cost per request (excl. router) |
|---|---|---|---|---|---|
| 0.9 | 400 (40%) | 388 (97%) | 534 of 600 | 92.2% | \$0.0064 |
| 0.7 | 600 (60%) | 564 (94%) | 350 of 400 | 91.4% | \$0.0046 |
| 0.5 | 750 (75%) | 675 (90%) | 210 of 250 | 88.5% | \$0.00325 |
| large only | 0 | — | 920 of 1,000 | 92.0% | \$0.0100 |

Check one row yourself. At $\tau = 0.7$: overall quality is $(564 + 350)/1000 = 91.4\%$, and cost is $0.6 \times 0.001 + 0.4 \times 0.010 = 0.0006 + 0.004 = \$0.0046$.

Two things stand out. First, at $\tau = 0.9$ the routed system slightly beats large-only quality (92.2% vs 92.0%) at 64% of the cost: on some easy requests the small model is right where the large one is not. Second, quality falls quickly below $\tau = 0.7$, because the small model starts receiving requests it fails on.

```steps
Choose a threshold
State the target: overall quality of at least 91%.
---
List the thresholds that meet it: $\tau = 0.9$ (92.2%) and $\tau = 0.7$ (91.4%). $\tau = 0.5$ (88.5%) fails.
---
Take the cheapest survivor: $\tau = 0.7$ at \$0.0046 per request, plus \$0.0001 for the router, so \$0.0047.
---
Compare with large-only: $0.0047 / 0.0100 = 47\%$ of the cost for 0.6 points of quality.
---
Write down the margin: 91.4% clears the bar by only 0.4 points, so monitor it closely in production.
```

## Router or cascade?

| | Cascade | Router |
|---|---|---|
| Decision made | after the small answer | before any call |
| Escalated requests pay | $c_s + c_\ell$ | $c_\ell$ |
| Escalated latency | $T_s + T_\ell$ | $T_\ell$ |
| Signal quality | strong (sees the answer) | weaker (sees only the request) |
| Best when | answers can be validated cheaply | latency matters, or $c_s$ is not tiny |

Systems often combine them: a router sends obviously hard requests straight to the large model, and the rest go through a cascade.

```sim
model-cascade
```

Set the threshold so that roughly 60% of traffic goes to the small model, then move it in small steps in each direction. Watch how cost changes almost linearly while quality changes slowly at first and then sharply. That asymmetry is why the knee of the curve is the usual operating point.

## In practice

Router scores drift. When your traffic mix changes (a new customer, a new language, a product launch), the fraction above the threshold changes too, and so does quality. Track $f$ daily; a sudden jump in $f$ usually means a new kind of traffic that the router misjudges, not that requests got easier.

```quiz
{"q": "A router costs \\$0.0002, sends 70% of traffic to a \\$0.002 model and the rest to a \\$0.012 model. What is the expected cost per request?", "options": ["\\$0.0052", "\\$0.0050", "\\$0.0070", "\\$0.0086"], "answer": 0, "explain": "0.0002 + 0.7 × 0.002 + 0.3 × 0.012 = 0.0002 + 0.0014 + 0.0036 = \\$0.0052. \\$0.0050 forgets the router's own cost."}
```

```quiz
{"q": "Raising the router threshold from 0.5 to 0.9 in the table above does what?", "options": ["Raises quality and raises cost, because fewer requests go to the small model", "Lowers cost, because the router becomes stricter", "Raises quality and lowers cost", "Changes quality but not cost"], "answer": 0, "explain": "A higher threshold means only very confident requests go small, so f falls from 75% to 40%: more traffic pays the large-model price, and quality rises from 88.5% to 92.2%. 'Stricter' sounds cheaper, but strict about using the small model means using it less."}
```
