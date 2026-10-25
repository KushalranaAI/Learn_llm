---
title: Prompts are versioned artifacts
minutes: 7
---

A one-word edit to a prompt can change behaviour on thousands of inputs. Unlike a code change, you cannot read the diff and know what it does. That makes prompts the riskiest kind of change a team ships routinely, and the discipline for handling them is the same one software teams already use for risky changes: version control, review, tests, staged rollout and a way back.

What counts as "the prompt"? The system prompt text, the template with its variable slots, the few-shot examples, the tool definitions, the output schema, the model name and version, and the sampling settings (temperature, max tokens). Change any of them and behaviour changes. A version identifier should cover all of them together.

```text
prompt: ticket-triage
version: 2.3.0
model: example-model-2026-01 (pinned)
temperature: 0
template: prompts/ticket-triage/v2.3.0.txt   (sha256: 9f2c...e41)
examples: prompts/ticket-triage/examples-v4.json
schema:   schemas/triage-v2.json
changelog: Added rule for refund requests; cut 140 tokens from the examples.
golden-set result: 94.0% pass (n=300), v2.2.0 was 92.7%
```

## Practices that pay for themselves

- **Store prompts in the repository**, not in a dashboard text box. Then every change has an author, a reviewer, a diff and a timestamp.
- **Give every version an identifier** (semantic version or content hash) and log it with every production call. When a user reports a bad answer, you must be able to say which prompt produced it.
- **Pin the model version.** A provider's "latest" alias can change under you. A prompt tuned for one model snapshot may behave differently on the next, so a model upgrade is a prompt change and goes through the same tests.
- **Keep a changelog with a reason.** "Added a refund rule because of ticket 4411" lets the next person judge whether the rule is still needed.
- **Make rollback one step.** If the new version regresses in production, switching back should be a config change, not a redeploy and a prayer.

## The maths: what an undetected regression costs

Let a change lower the pass rate by $\Delta$ (an absolute drop), traffic be $R$ requests per day, each failure cost $e$ dollars (support time, refund, lost trust), and the regression go unnoticed for $D$ days. The expected cost is

$$
C_{\text{regress}} = \Delta \cdot R \cdot e \cdot D
$$

Worked example: a rewrite drops pass rate by $\Delta = 0.03$ on a feature handling $R = 50{,}000$ requests a day, with $e = \$0.05$ per failure. Each day costs $0.03 \times 50{,}000 \times 0.05 = \$75$. If nobody notices for $D = 10$ days, that is \$750, and that is only the measurable part. Now compare with the price of prevention: running a 300-case golden set costs perhaps $300 \times 2{,}500\text{ tokens} \times 3\times10^{-6} = \$2.25$ in input tokens plus a few cents of output. Testing every change is cheap by two orders of magnitude, provided the test can see a 3-point drop, which the next topics quantify.

```steps
A prompt change workflow
Branch and edit the prompt files. Record the reason in the changelog.
---
Run the golden set against the old and new versions with identical settings. Record pass rates with confidence intervals.
---
Check the comparison is significant, not just different (topic 4), and that no important slice (language, ticket type) regressed.
---
Review the diff and the failing cases with a teammate. Merge only if the gate passes.
---
Roll out gradually (shadow, then a small percentage of traffic) and watch live metrics, as module 8 describes. Keep the previous version one config change away.
```

```callout-warn
Dashboards without history
Editing a production prompt in a web console with no history is the prompt equivalent of editing code on a live server. If your tooling allows it, you will eventually lose the version that worked. Export prompts to files and treat the console as a deployment target, not the source of truth.
```

## In practice

Treat the prompt's tests as part of its definition. A prompt without a golden set has no definition of "working"; it has a feeling. Teams that adopt even a small set of 100 to 300 labelled cases, run automatically on every change, report that most "obvious improvements" turn out to be neutral or mildly harmful on at least one slice, which is exactly the surprise you want to find before users do.

```quiz
{"q": "A prompt change lowers pass rate by 2 points on 80,000 requests per day. Each failure costs $0.04. If it goes unnoticed for 7 days, what is the expected cost?", "options": ["$448", "$4,480", "$640", "$1,600"], "answer": 0, "explain": "0.02 × 80,000 = 1,600 extra failures per day; × $0.04 = $64 per day; × 7 days = $448. $1,600 is just the daily failure count, and $4,480 is a factor-of-ten slip."}
```

```quiz
{"q": "Which of these changes should go through the same golden-set test as a prompt edit?", "options": ["Upgrading to a newer snapshot of the same model, changing temperature, or editing a tool description", "Only edits to the system prompt text", "Only changes that add tokens", "None: model upgrades are always improvements"], "answer": 0, "explain": "Behaviour depends on the whole bundle: text, examples, tool definitions, schema, model version and sampling settings. Any of them can shift pass rates, including model upgrades."}
```
