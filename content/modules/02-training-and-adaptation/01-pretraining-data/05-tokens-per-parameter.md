---
title: How much data a model needs, in tokens per parameter
minutes: 7
---

How much text should a model read? A useful single number is the ratio of training tokens to parameters, **tokens per parameter**:

$$
\rho = \frac{D}{N}
$$

where $D$ is the number of training tokens and $N$ the number of parameters. It is a rough measure of how thoroughly each parameter has been "fed". A model with a low ratio has capacity it never learned to use; a model with a very high ratio has squeezed a lot of data into a small set of knobs.

## In everyday life

A cricket academy has a fixed coaching budget for the season. It can sign a large squad and give each player only a few sessions, or sign a smaller squad and give each player far more practice. A big squad with little practice has plenty of talent that never gets developed. A smaller, well-drilled squad often plays better, and it is cheaper to take on tour.

Models face the same trade-off. **Parameters** are the model's adjustable numbers, which set how much it can learn. Tokens are the text it reads during training. **Tokens per parameter** is the number of training tokens divided by the number of parameters: how much practice each one gets. Early very large models had low ratios, so they were under-practised for their size. Later work found a balanced ratio for a given budget. Models that must serve many users are often trained well past that balance, because a small, well-practised model is cheaper to run every day. Unlike a squad, the supply of fresh practice material can run out, since good human-written text is finite.

**Where you meet it.** Reading a model card, you see a small model trained on a very large amount of text. A quick ratio check tells you the designers chose a small, heavily trained model that is cheap to run, rather than a bigger one trained on less. That tells you what they cared about.

```scene
title: Coaching budget at a cricket academy
step: 🏏 The academy has a fixed coaching budget for the season | Fixed training compute
step: 👥 It must pick a squad size: many players or few | Number of parameters
step: 🎯 A bigger squad means fewer practice sessions each | Fewer tokens per parameter
step: 📈 A smaller, well-drilled squad often beats a big under-practised one | A balanced ratio, as in Chinchilla
step: 🧳 A small squad is cheaper to take on tour, so some are drilled extra hard | Training past the balance to cut serving cost
step: 📦 Eventually the supply of fresh practice material runs low | Finite human text
takeaway: Tokens per parameter tells you how well-fed a model is, and what its designers valued.
```

## The ratio across well-known models

| Model | Parameters $N$ | Training tokens $D$ | $\rho = D/N$ |
|---|---|---|---|
| GPT-3 (2020) | 175B | ~300B | ~1.7 |
| Chinchilla (2022) | 70B | 1.4T | 20 |
| Llama 2 70B (2023) | 70B | 2T | ~29 |
| Llama 2 7B (2023) | 7B | 2T | ~286 |

Check two rows: $1.4 \times 10^{12} / 7 \times 10^{10} = 20$, and $2 \times 10^{12} / 7 \times 10^9 \approx 286$. The trend in the table is the story of the field. GPT-3-era models were large and relatively under-trained. The Chinchilla paper showed that, for a fixed training budget, a smaller model trained on many more tokens reaches a lower loss, and that the best balance is roughly **20 tokens per parameter**. Later models went far beyond 20 on purpose, because a small model that has been trained for longer is cheaper to serve. The next lesson derives the 20 and explains why going past it can be the right call.

## How big is a corpus in tokens?

Data comes measured in bytes; training is measured in tokens. For English text and a modern byte-pair tokenizer, one token is on average about **4 bytes** (roughly three-quarters of a word). Code and non-English text usually tokenize less efficiently, so use your own tokenizer on a sample to get the real ratio $\beta$ (bytes per token):

$$
D_{\text{corpus}} \approx \frac{\text{bytes}}{\beta}
$$

```steps
From filtered terabytes to a training plan
The filtering pipeline in the previous topic left 5.4 TB of English text. At $\beta \approx 4$ bytes per token: $5.4 \times 10^{12} / 4 = 1.35 \times 10^{12}$, about **1.35T tokens**.
---
A 13B-parameter model at the Chinchilla ratio needs $20 \times 13 \times 10^9 = 260\text{B}$ tokens. The corpus covers that about 5 times over: plenty.
---
The same 13B model trained "inference-style" at 150 tokens per parameter needs $150 \times 13\text{B} = 1.95\text{T}$ tokens.
---
That is $1.95 / 1.35 \approx 1.44$ epochs of the corpus. Repeating a high-quality corpus once or twice is acceptable; the alternative is to loosen the filters and add lower-quality tokens. Both choices are trade-offs, and teams test them with proxy models.
```

## Running out of fresh text

The ratios in the table have a consequence: the largest runs now consume corpora of many trillions of tokens, and the amount of high-quality public human text is finite. Three responses are common.

1. **Repeat good data.** Experiments on data-constrained training found that a few epochs over the same tokens give nearly the same benefit as fresh tokens, with sharply diminishing returns after that.
2. **Widen the net.** More languages, more code, transcribed audio, and documents previously filtered out.
3. **Synthesise data.** Use existing models to rewrite, explain or generate text, then filter it. This works for some skills (maths, code, reasoning traces) but needs care, because training on a model's own outputs without verification can amplify its errors.

```callout-key
The rule of thumb
For a fixed training budget, about 20 tokens per parameter minimises loss. For a model that will serve a lot of traffic, train well past 20 if you have the data. Either way, convert bytes to tokens with your own tokenizer before you plan.
```

## In practice

When reading a model card, compute $\rho$ yourself: it tells you a lot about the designers' priorities. A ratio near 20 says "best model for the training compute". A ratio in the hundreds says "small and cheap to run, trained hard". A ratio below 5 is a sign the model is probably under-trained for its size. And when someone quotes a corpus in gigabytes, divide by 4 as a first guess and then check with the actual tokenizer.

```quiz
{"q": "A 3B-parameter model is trained on 1.5T tokens. What is its tokens-per-parameter ratio?", "options": ["5", "50", "500", "2,000"], "answer": 2, "explain": "$1.5 \\times 10^{12} / 3 \\times 10^9 = 500$. Losing a factor of 10 or 1,000 in the exponents (giving 50 or 5) is the usual slip; write both numbers in scientific notation before dividing."}
```

```quiz
{"q": "You have 800 GB of filtered English text and a tokenizer averaging 4 bytes per token. Roughly how many tokens is that?", "options": ["200 million", "3.2 trillion", "200 billion", "800 billion"], "answer": 2, "explain": "$800 \\times 10^9 \\text{ bytes} / 4 = 2 \\times 10^{11}$, i.e. 200B tokens. Multiplying by 4 instead of dividing gives 3.2T; equating bytes with tokens gives 800B."}
```
