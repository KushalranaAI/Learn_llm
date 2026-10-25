---
title: In-context learning
minutes: 8
---

Show a person three examples of a form being filled in, and they can fill in the fourth without being told the rules. Large language models do something similar. Put a handful of input–output pairs in the prompt, then a new input, and the model continues the pattern. Nothing is trained; the weights are exactly the same before and after. This is **in-context learning (ICL)**, and a prompt that uses it is called **few-shot** (with $k$ examples, **$k$-shot**; with none, **zero-shot**).

```text
Classify each review as positive, negative or mixed.

Review: The battery lasts two days, but the screen scratches easily.
Label: mixed

Review: Arrived broken and support never replied.
Label: negative

Review: Exactly what I needed, setup took five minutes.
Label: positive

Review: Great sound, though the app crashes every morning.
Label:
```

Why does this work? During pretraining the model read enormous amounts of text that contains repeated patterns: tables, Q&A pages, lists of examples. Continuing a pattern is precisely what next-token prediction rewards. The examples do two jobs. They pin down **which task** this is (sentiment, not topic; three labels, not two), and they show the **format** of the answer (one lowercase word after "Label:").

## The maths: examples as evidence

A useful way to think about ICL is as inference over a hidden task. Let $c$ be the task the prompt is "about" (for example sentiment versus topic), and $E = (e_1, \dots, e_k)$ the examples. The model's prediction for a new input $x$ behaves like an average over tasks, weighted by how well each task explains the examples:

$$
P(y \mid x, E) = \sum_{c} P(y \mid x, c)\, P(c \mid E), \qquad P(c \mid E) \propto P(c) \prod_{j=1}^{k} P(e_j \mid c)
$$

Here $P(c)$ is the model's prior over tasks given the instructions, and $P(e_j \mid c)$ is how likely example $j$ is under task $c$. Each example multiplies the odds between tasks by its **likelihood ratio**.

```steps
Three examples resolve an ambiguous task
Two candidate tasks: $c_1$ = sentiment, $c_2$ = product category. With a terse instruction the prior is even: $P(c_1) = P(c_2) = 0.5$, odds $1:1$.
---
Each example ("... Label: negative") is 3 times as likely under sentiment as under category, so each multiplies the odds by 3.
---
After 1 example: odds $3:1$, $P(c_1 \mid E) = 3/4 = 0.75$.
---
After 3 examples: odds $3^3 = 27:1$, $P(c_1 \mid E) = 27/28 \approx 0.964$.
---
If the model's accuracy is 0.92 when it knows the task is sentiment and about 0 when it thinks it is category, expected accuracy rises from $0.5 \times 0.92 = 0.46$ zero-shot to $0.964 \times 0.92 \approx 0.89$ with three examples.
```

This picture explains a pattern seen in practice: the first one to three examples help a lot, later ones help little. Once $P(c \mid E)$ is near 1, extra evidence has almost nothing left to fix. It also explains why a clear instruction can replace examples: a good instruction moves the prior $P(c)$ close to 1 before any examples arrive.

```callout-key
What examples teach most
Experiments on classification tasks found that randomly shuffling the labels in the demonstrations often hurts accuracy surprisingly little, while removing the format or the set of possible labels hurts a lot. Examples mostly tell the model *what kind of answer is expected*, and only partly *what the right answer is*.
```

## In practice

- **Use instructions first, examples second.** For a well-known task with a clear instruction, zero-shot is often within a few points of few-shot. Add examples when the format is unusual, the labels are subtle, or the model keeps misreading the task.
- **Examples are the strongest format signal you have.** A model will copy an example's length, tone and punctuation more faithfully than it follows a sentence describing them. If your examples are 80 words, do not expect 20-word answers.
- **Check that examples do not leak into answers.** Models sometimes copy a name, a number or a phrase from an example into a real answer. Use obviously fictional data in examples.
- **ICL is not training.** Nothing persists. The examples are paid for in tokens on every call, which the next topic turns into a cost-benefit calculation.

```sim
constrained-decoding
{"step": "start", "temperature": 1, "constrained": false, "calls": 1000}
```

The sim starts unconstrained at the first token of a JSON answer. Read how much probability goes to prose openers such as "Sure" or a markdown fence, and the overall invalid rate per call. That leakage is exactly what a few-shot example that begins with `{` reduces, because the model copies the format it has just seen. Keep the baseline in mind: examples lower it, constraints in topic 5 drive it to zero.

```quiz
{"q": "Two candidate tasks start at even odds. Each example is 4 times as likely under task A as under task B. After 2 examples, what is P(task A)?", "options": ["16/17 ≈ 0.94", "8/9 ≈ 0.89", "4/5 = 0.80", "2/3 ≈ 0.67"], "answer": 0, "explain": "Odds multiply: 1 × 4 × 4 = 16:1, so P(A) = 16/17 ≈ 0.94. Adding the ratios (4 + 4 = 8) gives 8/9, which is wrong because independent evidence multiplies odds."}
```

```quiz
{"q": "After the first three examples, adding five more improves accuracy by under 1 point. Which explanation fits the Bayesian picture of ICL best?", "options": ["The model is already nearly certain which task it is doing, so more evidence has little left to change", "The model's weights stop updating after three examples", "Later examples are ignored because of the context window", "Five examples always cancel out three"], "answer": 0, "explain": "Once P(task | examples) is near 1, further likelihood ratios barely move it. Weights never update during ICL at all, and eight short examples are nowhere near any context limit."}
```
