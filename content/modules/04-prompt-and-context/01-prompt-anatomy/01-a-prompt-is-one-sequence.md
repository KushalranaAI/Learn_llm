---
title: A prompt is one long sequence of tokens
minutes: 7
---

```callout-before
Before you start
You need two ideas from module 1: text is split into tokens, and a model produces one next token at a time from everything before it. Nothing else is assumed.
```

When you call a chat API you send a tidy list of messages: a system message, a user message, maybe some earlier turns. It feels like talking to someone who reads each message separately and knows who said what. That is not what happens. Before the model runs, the server glues every message into **one flat sequence of tokens**, adds some special marker tokens, and hands that single sequence to the model.

The model then does the only thing it can do: predict the next token, then the next, until it emits a stop token. Everything you think of as "the prompt" (rules, examples, documents, chat history, tool results) is just a prefix of that sequence. **Prompt engineering** is the craft of choosing that prefix so the continuation you want becomes the likely one. **Context engineering** is the same craft applied to the whole window: deciding which documents, history and tool output earn a place in the prefix at all.

This framing explains a lot of behaviour that otherwise looks mysterious. A model "forgets" an instruction because the instruction is 30,000 tokens back and competes with everything after it. A model "obeys" text inside a pasted email because, to the model, that email is made of the same kind of tokens as your instructions. A prompt costs money in proportion to its length because every token in the prefix is processed on every call.

## The maths: what the model actually computes

Call the rendered prefix $x = (x_1, \dots, x_n)$, a sequence of $n$ token ids. The model defines a probability for any continuation $y = (y_1, \dots, y_m)$ as a product of next-token probabilities:

$$
P(y \mid x) = \prod_{t=1}^{m} P\big(y_t \mid x_1, \dots, x_n, y_1, \dots, y_{t-1}\big)
$$

Here $n$ is the prompt length in tokens, $m$ the response length, and each factor is one softmax output from the model. The prompt never changes the model's weights. It only changes the conditioning: which $x$ the probabilities are computed from. So the only lever a prompt has is moving probability mass between possible continuations.

A small worked example makes this concrete. Suppose the model must answer a yes/no question, and you measure the probability that its first token is "Yes" under two prompts:

| Prompt | $P(\text{first token} = \text{"Yes"})$ | $P(\text{"No"})$ | $P(\text{anything else})$ |
|---|---|---|---|
| "Is this refund eligible?" | 0.35 | 0.25 | 0.40 |
| "Answer with exactly Yes or No. Is this refund eligible?" | 0.58 | 0.40 | 0.02 |

The second prompt did not make the model smarter. It moved 38 percentage points of mass off "anything else" (preambles like "Sure, let me check") and onto the two tokens you can parse. The ratio of Yes to No barely moved ($0.35/0.25 = 1.40$ versus $0.58/0.40 = 1.45$). That is typical: wording changes the *format* of answers far more reliably than it changes the model's underlying judgement.

## The cost side of the same sequence

Because the prefix is processed in full on every call, cost is linear in its length. With an input price $p_{\text{in}}$ per token and output price $p_{\text{out}}$ per token, one call costs

$$
c = n \, p_{\text{in}} + m \, p_{\text{out}}
$$

Take hypothetical prices of \$3 per 1M input tokens and \$15 per 1M output tokens, so $p_{\text{in}} = 3 \times 10^{-6}$ and $p_{\text{out}} = 1.5 \times 10^{-5}$ dollars. A request with $n = 2{,}000$ and $m = 300$ costs $2{,}000 \times 3\times10^{-6} + 300 \times 1.5\times10^{-5} = 0.006 + 0.0045 = \$0.0105$. Output tokens are five times dearer here, yet the input still makes up 57% of the bill, because there are so many more of them.

```steps
From messages to a model call
You send a list: a system message, then a user message.
---
The server's **chat template** wraps each message in marker tokens that say who is speaking, then joins them into one string.
---
It appends a marker that means "assistant, your turn", so the most likely next token is the start of a reply.
---
The tokenizer turns the string into $n$ token ids. You are billed for all $n$ of them.
---
The model generates $m$ tokens until it produces an end-of-turn token. The server strips the markers and returns the text as an assistant message.
```

```sim
token-cost
{"systemTokens": 0, "inputWords": 1500, "outputWords": 200, "language": "english", "inputPrice": 3, "outputPrice": 15, "requestsPerDay": 1000}
```

The sim starts at a 1,500-word prompt and a 200-word answer at \$3 and \$15 per 1M tokens. Read the input and output tokens (about 1,950 and 260) and notice that input still makes up most of the cost. Then switch the language to source code, then to Hindi, and watch the token count, and the bill, climb for exactly the same number of words.

## In practice

Engineers who are good at this read the **rendered** prompt, not the message list. Most serving stacks can print the final templated string, and most API responses report the exact input token count. When behaviour is strange, the first debugging step is to look at what the model actually saw: a missing newline, a duplicated system message or a 20,000-token tool result explains more bugs than clever wording does.

A common mistake is to treat the message list as a security boundary ("the user can only write in the user message, so they cannot override the system prompt"). The roles are a strong hint the model was trained to respect, but they are still tokens in one sequence. Lesson 6 builds on exactly this point.

```quiz
{"q": "Under a prompt, a model gives P(\"Yes\") = 0.30, P(\"No\") = 0.20 and P(other) = 0.50 for its first token. After adding \"Reply with Yes or No only\", P(other) falls to 0.05 and the Yes:No ratio is unchanged. What is the new P(\"Yes\")?", "options": ["0.57", "0.35", "0.475", "0.60"], "answer": 0, "explain": "Yes and No now share 0.95 in the ratio 3:2, so P(Yes) = 0.95 × 0.6 = 0.57. Answering 0.60 assumes P(other) dropped to zero; 0.475 splits the mass equally and ignores the ratio."}
```

```quiz
{"q": "Why does a model sometimes act on instructions found inside a document you pasted into the user message?", "options": ["The document is rendered into the same token sequence as your instructions, so nothing structural separates them", "The API forwards pasted documents to a separate model", "Pasted text is given higher priority than the system prompt by the template", "Models only read the last message"], "answer": 0, "explain": "Everything becomes one flat sequence of tokens. Roles and delimiters are hints the model learned to respect, not a hard separation. The template does not rank pasted text above the system prompt; that would be the opposite of how it is designed."}
```
