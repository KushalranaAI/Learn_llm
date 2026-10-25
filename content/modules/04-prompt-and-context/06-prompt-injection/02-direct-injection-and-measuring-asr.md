---
title: Direct injection and measuring attack success
minutes: 8
---

In a **direct injection**, the person using your application is the attacker. They type something designed to make the model break the operator's rules: reveal the system prompt, adopt a forbidden persona, ignore a scope limit, or produce content the application should refuse. Many of these are called **jailbreaks**. Common families, described at the level of the idea and not as recipes:

| Family | Idea | Example intent |
|---|---|---|
| Instruction override | "Ignore the above and do X" | Replace the task |
| Role-play framing | Wrap the request in a story or persona | Make the rule look inapplicable |
| Prompt extraction | Ask the model to repeat its instructions | Leak the system prompt |
| Obfuscation | Encode, translate or split the request | Slip past keyword filters |
| Many-attempt search | Automated variants of the same request | Find the one that works |

Direct attacks matter most when the model has authority the user should not have: access to other customers' data, tools that act, or policies that protect third parties. A user who tricks a chatbot into a silly poem has caused little harm; a user who tricks it into issuing a refund policy exception has.

## The maths: measuring attack success honestly

To know whether a defence works, measure it. Build a **red-team set** of $N$ adversarial inputs, run your system, and count how many break the rule. The attack success rate is $\hat{s} = K/N$, and, exactly as with pass rates in the previous lesson, it has sampling noise. A 95% Wilson-type interval is wide for small $N$.

Worked example: you run $N = 200$ attack prompts and observe $K = 6$ successes.

```steps
Reading a red-team result
$\hat{s} = 6/200 = 0.03$, so the measured ASR is 3%.
---
Standard error: $\sqrt{0.03 \times 0.97 / 200} = \sqrt{0.0001455} = 0.01206$. The simple 95% interval is $0.03 \pm 1.96 \times 0.01206 = 0.03 \pm 0.0236$, about 0.6% to 5.4%.
---
The Wilson interval, better near zero, is roughly 1.4% to 6.4%. Either way, the true ASR could easily be double the measured value.
---
If you instead see 0 successes in 200 attempts, the rule of three gives an upper bound of about $3/200 = 1.5\%$. Zero observed is not zero true.
---
Convert to risk: at $s = 0.03$ and 50 attempts, an adaptive attacker succeeds with probability $1 - 0.97^{50} = 0.782$.
```

Two cautions follow. First, ASR is measured against your attack set, and an attacker is not limited to it. A set built from last year's techniques can score 0% against defences that were tuned on it while new techniques succeed. Refresh the set from published attacks and your own logs. Second, report ASR by category (override, extraction, obfuscation) and by severity, since one aggregate number hides which defences are weak.

## Defences against direct injection

1. **State the policy clearly, with a conflict rule.** As in lesson 1: say the rule applies even if the user asks otherwise.
2. **Rely on the provider's trained instruction hierarchy**, which raises the cost of simple overrides but does not eliminate them.
3. **Check output as well as input.** A filter on the response catches the leak or the forbidden content regardless of how the model was persuaded.
4. **Enforce the real limits in code.** If a user must not see another customer's data, the retrieval layer should never fetch it for them. The model cannot leak what it never received.
5. **Rate-limit and monitor.** Because attackers rely on many attempts, throttling, anomaly detection and account-level blocking directly attack the $N$ in $1-(1-s)^N$.

```callout-warn
Do not hide secrets in the prompt
Prompt extraction is among the easiest direct attacks. Keep keys, internal URLs and sensitive policy details out of system prompts, and design on the assumption that the prompt is public. If it leaks, the fix should be "nothing sensitive was in it".
```

## In practice

Teams usually keep a small automated red-team suite in CI (50 to 200 attack prompts across categories) and a larger quarterly exercise with fresh techniques. A regression in the suite blocks a prompt or model change the same way a failing golden-set case does. New real-world attempts found in logs become new suite cases.

```quiz
{"q": "A red-team run of 500 attacks yields 0 successes. Using the rule of three, what is the 95% upper bound on the true per-attempt ASR?", "options": ["About 0.6%", "0%", "About 3%", "About 0.06%"], "answer": 0, "explain": "3 / 500 = 0.006, or 0.6%. Zero observed successes means the true rate is probably small, not that it is zero. 3% would be 3/100, the wrong sample size."}
```

```quiz
{"q": "Your defence was tuned until it scored 0% ASR on the red-team set. What is the main risk in trusting that number?", "options": ["The defence may be fitted to those attacks and fail on new ones, like overfitting to a test set", "0% is impossible to achieve", "Red-team sets should contain no real attacks", "The number is too high"], "answer": 0, "explain": "Tuning against the same set you report on overstates robustness, exactly like tuning a prompt on its golden set. Keep a held-out set of fresh attacks and refresh both from new techniques."}
```
