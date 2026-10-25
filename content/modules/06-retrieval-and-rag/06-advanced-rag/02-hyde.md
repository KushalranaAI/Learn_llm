---
title: HyDE - searching with a hypothetical answer
minutes: 7
---

Questions and answers do not look alike. "What temperature should I store insulin at?" shares few words and a different shape with "Unopened insulin should be refrigerated between 2 and 8 degrees Celsius." An embedding model trained on question-passage pairs bridges some of that gap, but a cheaper trick often helps further: **write a plausible answer first, and search with the answer instead of the question.**

This is **HyDE** (Hypothetical Document Embeddings). Ask an LLM to write a short passage that would answer the query, embed that passage, and use its vector to search. The passage may contain wrong facts; that does not matter, because only its *shape and vocabulary* are used for retrieval, and the real documents provide the facts.

## Why it can work: a worked example

Pick toy 3-dimensional embeddings. The question $\mathbf{q}$, the hypothetical answer $\mathbf{h}$, and two documents: $\mathbf{d}_1$ (the true answer) and $\mathbf{d}_2$ (a passage that merely shares the question's wording):

$$
\mathbf{q} = (0.9, 0.3, 0.1),\quad \mathbf{h} = (0.3, 0.8, 0.5),\quad \mathbf{d}_1 = (0.2, 0.9, 0.4),\quad \mathbf{d}_2 = (0.8, 0.2, 0.3)
$$

```steps
Cosine similarity, question versus hypothetical answer
Question against the documents: $\cos(\mathbf{q}, \mathbf{d}_1) = 0.511$ and $\cos(\mathbf{q}, \mathbf{d}_2) = 0.968$. The question retrieves the wrong passage, because they share question-style wording.
---
Hypothetical answer against the documents: $\cos(\mathbf{h}, \mathbf{d}_1) = 0.985$ and $\cos(\mathbf{h}, \mathbf{d}_2) = 0.633$. The answer-shaped vector lands next to the true answer.
---
Check one: $\mathbf{h} \cdot \mathbf{d}_1 = 0.06 + 0.72 + 0.20 = 0.98$; $\lVert \mathbf{h} \rVert = \sqrt{0.09 + 0.64 + 0.25} = 0.990$; $\lVert \mathbf{d}_1 \rVert = \sqrt{0.04 + 0.81 + 0.16} = 1.005$. So $\cos = 0.98 / (0.990 \times 1.005) = 0.985$.
---
Generate several hypotheses and average their vectors, $\bar{\mathbf{h}} = \frac{1}{m}\sum_i \mathbf{h}_i$, to smooth out the errors in any single one. Some variants also include the original query vector in the average.
```

```mermaid
flowchart LR
  Q["Question"] --> L["LLM writes a short hypothetical answer"] --> E["Embed the answer"] --> S["Vector search"] --> D["Real passages"]
```

## When HyDE helps and when it hurts

**Helps:**
- Short, vague or question-shaped queries over passage-shaped documents.
- Domains where the model knows the general shape of answers (how-to guidance, definitions, encyclopaedic text).
- Zero-shot settings with no labelled data to fine-tune a retriever.

**Hurts:**
- **Private or very recent facts.** The model has no idea what your internal policy says; it writes a confident wrong paragraph, whose vector points at similar-sounding but wrong policies.
- **Exact lookups.** Codes, names and IDs are better matched by BM25 on the original query.
- **Latency-critical paths.** It adds a full LLM generation (typically 0.5 to 2 seconds for 100 to 200 tokens) in front of search.

| Property | Plain dense | HyDE |
|---|---|---|
| Extra LLM calls | 0 | 1 (short generation) |
| Added latency | 0 | about 0.5 to 2 s |
| Risk | vocabulary mismatch | confident wrong hypothesis |
| Best for | clean, specific queries | vague or question-shaped queries |

## In practice

Treat HyDE as a candidate retriever, not a replacement: run it alongside plain dense and BM25 and fuse with RRF, so a bad hypothesis cannot sink the query. Keep the generated passage short (one or two sentences) and instruct the model to write it as it would appear in documentation. Evaluate on your own questions; published gains are largest for out-of-domain queries and often small once a retriever has been fine-tuned on your data. If you can instead generate hypothetical *questions* for each chunk at indexing time (the previous lesson's enrichment), you move the LLM cost offline and keep query latency flat.

```quiz
{"q": "Why can a wrong hypothetical answer still retrieve the right passage?", "options": ["The retriever verifies facts in the hypothesis", "Only its style and vocabulary are used to find nearby real passages; the real passage supplies the facts", "LLMs never write wrong answers", "Because the hypothesis is discarded"], "answer": 1, "explain": "The hypothesis is only a search probe: its embedding sits in the 'answer-like' region of the space. The retrieved real documents provide the verified content. That is also why it fails when the model cannot even guess the vocabulary, as with private data."}
```

```quiz
{"q": "Which query is least suited to HyDE?", "options": ["'how long do refunds take?'", "'what does error KB-30871 mean?'", "'why is my laptop slow?'", "'explain the difference between TCP and UDP'"], "answer": 1, "explain": "An exact code must be matched literally (BM25). A hypothetical answer cannot know what the code means in your system and may point the vector at other errors."}
```
