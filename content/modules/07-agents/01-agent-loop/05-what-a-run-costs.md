---
title: What a run costs in tokens, money and time
minutes: 8
---

A chat reply is one model call. An agent run is many, and each one re-reads everything that came before. That single fact explains why agent bills surprise people: a run with twice as many steps does not cost twice as much, it costs roughly three to four times as much.

Picture reading a mystery novel where, before each new chapter, you must re-read the whole book from page one. Chapter 2 costs two chapters of reading, chapter 10 costs ten. The total reading effort grows with the square of the number of chapters. Agents read their context exactly like that, because the model has no memory between calls except the context itself.

## Input tokens grow quadratically

Let $c_0$ be the starting context in tokens (system prompt, tool definitions, task) and suppose each step appends $\Delta$ tokens (the model's tool call plus the tool's result). Call $k$, counting from $0$, reads $c_0 + k\Delta$ tokens. Over $K$ calls the total input is an arithmetic series:

$$
I(K) = \sum_{k=0}^{K-1} (c_0 + k\Delta) = K c_0 + \Delta \frac{K(K-1)}{2}
$$

The first term is linear in $K$; the second is quadratic. Output tokens are simpler: if each call writes about $g$ tokens, output is $O(K) = K g$. With input price $p_\text{in}$ and output price $p_\text{out}$ per token, the run costs

$$
\text{cost} = p_\text{in}\, I(K) + p_\text{out}\, O(K)
$$

```steps
Worked example: a 10-step research run
Take $c_0 = 3000$, $\Delta = 800$, $g = 150$, $K = 10$, and prices of \$3 per million input tokens and \$15 per million output tokens.
---
Input: $I = 10 \times 3000 + 800 \times \frac{10 \times 9}{2} = 30{,}000 + 36{,}000 = 66{,}000$ tokens. More than half comes from re-reading the history.
---
Output: $O = 10 \times 150 = 1{,}500$ tokens.
---
Cost: $66{,}000 \times 3 / 10^6 = \$0.198$ for input plus $1{,}500 \times 15 / 10^6 = \$0.0225$ for output, about **\$0.22** per run.
---
Double the run to $K = 20$: $I = 60{,}000 + 800 \times 190 = 212{,}000$ tokens and the cost is about \$0.68, roughly **3.1 times** as much for twice the steps.
```

Here is the same 10-step run, call by call:

| Call $k$ | Context read | Running input total |
|---|---|---|
| 0 | 3,000 | 3,000 |
| 1 | 3,800 | 6,800 |
| 2 | 4,600 | 11,400 |
| 5 | 7,000 | 30,000 |
| 9 | 10,200 | 66,000 |

Notice that input dominates. In agent workloads output is often under 5% of tokens, so the input price, and anything that reduces input (caching, shorter tool results, summarising history), matters far more than it does for chat.

## Latency adds up step by step

Each step costs a model call (time to first token plus generation) and a tool call. If a model call averages $m$ seconds and a tool call $u$ seconds, a $K$-step run takes about

$$
\text{latency} \approx K(m + u)
$$

With $m = 1.5$ s, $u = 0.6$ s and $K = 10$, that is $21$ seconds. Because the context grows, later calls also prefill more tokens and get slightly slower, so the estimate is a lower bound. Twenty seconds is fine for a background task and far too slow for a support chat, which is one reason the next lesson asks whether you need an agent at all.

## In practice

Three levers bring cost down, in roughly this order of impact:

1. **Prompt caching.** The start of the context is identical on every call. Providers that cache prefixes typically bill cached input at a fraction of the normal price, which hits the $K c_0$ term and much of the history term.
2. **Smaller observations.** A tool that returns 4,000 tokens of raw HTML instead of a 200-token summary raises $\Delta$ twentyfold, and $\Delta$ multiplies the quadratic term.
3. **Fewer steps.** Better tools (one call that does what used to take three), parallel calls, and clearer instructions reduce $K$, which helps both terms.

A common mistake is to budget agents with a chat-style "tokens per request" estimate. Always multiply out the series, or better, log actual tokens per run and look at the distribution: the expensive 5% of runs are usually the long, stuck ones.

```quiz
{"q": "A run has c₀ = 2,000 tokens, each step adds Δ = 1,000 tokens, and it makes K = 5 model calls. How many input tokens does it read in total?", "options": ["10,000", "20,000", "15,000", "7,000"], "answer": 1, "explain": "I = 5 × 2,000 + 1,000 × (5 × 4 / 2) = 10,000 + 10,000 = 20,000. The calls read 2k, 3k, 4k, 5k and 6k tokens. 10,000 ignores the growing history; 7,000 is only the size of the context after the last step."}
```

```quiz
{"q": "Which change most reduces the cost of a long agent run whose tools return large raw web pages?", "options": ["Lowering the output token limit", "Making the tools return short, extracted results instead of full pages", "Using a higher temperature", "Adding more tools"], "answer": 1, "explain": "Large observations inflate Δ, which multiplies the quadratic K(K−1)/2 term of input tokens. Output tokens are a small share of agent cost, so capping them barely helps."}
```
