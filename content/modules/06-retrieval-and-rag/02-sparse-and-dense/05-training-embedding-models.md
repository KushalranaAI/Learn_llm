---
title: How embedding models are trained
minutes: 8
---

A retriever's quality is set long before you deploy it, by what its embedding model was taught to treat as similar. The training idea is easy to state: show the model a question and the passage that answers it, and tell it to pull their vectors together while pushing the vectors of unrelated passages away. This is **contrastive learning**.

## The training data

Training examples are triples or pairs:

- a **query** $q$ (a question, a search string, or a title),
- a **positive** passage $d^{+}$ that answers it,
- one or more **negatives** $d^{-}$ that do not.

Large pretraining collects hundreds of millions of weakly labelled pairs (a title and its article, a question and its accepted answer), then fine-tunes on cleaner labelled pairs. Teams adapting a model to their domain often generate synthetic questions from their own passages with an LLM and use each passage as the positive for its question.

## The loss: InfoNCE with in-batch negatives

Take a batch of $B$ (query, positive) pairs. For query $q_i$, its own positive $d_i^{+}$ is the right answer and the other $B-1$ positives in the batch serve as free negatives. With similarity $s_{ij} = \cos(q_i, d_j)$ and a **temperature** $\tau$, the loss for query $i$ is a softmax cross-entropy over the batch:

$$
\mathcal{L}_i = -\log \frac{\exp(s_{ii}/\tau)}{\sum_{j=1}^{B} \exp(s_{ij}/\tau)}
$$

It is exactly the cross-entropy loss from [How a Network Learns](/learn/model-foundations/how-networks-learn), treating "which of the $B$ passages is mine?" as a classification problem. The temperature $\tau$ (often 0.02 to 0.1) sharpens the softmax: small $\tau$ makes the model care a lot about near-misses.

```steps
Worked example: easy negatives versus a hard negative
Use $\tau = 0.05$. The query has similarity $0.80$ to its positive and $0.30$ and $0.10$ to two random passages. Scaled scores: $16, 6, 2$.
---
$p = \frac{e^{16}}{e^{16} + e^{6} + e^{2}} = 0.99995$, so $\mathcal{L} = -\ln 0.99995 \approx 0.00005$. The model learns almost nothing: random negatives are too easy.
---
Add a **hard negative**: a passage on the same topic that does *not* answer the question, with similarity $0.75$ (scaled: $15$). The denominator becomes $e^{16} + e^{15} + e^{6} + e^{2}$.
---
$p = \frac{e^{16}}{e^{16} + e^{15} + e^{6} + e^{2}} \approx 0.731$, so $\mathcal{L} = -\ln 0.731 \approx 0.313$, thousands of times larger. The gradient is now large and points at the distinction that matters: answers versus near-answers.
```

## Why hard negatives decide quality

Random negatives teach the model that cooking recipes differ from tax law. A deployed retriever must tell the correct refund policy from the *almost* correct one (last year's version, the monthly-plan paragraph next to the annual-plan paragraph). **Hard-negative mining** finds those: retrieve the top results with an existing retriever (often BM25) and take highly ranked passages that are not labelled positive as negatives. Caution: some of them are actually relevant but unlabelled (**false negatives**), and training against them hurts, so teams filter with a cross-encoder or an LLM.

## See it

```sim
retrieval-compare
{"preset": "money", "method": "dense", "k": 3}
```

This preset, "how do I get my money back", is a paraphrase of "refund". Compare how the methods do on it: the dense retriever can succeed on this kind of query because training pulls "money back" and "refund" together. Then switch the query preset to "what is E42": training on meaning gave no reason to preserve exact codes, which is the other half of the story.

## In practice

Most teams do not train an embedding model from scratch. They pick a strong open or hosted model, evaluate on 100 to 500 of their own labelled queries (recall@k, covered in the next lessons), and only fine-tune if the gap justifies it. Fine-tuning on a few thousand in-domain pairs with hard negatives often adds several points of recall on specialised text such as legal, medical or code. Whenever you change the model you must re-embed the whole collection, so budget for that. Embedding models also have a **maximum input length** (often 512 tokens); text beyond it is silently truncated, a major reason chunk size matters.

```quiz
{"q": "In InfoNCE with temperature 0.05, the positive scores 0.80 and the only negative scores 0.75. What is the loss?", "options": ["About 0.31", "About 0.69", "About 0.0", "About 1.0"], "answer": 0, "explain": "Scaled scores are 16 and 15, so $p = 1/(1 + e^{-1}) = 0.731$ and $\\mathcal{L} = -\\ln 0.731 = 0.313$. Two equal scores would give 0.69 ($\\ln 2$); a negative at 0.10 would give almost 0."}
```

```quiz
{"q": "Why do hard negatives improve a retriever more than extra random negatives?", "options": ["They make batches larger", "Random negatives are already easy to rank below the positive, so their loss and gradient are near zero; hard negatives force the model to learn fine distinctions", "They reduce the embedding dimension", "They remove the need for a temperature"], "answer": 1, "explain": "With easy negatives the softmax already puts almost all probability on the positive and the loss is about 0.00005. Near-miss passages produce a large loss exactly where the retriever would fail in production."}
```
