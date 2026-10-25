---
title: From a base model to an assistant
minutes: 6
---

```callout-before
Before you start
You should know the next-token objective from pretraining. SFT reuses it almost unchanged, so the new ideas in this lesson are about data and formatting, not new maths.
```

Type "What is the capital of France?" into a pure pretrained model and you may get back "What is the capital of Germany? What is the capital of Italy?". That is a perfectly good continuation: on the web, a question is often followed by more questions, as in a quiz or a worksheet. A **base model** has learned what text looks like. It has not learned that it is supposed to be the one answering.

**Supervised fine-tuning** (SFT), also called **instruction tuning**, teaches that role. You show the model many examples of a prompt followed by the response you want, and train it to produce the response. The knowledge was already there from pretraining; SFT teaches a format and a behaviour: read the request, answer it helpfully, stop.

## Same loss, different data

An SFT example is a pair $(x, y)$: a prompt $x$ (instruction, maybe a system message and earlier turns) and a target response $y = (y_1, \dots, y_m)$. The objective is the familiar cross-entropy, applied only to the response, conditioned on the prompt:

$$
\mathcal{L}_{\text{SFT}}(\theta) = -\frac{1}{m}\sum_{j=1}^{m} \log p_\theta\!\left(y_j \mid x,\, y_{<j}\right)
$$

$m$ is the number of response tokens and $y_{<j}$ the response tokens before position $j$. Compared with pretraining, nothing about the network or the optimizer changes. What changes is that the training text has a structure (prompt, then answer) and that we only grade the answer. The topic on loss masking shows how that is implemented.

```steps
What one SFT example changes
Prompt $x$: "Translate to French: good morning". Target $y$: "bonjour".
---
Before SFT, the base model's probability for "bonjour" as the first response token might be low, say $p = 0.05$, because "Translate to French: good morning" is also commonly followed by more exercises. The loss on that token is $-\ln 0.05 = 3.0$ nats.
---
Gradient steps on thousands of similar pairs raise the probability of answering rather than continuing the exercise list. Suppose it reaches $p = 0.6$: the loss falls to $-\ln 0.6 = 0.51$ nats.
---
The model has not learned French in those steps (that came from pretraining). It has learned that, in this format, its job is to produce the answer.
```

## The modern post-training pipeline

```mermaid
flowchart LR
  P["Pretrained base model"] --> S["SFT: prompt-response pairs"]
  S --> R["Preference tuning: RLHF / DPO"]
  R --> A["Assistant model"]
  S -. "optional" .-> D["Domain SFT for your task"]
```

SFT usually comes first because it is simple, stable and cheap, and it gives the later preference-tuning stage a model that already behaves roughly correctly. The next lesson covers that stage.

| | Base model | After SFT |
|---|---|---|
| Training text | Raw documents | Prompt + response, in a chat template |
| Loss counted on | Every token | Response tokens only |
| Typical behaviour | Continues text in any style | Answers, follows format, stops |
| Data size | Trillions of tokens | Thousands to millions of examples |

## In practice

You will meet SFT in two settings. Model builders run large, general SFT (many tasks, many languages, safety examples) to turn a base model into an assistant. Product teams run small, specific SFT on an existing instruct model to teach a narrow behaviour: a strict output format, a house style, a classification scheme. The second kind is cheap and effective for **behaviour and format**, and much less effective for teaching new **facts**, as the last topic of this lesson explains. Start from the instruct version of a model for product work unless you have a strong reason to redo general SFT yourself.

```quiz
{"q": "A base model answers the prompt 'List three primes:' with 'List three even numbers: List three odd numbers:'. What does this show?", "options": ["The model has no knowledge of primes", "The model is continuing a plausible document rather than acting as an answerer, which SFT addresses", "The tokenizer is broken", "The temperature is too low"], "answer": 1, "explain": "Worksheets often list exercises one after another, so this is a likely continuation. The knowledge is probably present; what is missing is the trained habit of responding to the instruction, which is exactly what SFT teaches."}
```

```quiz
{"q": "During SFT, the model gives the first response token probability 0.2 and, after training, 0.8. By how much has that token's loss fallen?", "options": ["0.6 nats", "About 1.39 nats", "About 0.22 nats", "4 nats"], "answer": 1, "explain": "Loss goes from $-\\ln 0.2 = 1.609$ to $-\\ln 0.8 = 0.223$, a drop of $1.386 = \\ln 4$ nats. Subtracting the probabilities (0.6) is not the change in loss."}
```
