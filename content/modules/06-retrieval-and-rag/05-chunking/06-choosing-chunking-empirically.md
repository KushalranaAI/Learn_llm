---
title: Choosing a chunking strategy with evidence
minutes: 8
---

Opinions about chunk size are cheap and contradictory: "always 512", "never over 256", "sentences only". The only trustworthy answer comes from your documents and your questions. This topic sets up a small experiment, shows how large a difference you need before believing it, and gives a practical default.

## The experiment

```steps
A chunking experiment
**Collect questions.** 150 to 300 realistic questions, each labelled with the document span that answers it (a character range, not a chunk ID, so labels survive re-chunking).
---
**Define the metric.** recall@5 at the span level: a hit means some top-5 chunk contains the whole answer span (or enough of it that a human would accept the chunk as sufficient). Track mean prompt tokens as the cost.
---
**Grid.** Vary chunk size (for example 128, 256, 512), overlap (0%, 10%, 20%) and strategy (fixed, sentence, heading-aware). Keep the embedding model, index and $k$ fixed.
---
**Re-index and score** each configuration. Indexing a small collection takes minutes.
---
**Pick on cost-adjusted recall**, not recall alone, and confirm the winner end to end with answer correctness.
```

## How big a gap is real?

Recall measured on $n$ questions is a proportion $\hat{p}$ with a sampling error. The standard error is

$$
\text{SE} = \sqrt{\frac{\hat{p}\,(1-\hat{p})}{n}}, \qquad \text{95\% interval} \approx \hat{p} \pm 1.96\,\text{SE}
$$

```steps
Worked example: is 0.84 really better than 0.80?
With $n = 200$ questions and $\hat{p} = 0.80$: $\text{SE} = \sqrt{0.8 \times 0.2 / 200} = \sqrt{0.0008} = 0.0283$.
---
The 95% interval is $0.80 \pm 1.96 \times 0.0283 = 0.80 \pm 0.055$, i.e. from 0.745 to 0.855. A configuration at 0.84 lies inside it.
---
Because both configurations were scored on the same questions, a paired comparison (counting questions where only one config hits) is more sensitive than comparing the two intervals, but the lesson holds: with 200 questions, differences under about 5 points are often noise. With $n = 1{,}000$, $\text{SE} = 0.0126$ and the interval is $\pm 2.5$ points.
```

This is why a chunking sweep on 30 hand-picked questions is theatre. Evaluation design is revisited in [Comparing Systems You Can Trust](/learn/evaluation/comparing-systems).

## See it

```sim
chunking
{"strategy": "sentence", "chunkSize": 150, "overlap": 0}
```

Use the sim as a mini sweep over its six facts. For each strategy (fixed, sentence, heading-aware) and for sizes 60, 120 and 240, record the number of chunks, the number of split facts and the index overhead. Write the results as a small table and choose a configuration on a stated rule, for example "zero split facts at the fewest chunks". Then try the lab, which gives you a collection and labelled questions to do the same with recall@k.

```lab
chunk-it-right
```

## A defensible default

If you have no data yet, start here and then measure:

| Choice | Default | Reason |
|---|---|---|
| Boundaries | headings, then paragraphs, then sentences | follows the author's structure |
| Target size | 256 to 400 tokens, hard cap below the model's input limit | balances dilution and context |
| Overlap | 10 to 15% of size, or zero for heading-aware units | cheap insurance against split facts |
| Prefix | heading path and document title in each chunk | restores lost context |
| Metadata | source, section, date, ACL | filtering, citations, freshness |
| Retrieval unit | child chunks, with parents or neighbours for the prompt if answers need context | decouples find and read sizes |

## In practice

Keep the chunker deterministic and versioned: the same document must always produce the same chunks and IDs, or evaluation numbers and caches become meaningless. Store the chunker version with the index. Re-run your sweep when the corpus changes character (a new document type, a new language) or the embedding model changes. And when retrieval fails on a question, look at the chunks around the right answer before touching the model: a surprising number of "retrieval problems" are chunk boundaries.

```quiz
{"q": "Recall on 400 labelled questions is 0.75. What is the approximate 95% interval (to one decimal in points)?", "options": ["0.75 ± 4.2 points", "0.75 ± 8.5 points", "0.75 ± 2.1 points", "0.75 ± 0.4 points"], "answer": 0, "explain": "$\\text{SE} = \\sqrt{0.75 \\times 0.25/400} = 0.0217$, and $1.96 \\times 0.0217 = 0.0424$, about 4.2 points. Using the standard error alone (2.2 points) gives only a 68% interval."}
```

```quiz
{"q": "Why label answer spans by character range rather than by chunk ID?", "options": ["Chunk IDs are not unique", "Labels must survive re-chunking so the same questions can score every chunking configuration", "Character ranges are shorter", "Embedding models need ranges"], "answer": 1, "explain": "If labels point to chunk IDs, changing the chunker invalidates them. Span labels let you compute 'does a retrieved chunk cover the span' for any configuration."}
```
