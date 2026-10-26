---
title: What LLMs can and cannot do
minutes: 4
---

An LLM produces the *most likely-sounding* continuation. When everything it needs is in the prompt or is common knowledge, likely and right are usually the same thing. When the task needs exact computation, fresh facts or documents it never read, they come apart. Then the model needs a **tool** (calculator, code, search) or **grounding** (the right documents placed in its prompt).

Sort the cards. Each one tells you why.

```sim
llm-can-cant
```

**Try this:** sort all ten yourself before you press Play. Then click any red card to take it back.

Why exact maths is fragile: if each of 4 tokens in a long answer is right with probability $0.95$, the whole answer is right with probability

$$0.95^4 \approx 0.81$$

so about one time in five, a digit is wrong. A calculator is never wrong.

```quiz
{"q": "A user asks your chatbot about your company's refund policy, which is only in an internal document. What should you do?", "options": ["Nothing: a large enough model already knows it", "Raise the temperature so the model is more creative", "Retrieve the relevant part of the document and put it in the prompt", "Ask the model to be more careful"], "answer": 2, "explain": "The model never saw your private documents, so it can only guess a plausible-sounding policy. Grounding it with the actual text (retrieval-augmented generation) fixes that. Asking it to be careful does not give it information it does not have."}
```

You now have the whole picture at a glance. Next, open the first box: how a network learns at all. [How a Network Learns](/learn/model-foundations/how-networks-learn)
