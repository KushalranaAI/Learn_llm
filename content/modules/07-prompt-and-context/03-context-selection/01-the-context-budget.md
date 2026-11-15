---
title: The context window is a budget
minutes: 7
---

```predict
{"q":"A 16,000-token window already holds 6,200 tokens of system prompt, tools, history and question. How many 500-token retrieved chunks can you safely add?","options":["19","16","12","32"],"answer":1,"reveal":"16: the answer shares the window, so a 1,500-token output reserve and a 300-token margin come off first, leaving 8,000 tokens for retrieval. The steps under \"The maths: the budget equation\" do the sum, and 16 is a ceiling, not a target."}
```

A context window is like a suitcase with a weight limit. Some things must go in (passport, the system prompt), some are nice to have (a third pair of shoes, a tenth retrieved document), and you must leave room for what you will bring back (the model's answer). Packing well means deciding what each item is worth per kilogram, not stuffing in everything that fits.

**Context engineering** is that packing problem for prompts. Every request competes for one fixed window between:

- **Fixed costs**: system prompt, tool definitions, output-format instructions, few-shot examples.
- **Conversation state**: earlier turns, summaries, pinned facts.
- **Grounding material**: retrieved documents, tool results, files.
- **The question** itself.
- **The output reserve**: tokens the model needs to write its answer (and any reasoning). Input and output share the window on most models.

## In everyday life

Picture the one-page summary sheet a clinic keeps for each patient. The top has a printed header. Below it come notes from past visits, then today's complaint, then any lab reports the nurse clipped on. At the bottom the doctor needs blank space to write the new note. If the nurse fills every line with old reports, the doctor has nowhere to write.

A language model works with a sheet like this. The **context window** is the fixed amount of text the model can hold in view for one request. Text is counted in **tokens**, small pieces of words. The **system prompt** is the standing instructions at the top, like the printed header. The **output reserve** is the blank space kept for the answer, because the answer is written on the same sheet as the question.

So **context engineering** starts with simple bookkeeping: add up what must go in, keep room for the reply, and only then decide how much extra material fits. Unlike a paper sheet, the model counts tokens, not lines, so you must count with its own counter.

**Where you meet it.** A company's help chatbot pastes in the user's past chats and a few policy pages before every question. If nobody does the sum, a long chat history pushes the policy pages out, or leaves the answer no room and it is cut mid-sentence. A budget calculation in code prevents both.

```scene
title: The clinic sheet that ran out of space
step: 🏥 The header and standing instructions are printed on the sheet first | system prompt and tool definitions
step: 📋 Notes from earlier visits and today's complaint go on next | history and the question
step: 🧾 The nurse wants to clip on many lab reports | retrieved chunks
step: ✍️ The nurse keeps blank lines at the bottom for the doctor's note | output reserve
step: ➗ Whatever space remains decides how many reports can be added | retrieval budget
takeaway: Reserve room for the answer first, then fill what is left with extra material.
```

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
| One retrieved chunk | 200–1,000 tokens | Chosen when the documents are indexed |
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
