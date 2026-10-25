---
title: "Safe deployment: fail open or closed, and humans in the loop"
minutes: 8
---

Guardrails fail like any other component: the classifier service times out, the threshold is wrong, an attack is new. Two design decisions determine how bad those failures are. What does the system do **when a check cannot run**? And **who looks at the cases the checks cannot decide**?

## Fail open or fail closed

When a guardrail is unavailable you must choose. **Fail open** means proceeding without the check: availability is preserved, protection is lost. **Fail closed** means refusing or degrading: protection is preserved, availability is lost. Neither is right everywhere. Compare the expected cost per request during an outage. Let $\pi$ be the chance that a request is harmful, $c_{\text{miss}}$ the cost of letting a harmful one through, and $c_{\text{block}}$ the cost of refusing a good request:

$$
\text{cost}_{\text{open}} = \pi\, c_{\text{miss}}, \qquad \text{cost}_{\text{closed}} = (1 - \pi)\, c_{\text{block}}
$$

Fail closed is better when $\text{cost}_{\text{closed}} < \text{cost}_{\text{open}}$. With $\pi = 0.001$ and a good request blocked costing $c_{\text{block}} = \$2$:

| Feature | $c_{\text{miss}}$ | $\text{cost}_{\text{open}}$ | $\text{cost}_{\text{closed}}$ | Choice |
|---|---|---|---|---|
| General chat, no tools | \$100 | \$0.10 | \$2.00 | fail open |
| Assistant that can email customers | \$1,000 | \$1.00 | \$2.00 | fail open, but with tools disabled |
| Payments and refunds | \$5,000 | \$5.00 | \$2.00 | fail closed |
| Regulated advice | \$20,000 | \$20.00 | \$2.00 | fail closed |

The numbers are illustrative, but the pattern is real: the higher the potential harm, the more you should prefer closing. A third option is **fail soft**: continue, but remove the dangerous capabilities (no tools, read-only answers, a shorter and more conservative prompt).

## Humans in the loop

Some decisions should not be automated: irreversible actions, high-value actions and uncertain cases. A **human review queue** receives them. Queues are limited by people, so size them with arithmetic. Suppose 1,000,000 requests a day, 0.5% flagged for review and 2 minutes per review:

$$
\text{review minutes per day} = 1{,}000{,}000 \times 0.005 \times 2 = 10{,}000 \text{ min} = 166.7 \text{ h}
$$

At 8 productive hours per reviewer that is $166.7/8 \approx 21$ reviewers. If the threshold moves so that 2% is flagged, you need 83. The flag rate is a staffing decision as much as a technical one, which is why the threshold must be chosen with cost in mind. Use the **middle band** idea: automate the clear cases (score below 0.3 allowed, above 0.9 blocked) and review only the uncertain band.

```steps
Decide how a risky action is approved
Classify the action by reversibility and size: read-only, reversible, irreversible, high-value.
---
Read-only and reversible actions run automatically with logging.
---
Irreversible or high-value actions require approval: show the reviewer the action, the evidence and the model's reasoning, and a one-click approve or reject.
---
Set an approval time limit. If nobody responds in time, the action fails safely rather than proceeds.
---
Sample automatically approved actions for audit, and track the reviewer override rate as a measure of how good the automation is.
```

## Test before you trust

Guardrails need their own tests. Build a **red-team set**: known injections, jailbreak patterns, edge-case PII and policy-violating requests. Run it on every release and record recall per category. Add every real-world miss to it. Include benign look-alikes, so that an over-eager classifier is visible too. Run attacks that target the guardrails themselves, such as splitting a malicious instruction across turns.

| Release gate | Example requirement |
|---|---|
| Recall on red-team set | at least 90% overall, 99% on the highest-severity category |
| False-block rate on benign sample | at most 1% |
| Latency added by guardrails | p95 under 150 ms |
| Fail-closed behaviour tested | simulated outage blocks the high-risk actions |
| Kill switch tested | can disable the feature in under 5 minutes |

## In practice

Roll out guardrails **in shadow mode** first: log what they would have blocked without blocking, review the sample, then enforce. That is the same shadow method covered in the rollouts lesson. Document who owns each guardrail, what its thresholds are and when they were last reviewed. Try the guarded assistant sandbox to see how input checks, output checks and tool permissions combine against a set of attacks.

```sandbox
guarded-assistant
```

```quiz
{"q": "Harmful requests are 0.2% of traffic, a missed harmful request costs \\$2,000 and a wrongly blocked good request costs \\$3. During a guardrail outage, which policy has the lower expected cost per request?", "options": ["Fail closed", "Fail open", "They cost the same", "It cannot be computed without a classifier recall"], "answer": 0, "explain": "Open: 0.002 × 2,000 = \\$4.00. Closed: 0.998 × 3 = \\$2.99. Closing is cheaper, because the miss cost is large relative to the block cost."}
```

```quiz
{"q": "2 million requests per day, 0.25% sent for review, 3 minutes each. How many reviewer-hours per day?", "options": ["250", "150", "25", "1,000"], "answer": 0, "explain": "2,000,000 × 0.0025 = 5,000 reviews; × 3 minutes = 15,000 minutes = 250 hours. 150 slips by using 1.8 minutes per review; 25 loses a factor of ten in the flag rate."}
```
