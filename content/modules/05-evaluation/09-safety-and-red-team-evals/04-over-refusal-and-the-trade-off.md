---
title: Over-refusal and choosing where to draw the line
minutes: 8
---

**Over-refusal** (also called exaggerated safety) is when a system refuses a request that is acceptable because it *looks* like an unacceptable one. "How do I kill a Python process?", "What household chemicals should never be mixed?", "Write a villain's monologue for my novel." Users experience these refusals as the product being broken, and they are far more common than real attacks.

Airport security is the familiar version. Screening every passenger at maximum strictness would stop more threats and also cause hours of queues and confiscated toothpaste. Every real system picks an operating point, and the job of the evaluation is to show what each point costs.

## Measuring it with contrast pairs

The **XSTest** suite (2023) is built for this. It has 250 safe prompts across ten types (homonyms like "kill a process", figurative language, safe questions about sensitive topics, fiction, and so on), each designed to resemble something unsafe, plus 200 unsafe **contrast prompts** that a system should refuse. Scoring both halves shows whether a system has learned the distinction or just learned to flinch at certain words.

Build the same structure for your domain: for each sensitive area of your product, write pairs where the surface wording is similar and only the intent differs. A medical information service needs "what is the maximum safe dose of paracetamol" (answer it) next to requests that seek self-harm methods (refuse and redirect to help).

## The maths: picking a threshold

Most refusal behaviour, whether from a classifier in front of the model or from the model's own training, can be summarised as a score and a threshold $t$: refuse when the risk score exceeds $t$. Lowering $t$ catches more harmful requests and refuses more acceptable ones. With harmful share $b$, the expected cost per request at threshold $t$ is

$$
\text{cost}(t) = b \cdot h(t) \cdot C_h + (1 - b) \cdot o(t) \cdot C_o
$$

where $h(t)$ is the harmful compliance rate and $o(t)$ the over-refusal rate at that threshold.

```steps
Three candidate thresholds, per 100,000 requests
Base rate $b = 0.01$; cost of helping a harmful request $C_h = 100$, of refusing an acceptable one $C_o = 2$.
---
Strict, $t = 0.3$: $h = 0.02$, $o = 0.10$. Harm $100{,}000 \times 0.01 \times 0.02 \times 100 = 2{,}000$; refusals $100{,}000 \times 0.99 \times 0.10 \times 2 = 19{,}800$. Total 21,800.
---
Middle, $t = 0.5$: $h = 0.06$, $o = 0.03$. Harm 6,000; refusals 5,940. Total 11,940.
---
Lenient, $t = 0.7$: $h = 0.15$, $o = 0.01$. Harm 15,000; refusals 1,980. Total 16,980.
---
The middle threshold wins. The strict one looks "safest" but costs most, almost all of it in refused legitimate users.
```

```sim
guardrail-threshold
{"threshold": 0.5, "separation": 3, "baseRate": 0.01, "costFalseBlock": 2, "costMiss": 100}
```

Move the threshold down and watch false blocks climb faster than missed attacks fall. Then raise the classifier's separation: a better classifier lowers both errors at once, which is the only way to escape the trade-off rather than move along it. Finally drop the base rate to 0.001 and see how the cost-minimising threshold moves towards leniency.

## Beyond yes or no

Refusal is not binary in good systems. Between "full answer" and "I can't help with that" sit partial answers: general safety information without operational detail, a redirect to appropriate help, or an answer with a caveat. Grade these as their own category in your eval, because a response that safely helps is better than either extreme, and a grader that only knows "refused / complied" will misclassify them.

## In practice

Track over-refusal as a first-class metric next to attack success, with its own CI threshold. Sample refusals from production regularly and label them; refusal complaints are an early signal of a model or filter change that went too far. When a vendor model update changes refusal behaviour, rerun your contrast-pair suite before switching.

```quiz
{"q": "b = 0.02, C_h = 50, C_o = 1. Threshold A: h = 0.05, o = 0.04. Threshold B: h = 0.10, o = 0.01. Which has the lower expected cost per request?", "options": ["A: 0.0892 vs B: 0.1098", "B: 0.1098 vs A: 0.0892", "They are equal", "A, because it has lower harmful compliance"], "answer": 0, "explain": "A: 0.02 × 0.05 × 50 + 0.98 × 0.04 × 1 = 0.05 + 0.0392 = 0.0892. B: 0.02 × 0.10 × 50 + 0.98 × 0.01 = 0.10 + 0.0098 = 0.1098. A wins, but the last option's reason is incomplete: with different costs B could win despite higher harmful compliance."}
```

```quiz
{"q": "Why does XSTest pair safe prompts with similar-looking unsafe ones?", "options": ["To make the test longer", "To check that the system distinguishes intent rather than reacting to surface words; refusing both or helping both reveals the failure", "Because unsafe prompts are easier to write", "To measure latency"], "answer": 1, "explain": "If a system refuses 'how do I kill a Python process' it is reacting to the word 'kill'. Scoring both halves separates a system that understands intent from one that flinches at keywords or one that helps with everything."}
```
