---
title: The context window is a budget
minutes: 7
---

A context window is like a suitcase with a weight limit. Some things must go in (passport, the system prompt), some are nice to have (a third pair of shoes, a tenth retrieved document), and you must leave room for what you will bring back (the model's answer). Packing well means deciding what each item is worth per kilogram, not stuffing in everything that fits.

**Context engineering** is that packing problem for prompts. Every request competes for one fixed window between:

- **Fixed costs**: system prompt, tool definitions, output-format instructions, few-shot examples.
- **Conversation state**: earlier turns, summaries, pinned facts.
- **Grounding material**: retrieved documents, tool results, files.
- **The question** itself.
- **The output reserve**: tokens the model needs to write its answer (and any reasoning). Input and output share the window on most models.

## The maths: the budget equation

Let $W$ be the window size in tokens. For one request,

$$
S + T + H + Q + R + O_{\max} + \delta \le W
$$

where $S$ is the system prompt, $T$ the tool definitions, $H$ the history, $Q$ the question, $R$ the retrieved material, $O_{\max}$ the output reserve (the `max_tokens` you allow), and $\delta$ a safety margin for template overhead and tokenizer differences. Everything except $R$ is usually known before retrieval, so the retrieval budget is

$$
R_{\max} = W - (S + T + H + Q + O_{\max} + \delta)
$$

and with chunks of $c$ tokens, at most $k_{\max} = \lfloor R_{\max} / c \rfloor$ chunks fit.

```steps
Budgeting a 16k-token window
Window $W = 16{,}000$. Fixed parts: system prompt $S = 1{,}200$, tools $T = 1{,}800$, history $H = 3{,}000$, question $Q = 200$.
---
Reserve output $O_{\max} = 1{,}500$ and a margin $\delta = 300$. Committed so far: $1{,}200 + 1{,}800 + 3{,}000 + 200 + 1{,}500 + 300 = 8{,}000$.
---
Retrieval budget $R_{\max} = 16{,}000 - 8{,}000 = 8{,}000$ tokens.
---
With chunks of $c = 500$ tokens, $k_{\max} = \lfloor 8{,}000 / 500 \rfloor = 16$ chunks.
---
At a hypothetical \$3 per 1M input tokens, filling the window costs about $(16{,}000 - 1{,}500) \times 3\times10^{-6} = \$0.0435$ of input per request. Using only 6 chunks (3,000 tokens) costs $(8{,}000 - 1{,}500 + 3{,}000) \times 3\times10^{-6} = \$0.0285$.
```

That last line is the important one. $k_{\max}$ is a **ceiling**, not a target. The next topics show that the best $k$ is often well below it, because extra chunks cost money and latency and can dilute the model's attention.

## What eats budgets in practice

| Item | Typical size | Notes |
|---|---|---|
| System prompt | 300–3,000 tokens | Grows by accretion; audit it |
| Tool definitions | 100–300 tokens per tool | 20 tools can cost several thousand tokens |
| One web page as a tool result | 2,000–20,000 tokens | Strip boilerplate before inserting |
| One retrieved chunk | 200–1,000 tokens | Chosen at indexing time (module 6) |
| JSON tool output | Often 2–3× the tokens of the same facts in prose | Keys and punctuation are tokens too |
| Output reserve | 200–4,000 tokens | Long reasoning needs much more |

```callout-warn
Overflow fails silently
When a prompt exceeds the window, some stacks reject the request, but many frameworks silently truncate, often from the *start*, which can cut off the system prompt. Always compute the budget in code with the real tokenizer and decide explicitly what to drop.
```

```sim
context-position
{"contextTokens": 16384, "position": 50, "model": "older"}
```

The sim starts at a 16k context with a key fact halfway in: recall reads about 57%. Drag the position to 0% (about 82%) and to 100% (about 87%). The window is not uniform: the same fact, in the same budget, is used less often in the middle. Now switch to the long-context model and compare: the dip shrinks but does not vanish. Budgeting decides *what* fits; the next topics decide *where* it goes.

## In practice

Production systems build the prompt in a fixed order of priority: system prompt and tools first (never dropped), then pinned facts and the question, then the output reserve, then as much history and retrieved material as the remaining budget and the quality data justify. A function that assembles context, counts tokens and logs what was dropped is one of the most useful pieces of code in an LLM application.

```quiz
{"q": "Window 32,000 tokens. System 2,000, tools 3,000, history 6,000, question 500, output reserve 4,000, margin 500. How many 800-token chunks fit?", "options": ["20", "25", "15", "32"], "answer": 0, "explain": "Committed: 2,000 + 3,000 + 6,000 + 500 + 4,000 + 500 = 16,000. R_max = 16,000, and ⌊16,000 / 800⌋ = 20. Forgetting the output reserve gives 25; dividing the whole window by 800 gives 40, not offered."}
```

```quiz
{"q": "Why should the output reserve be subtracted before deciding how much to retrieve?", "options": ["Input and output share the window, so a full prompt leaves no room for the answer and it gets cut off", "Providers charge output tokens at the input rate", "Retrieval is slower than generation", "The output reserve is only needed for streaming"], "answer": 0, "explain": "On most models the generated tokens occupy the same window as the prompt. Pack the window full of documents and the answer is truncated or the request is rejected. Pricing does not enter this argument at all."}
```
