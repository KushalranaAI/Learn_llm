---
title: Jailbreak evals done honestly: budgets and graders
minutes: 9
---

A **jailbreak** is an input crafted to make a model produce something its policy forbids. Measuring jailbreak robustness sounds simple: try attacks, count successes. In practice two details decide whether the number means anything. First, the **attack budget**: how many attempts, and how adaptive, the attacker gets. Second, the **grader**: how you decide that a response really was a successful jailbreak.

Testing a lock is the analogy. "Opened by 2% of single attempts with a random key" and "opened within an hour by a locksmith" are both true statements about the same lock. And if your inspector counts a door that swung open in the wind as "picked", your numbers are wrong in a different way.

## Standardise the protocol

Before **HarmBench** (2024), jailbreak papers each used their own behaviours, models and success criteria, so results could not be compared. HarmBench fixed a set of harmful behaviours and a grading classifier, then compared 18 automated red-teaming methods against 33 target models and defences under the same protocol. The lesson for your own evals is the same: fix the behaviour set, the attack methods, the number of attempts and the grader, and record them with every result.

## The maths: attack budgets

If a single attempt succeeds with probability $a$ and attempts are roughly independent, an attacker with $k$ attempts succeeds at least once with probability

$$
\text{ASR}@k = 1 - (1 - a)^k
$$

This is pass@k from the attacker's side. Report ASR at several budgets, because a defence that looks strong at $k = 1$ can be weak at $k = 100$.

```sim
pass-at-k
```

Read "per-attempt success" as the per-attempt jailbreak rate. Set it to 0.02 and $k = 1$: the model looks robust. Raise $k$ to 20 and watch pass@k (the attacker's chance) climb past 30%. The pass^k number, all attempts succeeding, is irrelevant here: an attacker needs only one success.

```steps
Budget changes the story
Per-attempt success $a = 0.02$. At $k = 1$: ASR = 2%.
---
At $k = 20$: $1 - 0.98^{20} = 1 - 0.668 = 0.33$.
---
At $k = 100$: $1 - 0.98^{100} = 1 - 0.133 = 0.87$.
---
Adaptive attacks (which learn from refusals) do better than this independent-attempts formula, so treat it as a lower bound on a determined attacker's success.
```

## The maths: grader errors inflate ASR

Graders that look only for the absence of a refusal phrase count many non-answers as successes: a response that "complies" but contains nothing useful, or that rambles off-topic. The StrongREJECT authors found that many published jailbreak results are overstated for exactly this reason, and that jailbreaks which do get past safety training often degrade the quality of what comes out. Their grader scores how specific and useful the harmful content is, not just whether the model said no.

The correction has the same shape as for quality judges. If the true per-attempt success is $s$, the grader's true positive rate is TPR and its false positive rate (non-answers counted as successes) is FPR:

$$
\text{observed ASR} = s \cdot \text{TPR} + (1 - s) \cdot \text{FPR}
$$

With $s = 0.05$, TPR = 0.9 and FPR = 0.08, the observed rate is $0.045 + 0.076 = 0.121$: more than double the truth. Low true rates are the most sensitive to false positives, because there are so many more non-successes to misclassify.

## In practice

| Report | Why |
|---|---|
| ASR at $k = 1$ and at a realistic budget (e.g. 20 or 100) | Single-attempt numbers flatter defences |
| Static vs adaptive attacks separately | Adaptive attacks are the realistic threat |
| By harm category and severity | Aggregates hide weak categories |
| Grader TPR/FPR on a hand-labelled sample | Shows how much of the ASR is real |
| Over-refusal on a benign-but-edgy set | Shows what robustness cost |

Rate limits and abuse monitoring attack the $k$ in the formula, which is why they are part of the defence, not an afterthought.

```quiz
{"q": "A model has a 1% per-attempt jailbreak rate. With 50 independent attempts, what is the attacker's chance of at least one success?", "options": ["About 1%", "About 39%", "About 50%", "About 61%"], "answer": 1, "explain": "1 − 0.99⁵⁰ = 1 − 0.605 = 0.395. 50% would come from naively multiplying 1% by 50, which overcounts overlapping successes."}
```

```quiz
{"q": "True per-attempt ASR is 2%. The grader has TPR 0.95 and counts 5% of non-successes as successes. What ASR does it report?", "options": ["About 2%", "About 6.8%", "About 1.9%", "About 5%"], "answer": 1, "explain": "0.02 × 0.95 + 0.98 × 0.05 = 0.019 + 0.049 = 0.068. The false positives on the 98% of non-successes dominate, more than tripling the true rate."}
```
