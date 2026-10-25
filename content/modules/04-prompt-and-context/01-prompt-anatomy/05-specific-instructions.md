---
title: Specific instructions and the price of retries
minutes: 8
---

A vague prompt is cheap to write and expensive to run. "Summarise this ticket" leaves the model to guess the length, the audience, the format and what to do with missing information. Each guess is a chance to produce something your code cannot use, and every unusable answer means a retry, a human fix or a confused user.

A **specific** prompt removes guesses. It says who the output is for, what shape it takes, how long it is, and what to do in the awkward cases. Compare:

```text
Summarise this support ticket.
```

```text
Summarise the support ticket in <ticket> tags for an on-call engineer.
- Exactly 3 bullet points: the symptom, what the customer already tried, the customer's deadline.
- If a field is not in the ticket, write "unknown" for that bullet. Do not guess.
- Plain text, no headings, at most 60 words in total.

<ticket>
{ticket_text}
</ticket>
```

The second prompt is longer, and in a real system the full specific version (with edge cases and an example) often adds a couple of hundred tokens. Whether those tokens are worth it is not a matter of taste: it is arithmetic.

## The maths: expected cost with retries

Say each attempt produces a usable answer with probability $p$, attempts are independent, and you retry until one succeeds. The number of attempts $A$ is geometrically distributed, with expectation

$$
\mathbb{E}[A] = \sum_{a=1}^{\infty} a\,(1-p)^{a-1} p = \frac{1}{p}
$$

If one attempt costs $c = n\,p_{\text{in}} + m\,p_{\text{out}}$ (prompt length $n$, output length $m$, prices per token), the expected cost per usable answer is $c / p$.

Now compare two prompts at hypothetical prices of \$3 per 1M input and \$15 per 1M output tokens, with $m = 300$ output tokens:

| | Vague prompt | Specific prompt |
|---|---|---|
| Input tokens $n$ | 800 | 1,000 |
| Cost per attempt $c$ | $0.0024 + 0.0045 = \$0.0069$ | $0.0030 + 0.0045 = \$0.0075$ |
| Usable-answer rate $p$ | 0.90 | 0.99 |
| Expected attempts $1/p$ | 1.111 | 1.010 |
| Expected cost $c/p$ | \$0.00767 | \$0.00758 |

The longer prompt is 8.7% dearer per attempt and still cheaper per usable answer, because it almost never needs a second try. Latency moves the same way: every retry adds a full generation to the user's wait, so at $p = 0.90$ one user in ten waits roughly twice as long.

```steps
Checking the break-even point
A longer prompt adds $\Delta n$ input tokens and raises the success rate from $p_1$ to $p_2$.
---
It pays off when $\dfrac{c + \Delta n \, p_{\text{in}}}{p_2} < \dfrac{c}{p_1}$.
---
Rearranged: $\Delta n \, p_{\text{in}} < c\left(\dfrac{p_2}{p_1} - 1\right)$.
---
With $c = 0.0069$, $p_1 = 0.90$, $p_2 = 0.99$: the right side is $0.0069 \times 0.1 = \$0.00069$.
---
At $p_{\text{in}} = 3\times10^{-6}$ that allows $\Delta n < 230$ tokens. The 200 extra tokens in the table fit, with a little room to spare.
```

The retry model ignores a cost that is often larger: failures you do not detect. A summary that silently invents a deadline is not retried; it is acted on. Specific instructions ("write unknown, do not guess") are mainly about lowering that undetected-error rate, which no retry loop can fix.

## Habits that make prompts specific

- **State the audience and purpose.** "For an on-call engineer at 3am" changes length and tone more reliably than "be concise".
- **Say what to do, not only what to avoid.** "Write unknown" is followable; "don't hallucinate" is not an action.
- **Delimit inputs.** Wrap pasted content in tags such as `<ticket>` so the model can tell instructions from material, and so you can refer to it by name.
- **Make the output checkable.** "Exactly 3 bullets, at most 60 words" can be verified by code; "brief" cannot.
- **Handle the edge cases you have seen.** Empty input, a different language, a request outside scope.

```sim
token-cost
{"systemTokens": 800, "inputWords": 0, "outputWords": 231, "language": "english", "inputPrice": 3, "outputPrice": 15, "requestsPerDay": 1000}
```

The sim starts at the vague prompt from the table: 800 input tokens and 231 words of output (about 300 tokens), so the cost per request reads \$0.0069. Raise the system prompt to 1,000 tokens and it becomes \$0.0075. Now divide each by its success rate (0.90 and 0.99) on paper: the per-attempt cost the sim shows is only half the story.

## In practice

The best evidence for a prompt change is a measured $p$ on a golden set, not a feeling. Teams typically log the "usable answer" check (schema valid, length within bounds, required fields present) for every production call, which gives them $p$ for free and lets them run the break-even sum above with real numbers.

```quiz
{"q": "A prompt yields a usable answer 80% of the time, and you retry until one succeeds. How many attempts does a request need on average?", "options": ["1.25", "1.2", "1.8", "2"], "answer": 0, "explain": "For a geometric number of attempts, E[A] = 1/p = 1/0.8 = 1.25. Answering 1.2 adds the failure rate once, ignoring that retries can fail again."}
```

```quiz
{"q": "Each attempt costs $0.010 and succeeds with p = 0.85. A rewritten prompt adds $0.001 per attempt and raises p to 0.95. Which is cheaper per usable answer?", "options": ["The rewritten prompt: about $0.01158 versus $0.01176", "The original: it is cheaper per attempt", "They are exactly equal", "The rewritten prompt: about $0.0105 versus $0.0118"], "answer": 0, "explain": "Original: 0.010 / 0.85 ≈ $0.01176. Rewrite: 0.011 / 0.95 ≈ $0.01158. Cheaper per attempt is not the same as cheaper per usable answer. The last option forgets to divide by p on the rewrite."}
```
