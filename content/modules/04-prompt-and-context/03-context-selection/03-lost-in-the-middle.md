---
title: Lost in the middle
minutes: 8
---

Hand someone a 40-page briefing pack and ask a question answered on page 19. They will probably remember the first few pages and the last few pages best. The middle blurs. Language models show a strikingly similar pattern: when the one passage that answers a question is placed at the start or the end of a long context, models find and use it far more often than when the same passage sits in the middle.

This effect was measured systematically in a 2023 study (Liu et al., "Lost in the Middle"), which moved the relevant document through a list of retrieved documents and plotted accuracy against its position. The curve was U-shaped: high at the beginning (**primacy**), highest or nearly so at the end (**recency**), with a trough in between. The trough deepened as the context grew. Newer long-context models flatten the U, but in most evaluations it does not disappear.

Why would a model do this? Part of the explanation is training data: in most documents, the important framing comes first and the most relevant recent text comes last, so models learn to weight those regions. Part is how attention behaves over long sequences: the earliest tokens tend to attract attention regardless of content, and nearby tokens are easier to attend to than distant ones. Whatever the mix, the engineering consequence is the same: **position is a variable you control**, and it changes accuracy.

## The maths: recall as a function of position

Let $r(q)$ be the probability that the model uses a fact placed at relative position $q \in [0,1]$ in the context ($q = 0$ at the start, $q = 1$ at the end). The sim below uses an illustrative U-shaped curve. For a 16k context and an older model, it gives roughly:

| Position $q$ | 0 | 0.25 | 0.5 | 0.75 | 1 |
|---|---|---|---|---|---|
| Recall $r(q)$ | 0.82 | 0.61 | 0.57 | 0.62 | 0.87 |

If your pipeline puts the key passage at a position you do not control (effectively random over five slots), the expected recall is the average:

$$
\mathbb{E}[r] = \frac{1}{5}\sum_{s=1}^{5} r(q_s) = \frac{0.82 + 0.61 + 0.57 + 0.62 + 0.87}{5} = \frac{3.49}{5} = 0.698
$$

If instead you can place it at the end, recall is 0.87. That is an absolute gain of $0.87 - 0.698 = 0.172$, or 25% relative, from moving text, without changing the model, the retriever or a single token of content. At 100,000 questions a day, it is the difference between about 30,200 and 13,000 missed answers.

```callout-math
Relative position, not just absolute
The dip is about the fact's place *relative to everything else*. Adding 10,000 tokens of extra material after a fact moves it from the end towards the middle, which is one reason adding more context can lower accuracy even when the extra material is harmless.
```

```sim
context-position
{"contextTokens": 16384, "position": 50, "model": "older"}
```

Start at a 16k context with the fact in the middle. Sweep the position from 0% to 100% and trace the U. Then set the context to 4k: the dip is shallower (about 73% at the middle versus 93% at the end). Push to 32k, past what this older model was trained on, and recall collapses everywhere. Finally switch to the long-context model and repeat the sweep: the U is much flatter, but the middle is still the worst place to be.

## In practice

- **Measure it on your own model and data.** Build a small "needle" test: take real questions, put the gold passage at the start, middle and end of a realistically sized context, and measure accuracy. It costs a few hundred calls and tells you how much ordering matters for you.
- **Put the question last.** For long contexts, documents first and the question (plus key instructions) at the end usually beats the reverse, because the instruction then sits in the high-recall recency region at the moment the model starts answering. Some teams repeat the question before and after the documents, at the cost of a few tokens.
- **Keep contexts shorter than the window.** The dip deepens with length; the cheapest fix is not to fill the window.
- **Do not trust "supports 1M tokens".** A model can *accept* a context without *using* all of it equally well. Advertised window size is a capacity, not a recall guarantee.

```quiz
{"q": "Recall by slot is 0.9, 0.7, 0.6, 0.7, 0.95. The key passage lands in a uniformly random slot. What is expected recall, and what is it if you always put the passage last?", "options": ["0.77 random; 0.95 last", "0.70 random; 0.95 last", "0.77 random; 0.90 last", "0.60 random; 0.95 last"], "answer": 0, "explain": "Average: (0.9 + 0.7 + 0.6 + 0.7 + 0.95) / 5 = 3.85 / 5 = 0.77. Always last gives the last slot's recall, 0.95. 0.60 is the worst slot, not the average."}
```

```quiz
{"q": "You append 8,000 tokens of extra background after the paragraph that answers the question. Accuracy drops even though the extra text is accurate and on-topic. Which explanation fits best?", "options": ["The answering paragraph moved from the end towards the middle of the context, where recall is lower", "The extra text exceeded the context window", "Accurate background text always confuses models", "The model now has too few output tokens"], "answer": 0, "explain": "Position is relative: the key paragraph lost its recency advantage. Nothing here implies the window overflowed, and accurate background does not hurt as such; its placement did."}
```
