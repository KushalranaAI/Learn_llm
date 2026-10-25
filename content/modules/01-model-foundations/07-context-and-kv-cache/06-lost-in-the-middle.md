---
title: Long context and the lost middle
minutes: 7
---

A 128,000-token window sounds like it solves retrieval: just paste in every document and let the model find what it needs. In practice, fitting text into the window and *using* it are different things. Models are measurably better at using information placed near the start or the end of a long context than information buried in the middle, and their reliability falls as the context grows, even when the relevant fact is in there.

The effect was documented systematically in a 2023 study, "Lost in the Middle": when the one document containing an answer was moved through a list of retrieved documents, accuracy traced a **U-shaped curve**, highest when the document was first or last and lowest in between. Later long-context models have flattened the curve, but the general lesson holds: position and length matter, so measure them for your model.

## A simple model of dilution

Why would length hurt? One part of the story is that attention is a softmax over every visible token, so relevant tokens compete with everything else. Suppose one relevant token has an attention score $\Delta$ higher than each of $n - 1$ distractor tokens (all distractors scored equally, a deliberate simplification). Its attention weight is

$$
\alpha = \frac{e^{\Delta}}{e^{\Delta} + (n - 1)}
$$

$\alpha$ is the fraction of the head's attention that lands on the relevant token, $\Delta$ the score gap (after the $1/\sqrt{d_h}$ scaling), and $n$ the number of tokens in view.

With a healthy gap $\Delta = 5$, so $e^{5} = 148.4$:

| tokens in context $n$ | weight on the relevant token $\alpha$ |
|---|---|
| 100 | $148.4 / (148.4 + 99) = 0.60$ |
| 1,000 | $148.4 / (148.4 + 999) = 0.13$ |
| 10,000 | $148.4 / (148.4 + 9{,}999) = 0.015$ |
| 100,000 | $148.4 / (148.4 + 99{,}999) = 0.0015$ |

To keep $\alpha = 0.6$ at $n = 10{,}000$ the gap must grow to $\Delta = \ln(1.5 \times 9{,}999) \approx 9.6$. Every tenfold increase in distractors demands about $\ln 10 \approx 2.3$ more units of score gap for the same focus. Real models have many heads and layers and learn sharper scores than this toy, but the pressure is real: long contexts make it harder to attend precisely.

Dilution explains length, not position. The middle-is-worst pattern is generally attributed to training data and position encodings: models see many documents where the important material is at the beginning (titles, instructions) or right before the prediction (the most recent text), and they learn to lean on those positions.

```callout-note
Not the same as the context limit
A fact inside the window can still be missed; a fact outside the window cannot be seen at all. Both are failure modes of long inputs, but only the second is fixed by a bigger window.
```

## See it

```sim
context-position
```

Fix the context length at a moderate value and move the fact from the start to the end: trace the recall curve and look for the dip in the middle. Then raise the context length several times and repeat. Note two things: how deep the middle dip gets, and whether the start and end positions also degrade as length grows.

## What engineers do about it

```steps
Placing information in a long prompt
Put stable instructions in the system prompt at the start, where models attend reliably, and keep them short.
---
Retrieve fewer, better documents instead of many: reranking the top 20 down to the best 5 usually beats pasting all 20.
---
Order retrieved documents so the most relevant sit at the edges, ideally right before the question, not in the middle of the stack.
---
Repeat the user's actual question at the end, after the documents, so the final tokens point the model at what matters.
---
Test it: plant a known fact at several positions and lengths in your real prompt template (a "needle in a haystack" test) and measure recall.
```

## Costs, again

Long context has costs beyond accuracy. The KV cache grows linearly: for Llama-3-8B's 128 KiB per token, a 128,000-token prompt needs $128{,}000 \times 128 \text{ KiB} \approx 15.6$ GiB of cache for one user. Prefill grows at least linearly, with a quadratic attention term on top, so time to first token for very long prompts runs into seconds. And every input token is billed. A retrieval step that sends 4,000 well-chosen tokens instead of 100,000 is usually faster, cheaper and more accurate.

## In practice

Use the long window as headroom, not as a strategy. It is valuable for tasks that genuinely need a whole document at once (summarising a contract, reviewing a code file), and as a safety margin for long conversations. For question answering over a large corpus, retrieval plus a modest context remains the better engineering choice. Whatever you choose, test with your own prompt layout: benchmark scores at long context are measured on synthetic tasks and do not transfer reliably.

```quiz
{"q": "Using the toy dilution model with a score gap of $\\Delta = 5$, roughly what attention weight lands on the relevant token when there are 1,000 tokens in context?", "options": ["About 0.60", "About 0.13", "About 0.015", "About 0.99"], "answer": 1, "explain": "$\\alpha = e^5 / (e^5 + 999) = 148.4 / 1147.4 \\approx 0.13$. 0.60 is the value at 100 tokens and 0.015 at 10,000: the same gap buys less focus as distractors multiply."}
```

```quiz
{"q": "Your RAG prompt places 20 retrieved chunks between the instructions and the question. Answers miss facts from chunks 8 to 14. What change is most likely to help first?", "options": ["Increase the context window", "Rerank and keep the best few chunks, placing the most relevant nearest the question", "Raise the temperature", "Add more chunks so the fact appears twice"], "answer": 1, "explain": "The facts are inside the window, so a bigger window changes nothing. Fewer, better-placed chunks reduce dilution and avoid the weak middle positions. Adding chunks makes the context longer and the middle bigger."}
```

```lab
fit-the-kv-cache
```
