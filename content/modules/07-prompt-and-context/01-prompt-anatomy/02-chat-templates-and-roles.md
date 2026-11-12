---
title: Chat templates and roles
minutes: 8
---

A **chat template** is the formatting rule that turns a list of messages into the single string a model was trained on. During instruction tuning the model saw millions of conversations written in one exact format, with special tokens marking where each speaker's turn starts and ends. At inference you must reproduce that format precisely. Get it right and the model behaves like the assistant it was tuned to be. Get it wrong and you are effectively prompting a different, half-trained model.

Each message has a **role**. The common ones are:

| Role | Who writes it | What the model learned to do with it |
|---|---|---|
| system (or developer) | The application builder | Treat as standing rules and persona for the whole conversation |
| user | The person using the app | Treat as the request to answer |
| assistant | The model (earlier turns) | Treat as what it already said; stay consistent with it |
| tool | Your code, returning a tool result | Treat as data from the outside world, produced after a tool call |

Here is a conversation rendered with a ChatML-style template, one widely used format. Other model families use different markers, but the structure is the same: a start marker, a role name, the content, an end marker.

```text
<|im_start|>system
You are a support assistant for Acme Cloud. Answer only questions about Acme products.<|im_end|>
<|im_start|>user
How do I rotate my API key?<|im_end|>
<|im_start|>assistant
```

The final line is the **generation prompt**: an opened assistant turn with no content. It is what makes "start of an assistant reply" the most probable continuation. Forget it, and the model may continue the user's message instead of answering it.

## The maths: template overhead

Every message pays a fixed number of extra tokens for its markers. Let message $i$ have $\ell_i$ content tokens, let each message cost $o$ overhead tokens (start marker, role name, newline, end marker), and let the generation prompt cost $g$ tokens. For $k$ messages the rendered prompt length is

$$
n = \sum_{i=1}^{k} (\ell_i + o) + g = \sum_{i=1}^{k} \ell_i + k\,o + g
$$

With a typical $o = 4$ and $g = 3$, a 10-message conversation pays $10 \times 4 + 3 = 43$ tokens of pure formatting. That is negligible next to a 2,000-token system prompt, but it is not negligible for a classifier that sends 25-token messages: three messages of 25 tokens become $75 + 12 + 3 = 90$ tokens, so 17% of the input is markup. If you split a long instruction into many tiny messages, the overhead fraction grows; one message with the same content is cheaper.

```steps
Rendering a three-message conversation
Messages: system (40 tokens), user (25 tokens), and the generation prompt. Overhead $o = 4$ per message, $g = 3$.
---
System message: $40 + 4 = 44$ tokens.
---
User message: $25 + 4 = 29$ tokens.
---
Generation prompt: $3$ tokens. Total $n = 44 + 29 + 3 = 76$.
---
At a hypothetical \$3 per 1M input tokens this request's input costs $76 \times 3 \times 10^{-6} = \$0.000228$. Of that, $(4+4+3)/76 = 14.5\%$ is template overhead.
```

## What goes wrong in practice

Template bugs are among the most common reasons an open-weight model "seems worse than the benchmarks". The usual culprits:

- **Wrong template for the model.** Using one family's markers with another family's model. The model never saw those markers as special, so it reads them as ordinary text.
- **Special tokens tokenized as text.** If the string `<|im_end|>` is split into ordinary pieces like `<`, `|`, `im`, the model does not see an end-of-turn token at all. Use the tokenizer's built-in template function (for example `apply_chat_template` in Hugging Face transformers) rather than formatting strings by hand.
- **Missing generation prompt** or a stray trailing newline after it, which shifts the most likely first token.
- **Double system messages** when a framework adds a default system prompt and you add your own.

Hosted APIs apply the template server-side, which removes most of these bugs but also hides the rendering. You still pay for the overhead, and you still need to know that "tool" content and "user" content land in the same sequence.

```python
# Render a conversation with the model's own template (Hugging Face transformers).
from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
messages = [
    {"role": "system", "content": "You are a terse assistant."},
    {"role": "user", "content": "Name one prime number."},
]
text = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
print(text)                      # the exact string the model will see
print(len(tok(text).input_ids))  # n, the number of input tokens you pay for
```

Running something like this once per model you deploy is cheap insurance. Print the string, eyeball the markers, and count the tokens.

```callout-tip
Prefilling the assistant turn
Some APIs let you supply the first few tokens of the assistant's reply, for example an opening brace. Because the model continues from whatever the sequence ends with, starting the reply with `{` makes a JSON object the overwhelmingly likely continuation. It is a cheap, template-level way to steer format.
```

```quiz
{"q": "A classifier sends 2 messages per request: a 30-token system message and a 20-token user message. Overhead is 4 tokens per message plus a 3-token generation prompt. What fraction of the input tokens is template overhead?", "options": ["About 18%", "About 8%", "About 14%", "About 22%"], "answer": 0, "explain": "Content is 50 tokens; overhead is 2 × 4 + 3 = 11; total 61. 11 / 61 ≈ 0.18. Forgetting the generation prompt gives 8/58 ≈ 14%; dividing 8 by 100 gives 8%."}
```

```quiz
{"q": "You format prompts by hand for an open-weight model and quality is far below published results. The rendered string looks correct to the eye. What should you check first?", "options": ["Whether the special marker strings are being tokenized as single special tokens or split into ordinary text pieces", "Whether the temperature is above 1", "Whether the system prompt is too polite", "Whether the GPU is using bf16"], "answer": 0, "explain": "A template that looks right as text can still be wrong as tokens: if the markers are split into ordinary pieces, the model never sees the turn boundaries it was trained on. Temperature and precision can matter, but a silent template mismatch is the classic cause of a large, unexplained quality gap."}
```
