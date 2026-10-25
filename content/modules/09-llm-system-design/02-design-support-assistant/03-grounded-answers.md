---
title: "Deep dive: grounded answers from the help centre"
minutes: 9
---

The interviewer picks the first deep dive: "How do you stop it making up the return policy?" The honest answer is that you cannot stop a model from generating plausible text; you can only make the right text easy to find, require the answer to rest on it, and check that it did. That is retrieval-augmented generation applied to a corpus you control.

A support corpus has a helpful property: it is small, curated and owned by one team. Thirty thousand articles is tiny by search standards, which means the hard part is not scale but **freshness** (a policy changed this morning) and **coverage** (the question is not answered anywhere).

## Size the index

Let $A$ be the number of articles, $\bar{\ell}$ their mean length in tokens, $c$ the chunk size and $o$ the overlap fraction. The chunk count and raw vector storage are

$$
N_{chunks} \approx \frac{A\,\bar{\ell}}{c}\,(1 + o), \qquad S = N_{chunks} \cdot d \cdot b
$$

where $d$ is the embedding dimension and $b$ the bytes per number. With $A = 30{,}000$, $\bar{\ell} = 1{,}200$, $c = 300$ and $o = 0.25$: $36\text{M}/300 \times 1.25 = 150{,}000$ chunks. At $d = 768$ in float32 ($b = 4$), $S = 150{,}000 \times 3{,}072 \approx 461$ MB. Embedding the whole corpus (about 45M tokens with overlap) at the hypothetical \$0.02 per 1M tokens costs about **\$0.90**. Re-embedding everything after a chunking change is a rounding error, so never let index cost drive the design here; it fits in memory on one machine, and you can afford exact search.

## Accuracy is a product of stages

An answer is right only if several things all go right. A useful decomposition, which the simulation below lets you explore:

$$
P(\text{correct}) \approx P(\text{covered}) \cdot \text{recall@}k \cdot \text{faithfulness}
$$

Here $P(\text{covered})$ is the share of questions the help centre actually answers, recall@$k$ the probability that the right chunk is among the $k$ chunks given to the model, and faithfulness the probability that the model's answer sticks to that chunk. Ignore coverage for a moment and take recall@3 $= 0.85$ and faithfulness $= 0.92$:

$$
0.85 \times 0.92 = 0.782
$$

Which lever is worth more? Raising recall to $0.95$ gives $0.95 \times 0.92 = 0.874$. Raising faithfulness to $0.97$ gives $0.85 \times 0.97 = 0.8245$. Both matter, but in this example retrieval has more headroom. Measure both stages separately before deciding where to spend a sprint.

```sim
rag-pipeline
```

Try this: set recall@k around 0.85 and faithfulness around 0.92 and read the answer accuracy (close to 0.78). Then raise $k$ and watch two things move together: recall climbs, but context size, cost and latency climb too. Find the $k$ where the extra recall stops paying for its tokens.

## Paying for context

Every extra chunk is re-sent on every turn. Going from 3 chunks (about 1,000 tokens) to 8 chunks (about 2,500) adds 1,500 tokens per turn: $1.2\text{M} \times 1{,}500 = 1.8$ billion input tokens a day, or **\$1,800 a day** at the hypothetical large-model price, almost half the original bill. The better move is to retrieve wide and pass narrow: fetch 30 candidates cheaply, rerank them, and give the model the best 3.

| Option | Recall@k (illustrative) | Extra tokens / turn | Extra cost / day |
|---|---|---|---|
| Top 3, no rerank | 0.78 | 0 | \$0 |
| Top 3 after reranking 30 | 0.85 | 0 (reranker cost separate) | small |
| Top 8, no rerank | 0.88 | 1,500 | \$1,800 |

## Coverage and abstention

When the answer is not in the help centre, the best response is not a guess; it is "I'll get a colleague", with the conversation summarised. Make that explicit: the prompt instructs the model to answer only from provided chunks, and a cheap **grounding check** (a second small-model call, or a rule that every policy statement cites a chunk id) rejects replies that make unsupported claims. Rejected replies become escalations, and the questions behind them become a weekly list for the content team. Over time coverage rises, which no model upgrade can do for you.

## Freshness

Policies change. Subscribe the ingestion job to the help-centre CMS, re-chunk and re-embed an article within minutes of publication, and store `article_id` and `version` on every chunk. The trace records which versions were used, so when a customer disputes an answer you can show exactly what the bot read.

## In practice

The usual first production bug is not hallucination in the abstract; it is two articles that disagree (an old regional policy left published). Retrieval faithfully surfaces both and the model picks one. Deduplicate and expire content at ingestion, and add a metadata filter for the customer's region before search.

```quiz
{"q": "Recall@3 is 0.85 and faithfulness 0.92. Which single change gives the larger accuracy gain?", "options": ["Faithfulness to 0.97", "Recall@3 to 0.95", "They give the same gain", "Neither: accuracy is the minimum of the two"], "answer": 1, "explain": "0.95 × 0.92 = 0.874 against 0.85 × 0.97 = 0.8245. Both stages multiply, so the one with more headroom (recall, 0.10 to gain) helps more here. Accuracy is a product, not a minimum."}
```

```quiz
{"q": "Embedding the 150,000-chunk help centre costs about \\$0.90. What does that imply?", "options": ["Use a smaller embedding model to save money", "Re-embedding after a chunking or model change is cheap, so experiment freely", "Approximate nearest-neighbour search is required", "Never re-embed, because it disrupts the index"], "answer": 1, "explain": "At this scale index cost is negligible, so chunking and embedding choices should be driven by quality, and full rebuilds are routine. 461 MB of vectors also fits in memory, so exact search is affordable; ANN is not required."}
```
