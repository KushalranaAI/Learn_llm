---
title: "Base rates: why accurate detectors still cry wolf"
minutes: 8
---

Here is a trap that catches experienced engineers. A vendor says its attack detector is "99% accurate". You deploy it. Within a day the security team complains that almost everything it flags is harmless. Nothing is wrong with the detector. The problem is arithmetic: when the thing you are looking for is rare, even a small false-positive rate produces more false alarms than real hits.

## Natural frequencies first

Define "99% accurate" as: it flags 99% of real attacks (recall, or **true-positive rate**, 0.99) and it wrongly flags 1% of benign requests (**false-positive rate**, 0.01). Now suppose attacks are rare: 0.1% of requests (the **base rate** or **prevalence**, $\pi = 0.001$). Imagine 100,000 requests.

```steps
Count what happens to 100,000 requests
Real attacks: $100{,}000 \times 0.001 = 100$. Benign: $99{,}900$.
---
The detector catches 99% of attacks: $100 \times 0.99 = 99$ true positives, and misses 1.
---
It wrongly flags 1% of benign requests: $99{,}900 \times 0.01 = 999$ false positives.
---
Total flagged: $99 + 999 = 1{,}098$. Of those, only 99 are real attacks.
---
Precision $= 99/1098 = 9.0\%$. About 91 of every 100 blocked requests are innocent.
```

A "99% accurate" detector flags mostly benign traffic. The detector did what it promised; the base rate decided the outcome.

## Bayes' rule

The same calculation in symbols is **Bayes' rule**. With $A$ = "is an attack" and $F$ = "is flagged":

$$
P(A \mid F) = \frac{P(F \mid A)\,P(A)}{P(F \mid A)\,P(A) + P(F \mid \neg A)\,P(\neg A)} = \frac{r\,\pi}{r\,\pi + f\,(1 - \pi)}
$$

where $r = P(F \mid A)$ is the recall, $f = P(F \mid \neg A)$ the false-positive rate and $\pi = P(A)$ the base rate. Plug in $r = 0.99$, $f = 0.01$, $\pi = 0.001$:

$$
P(A \mid F) = \frac{0.99 \times 0.001}{0.99 \times 0.001 + 0.01 \times 0.999} = \frac{0.00099}{0.00099 + 0.00999} = \frac{0.00099}{0.01098} = 0.090
$$

There is a neat way to see it. In **odds** form, posterior odds equal prior odds times the **likelihood ratio** $r/f$:

$$
\underbrace{\frac{P(A\mid F)}{P(\neg A\mid F)}}_{\text{posterior odds}} = \underbrace{\frac{\pi}{1 - \pi}}_{\text{prior odds}} \times \underbrace{\frac{r}{f}}_{\text{likelihood ratio}} = 0.001001 \times 99 = 0.0991
$$

The detector multiplies your odds by 99, a large number, but you started at roughly 1 to 1,000, so you end at roughly 1 to 10. Odds of 0.0991 correspond to a probability of $0.0991/1.0991 = 9.0\%$.

## What changes with the base rate

Same detector ($r = 0.99$, $f = 0.01$), different prevalence:

| Attack base rate $\pi$ | Precision $P(A\mid F)$ | Of 100 flags, real attacks |
|---|---|---|
| 10% | 91.7% | 92 |
| 1% | 50.0% | 50 |
| 0.1% | 9.0% | 9 |
| 0.01% | 1.0% | 1 |

Check the 1% row: $0.0099/(0.0099 + 0.0099) = 0.5$. The same classifier is useful in a forum under active attack and nearly useless in a quiet enterprise tool. Always evaluate a detector at the base rate it will actually face, not on a balanced test set with 50% attacks.

```sim
guardrail-threshold
{"baseRate": 0.001, "threshold": 0.5}
```

Set the base rate to 0.1 and note the precision, then drag it down to 0.001 without touching the threshold or separation. Precision falls by a factor of 10 or more. Now try to recover it by raising the threshold, and observe the price you pay in recall.

## Ways to cope with rare events

1. **Cut the false-positive rate.** Precision is dominated by $f(1-\pi)$. Cutting $f$ from 1% to 0.01% at the same $r$ gives $0.00099/(0.00099 + 0.0000999) = 90.8\%$.
2. **Use a second stage.** Send only flagged requests to a slower, more precise check (a bigger model, a human). If the second check is independent with the same $r$ and $f$, the odds multiply again: $0.0991 \times 99 = 9.81$, so precision becomes $9.81/10.81 \approx 90.7\%$, and recall becomes $0.99^2 = 98\%$. The extra cost applies to only about 1% of traffic.
3. **Do not block, degrade.** On a flag, restrict capabilities (read-only mode, no tools) instead of refusing outright. A false flag then costs little.
4. **Use context.** Combine the score with other evidence (account age, past behaviour, request rate) that shifts the prior for this request.

## In practice

Report precision and recall **at the production base rate**, estimated from reviewed traffic, and resample it, because base rates shift (a public attack technique can raise it 100-fold in a week). Review a random sample of flagged items every week: if most are benign, you are in the situation above, and the fix is a lower $f$, a second stage or a softer response.

```quiz
{"q": "A fraud detector catches 95% of fraud and wrongly flags 2% of legitimate traffic. Fraud is 0.5% of traffic. About what share of flagged items is real fraud?", "options": ["About 19%", "About 95%", "About 50%", "About 2%"], "answer": 0, "explain": "r π = 0.95 × 0.005 = 0.00475; f(1 − π) = 0.02 × 0.995 = 0.0199. Precision = 0.00475/(0.00475 + 0.0199) = 0.192. The 95% figure is the recall, which says nothing about how many flags are real."}
```

```quiz
{"q": "Which change most raises precision for a rare attack, without lowering recall?", "options": ["Lower the false-positive rate of the classifier", "Collect a balanced test set with 50% attacks", "Report accuracy instead of precision", "Block all flagged requests faster"], "answer": 0, "explain": "Precision is rπ/(rπ + f(1 − π)), which rises as f falls. A balanced test set changes only how the detector looks in evaluation, not how it behaves on real traffic."}
```
