---
title: Tokens are the unit of cost and length
minutes: 8
---

Every hosted model bills per token, every context window is measured in tokens, and generation speed is quoted in tokens per second. So the first thing an engineer does when designing an LLM feature is a token budget: how many tokens go in, how many come out, and what that costs per request and per month. It is like costing a phone plan by minutes: the price per minute is easy, the skill is estimating the minutes.

Two details catch people out. Input and output tokens are priced differently, and output is usually several times more expensive per token because each output token needs its own sequential forward pass (the KV-cache lesson explains why). And in a chat, the whole conversation history is sent again with every new message, so input tokens grow turn after turn.

## The cost formula

For one request with $T_{\text{in}}$ input tokens and $T_{\text{out}}$ output tokens, priced at $p_{\text{in}}$ and $p_{\text{out}}$ dollars per million tokens:

$$
\text{cost per request} = \frac{T_{\text{in}}\, p_{\text{in}} + T_{\text{out}}\, p_{\text{out}}}{10^6}, \qquad \text{cost per month} \approx \text{cost per request} \times R \times 30
$$

where $R$ is requests per day. Input tokens include everything you send: the system prompt, any retrieved documents, the history and the user's message. Words convert to tokens with the fertility $f$ from the compression topic: $T \approx f \cdot W$.

## Worked example (the sim's defaults)

A feature has a 400-token system prompt, 600 words of user input and a 250-word answer, in English ($f = 1.3$), at \$3 per million input tokens and \$15 per million output tokens, with 10,000 requests a day.

```steps
From words to a monthly bill
**Input tokens.** $400 + 600 \times 1.3 = 400 + 780 = 1{,}180$.
---
**Output tokens.** $250 \times 1.3 = 325$.
---
**Cost per request.** Input $1{,}180 \times 3 / 10^6 = 0.00354$; output $325 \times 15 / 10^6 = 0.004875$; total $0.008415$ dollars, a bit under one cent.
---
**Scale up.** Per day: $0.008415 \times 10{,}000 = 84.15$ dollars. Per month (30 days): about $2{,}524.50$ dollars.
---
**Where the money goes.** Output is only $325 / 1{,}505 \approx 22\%$ of the tokens but $0.004875 / 0.008415 \approx 58\%$ of the cost. Halving the answer length to 125 words (163 tokens) saves $(325 - 163) \times 15 / 10^6 \approx 0.00243$ per request, about 24 dollars a day. Trimming the system prompt by 200 tokens saves only $200 \times 3 / 10^6 = 0.0006$, 6 dollars a day.
```

## Chat history grows quadratically

If each turn of a conversation adds $t$ tokens (question plus answer) and the full history is resent each time, turn $k$ sends about $k t$ input tokens. Over $K$ turns the total input is

$$
t \sum_{k=1}^{K} k = t\,\frac{K(K+1)}{2}
$$

With $t = 300$ and $K = 10$ turns: $300 \times 55 = 16{,}500$ input tokens, compared with $3{,}000$ if every turn were independent. A 20-turn chat costs $300 \times 210 = 63{,}000$. This is why long chats are summarised or truncated, and why caching a repeated prefix (module 03) matters so much.

## See it

```sim
token-cost
{"systemTokens": 400, "inputWords": 600, "outputWords": 250, "language": "english", "inputPrice": 3, "outputPrice": 15, "requestsPerDay": 10000}
```

Confirm the readouts match the hand calculation. Then try three changes one at a time and note the monthly cost each time: set output words to 125; set the system prompt to 3,000 tokens (a typical size once tools and examples are included); and switch language to JSON. Finally set requests per day to 1,000,000: decisions that look like rounding errors per request become the main line of a budget at scale.

## In practice

- **Count with the real tokenizer** before launch. Libraries such as `tiktoken` (for OpenAI models) or a model's `transformers` tokenizer give exact counts; the 1.3 tokens-per-word rule is for back-of-envelope only.

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
text = "Tokens are the unit of cost and length."
ids = enc.encode(text)
print(len(text.split()), "words ->", len(ids), "tokens")
print(enc.decode(ids) == text)  # lossless round trip: True
```

- **Budget the context window, not just the bill.** Input plus output must fit: $T_{\text{in}} + T_{\text{out}} \le n_{\max}$. If you allow up to 1,000 output tokens on an 8,192-token model, the prompt can be at most 7,192 tokens, including history and retrieved documents.
- **Cap output length** with a `max_tokens` setting. Output tokens are the expensive ones, and runaway answers are a common cause of surprise bills and latency spikes.
- **Prices change, ratios persist.** Specific per-token prices move often; the structure (output dearer than input, cached input cheaper) has been stable. Keep prices in configuration, not in code.

```quiz
{"q": "A request sends 2,000 input tokens and receives 500 output tokens at \\$1 per million input and \\$4 per million output. What does it cost?", "options": ["\\$0.004", "\\$0.0025", "\\$0.010", "\\$0.0045"], "answer": 0, "explain": "$2{,}000 \\times 1/10^6 = 0.002$ plus $500 \\times 4/10^6 = 0.002$, total \\$0.004. \\$0.010 prices all 2,500 tokens at the output rate; \\$0.0025 prices everything at the input rate."}
```

```quiz
{"q": "A chat adds 400 tokens per turn and resends the full history every turn. Roughly how many input tokens does a 6-turn conversation use in total?", "options": ["2,400", "8,400", "14,400", "4,800"], "answer": 1, "explain": "Turn $k$ sends about $400k$ tokens, so the total is $400 \\times (1+2+3+4+5+6) = 400 \\times 21 = 8{,}400$. 2,400 assumes no history is resent; 14,400 squares the turn count ($400 \\times 36$) instead of summing."}
```

```lab
token-budget
```
