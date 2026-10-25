---
title: Cleaning and filtering the web
minutes: 7
---

A raw web crawl is mostly not text you would want a model to imitate. It contains navigation menus, cookie banners, spam pages stuffed with keywords, machine-generated gibberish, duplicated boilerplate, pages in hundreds of languages, and personal data. Training on it unfiltered is like learning to write by reading every flyer ever pushed through a letterbox.

So a pretraining pipeline is a series of **filters**, each removing a slice of documents for a specific reason. The surprising lesson of recent open datasets is how much this matters: models trained on the same number of carefully filtered tokens beat those trained on lightly filtered ones, often by a wide margin.

## The pipeline as a product of keep-rates

If stage $k$ keeps a fraction $r_k$ of whatever reaches it, the fraction of the raw crawl that survives $K$ stages is

$$
R = \prod_{k=1}^{K} r_k = r_1 \times r_2 \times \cdots \times r_K
$$

Here $r_k \in [0, 1]$ is the **keep-rate** of stage $k$, measured on documents that passed every earlier stage. Because the rates multiply, a few moderate filters remove most of the crawl.

```steps
A plausible English web pipeline, start to finish
Start with 100 TB of extracted text from a crawl. **Text extraction** has already stripped HTML; now apply **URL filtering** (block lists of spam and adult domains): keep $r_1 = 0.90$, leaving 90 TB.
---
**Language identification** with a fast classifier, keeping English only: $r_2 = 0.50$, leaving 45 TB.
---
**Heuristic quality rules**: drop pages with too few words, too many symbols, very short lines, repeated lines, or no sentence-ending punctuation: $r_3 = 0.60$, leaving 27 TB.
---
**Model-based quality filter**: a small classifier scores how much each page resembles reference "good" text; keep the top part: $r_4 = 0.40$, leaving 10.8 TB.
---
**Deduplication** (next topic): $r_5 = 0.50$, leaving 5.4 TB. Overall $R = 0.9 \times 0.5 \times 0.6 \times 0.4 \times 0.5 = 0.054$: about 5% of the extracted crawl becomes training text.
```

The exact rates differ between datasets, but the shape is typical: aggressive filtering, single-digit-percent survival, and the expensive steps run last on the smallest volume.

## Model-based quality filters

A **quality classifier** is usually a cheap model (a linear classifier over word n-grams, or a small transformer) trained to separate a reference set of good text from random web text. It outputs a score $s(x) \in [0, 1]$ and the pipeline keeps documents with $s(x) > \tau$ for a threshold $\tau$. A related trick scores each page with a small language model trained on clean text and keeps pages whose **perplexity** under it is not too high, since gibberish and spam are surprising to a model of clean prose.

Both methods encode a definition of "quality", and with it a bias. If the reference set is encyclopaedia articles, the filter will quietly remove informal dialects, recipes and forum help threads that are perfectly useful. Teams therefore tune $\tau$ with proxy-model experiments rather than taste, and some keep a fraction of lower-scoring pages to preserve diversity.

| Filter | Removes | Typical risk |
|---|---|---|
| URL block lists | Spam, adult, malware domains | Over-blocking whole sites |
| Language ID | Pages not in target languages | Code-switched and dialect text misclassified |
| Heuristic rules | Boilerplate, lists, gibberish | Drops tables, poetry, code |
| Quality classifier | Low-effort or spammy prose | Encodes the reference set's style |
| PII scrubbing | Emails, phone numbers, IDs | Missed formats leak personal data |
| Toxicity filter | Hateful or explicit text | Can erase discussions of those topics |

## In practice

Filters are judged by the models they produce, not by how clean the samples look. The standard loop is: change one filter, rebuild a slice of the dataset, train a small proxy model on a fixed token budget, compare evaluation scores with the previous version. A filter that removes 30% of the data but does not move the evaluations is just costing you tokens.

Personal data and licensing are handled here too. Pipelines replace detected emails, phone numbers and IP addresses with placeholders and honour opt-out signals and licence restrictions. These are legal and ethical requirements as much as quality ones, and they are much harder to fix after a model has been trained.

```quiz
{"q": "Four filters keep 0.8, 0.5, 0.5 and 0.6 of what reaches them. What fraction of the input survives?", "options": ["0.60", "0.12", "0.40", "0.24"], "answer": 1, "explain": "Keep-rates multiply: $0.8 \\times 0.5 \\times 0.5 \\times 0.6 = 0.12$. Averaging the rates (0.6) is the tempting mistake; each filter acts on what the previous ones left."}
```

```quiz
{"q": "A team trains its quality classifier with encyclopaedia articles as the positive class and keeps only pages scoring above 0.9. What is the most likely side effect?", "options": ["The model becomes better at all tasks with no downside", "Conversational, informal and practical text is under-represented", "The corpus grows because duplicates are added", "Language identification stops working"], "answer": 1, "explain": "A classifier keeps what resembles its positive examples. A strict threshold against an encyclopaedic reference removes forum answers, recipes and dialogue, narrowing the model's style and knowledge. It does not add data, and it is unrelated to language ID."}
```
