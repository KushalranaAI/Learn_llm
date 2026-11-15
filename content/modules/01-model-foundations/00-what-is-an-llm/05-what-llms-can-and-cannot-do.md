---
title: What LLMs can and cannot do
minutes: 4
---

An LLM produces the *most likely-sounding* continuation. When everything it needs is in the prompt or is common knowledge, likely and right are usually the same thing. When the task needs exact computation, fresh facts or documents it never read, they come apart. Then the model needs a **tool** (calculator, code, search) or **grounding** (the right documents placed in its prompt).

## In everyday life

Think of a well-read friend who answers most questions smoothly from memory. For everyday topics, you can trust them. Now ask something else: multiply two big numbers, tell me today's cricket score, or what my own insurance paper says. A sensible friend would reach for a calculator, a phone or the paper. A fluent bluffer would just say something that sounds right.

An LLM is that friend, and it always keeps talking smoothly. It produces the most likely-sounding continuation. When the answer is common knowledge, likely and right match. When the task needs exact computation, fresh facts or documents it never read, they come apart. The fix is to hand it what the friend reached for: a **tool**, a helper such as a calculator, code or web search, and **grounding**, which means putting the right documents in front of it inside its **prompt** (the text you send it).

Unlike you, the model does not feel unsure. It keeps producing likely-sounding words either way.

**Where you meet it.** A clinic's booking assistant is asked for today's doctor timings and a patient's last visit notes. Without the idea, it makes up plausible answers. With a lookup tool and the real record placed in the prompt, it reads out the actual details.

```scene
title: The well-read friend and the missing facts
step: 🙋 A well-read friend answers common questions smoothly from memory | the most likely continuation
step: 🧮 Asked for a long multiplication, they say a number that looks right | exact maths is fragile
step: 📰 Asked about this morning's news, they guess from older things | fresh facts are missing
step: 📄 Asked about your private paper, they invent something plausible | documents it never read
step: 🔧 You hand them a calculator and the actual paper | a tool and grounding
step: ✅ Now they read from the paper and answer correctly | a grounded answer
takeaway: When likely and right come apart, give the model a tool or the real documents.
```

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
