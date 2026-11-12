---
title: An LLM is a very good autocomplete
minutes: 4
---

```callout-before
Start here
No background needed. This lesson is mostly things to watch and play with. Press Play on each simulation.
```

```callout-tip
Run it yourself
Everything in this module runs in your browser. When you want to write and train the real thing, [Run It Yourself](/learn/model-foundations/run-it-yourself) shows how on a laptop CPU (8–16 GB RAM), free Google Colab or a short GPU rental.
```

```predict
{"q":"A model gives \" Paris\" a 95% chance of coming next after \"The capital of France is\". If you turn its randomness (temperature) up and ask many times, what happens?","options":["It always says Paris, because it knows the answer","Sooner or later it says a wrong city such as \" Lyon\", in a perfectly fluent sentence","It refuses to answer once it is unsure"],"answer":1,"reveal":"It sometimes says Lyon. The model never looks the answer up: it gives every next token a probability and picks one, so a 5% tail still gets picked now and then. The simulation below lets you watch it happen."}
```

Your phone suggests the next word as you type. A **large language model (LLM)** does the same thing, with far more skill: it reads the text so far and gives every possible next **token** (a word or a piece of a word) a probability.

$$P(\text{next token} \mid \text{text so far})$$

Then it picks one, adds it to the text, and does it again. That loop is all the "writing" an LLM does.

```sim
llm-autocomplete
{"prompt": "capital", "temperature": 1}
```

**Try this:** set temperature to 0 and press Play: the top bar wins every time. Now try 1.8 and press Resample a few times. Sooner or later you get " Lyon", fluent and wrong.

```callout-key
The one idea
Each step, the model's five bars add up to 1. "Paris" at 95% means: in text like this, "Paris" usually comes next. The model never looks the answer up. It has learned what usually comes next.
```

```quiz
{"q": "An LLM is generating an answer. What happens at each step?", "options": ["It finds the answer in a database and copies it out", "It gives every possible next token a probability, picks one, appends it, and repeats", "It writes the whole answer at once and then checks it", "It searches the internet for the most common next word"], "answer": 1, "explain": "Generation is a loop of next-token predictions. A database lookup is the tempting picture, but the model stores no documents: its knowledge is in learned probabilities, which is why it can be fluent and wrong."}
```
