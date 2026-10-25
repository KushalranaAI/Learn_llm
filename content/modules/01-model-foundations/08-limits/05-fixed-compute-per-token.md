---
title: A fixed budget of thought per token
minutes: 8
---

Ask someone to multiply 4,837 by 2,916 in their head and give the answer instantly, with no paper, and they will fail, even if they are a fine mathematician. The problem needs more steps than fit into one instant. Give them paper and two minutes and they will get it right. Language models have the same limit, and it is built into the architecture.

Every token a model produces comes out of one **forward pass**: the input runs through the same $L$ layers, using the same parameters, doing the same amount of arithmetic, whether the next token is the word " the" or the final digit of a hard calculation. The model cannot pause to think harder about a difficult token. It has a fixed budget of computation per token, and some tasks need more than that budget in one go.

## Counting the budget

For a model with $N$ parameters, a forward pass costs about

$$
C_{\text{token}} \approx 2N \ \text{FLOPs}
$$

because each parameter takes part in one multiply and one add per token (attention over the context adds a bit more, which grows with context length). For an 8-billion-parameter model that is $2 \times 8 \times 10^9 = 1.6 \times 10^{10}$ FLOPs, 16 GFLOPs, for every token. There is also a limit on **sequential depth**: within one token the computation passes through exactly $L$ layers in order, so a chain of dependent steps longer than the network can represent cannot be finished inside a single token.

Writing intermediate steps changes the picture. Each generated token gets its own forward pass and is then fed back as input, so the model can store partial results in the text and read them on the next step. A 200-token worked solution buys

$$
200 \times 1.6 \times 10^{10} = 3.2 \times 10^{12} \ \text{FLOPs}
$$

200 times the computation of a one-token answer, and, just as important, 200 sequential passes instead of one. This is the mechanical reason **chain-of-thought** prompting and reasoning models that "think" before answering do better on multi-step problems: the scratchpad is extra computation and extra memory.

```steps
Why the scratchpad helps: 37 × 48
Answering in one token, the model must produce "1776" directly from a pattern it learned. For common products it may have memorised the answer; for rare ones it guesses a plausible-looking number.
---
With steps, it first writes $37 \times 40 = 1480$. That is a small, familiar sub-problem, well within one pass.
---
Next it writes $37 \times 8 = 296$, again easy on its own.
---
Then $1480 + 296 = 1776$. The two partial results are now in the context, so the addition only has to read them.
---
Each step needed little computation; the text carried the state between steps. Check with a calculator: $37 \times 48 = 1776$.
```

## Long chains still compound

Steps help, but each step can still go wrong. If each of $k$ steps is right with probability $q$ and an error anywhere spoils the result,

$$
P(\text{correct}) = q^{k}
$$

With $q = 0.99$ and $k = 50$ steps, $0.99^{50} \approx 0.605$. Even 99%-reliable steps leave a 50-step derivation wrong 40% of the time. This is why reliable systems add verification (check the result another way) or hand exact work to a tool.

## Tokens hide the letters

A second limit comes from tokenization. The model never sees characters; it sees token IDs. A word like "strawberry" may arrive as two or three sub-word tokens, depending on the tokenizer, and each token is a single ID whose spelling the model only knows indirectly, from having seen it spelled out elsewhere. Asking "how many r's are in strawberry?" asks the model to reason about characters it was never shown. Similar artefacts affect reversing words, counting characters, rhyming and arithmetic on long numbers whose digits are split into irregular chunks.

| task | why it is hard for a next-token model | standard workaround |
|---|---|---|
| Multi-digit arithmetic | Many dependent steps; digits split into odd tokens | Calculator or code tool |
| Counting letters, reversing strings | Characters hidden inside token IDs | Spell it out first, or run code |
| Long logical chains | $q^k$ compounding, fixed depth per token | Step-by-step reasoning plus verification |
| Exact lookups (dates, IDs, quotes) | Probabilistic recall, not storage | Retrieval or database query |
| Counting items in a long list | Needs exact running state | Number the items, or use code |

## See it

```sim
sampling
{"temperature": 1, "topP": 1}
```

Picture the distribution as the model writing the first digit of an answer to a hard sum in one shot. Several digits share the mass because the model cannot compute the answer in one pass, so it falls back on plausible-looking digits. Lower the temperature to 0.1: the output becomes deterministic, but if the top digit is wrong, greedy makes it wrong every time. Determinism and correctness are different properties.

## In practice

Engineers give the model room and tools in proportion to the task. For arithmetic, dates and data manipulation they expose a code or calculator tool and instruct the model to use it. For multi-step reasoning they let it reason before the final answer (and accept the extra output tokens, latency and cost), then extract the final answer in a fixed format. They budget for the cost: if reasoning adds 500 output tokens per request, that is often the most expensive part of the call. A common mistake is asking for "just the answer, no explanation" on a hard problem to save tokens, which removes exactly the computation the model needed.

```quiz
{"q": "A 70B-parameter model writes a 300-token reasoning trace before its answer. Roughly how many forward-pass FLOPs does the trace cost?", "options": ["About $1.4 \\times 10^{11}$", "About $4.2 \\times 10^{13}$", "About $2.1 \\times 10^{13}$", "About $8.4 \\times 10^{13}$"], "answer": 1, "explain": "Per token $2N = 1.4 \\times 10^{11}$ FLOPs; times 300 tokens gives $4.2 \\times 10^{13}$. The first option is a single token; $2.1 \\times 10^{13}$ forgets the factor of 2."}
```

```quiz
{"q": "Why does writing intermediate steps help a model solve multi-step arithmetic?", "options": ["It raises the model's temperature", "Each written token is another forward pass, and the text stores partial results the next pass can read", "It makes the model use a larger vocabulary", "It retrains the weights during generation"], "answer": 1, "explain": "The weights never change during generation. Each extra token adds a full pass of computation and the generated text acts as working memory, so a long chain becomes many small steps. Temperature and vocabulary are unrelated."}
```
