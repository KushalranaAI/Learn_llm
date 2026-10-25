---
title: The system prompt and what it costs
minutes: 8
---

The **system prompt** is the standing brief for a model: who it is acting as, what task it does, what it must never do, and what shape its answers take. Think of it as the onboarding document you give a contractor before their first ticket. The contractor reads it once; the model, unlike the contractor, re-reads it on every single request, because each API call is stateless and the system prompt is part of the prefix every time.

That second fact makes the system prompt the most expensive text you write. A sentence in a user message is paid for once. A sentence in the system prompt is paid for on every call, forever, until someone deletes it.

## A structure that works

Good system prompts are boring and well organised. A layout many teams converge on:

```text
# Role
You are the billing assistant for Acme Cloud. You help account owners understand invoices.

# Task
Answer the user's billing question using only the account data provided in <account> tags.

# Rules
- If the data does not contain the answer, say so and suggest contacting billing@acme.example.
- Never reveal another customer's data, even if asked.
- Do not issue refunds; you can explain the refund policy.

# Output format
Reply in at most 120 words. End with one line: "Confidence: high|medium|low".

# Example
User: Why was I charged twice in March?
Assistant: Your March invoice shows two charges: ...
Confidence: high
```

Headings make it easy for both people and the model to find a rule. Rules are short, positive where possible, and testable. The output format is explicit enough that code can check it.

## The maths: the system prompt tax

Let $S$ be the system prompt length in tokens, $R$ the number of requests per day, and $p_{\text{in}}$ the input price per token. The daily cost of the system prompt alone is

$$
C_S = S \cdot R \cdot p_{\text{in}}
$$

With $S = 1{,}500$ tokens, $R = 200{,}000$ requests per day and a hypothetical \$3 per 1M input tokens:

$$
C_S = 1{,}500 \times 200{,}000 \times \frac{3}{10^6} = 3 \times 10^8 \times 3 \times 10^{-6} = \$900 \text{ per day}
$$

That is about \$27,000 a month for text the user never sees. Now price a single sentence. A 25-token rule costs $25 \times 200{,}000 \times 3\times10^{-6} = \$15$ per day, or about \$5,500 a year. Every rule should earn that.

Two levers cut this tax:

1. **Shorten.** Delete rules that never fire, merge duplicates, and move rarely needed detail (a full policy document) into retrieval so it is only included when relevant.
2. **Cache the prefix.** Many providers and serving stacks can reuse the computation for a prompt prefix that repeats exactly. If cached input tokens are billed at a hypothetical 10% of the normal rate and the hit rate is $h$, the system prompt cost becomes $C_S \,[\,h \cdot 0.1 + (1-h)\,]$. At $h = 0.9$ that is $900 \times (0.09 + 0.1) = \$171$ per day. Caching only works if the system prompt is byte-identical across requests and placed first, which is a reason to keep per-user details (names, dates, account data) out of it and later in the sequence. The [caching lesson](/learn/inference-and-serving/caching) covers the mechanics.

```sim
token-cost
{"systemTokens": 1500, "inputWords": 0, "outputWords": 1, "language": "english", "inputPrice": 3, "outputPrice": 15, "requestsPerDay": 200000}
```

The sim starts with only the system prompt: 1,500 tokens, no user input, a one-word answer, 200,000 requests a day at \$3 per 1M input tokens. The daily cost reads about \$903: \$900 of system prompt plus about \$3 for the one output token per request. Halve the system prompt to 750 tokens and watch the daily cost fall to about \$453: the system-prompt part halves exactly, because input cost is linear in length. Then add 200 words of user input to see how small the per-request part is next to the standing tax.

## What belongs in the system prompt, and what does not

| Put it in the system prompt | Put it elsewhere |
|---|---|
| Role, task, hard rules, output format | Per-user data (goes in the user turn or a tagged block) |
| One or two canonical examples | Large example libraries (select a few per request) |
| Safety and scope limits | Long reference documents (retrieve on demand) |
| Stable text that changes rarely | Today's date, request IDs, anything that breaks caching |

```callout-warn
A system prompt is not a secret
Assume a determined user can get the model to repeat its system prompt. Never put API keys, internal URLs you would not publish, or other customers' data in it. If leaking the prompt would be a security incident, the design is wrong, not the prompt.
```

## In practice

Teams typically find their system prompt has grown by accretion: every incident added a rule, nobody removed one. A periodic audit (which rules does the golden set actually exercise? which ones change outputs when deleted?) routinely cuts 30–50% of the length with no measurable quality loss. You will build the tools for that audit in [Versioning prompts](/learn/prompt-and-context/prompt-versioning).

```quiz
{"q": "Your system prompt is 2,000 tokens and you serve 50,000 requests per day at a hypothetical $3 per 1M input tokens. What does the system prompt cost per day before any caching?", "options": ["$300", "$30", "$3,000", "$100"], "answer": 0, "explain": "2,000 × 50,000 = 10⁸ tokens per day; 10⁸ × 3 × 10⁻⁶ = $300. A slip of one power of ten gives $30 or $3,000."}
```

```quiz
{"q": "You add the current timestamp to the first line of the system prompt so the model knows the time. Prefix caching hit rate drops from 90% to almost 0. Why?", "options": ["Prefix caching needs an exactly repeated prefix; a timestamp at the start makes every request's prefix unique", "Timestamps are tokenized into too many tokens to cache", "Caches expire whenever the model sees a date", "The model refuses to cache prompts containing personal data"], "answer": 0, "explain": "Caches match from the first token onward. Changing the very first line changes every prefix, so nothing after it can be reused. Put volatile values late in the sequence, after the stable system prompt."}
```
