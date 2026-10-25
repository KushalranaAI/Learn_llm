---
title: A staged rollout playbook
minutes: 8
---

The earlier topics give you the parts: shadow traffic, canary sizing, guard metrics and fast rollback. This topic puts them into a repeatable **playbook** that a team can follow for every prompt, model, retrieval or router change. A playbook turns judgement calls into a checklist, so the tenth change gets the same care as the first.

## The stages

| Stage | Share | Gate to enter | Hold until | Roll back if |
|---|---|---|---|---|
| 0. Offline | 0% | tests and evaluation set pass, change reviewed | no regression on any slice | any slice drops beyond margin |
| 1. Shadow | 0% (copy) | stage 0 passed | 50,000+ pairs judged or 3 days | win rate lower bound below 50%, cost or latency breach |
| 2. Canary | 1–5% | stage 1 passed | at least 6,000 requests and 1 hour | any guard metric breached |
| 3. Ramp | 25% | stage 2 clean | 12 hours including a busy period | any guard metric breached |
| 4. Ramp | 50% | stage 3 clean | 24 hours | guard breach or slow-metric drop |
| 5. Full | 100% | stage 4 clean | 7 days, then retire the old version | slow-metric drop |

Each stage's hold time comes from the sizing arithmetic. With $\lambda = 2{,}000$ requests per minute and a rule-of-three target of $n = 6{,}000$ requests:

| Share $s$ | Requests per minute $s\lambda$ | Time for $n = 6{,}000$ |
|---|---|---|
| 1% | 20 | 300 min (5 h) |
| 5% | 100 | 60 min |
| 25% | 500 | 12 min |
| 50% | 1,000 | 6 min |

The later stages are fast in terms of volume; they are held longer for **different reasons**: to cover traffic patterns (peak hours, weekends), to let slow quality metrics accumulate and to let rare tenants appear.

## Scale the care to the risk

Not every change deserves the same ceremony. Rate the change on two axes: how large is the possible harm, and how reversible is it?

| Risk | Example | Path |
|---|---|---|
| Low | typo fix in a help message, config tweak with a clear effect | offline test, 25% canary, then full |
| Medium | prompt wording, retrieval parameter, router threshold | the full playbook above |
| High | new model family, guardrail removal, new tool with side effects | the full playbook, longer holds, human review of samples, sign-off from the owner |
| Critical | anything touching payments, medical or legal advice | add red-team testing, shadow for a week, and approval gates |

## Pre-flight checklist

```steps
Before you start the rollout
The change is versioned and the previous version is warm and tested. Rollback is a single switch and has been rehearsed.
---
Guard metrics, thresholds, minimum sample sizes and the hold time for each stage are written in the release ticket.
---
Dashboards show canary and control side by side, sliced by tenant and feature. Alerts are routed to a named person.
---
Cost and quota are checked: a doubled prompt length or a shadow copy must fit within budgets and rate limits.
---
Stakeholders are told: support knows what to say if users notice, and the on-call has the rollback instructions.
```

## During and after

During the rollout, **one change at a time**. If a prompt change and a model upgrade ship together and quality moves, you cannot tell which did it. After 100%, keep the old version for a defined period, then retire it deliberately (remove flags, delete dead code and old prompts, archive the evaluation results). A short **retro** closes the loop: how long did each stage take, did any guard metric come close to its threshold, what should the thresholds be next time.

## When the playbook is not enough

Some risks never show in small canaries: a defect with probability $10^{-5}$ needs $3/10^{-5} = 300{,}000$ requests, which at a 5% canary and 100 requests per minute takes 50 hours. Rare, severe failures (a leaked secret, a harmful answer) must be addressed by other means: red-team tests, guardrails, least-privilege tools and monitoring that reads samples of production output. The canary protects against common regressions; it is not a safety proof.

```sim
canary-rollout
{"canaryPct": 25, "durationMin": 12, "trafficPerMin": 2000, "bugRate": 0.0005, "alertThreshold": 1}
```

Compare this stage-3 setting with the earlier 5% canary: the same 6,000 requests arrive in a fifth of the time, but a defect would now affect a quarter of your users while you wait. Try the 1% setting with a 300-minute duration and see how little exposure it causes, at the price of slow feedback.

## In practice

Write the playbook down and automate what you can: a pipeline that advances stages when guard metrics hold and stops otherwise. Teams that keep the playbook as an unwritten habit tend to skip stages under deadline pressure, which is exactly when changes are riskiest.

```quiz
{"q": "Total traffic is 3,000 requests per minute. A 2% canary collects 6,000 requests in how many minutes?", "options": ["100", "50", "200", "10"], "answer": 0, "explain": "The canary gets 0.02 × 3,000 = 60 requests per minute, so 6,000/60 = 100 minutes. 50 would correspond to a 4% share."}
```

```quiz
{"q": "A prompt change and a model upgrade are ready together. What does the playbook recommend?", "options": ["Roll them out one at a time", "Ship both at once to save time", "Ship the model upgrade at 100% and canary the prompt", "Skip the canary because both passed offline tests"], "answer": 0, "explain": "With one change at a time, any movement in the guard metrics has one cause. Shipping both together makes a regression impossible to attribute and a rollback impossible to scope."}
```
