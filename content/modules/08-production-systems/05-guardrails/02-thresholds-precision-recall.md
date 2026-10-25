---
title: Thresholds, precision and recall
minutes: 8
---

A learned guardrail does not output "attack" or "benign". It outputs a **score**, say 0.83, and you choose a **threshold** $t$: block when the score is at least $t$. Moving $t$ changes two things in opposite directions. Lower it and you catch more attacks but also block more innocent users. Raise it and the reverse happens. No threshold is free.

## The four outcomes

Against labelled data every request lands in one of four cells:

| | Flagged (blocked) | Not flagged (allowed) |
|---|---|---|
| **Attack** | true positive (TP) | false negative (FN), a missed attack |
| **Benign** | false positive (FP), a false block | true negative (TN) |

From them come the standard measures:

$$
\text{precision} = \frac{TP}{TP + FP}, \qquad \text{recall} = \frac{TP}{TP + FN}, \qquad F_1 = \frac{2\,TP}{2\,TP + FP + FN}
$$

**Precision** answers "when we block, how often is it a real attack?". **Recall** (also the true-positive rate) answers "of the real attacks, how many did we block?". $F_1$ is their harmonic mean, a single summary that punishes lopsidedness. The **false-positive rate** is $FP/(FP+TN)$.

## A threshold sweep

Take 10,000 requests, of which 100 are attacks (a 1% base rate) and 9,900 are benign. A classifier produces these counts at four thresholds:

| Threshold $t$ | TP | FN | FP | Precision | Recall | $F_1$ |
|---|---|---|---|---|---|---|
| 0.3 | 97 | 3 | 900 | 9.7% | 97% | 0.176 |
| 0.5 | 90 | 10 | 300 | 23.1% | 90% | 0.367 |
| 0.7 | 75 | 25 | 80 | 48.4% | 75% | 0.588 |
| 0.9 | 50 | 50 | 10 | 83.3% | 50% | 0.625 |

Check the $t = 0.5$ row: precision $= 90/(90 + 300) = 0.231$; recall $= 90/100 = 0.90$; $F_1 = 180/(180 + 300 + 10) = 180/490 = 0.367$. Raising the threshold from 0.3 to 0.9 lifts precision from about 10% to 83% while recall falls from 97% to 50%.

$F_1$ is highest at $t = 0.9$ here, but $F_1$ treats both mistakes as equally bad, and in security they rarely are.

## Choose by cost

Put prices on the two mistakes. Say a false block costs $c_{FB} = \$2$ (a frustrated user, a support ticket) and a missed attack costs $c_{\text{miss}} = \$100$ (an incident). Expected cost over the 10,000 requests is

$$
\text{cost}(t) = c_{FB}\cdot FP(t) + c_{\text{miss}}\cdot FN(t)
$$

| $t$ | $FP \times \$2$ | $FN \times \$100$ | Total |
|---|---|---|---|
| 0.3 | \$1,800 | \$300 | \$2,100 |
| 0.5 | \$600 | \$1,000 | \$1,600 |
| 0.7 | \$160 | \$2,500 | \$2,660 |
| 0.9 | \$20 | \$5,000 | \$5,020 |

The cheapest threshold is $t = 0.5$ at \$1,600, even though its $F_1$ is not the best, because a miss costs 50 times a false block. At $t = 0.7$ you save \$440 of false blocks but lose \$1,500 to the 15 extra misses. The optimum is where the next missed attack avoided is worth no more than the false blocks it adds. Change the costs and the best threshold moves: if a miss costs only \$20, the optimum shifts to a higher threshold.

```sim
guardrail-threshold
{"threshold": 0.5, "separation": 3, "baseRate": 0.01, "costFalseBlock": 2, "costMiss": 100}
```

Drag the threshold from 0.1 to 0.9 and watch the total cost curve: it has a single valley. Then raise the cost of a missed attack to 1,000 and see the optimum move left (a lower threshold, more blocking). Finally lower the base rate to 0.001 and watch precision collapse at the same threshold, which is the subject of the next topic.

## Separation: how good the classifier is

The threshold only slides you along a curve. How good the classifier is decides where the curve sits: how far apart attack scores and benign scores are. A better classifier gives you higher recall at the same false-positive rate, and no threshold can fix a weak one. Improving the classifier (more training data, better features, a bigger model) moves the whole curve; tuning the threshold only moves you along it.

```steps
Pick a threshold
Collect a labelled set that reflects real traffic, including its true attack rate. Include hard negatives: benign requests that look like attacks.
---
Sweep thresholds and compute TP, FP, FN for each.
---
Price the two mistakes with the product and security owners. Write the numbers down.
---
Compute total expected cost per threshold and take the minimum. Check recall against any hard requirement (for example, at least 80% of known attacks).
---
Repeat when traffic changes: the best threshold depends on the base rate.
```

## In practice

Most teams set separate thresholds per action: a low threshold (aggressive blocking) before an irreversible action like payment, a high one (permissive, with logging) for casual chat. Also consider a **middle band**: scores above 0.9 are blocked, scores between 0.5 and 0.9 go to a safer mode or human review, scores below 0.5 pass.

```quiz
{"q": "At a given threshold a classifier gives TP = 40, FP = 10, FN = 20. What are precision and recall?", "options": ["Precision 80%, recall 67%", "Precision 67%, recall 80%", "Precision 80%, recall 80%", "Precision 40%, recall 20%"], "answer": 0, "explain": "Precision = 40/(40 + 10) = 0.80; recall = 40/(40 + 20) = 0.667. Swapping them is the usual slip: precision looks at what was flagged, recall at what was actually bad."}
```

```quiz
{"q": "A missed attack becomes 10 times costlier while everything else stays the same. What should happen to the optimal blocking threshold?", "options": ["It should go down, blocking more", "It should go up, blocking less", "It should not change", "It should be set to 1.0"], "answer": 0, "explain": "When misses cost more, you accept more false blocks to catch more attacks, which means a lower threshold. A threshold of 1.0 would block nothing and maximise misses."}
```
