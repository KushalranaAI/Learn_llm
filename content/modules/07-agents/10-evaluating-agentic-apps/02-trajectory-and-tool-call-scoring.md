---
title: Scoring trajectories and tool calls
minutes: 9
---

Outcome checks tell you *whether* a trial succeeded. Trajectory scoring tells you *how*, and that is where you find out why it failed, whether it succeeded by luck, and whether it broke a rule on the way. The [trajectory metrics](/learn/agents/traces-and-evaluation/trajectory-metrics) topic introduced task success, step efficiency and tool-call accuracy. This topic adds the tools for scoring calls against an expected set and checking constraints on their order, without punishing valid alternative routes.

A recipe check is a good picture. You do not demand the cook crack the eggs with the left hand first; you do check that every required ingredient went in, nothing harmful went in, and the oven was preheated before the cake went in. Required items, forbidden items, and ordering rules.

## Matching calls: precision, recall, F1

For each task, write the **expected calls**: the tools and the key arguments that any correct solution needs. Then match the agent's actual calls against them (a call matches if the tool name and key arguments agree; each expected call can be matched once).

$$
\text{precision} = \frac{\text{matched}}{\text{calls made}}, \quad \text{recall} = \frac{\text{matched}}{\text{calls expected}}, \quad F_1 = \frac{2PR}{P + R}
$$

Recall falls when the agent skips a necessary step; precision falls when it makes unnecessary, repeated or wrong calls. Ragas and similar libraries ship this as a tool-call F1 metric.

```steps
Scoring one trace
Expected: `lookup_order(1187)`, `verify_identity(c42)`, `refund(1187, 42.00)`.
---
Actual: `lookup_order(1187)`, `lookup_order(1187)` again, `verify_identity(c42)`, `refund(1187, 48.00)`, `send_email(c42)`.
---
Matches: the first lookup and the identity check. The repeat lookup has nothing left to match; the refund has the wrong amount; the email was not expected. Matched = 2.
---
Precision $= 2/5 = 0.40$. Recall $= 2/3 = 0.67$. $F_1 = 2 \times 0.40 \times 0.67 / (0.40 + 0.67) = 0.536/1.07 = 0.50$.
---
The outcome check (refund equals 42.00) also fails. The trace shows exactly why: the agent read the order total, not the item price.
```

## Constraints instead of exact sequences

Comparing the whole sequence with a "gold" trajectory is tempting and usually wrong: a valid solution may look things up in a different order or use one extra harmless call. Express what really matters as **constraints**:

| Constraint type | Example | How to check |
|---|---|---|
| Required | `refund` must be called exactly once | Count calls |
| Forbidden | Never call `delete_account` in a refund task | Any occurrence fails |
| Precedence | `verify_identity` before `refund` | Index of first verify < index of refund |
| Argument | Refund amount ≤ item price | Compare argument with fixture data |
| Budget | At most 15 steps and 40k tokens | Count spans and tokens |

These are code assertions over the trace, so they are cheap, deterministic and easy to explain when they fail.

```python
def check_trace(calls, expected_amount):
    names = [c["tool"] for c in calls]
    problems = []
    if names.count("refund") != 1:
        problems.append("refund must be called exactly once")
    if "delete_account" in names:
        problems.append("forbidden tool used")
    if "refund" in names and ("verify_identity" not in names
                              or names.index("verify_identity") > names.index("refund")):
        problems.append("identity not verified before refund")
    for c in calls:
        if c["tool"] == "refund" and c["args"]["amount"] > expected_amount:
            problems.append("refund amount too high")
    return problems
```

## See it

```sim
agent-trajectory
```

Start with a low tool error rate and lenient judging: task success and step accuracy are both high. Raise the tool error rate and watch step and tool-call accuracy fall before task success does, because the agent can sometimes recover. Then raise the judge strictness and see which runs that "succeeded" are reclassified, and how cost per success moves as failed runs still consume tokens.

## In practice

Report trajectory metrics next to the outcome, never instead of it: a high F1 with a failed outcome means the agent did the right things with a wrong value; a successful outcome with low precision means it got there wastefully. Keep the expected-call lists short (the calls any solution must make) so you measure necessity, not one person's style. Turn every policy in the agent's instructions into a constraint check.

```quiz
{"q": "Expected 4 calls; the agent made 6 calls, of which 3 match expected ones. What is the tool-call F1?", "options": ["0.60", "0.50", "0.75", "0.625"], "answer": 0, "explain": "Precision = 3/6 = 0.50, recall = 3/4 = 0.75, F1 = 2 × 0.50 × 0.75 / (0.50 + 0.75) = 0.75 / 1.25 = 0.60. The simple average of precision and recall (0.625) is not F1; F1 is the harmonic mean, which sits closer to the weaker of the two."}
```

```quiz
{"q": "Why are ordering constraints (e.g. verify before refund) usually better than matching an exact gold trajectory?", "options": ["They are faster to write in Python", "Several different call sequences can be valid; constraints check what matters without penalising harmless differences", "Gold trajectories cannot be stored", "Constraints work without traces"], "answer": 1, "explain": "Exact sequence matching fails valid solutions that differ in harmless ways. Constraints encode the actual rules. They still need a trace to check, so the last option is false."}
```
