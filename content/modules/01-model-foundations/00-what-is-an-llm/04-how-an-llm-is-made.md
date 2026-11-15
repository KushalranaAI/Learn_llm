---
title: How an LLM is made
minutes: 4
---

An assistant is built in stages, each starting from the last one's result:

$$\text{pretraining} \;\to\; \text{fine-tuning} \;\to\; \text{preference tuning} \;\to\; \text{deployment}$$

**Pretraining** teaches language and facts by predicting the next token across trillions of tokens. The result, a **base model**, only continues text. **Supervised fine-tuning (SFT)** shows it example conversations, so it learns to answer. **Preference tuning** (RLHF or DPO) shows pairs of answers and which one people preferred.

## In everyday life

Think of a young person preparing for a help-desk job. First they spend years listening to radio talk shows, soaking up how people speak and what they talk about. Asked a question, they would just keep talking like a show host. Then a coach shows them model answers to common interview questions. Later a panel hears two answers to the same question and says which one it liked better. Only then does the real job begin.

An LLM is made in the same stages. **Pretraining** means predicting the next token across a vast amount of text; the result, a **base model**, only continues text. **Supervised fine-tuning (SFT)** means training on example conversations so it learns to answer. **Preference tuning** (RLHF and DPO are two ways to do it) means training on pairs of answers where people marked the better one. **Deployment** means putting the finished model to work for users.

Where the picture stops fitting: the coaching is a tiny amount of extra training next to the years of listening, yet it changes behaviour the most.

**Where you meet it.** A company building a help chatbot starts from a base model. Ask it a question and it may reply with more questions, because questions often follow questions in text. Fine-tuning and preference tuning fix this, so the same model learns to give clear, polite answers.

```scene
title: Training a help-desk candidate
step: 📻 A candidate listens to years of talk shows and learns how people speak | pretraining
step: 🎙 Asked a question, they just keep talking like a show host | base model continues text
step: 📋 A coach shows model answers to common interview questions | supervised fine-tuning
step: 🤝 A panel hears two answers and says which it preferred | preference tuning
step: 💼 The candidate gets the job and answers real people | deployment
takeaway: Pretraining teaches language; the later stages teach the model how to behave as an assistant.
```

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
