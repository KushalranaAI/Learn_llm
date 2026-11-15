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

## In everyday life

Think of a tea-stall owner who has served the same regulars for years. A customer starts, "One cutting chai and...", and the owner already knows the likely ending: a samosa, or maybe a biscuit. He has not looked anything up. Years of listening taught him what usually follows what.

A **large language model (LLM)** works the same way. It is a program that has read a huge amount of text and learned which pieces tend to follow which. Those pieces are called **tokens**: a token is a whole word or part of a word. For the text so far, the model gives every possible next token a **probability**, a score for how likely it is, and then picks one. That token joins the text, and the loop runs again. This loop is all the "writing" the model does.

Unlike the owner, the model cannot step out and check a fact. It only has learned habits, so it can say something wrong in a smooth, confident voice.

**Where you meet it.** A help chatbot on a shopping site writes each reply one token at a time, always choosing from what usually comes next. People who think it looks answers up in a database trust it blindly. Knowing it works from habits tells you when to double-check, such as order numbers, dates and prices.

```scene
title: The tea stall that guesses your order
step: ☕ A regular starts an order and the owner listens | the text so far
step: 🤔 From years of habit he feels samosa is likely, biscuit less, others rare | a probability for every next token
step: 🎲 He picks one, usually the likeliest, sometimes another | picking a token
step: 🗣 That word is added to the order and he listens for more | append and repeat
step: 🚩 Sometimes a smooth guess is wrong, and he cannot check it | fluent but not looked up
takeaway: An LLM does not look answers up; it keeps picking what usually comes next.
```

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
