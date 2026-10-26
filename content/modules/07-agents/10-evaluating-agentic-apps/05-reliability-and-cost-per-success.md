---
title: Reliability and the cost of a successful task
minutes: 9
---

Two numbers decide whether an agent is a viable product: how **reliably** it succeeds, and what each **success** costs once retries, failures and human clean-up are included. Average success rate alone answers neither. This topic ties pass^k, retries and failure costs into one calculation you can put in front of a product owner.

Compare a delivery service. Customers care that the parcel arrives every time (reliability). The company cares about the full cost per delivered parcel, including second attempts and lost-parcel refunds, not just the cost of one van trip.

## Reliability: per task, across trials

From the [τ-bench topic](/learn/agents/agent-benchmarks/tau-bench-and-pass-power-k): run each task several times, estimate pass^k per task, and average. Report pass^1 (average success) and pass^k for a $k$ that reflects how often users repeat a task. A large gap means failures are random rather than concentrated on particular task types, and random failures cannot be routed around.

```sim
pass-at-k
{"p": 0.85, "k": 5, "tasks": 50, "spread": 0.3}
```

With spread, tasks differ in difficulty. Compare passHatK at spread 0 and at a high spread with the same average $p$: concentrated difficulty (some tasks always pass, some always fail) gives a *higher* pass^k than uniform flakiness at the same average.

## The maths: retries with a verifier

Suppose a trial succeeds with probability $p$, costs $c$, and a **verifier** (tests, a state check) tells you reliably whether it succeeded. You retry up to $m$ times. Then

$$
P(\text{success within } m) = 1 - (1 - p)^m, \qquad E[\text{attempts}] = \sum_{i=0}^{m-1}(1-p)^i = \frac{1 - (1-p)^m}{p}
$$

Dividing expected cost by success probability gives a neat result: with a perfect verifier, **cost per success** is $c \cdot E[\text{attempts}] / P(\text{success}) = c / p$, whatever the cap $m$. Retries do not make successes cheaper; they make *failures rarer*. So add what a final failure costs, $C_f$ (a human fixes it, a customer churns):

$$
\text{total cost per task} = c \cdot E[\text{attempts}] + (1 - p)^m \cdot C_f
$$

```steps
Should the agent retry?
$p = 0.70$ per trial, $c = \$0.30$ per trial, a failure handed to a human costs $C_f = \$8$.
---
No retry ($m = 1$): $0.30 + 0.30 \times 8 = 0.30 + 2.40 = \$2.70$ per task. Success 70%.
---
Up to 3 attempts: $E[\text{attempts}] = 1 + 0.3 + 0.09 = 1.39$, agent cost $1.39 \times 0.30 = \$0.42$. Residual failure $0.3^3 = 0.027$, cost $0.027 \times 8 = \$0.22$. Total \$0.63 per task. Success 97.3%.
---
Cost per *successful* task for the agent alone stays $0.30/0.70 = \$0.43$ in both cases. The saving comes entirely from fewer human hand-offs.
---
Latency is the price: a quarter of tasks need a second attempt. If the agent is interactive, budget for it or retry only the failing step.
```

Without a verifier, retries are much weaker: you cannot tell which attempt to keep, so you are back to the selector problem from [reading agent results](/learn/agents/agent-benchmarks/reading-agent-results). Building a cheap, reliable verifier is often the highest-value investment in an agent.

```sim
agent-reliability
{"p": 0.95, "n": 10, "retries": 1, "verify": true}
```

This shows the step-level version of the same idea: a 10-step task at 95% per step. Turn verification off and on, and change retries, to see how much end-to-end success comes from checking rather than from a better model.

## Report these together

| Metric | Definition |
|---|---|
| pass^1 and pass^k | Average success; all-$k$-succeed reliability |
| Success after retries | $1 - (1-p)^m$ with your actual retry policy |
| Cost per successful task | Agent spend divided by successes |
| Total cost per task | Agent spend plus failure costs |
| Latency p50 / p95 | Including retries |
| Policy violations per 1,000 tasks | Safety does not average out |

## In practice

Agree the failure cost $C_f$ with the business before you optimise; it decides how many retries and how much verification are worth paying for. Re-run the calculation when model prices change, since a cheaper model with lower $p$ and more retries can beat a premium model on total cost. And keep the policy-violation count separate: a retry policy that hides violations behind a final success still let the violation happen.

```quiz
{"q": "p = 0.5, c = 0.20 dollars, up to 2 attempts with a perfect verifier, failure cost 4 dollars. What is the total cost per task?", "options": ["0.30 + 1.00 = 1.30 dollars", "0.20 + 2.00 = 2.20 dollars", "0.40 + 1.00 = 1.40 dollars", "0.30 + 0.50 = 0.80 dollars"], "answer": 0, "explain": "E[attempts] = 1 + 0.5 = 1.5, agent cost 1.5 × 0.20 = 0.30. Residual failure 0.5² = 0.25, × 4 = 1.00. Total 1.30. The 2.20 option is the no-retry cost."}
```

```quiz
{"q": "With a perfect verifier, why does the agent's cost per successful task stay at c/p regardless of the retry cap?", "options": ["Because retries are free", "Each attempt is an independent trial with success p, so on average 1/p attempts are spent per success; the cap changes how many tasks end in failure, not the price of a success", "Because the verifier lowers c", "It does not; more retries always lower cost per success"], "answer": 1, "explain": "Expected attempts (1 − (1−p)^m)/p divided by success probability 1 − (1−p)^m equals 1/p. Retries reduce residual failures, which is where the savings come from."}
```
