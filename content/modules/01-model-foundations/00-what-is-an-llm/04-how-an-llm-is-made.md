---
title: How an LLM is made
minutes: 4
---

An assistant is built in stages, each starting from the last one's result:

$$\text{pretraining} \;\to\; \text{fine-tuning} \;\to\; \text{preference tuning} \;\to\; \text{deployment}$$

**Pretraining** teaches language and facts by predicting the next token across trillions of tokens. The result, a **base model**, only continues text. **Supervised fine-tuning (SFT)** shows it example conversations, so it learns to answer. **Preference tuning** (RLHF or DPO) shows pairs of answers and which one people preferred.

```sim
training-stages
{"stage": "pretrain", "prompt": "sky"}
```

**Try this:** press Play and watch the same prompt get four different answers. Then pick the headache prompt and compare stage 2 with stage 3.

```callout-tip
The surprise in the numbers
The data sizes shown are illustrative orders of magnitude. Pretraining sees about $10^{13}$ tokens; fine-tuning only about $10^{5}$ examples, roughly $10^{8}$ times less. Yet those small later stages change *how the model behaves* the most.
```

```quiz
{"q": "You send \"Explain why the sky is blue.\" to a base model that has only been pretrained. What is the most likely result?", "options": ["A careful, friendly explanation", "A refusal", "More text that continues the pattern, such as more homework questions", "An error, because base models cannot read questions"], "answer": 2, "explain": "A base model predicts what usually follows text like this, and on the web a question is often followed by more questions. Answering politely is learned later, in fine-tuning and preference tuning."}
```
