---
title: Expected tokens per pass and the speedup formula
minutes: 8
---

How much faster is speculative decoding? The answer is a short formula you can derive in a few lines, and it tells you how to pick the draft length.

## Expected accepted tokens

Model each drafted token as accepted independently with probability $\alpha$ (a simplification, since acceptance varies by position and context, but a good guide). The draft proposes $k$ tokens. The target keeps the longest accepted prefix, and then always contributes one more token: the correction if a rejection happened, or the bonus token if all $k$ were accepted. So a pass emits $n + 1$ tokens, where $n \in \{0, \dots, k\}$ is the number accepted.

The number of tokens emitted is at least $j+1$ exactly when the first $j$ drafts are all accepted, which has probability $\alpha^j$. Summing over $j = 0 \dots k$:

$$
\mathbb{E}[\text{tokens per target pass}] = \sum_{j=0}^{k} \alpha^{j} = \frac{1 - \alpha^{k+1}}{1 - \alpha}
$$

Check the extremes. If $\alpha = 0$ (draft always wrong) the sum is $1$: you still get one token per pass, from the correction. If $\alpha \to 1$ the sum tends to $k + 1$: all drafts plus the bonus token.

```steps
Expected tokens for $\alpha = 0.8$, $k = 4$
Sum the terms: $\alpha^0 + \alpha^1 + \alpha^2 + \alpha^3 + \alpha^4$.
---
$1 + 0.8 + 0.64 + 0.512 + 0.4096 = 3.3616$.
---
Closed form: $(1 - 0.8^{5})/(1 - 0.8) = (1 - 0.32768)/0.2 = 3.3616$. Same.
---
So each target pass yields about 3.36 tokens, on average, instead of 1.
```

## Including the draft's cost

A pass is not free: the draft model must run $k$ steps first. Let $c$ be the cost of one draft step relative to one target step (for a 1B draft and a 70B target, $c \approx 1/70 \approx 0.014$ on weights alone; real systems see $c$ between 0.02 and 0.2 once overheads are included). One speculation round costs $k c + 1$ target-step equivalents (the draft steps plus one verification pass, which we treat as costing the same as one ordinary step, valid while decode is memory-bound). The speedup over ordinary decoding is

$$
\text{speedup} = \frac{(1 - \alpha^{k+1})/(1 - \alpha)}{1 + c\,k}
$$

Increasing $k$ raises the numerator with diminishing returns (each extra term $\alpha^{k}$ is smaller) and raises the denominator linearly. So there is an optimal $k$.

| $k$ | Tokens/pass ($\alpha=0.8$) | Speedup, $c=0.1$ | Tokens/pass ($\alpha=0.6$) | Speedup, $c=0.1$ | Tokens/pass ($\alpha=0.9$) | Speedup, $c=0.1$ |
|---|---|---|---|---|---|---|
| 1 | 1.80 | 1.64 | 1.60 | 1.45 | 1.90 | 1.73 |
| 2 | 2.44 | 2.03 | 1.96 | 1.63 | 2.71 | 2.26 |
| 3 | 2.95 | 2.27 | 2.18 | 1.67 | 3.44 | 2.65 |
| 4 | 3.36 | 2.40 | 2.31 | 1.65 | 4.10 | 2.93 |
| 6 | 3.95 | 2.47 | 2.43 | 1.52 | 5.22 | 3.26 |
| 8 | 4.33 | 2.40 | 2.47 | 1.37 | 6.13 | 3.40 |

The best $k$ is 6 for $\alpha = 0.8$ (speedup 2.47), only 3 for $\alpha = 0.6$ (1.67), and about 10 for $\alpha = 0.9$ (3.43). A poor draft should speculate briefly; a great one can speculate far. Past the optimum the speedup actually *falls*, since extra draft steps are mostly wasted once an early rejection has thrown the rest away.

```steps
One cell, by hand
$\alpha = 0.8$, $k = 4$, $c = 0.1$.
---
Tokens per pass: $3.3616$ (from above).
---
Cost per round: $1 + c k = 1 + 0.4 = 1.4$ target-step equivalents.
---
Speedup: $3.3616 / 1.4 = 2.40$. Tokens per unit of target-step time rise from 1 to 2.4.
---
If the draft were free ($c = 0$) the speedup would be $3.36$; its cost takes about 29% of the gain.
```

## See it

```sim
speculative-decoding
{"k": 4, "alpha": 0.8, "draftCost": 0.1, "seed": 7}
```

Read tokens per pass and speedup; they should match 3.36 and 2.40. Then use the sim's best-$k$ readout while you change the acceptance rate: at $\alpha = 0.6$ it should settle near 3, at $0.9$ near 10. Raise the draft cost $c$ from 0.1 to 0.3 and watch both the best $k$ and the speedup shrink: an expensive draft must be very accurate to pay off. The simulated tokens per pass is a random run, so it wobbles around the formula; change the seed to see the spread.

## In practice

Measure $\alpha$ on your own traffic, not on a benchmark: it varies a lot by task. Code, structured output and summaries (text that closely follows the input) often reach 0.7 to 0.9; open-ended creative writing is lower. Engines report an "acceptance rate" or "mean accepted length" metric; $\alpha$ can be recovered from it by solving $\mathbb{E} = (1 - \alpha^{k+1})/(1 - \alpha)$. Then compute the speedup for a few $k$ and set $k$ accordingly, remembering that real verification passes cost slightly more than one ordinary step.

```quiz
{"q": "With $\\alpha = 0.5$ and $k = 3$, what are the expected tokens per target pass?", "options": ["1.875", "2.0", "1.5", "3.5"], "answer": 0, "explain": "$1 + 0.5 + 0.25 + 0.125 = 1.875$, or $(1 - 0.5^4)/(1 - 0.5) = 0.9375/0.5 = 1.875$. The hard ceiling is $k + 1 = 4$, reached only if $\\alpha = 1$; 2.0 is the limit as $k \\to \\infty$ for $\\alpha = 0.5$, which is never reached at $k = 3$."}
```

```quiz
{"q": "$\\alpha = 0.8$, $k = 4$ gives 3.36 tokens per pass. If the draft costs $c = 0.25$ of a target step, what is the speedup?", "options": ["About 1.68", "About 2.40", "About 3.36", "About 0.84"], "answer": 0, "explain": "Round cost $= 1 + 0.25 \\times 4 = 2$, so speedup $= 3.3616/2 = 1.68$. 2.40 is the value for $c = 0.1$, and 3.36 ignores the draft's cost altogether."}
```
