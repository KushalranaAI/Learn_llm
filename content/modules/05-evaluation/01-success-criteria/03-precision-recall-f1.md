---
title: Precision, recall and F1
minutes: 9
---

Many LLM tasks are really detection or extraction tasks in disguise. "Pull every action item out of this meeting transcript." "Flag messages that contain medical advice." "Return the documents relevant to this question." In each case the system makes a set of claims, and the truth is another set. There are two different ways to be wrong: claim something that is not there, or miss something that is.

A fishing net makes the distinction concrete. A fine net catches every fish in the lake but also boots, weeds and plastic. A coarse net brings up only fish but lets most of them escape. **Precision** asks: of what I caught, how much is fish? **Recall** asks: of all the fish, how many did I catch? Neither number alone tells you whether the net is good.

## The confusion matrix

For a yes/no decision on each item, every case lands in one of four cells:

| | Truly positive | Truly negative |
|---|---|---|
| **Predicted positive** | true positive (TP) | false positive (FP) |
| **Predicted negative** | false negative (FN) | true negative (TN) |

From these four counts:

$$
\text{precision} = \frac{TP}{TP + FP}, \qquad \text{recall} = \frac{TP}{TP + FN}, \qquad \text{accuracy} = \frac{TP + TN}{TP + FP + FN + TN}
$$

**F1** combines precision $P$ and recall $R$ with a harmonic mean, which stays low unless both are high:

$$
F_1 = \frac{2PR}{P + R}
$$

Its generalisation **F-beta** weights recall $\beta$ times as heavily as precision:

$$
F_\beta = \frac{(1+\beta^2)\,P R}{\beta^2 P + R}
$$

$\beta = 2$ favours recall (missing things is worse), $\beta = 0.5$ favours precision (false alarms are worse), and $\beta = 1$ gives $F_1$.

```steps
Action-item extraction, by hand
The reference transcript contains 60 action items. The model extracts 50 items, of which 40 match a real one.
---
$TP = 40$, $FP = 50 - 40 = 10$, $FN = 60 - 40 = 20$. (There is no meaningful TN here: the "items not extracted and not real" are uncountable. That is why extraction uses precision and recall, not accuracy.)
---
Precision $= 40/50 = 0.80$. Recall $= 40/60 = 0.667$.
---
$F_1 = \dfrac{2 \times 0.80 \times 0.667}{0.80 + 0.667} = \dfrac{1.067}{1.467} = 0.727$. The plain average would be 0.733; the harmonic mean is pulled toward the weaker number.
---
$F_2 = \dfrac{5 \times 0.80 \times 0.667}{4 \times 0.80 + 0.667} = \dfrac{2.667}{3.867} = 0.690$ (lower, because the weak recall now counts more). $F_{0.5} = \dfrac{1.25 \times 0.533}{0.2 + 0.667} = 0.769$.
```

Why the harmonic mean? Consider a lazy extractor that returns every sentence in the transcript. Recall might reach 1.0 while precision falls to 0.05. The arithmetic mean is 0.525, which sounds respectable; $F_1 = 2(0.05)(1.0)/1.05 = 0.095$, which correctly says the output is useless.

## When accuracy lies

Accuracy is fine when classes are balanced and both errors cost the same. LLM safety and moderation problems are rarely like that. Suppose 1,000 messages contain 20 that are harmful. A filter that **never flags anything** gets $TN = 980$, $FN = 20$:

$$
\text{accuracy} = \frac{0 + 980}{1000} = 98\%, \qquad \text{recall} = \frac{0}{0 + 20} = 0
$$

98% accuracy, zero usefulness. With rare positives, always report precision and recall (or the full confusion matrix) for the class you care about.

## Precision and recall in RAG and LLM evals

The same two questions appear throughout the course:

| Setting | Precision asks | Recall asks |
|---|---|---|
| Retrieval (top-$k$ documents) | how many retrieved documents are relevant | how many relevant documents were retrieved (recall@k) |
| Claim checking of an answer | how many claims in the answer are supported | how many key facts from the reference appear |
| Guardrail classifier | how many blocked requests were really attacks | how many attacks were blocked |
| Judge model as a detector of bad answers | how many flagged answers are really bad | how many bad answers get flagged |

## In practice

Report precision and recall separately in dashboards; F1 is a convenient single number for ranking, but it hides which way a system is failing. When a product owner says "fewer false alarms", they are asking for precision; "never miss one" is recall. Pick F-beta deliberately to match that, and say which beta you used. For multi-class problems, compute per class first, then average (macro average treats classes equally; micro average pools all counts and is dominated by frequent classes).

```quiz
{"q": "A medical-advice detector flags 30 messages; 24 of them really contain medical advice. There are 40 such messages in total. What is its F1?", "options": ["0.69", "0.80", "0.60", "0.70"], "answer": 0, "explain": "Precision $= 24/30 = 0.80$, recall $= 24/40 = 0.60$. $F_1 = 2(0.8)(0.6)/(1.4) = 0.96/1.4 = 0.686 \\approx 0.69$. The arithmetic mean, 0.70, is the tempting wrong answer; the harmonic mean is always at or below it."}
```

```quiz
{"q": "Missing a fraudulent refund request costs ten times more than reviewing a legitimate one by mistake. Which summary metric fits best?", "options": ["Accuracy", "$F_{0.5}$", "$F_2$ or another recall-weighted measure", "Precision alone"], "answer": 2, "explain": "Misses (false negatives) are the expensive error, so weight recall more heavily: $\\beta > 1$. $F_{0.5}$ does the opposite. Accuracy ignores the imbalance in both class frequency and cost."}
```
