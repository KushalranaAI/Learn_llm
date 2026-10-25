---
title: "Reliability compounds: the pⁿ problem"
minutes: 9
---

A step that works 95% of the time sounds dependable. Chain twenty of them and the whole thing works about a third of the time. This is the single most important number in agent engineering, and it surprises almost everyone the first time they compute it.

Think of a relay race with twenty runners, each of whom drops the baton one time in twenty. Any single runner looks safe. But the team only finishes if **every** handover succeeds, and the chances of a clean race shrink with every runner you add. Long agent runs are relay races: each step must hand a correct state to the next.

## The product rule

If a task needs $n$ steps, step $i$ succeeds with probability $p_i$, and the steps fail independently, the whole run succeeds only if all of them do:

$$
P(\text{success}) = \prod_{i=1}^{n} p_i = p_1 \cdot p_2 \cdots p_n
$$

When every step has the same reliability $p$, this is simply $p^n$. For $p$ close to 1 there is a handy approximation: since $\ln p \approx -(1-p)$,

$$
p^n = e^{n \ln p} \approx e^{-n(1-p)}
$$

So what matters is $n(1-p)$, the **expected number of failures** in the run. When that reaches 1, success has dropped to about $e^{-1} \approx 37\%$.

```steps
The headline example, by hand
Per-step success $p = 0.95$, $n = 20$ steps. $P = 0.95^{20}$.
---
Square repeatedly: $0.95^2 = 0.9025$, $0.95^4 = 0.8145$, $0.95^8 = 0.6634$, $0.95^{16} = 0.4401$.
---
Multiply in the rest: $0.95^{20} = 0.95^{16} \times 0.95^4 = 0.4401 \times 0.8145 = 0.3585$. About **36%** of runs succeed.
---
Check with the approximation: $n(1-p) = 20 \times 0.05 = 1$, and $e^{-1} = 0.368$. Close, and it tells you why: the run expects one failure.
```

| Per-step $p$ | 5 steps | 10 steps | 20 steps | 50 steps |
|---|---|---|---|---|
| 0.90 | 59.0% | 34.9% | 12.2% | 0.5% |
| 0.95 | 77.4% | 59.9% | 35.8% | 7.7% |
| 0.99 | 95.1% | 90.4% | 81.8% | 60.5% |
| 0.999 | 99.5% | 99.0% | 98.0% | 95.1% |

Read the table along a row and the cost of length is brutal. Read down a column and you see the other lever: each extra "nine" of per-step reliability buys roughly ten times as many steps for the same overall success.

## How long can the chain be?

Turn the formula around. To reach a target success $P^\star$ with per-step reliability $p$, the number of steps must satisfy $p^n \ge P^\star$, so

$$
n \le \frac{\ln P^\star}{\ln p}
$$

Both logarithms are negative, so the ratio is positive. For $p = 0.95$ and $P^\star = 0.5$: $\ln 0.5 / \ln 0.95 = -0.693 / -0.0513 = 13.5$, so at most **13 steps**. For $p = 0.99$ and $P^\star = 0.9$: $-0.105 / -0.01005 = 10.5$, so at most **10 steps**. If your task needs 30 steps at 90% overall success, you need per-step reliability of $0.9^{1/30} = 0.9965$.

Steps rarely share one $p$. A run with steps at 0.99, 0.98, 0.90 and 0.95 succeeds with probability $0.99 \times 0.98 \times 0.90 \times 0.95 = 0.830$. The weakest step (0.90) costs more than the other three combined, so improve the worst step first.

## See it

The simulation plots $p^n$ against the number of steps and lets you add the remedies covered in the rest of the module.

```sim
agent-reliability
```

Set per-step success to 0.95 and steps to 20 and confirm the 36%. Then raise per-step success to 0.99 and watch the curve flatten. Finally move steps to 50 at 0.99 and see that even "one percent failure" leaves you near 60%.

## When the model is too pessimistic, or too optimistic

The product rule assumes independent failures and no recovery. Agents can **recover**: a model that reads an error message may retry or take another route, so a failed step is not always fatal, and real success can beat $p^n$. On the other hand, failures are often **correlated**: if the model misread the task at step 1, every later step inherits the error, and a confused agent tends to stay confused. Treat $p^n$ as the baseline that recovery mechanisms must beat, not as a precise prediction.

## In practice

This is why experienced teams shorten chains before they tune prompts: merging three tool calls into one well-designed tool, removing steps a workflow can do deterministically, and adding cheap verification at the riskiest steps. It is also why demos mislead: a demo shows one successful run, and a 36% success rate still produces plenty of those.

```quiz
{"q": "Each step of a 10-step workflow succeeds 98% of the time, independently. Roughly what fraction of runs succeed end to end?", "options": ["98%", "82%", "90%", "80%"], "answer": 1, "explain": "0.98¹⁰ ≈ 0.817, about 82%. A quick check: n(1−p) = 0.2 expected failures and e^(−0.2) ≈ 0.82. Answering 80% uses 1 − 10 × 0.02, which slightly underestimates because it double-counts runs with two failures."}
```

```quiz
{"q": "Your agent's steps succeed with p = 0.98. What is the longest chain that still succeeds at least 80% of the time?", "options": ["8 steps", "11 steps", "20 steps", "40 steps"], "answer": 1, "explain": "n ≤ ln 0.8 / ln 0.98 = −0.2231 / −0.0202 ≈ 11.05, so 11 steps (0.98¹¹ ≈ 0.801). At 12 steps it drops to about 0.785."}
```
