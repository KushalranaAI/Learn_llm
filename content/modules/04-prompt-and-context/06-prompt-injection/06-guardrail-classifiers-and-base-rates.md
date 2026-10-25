---
title: Guardrail classifiers when attacks are rare
minutes: 9
---

A common layer is a **guardrail classifier**: a small model that reads each input (or each retrieved document, or each output) and returns a score for "this looks like an attack". You choose a **threshold** $t$: score above it, the request is blocked or sent for review. The classifier looks accurate in a demo (it catches 93% of attacks!) and then, in production, blocks a crowd of innocent users. The reason is the **base rate**: real attacks are a tiny fraction of traffic, and that changes everything about what a "93% detector" means.

Definitions you will need:

- **Recall** (true positive rate): of all real attacks, the fraction caught.
- **False positive rate (FPR)**: of all benign requests, the fraction wrongly blocked.
- **Precision**: of everything blocked, the fraction that really were attacks.

## The maths: why precision collapses

Let the base rate of attacks be $\pi$, the recall $\text{TPR}$ and the false positive rate $\text{FPR}$. Per $M$ requests there are $\pi M$ attacks and $(1-\pi)M$ benign requests, so

$$
\text{blocked attacks} = \pi M \cdot \text{TPR}, \qquad \text{false blocks} = (1-\pi)M \cdot \text{FPR}, \qquad \text{precision} = \frac{\pi\,\text{TPR}}{\pi\,\text{TPR} + (1-\pi)\,\text{FPR}}
$$

A typical model of classifier scores places benign scores around $-d'/2$ and attack scores around $+d'/2$ on a logit scale with unit spread, where $d'$ measures how well separated the two groups are. With threshold $t = 0.5$ (a logit of 0) and separation $d' = 3$:

$$
\text{TPR} = \Phi(1.5) = 0.933, \qquad \text{FPR} = 1 - \Phi(1.5) = 0.067
$$

Here $\Phi$ is the standard normal cumulative distribution function. Now the base rate: let $\pi = 0.01$ (1% of traffic is attack) and $M = 10{,}000$ requests.

```steps
One day's traffic: 10,000 requests, 1% attacks
Attacks: $100$. Benign: $9{,}900$.
---
Caught attacks: $100 \times 0.933 = 93.3$. Missed attacks: $6.7$.
---
False blocks: $9{,}900 \times 0.0668 = 661.4$ innocent requests blocked.
---
Precision: $93.3 / (93.3 + 661.4) = 0.124$. About 88% of the blocks hit innocent users.
---
Cost with a false block costing \$2 (support, lost sale) and a missed attack costing \$100: $661.4 \times 2 + 6.7 \times 100 = 1{,}322.8 + 668.1 = \$1{,}991$ per 10,000 requests.
```

A detector with 93% recall and 93% specificity sounds strong, yet its blocks are mostly wrong because benign requests outnumber attacks 99 to 1. This is the same base-rate trap that affects medical screening for rare diseases.

## Choosing the threshold by cost

Moving the threshold trades one error for the other. Raise it and you block less: fewer false blocks, more missed attacks. Lower it and you catch more attacks and annoy more users. If a false block costs $c_{FB}$ and a miss costs $c_{M}$, the cost-minimising threshold in logit space satisfies

$$
x^{*} = \frac{1}{d'} \ln\!\left(\frac{(1-\pi)\,c_{FB}}{\pi\,c_{M}}\right)
$$

With $\pi = 0.01$, $c_{FB} = 2$, $c_M = 100$, $d' = 3$: $x^* = \tfrac{1}{3}\ln\!\left(\dfrac{0.99 \times 2}{0.01 \times 100}\right) = \tfrac{1}{3}\ln(1.98) = 0.228$, which corresponds to a score threshold of $\text{sigmoid}(0.228) = 0.557$. At that threshold, recall is 89.8%, the false positive rate 4.2%, there are about 416 false blocks and 10.2 missed attacks per 10,000, and the cost is about \$1,848, 7% lower than at 0.5. If a missed attack costs \$1,000 instead of \$100, the optimal threshold drops to about 0.37 and the classifier blocks more aggressively.

```sim
guardrail-threshold
{"threshold": 0.5, "separation": 3, "baseRate": 0.01, "costFalseBlock": 2, "costMiss": 100}
```

The sim starts at exactly the numbers above. Read the precision (about 12%), recall (about 93%) and false blocks per 10,000 (about 661). Then try three things. Drag the attack base rate down to 0.1% and watch precision fall to about 1.4%. Raise the separation to 5 (a much better classifier) and see how many false blocks disappear. Finally set the cost of a missed attack to 1,000 and find where the sim's optimal threshold moves.

## Practical consequences

- **Do not block on the classifier alone for low-consequence cases.** A flagged request can be routed to a safer path instead: strip tools, use a tool-less model, answer with a restricted template, or ask the user to rephrase.
- **Use two thresholds.** Block above a high threshold, review or downgrade capability between a low and a high one, allow below.
- **Pair the classifier with capability limits.** A classifier lowers the number of attempts that reach the model; limits bound what the rest can do. Neither is enough alone.
- **Re-measure on your own traffic.** Published separation numbers come from benchmark data. Your attack types and benign traffic (code, security discussions, legitimate "ignore previous" phrases) may sit differently.
- **Watch drift.** New attack styles lower real recall over time; new product features change the benign distribution and raise false blocks.

## In practice

Teams usually find the classifier's false blocks first, because users complain. Missed attacks are silent. That asymmetry pushes thresholds towards leniency, which is why you must estimate the costs deliberately and review a sample of passed traffic, not only of blocked traffic.

```quiz
{"q": "A detector has recall 90% and false positive rate 5%. Attacks are 0.5% of traffic. Out of 10,000 requests, roughly how many blocks are false?", "options": ["About 497 of about 542 blocks", "About 5 of 50 blocks", "About 45 of 95 blocks", "About 50 of 100 blocks"], "answer": 0, "explain": "Attacks: 50, caught 45. Benign: 9,950, false blocks 0.05 × 9,950 = 497.5. Total blocks about 542, of which 92% are false. Ignoring the base rate and applying 5% to the attack count gives the tempting but wrong small numbers."}
```

```quiz
{"q": "The cost of a missed attack rises tenfold while everything else stays the same. What happens to the cost-minimising threshold?", "options": ["It falls: the classifier should block more aggressively", "It rises: the classifier should block less", "It does not change", "It becomes 1.0"], "answer": 0, "explain": "x* includes −ln(c_M)/d', so a larger miss cost lowers it. Missing attacks becomes more expensive than false blocks, so you accept more false blocks to catch more attacks."}
```
