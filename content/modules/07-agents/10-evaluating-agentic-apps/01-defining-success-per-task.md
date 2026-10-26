---
title: Defining success for each task
minutes: 8
---

An agent eval is only as good as its definition of success. "Did the agent handle the refund request well?" invites argument. "Does the orders table show a refund of 42.00 on order 1187, with no other rows changed, and did the customer receive a confirmation?" does not. The work of agent evaluation starts with turning every task into a statement like the second one.

Building inspectors work this way. They do not ask whether the electrician "did a good job"; they check named things: the breaker rating, the earth connection, the socket heights. Each check has a clear pass or fail.

## Anatomy of a task

Anthropic's guide on agent evals uses a vocabulary worth adopting: a **task** (inputs plus success criteria), a **trial** (one attempt at it), a **grader** (logic that scores some aspect), a **transcript** (everything that happened) and an **outcome** (the final state of the environment). A good task specification makes each explicit.

```python
task = {
    "id": "refund-partial-07",
    "user_goal": "Refund the damaged mug from order 1187, keep the rest",
    "initial_state": "fixtures/orders_1187.sql",          # reset before every trial
    "graders": [
        {"type": "state", "check": "refunds(order=1187) == [42.00]", "weight": 0.5},
        {"type": "state", "check": "no_other_rows_changed()",       "weight": 0.2},
        {"type": "trace", "check": "verify_identity before refund", "weight": 0.2},
        {"type": "judge", "check": "confirmation states amount and timeline", "weight": 0.1},
    ],
    "must_pass": ["refunds(order=1187) == [42.00]", "no_other_rows_changed()"],
    "reference_solution": "traces/refund-partial-07-gold.json",
}
```

Three rules make tasks trustworthy:

1. **Grade outcomes first.** Check the state of the world (database rows, files, test results), not whether the agent followed the exact path you imagined. There is usually more than one valid route.
2. **Unambiguous criteria.** Two domain experts reading the spec should reach the same verdict on any transcript. If they would not, rewrite the task.
3. **A reference solution.** Someone (or a past successful trial) must have solved it. That proves the task is solvable in this environment.

## Success per kind of task

| Agent type | Primary outcome check | Secondary checks |
|---|---|---|
| Coding | Tests pass (fail-to-pass and pass-to-pass) | Lint, no changes outside scope |
| Support / operations | Database state equals goal state | Policy order (identity before refund), confirmation message |
| Research | Final answer matches a checkable fact or set of facts | Sources cited and actually support claims |
| Browser / GUI | Target page or file state reached | No unintended submissions |
| Data analysis | Numbers match a reference computation within tolerance | Chart or table present |

## The maths: weighted scores and must-pass gates

Many tasks have several graders. A weighted score gives partial credit:

$$
\text{score} = \sum_i w_i \, g_i, \qquad \sum_i w_i = 1, \quad g_i \in \{0, 1\}
$$

but some checks are not negotiable, so combine it with a **must-pass** rule: if any must-pass check fails, the task counts as failed for the headline success rate, whatever the weighted score.

```steps
Scoring one trial of the refund task
Refund correct ($g_1 = 1$), no other rows changed ($g_2 = 1$), identity verified *after* the refund ($g_3 = 0$), confirmation fine ($g_4 = 1$).
---
Weighted score: $0.5 + 0.2 + 0 + 0.1 = 0.8$.
---
Must-pass checks both passed, so the trial counts as a success for task success.
---
But the policy check failed. Report it separately as a **policy violation rate**; for a refund agent this may deserve its own release gate even though the customer got the right outcome.
```

## Detecting broken tasks

If a task fails on every trial for every agent version, suspect the task before the agent. With true per-trial success $p$, the chance of $n$ failures in a row is $(1-p)^n$: for $p = 0.2$ and $n = 10$ it is $0.8^{10} = 0.11$, so ten straight failures are suggestive but not proof. Read the transcripts: a grader that rejects a valid answer, a fixture missing a row, or an instruction that contradicts the policy are common culprits.

## Balance

Include tasks where the right outcome is to **not** act: a refund request outside the policy window, a request missing information the agent must ask for, a user who should be escalated to a human. Without them, an eval rewards an agent that always acts.

```quiz
{"q": "Graders with weights 0.4, 0.3, 0.2, 0.1 return 1, 0, 1, 1. The 0.3 grader is must-pass. What are the weighted score and the task-success verdict?", "options": ["0.7 and failed", "0.7 and succeeded", "0.4 and failed", "1.0 and succeeded"], "answer": 0, "explain": "Weighted: 0.4 + 0 + 0.2 + 0.1 = 0.7. Because the failed grader is must-pass, the trial counts as a failure for task success. Report both numbers."}
```

```quiz
{"q": "A task has failed 12 out of 12 trials across three different agent versions. What should you do first?", "options": ["Remove the agent from production", "Read the transcripts and the grader: a 0% task is often a broken task or grader", "Add more trials until one succeeds", "Lower the pass threshold"], "answer": 1, "explain": "Consistent 0% across versions is a classic sign of an impossible task, a wrong fixture or a grader rejecting valid solutions. Verify the task with a reference solution before blaming the agent."}
```
