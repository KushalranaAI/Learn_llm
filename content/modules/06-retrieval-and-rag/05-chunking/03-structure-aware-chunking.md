---
title: Structure-aware chunking
minutes: 8
---

A fixed window of 200 tokens is like cutting a loaf of bread into equal slices with your eyes shut: some slices end mid-crumb. Documents already carry their own seams: headings, paragraphs, list items, table rows, function definitions. **Structure-aware chunking** cuts along those seams, so each chunk is a coherent unit and few facts are split without paying for large overlaps.

## From weakest to strongest structure

| Strategy | Boundaries | Strength | Weakness |
|---|---|---|---|
| Fixed windows | every $s$ tokens | trivial, predictable size | cuts mid-sentence; unstable under edits |
| Sentence packing | sentence ends, packed up to a token cap | never splits a sentence | may mix topics inside one chunk |
| Heading-aware | section headings, then paragraphs inside long sections | chunks match how authors organised ideas | needs parseable structure; sections vary wildly in length |
| Semantic | where adjacent-sentence similarity drops | follows topic shifts, even without headings | needs embedding every sentence; noisy thresholds |
| Format-specific | code by function, tables by row group, slides by slide | respects the unit users ask about | needs a parser per format |

## Sentence packing, worked

Split the text into sentences, then add sentences to the current chunk until the next one would exceed the token cap $s$. Take six sentences of 40, 55, 30, 70, 25 and 60 tokens and a cap of 150:

```steps
Packing six sentences with a 150-token cap
Start chunk 1: add sentence 1 (40 tokens), sentence 2 (95 total), sentence 3 (125 total).
---
Sentence 4 has 70 tokens; $125 + 70 = 195 > 150$, so close chunk 1 at 125 tokens and start chunk 2 with sentence 4.
---
Add sentence 5: $70 + 25 = 95$. Sentence 6 would make $95 + 60 = 155 > 150$, so close chunk 2 at 95 tokens.
---
Chunk 3 holds sentence 6 alone (60 tokens). Result: chunks of 125, 95 and 60 tokens, with no sentence cut.
```

The sizes are uneven (125, 95, 60) where fixed windows would give 150, 150, 30 with two sentences cut. Uneven sizes are fine; coherent chunks matter more than equal ones.

## Heading-aware chunking

Documents with headings gain from a rule such as: **one chunk per section; if a section is longer than the cap, split it by paragraphs; if shorter than a floor, merge it with its neighbour.** Crucially, prepend the **heading path** to each chunk's text:

```
Billing > Refunds > Monthly plans
Monthly plans are not refunded, but you keep access until the end of the period.
```

Without the path, the chunk "Monthly plans are not refunded..." is anonymous; the query "refund policy for monthly subscriptions" matches it only through two words. With the path, the chunk's vector and its BM25 terms both carry "billing", "refunds" and "monthly plans". This costs a few tokens per chunk and is one of the cheapest accuracy gains available.

## Semantic chunking, worked

Embed each sentence, compute the cosine similarity between each adjacent pair, and cut where similarity drops below a threshold $\theta$ (or below a low percentile of all adjacent similarities). Seven sentences give six adjacent similarities:

$$
[\,0.82,\; 0.78,\; 0.31,\; 0.80,\; 0.75,\; 0.28\,], \qquad \theta = 0.5
$$

The values below $\theta$ are after sentences 3 and 6, so the chunks are sentences 1 to 3, 4 to 6, and 7. The two drops mark topic changes. In practice you add a minimum and maximum chunk size so noise in the similarities cannot create one-sentence or giant chunks.

```mermaid
flowchart LR
  D["Document"] --> P["Parse structure: headings, lists, tables, code"]
  P --> U["Units: sections, paragraphs, sentences"]
  U --> K["Pack units to token cap; split long, merge short"]
  K --> H["Prepend heading path + metadata"]
  H --> E["Embed and index"]
```

## See it

```sim
chunking
{"strategy": "heading", "chunkSize": 150, "overlap": 0}
```

The sim's admin guide has headings. Compare Fixed windows, Sentence packing and Heading-aware at the same size 150 and overlap 0: read the number of split facts and the chunk count for each. Notice that heading-aware chunking can leave facts intact with no overlap at all, so its index is smaller than a fixed-window index that needs overlap to reach the same protection.

## In practice

Format matters more than strategy names suggest. For **PDFs**, extracting text in the correct reading order (columns, headers, footers removed) matters more than any splitter. For **tables**, keep a header row with each group of rows, or convert each row to a sentence ("Pro plan: 100 GB storage, \$12 per month"). For **code**, chunk by function or class and include the file path and signature. For **slides and chats**, a slide or a conversation turn is the natural unit. Whatever the splitter, attach metadata: source, section path, last-updated date, and permissions. Those fields power filters, citations and freshness checks later.

```quiz
{"q": "Sentences have 50, 60, 45 and 80 tokens, and the cap is 160. Using greedy sentence packing, what are the chunk sizes?", "options": ["155 and 80", "110 and 125", "50, 60, 45 and 80", "160 and 75"], "answer": 0, "explain": "$50 + 60 + 45 = 155 \\le 160$; adding the 80-token sentence would reach 235, so chunk 1 is 155 and chunk 2 is 80. Fixed 160-token windows would cut a sentence."}
```

```quiz
{"q": "Why prepend the heading path (for example 'Billing > Refunds > Monthly plans') to each chunk before embedding?", "options": ["It makes chunks longer so they rank higher", "It restores context the chunk lost when separated from its section, helping both vector and keyword matching", "It is required by embedding APIs", "It removes the need for metadata"], "answer": 1, "explain": "A chunk like 'Monthly plans are not refunded' is ambiguous alone. The path adds the topic words that a user query is likely to contain. Length does not increase similarity, and metadata is still needed for filters."}
```
