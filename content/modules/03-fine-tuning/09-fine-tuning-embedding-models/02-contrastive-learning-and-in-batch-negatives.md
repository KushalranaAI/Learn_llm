---
title: Contrastive learning and in-batch negatives
minutes: 9
---

How do you tell a model what "similar" means without labelling every pair of texts in the world? You show it pairs that *should* match, a question and the passage that answers it, and let every other passage in the batch play the part of a wrong answer. The model is rewarded for picking the right partner out of the line-up. That is **contrastive learning**, and the free wrong answers are **in-batch negatives**.

It is the same game CLIP plays with images and captions, which [the CLIP contrastive loss](/learn/training-and-adaptation/multimodal/clip-contrastive-loss) derives in full. Here both sides are text and the loss is usually computed in one direction, query to document.

## The loss: InfoNCE as a classification problem

Take a batch of $B$ pairs $(a_i, p_i)$: anchors (queries) and their positives (passages). Encode and normalise all of them, then compute the $B \times B$ matrix of cosines $S_{ij} = \cos(\mathbf{a}_i, \mathbf{p}_j)$. The diagonal holds the true pairs; everything off the diagonal is a negative.

Treat row $i$ as a $B$-way classification: which passage belongs to anchor $i$? Scale the similarities by $s = 1/\tau$, apply a softmax, and take the cross-entropy against the correct column:

$$
\mathcal{L} = \frac{1}{B} \sum_{i=1}^{B} -\log \frac{\exp(s \, S_{ii})}{\sum_{j=1}^{B} \exp(s \, S_{ij})}
$$

This is the **InfoNCE** loss (van den Oord et al., 2018), also called NT-Xent in SimCLR (Chen et al., 2020). In sentence-transformers it is `MultipleNegativesRankingLoss`, with a default **scale** $s = 20$, equivalent to a temperature $\tau = 0.05$. The scale matters because cosines live in $[-1, 1]$: without it, the logits differ by at most 2, the softmax can never become confident, and the gradient keeps pushing even on pairs that are already correct.

## Worked example, B = 3

```steps
Three queries, three passages, scale 20
Similarity matrix (rows: queries, columns: passages): $S = \begin{pmatrix} 0.9 & 0.4 & 0.2 \\ 0.3 & 0.8 & 0.5 \\ 0.1 & 0.6 & 0.7 \end{pmatrix}$. The diagonal is the truth.
---
Row 3 multiplied by 20: $(2, 12, 14)$. Loss $= -\log \frac{e^{14}}{e^{2} + e^{12} + e^{14}} = \log(1 + e^{-2} + e^{-12}) = \log(1.1353) \approx 0.127$. The model gives its own passage probability $0.881$; passage 2 at cosine 0.6 is a close rival.
---
Row 2: $(6, 16, 10)$, loss $= \log(1 + e^{-10} + e^{-6}) \approx 0.0025$. Row 1: $(18, 8, 4)$, loss $\approx 0.00005$. These rows are already easy.
---
Mean over the batch: $(0.00005 + 0.0025 + 0.127)/3 \approx 0.043$. Almost all of the gradient comes from row 3, the one with a hard negative.
---
At scale 1 (no sharpening) the same matrix gives row losses $0.74, 0.85, 0.90$ and a mean of $0.83$: every row looks equally bad, and the model cannot tell easy pairs from hard ones.
```

```python
import numpy as np

S = np.array([[0.9, 0.4, 0.2],
              [0.3, 0.8, 0.5],
              [0.1, 0.6, 0.7]])          # cos(anchor_i, positive_j)

def info_nce(S, scale=20.0):
    logits = scale * S
    # log-softmax of each row, then pick the diagonal (the correct passage)
    log_probs = logits - np.log(np.exp(logits).sum(axis=1, keepdims=True))
    return -np.diag(log_probs)

print(info_nce(S).round(4), info_nce(S).mean().round(4))   # [0. 0.0025 0.1269] 0.0432
print(info_nce(S, 1.0).mean().round(4))                    # 0.8314
```

## Why bigger batches help

Each anchor is contrasted against $B - 1$ negatives for the price of encoding $B$ passages you needed anyway. Double the batch and every anchor sees twice as many wrong answers, so the chance that one of them is a genuinely confusing near-miss goes up. The loss gets harder and the learned space sharper. This is why contrastive pretraining runs use batches in the tens of thousands.

On a laptop you are memory-bound. Batches of 32 to 128 are typical for a small model on CPU. If you want a larger effective batch, `CachedMultipleNegativesRankingLoss` computes the loss for a big batch by encoding it in small mini-batches and caching gradients (the GradCache trick), trading time for memory. Ordinary gradient accumulation does **not** help: it sums losses from separate small batches, so each anchor still only sees the negatives of its own small batch.

Duplicates hurt in the opposite way. If the same passage appears twice in one batch, it is both the positive for one anchor and a "negative" for another anchor that it actually answers. That is why the trainer offers a batch sampler that avoids duplicates (next topics).

| Loss | Data | Negatives per anchor | Notes |
|---|---|---|---|
| `MultipleNegativesRankingLoss` | (anchor, positive) or with explicit negatives | $B - 1$ in-batch, plus any given | The default for retrieval fine-tuning |
| `CachedMultipleNegativesRankingLoss` | same | $B - 1$ with large $B$ | Large batches on small memory, slower |
| `TripletLoss` | (anchor, positive, negative) | 1 | Margin-based, weaker signal per step |

## The triplet loss for contrast

Before in-batch negatives became standard, embedding models were often trained with a **triplet loss**: for one anchor, one positive and one negative,

$$
\mathcal{L}_{\text{triplet}} = \max\big(0,\; \|\mathbf{a} - \mathbf{p}\| - \|\mathbf{a} - \mathbf{n}\| + m\big)
$$

where $m$ is a margin. It asks only that the negative be at least $m$ further away than the positive. Once that holds the loss is exactly zero and the triplet teaches nothing. InfoNCE uses all $B - 1$ negatives at once and never quite reaches zero, so it keeps extracting signal from every batch. That is why it replaced the triplet loss as the default.

## In practice

- **Keep the default scale of 20** unless you have a reason. Values between about 20 and 50 are common; very large scales make training unstable early on.
- **Batch size is a quality knob, not only a speed knob.** If retrieval improves when you raise the batch from 32 to 128, that is the negatives at work.
- **Watch for a loss that collapses to near zero in the first hundred steps.** It usually means the batch is too easy (random negatives from unrelated topics) and the model is learning little. Hard negatives (next topic) fix that.

```quiz
{"q": "With scale $s = 20$, an anchor's row of cosines is $(0.5, 0.5, 0.5)$ and the first entry is the true pair. What is its InfoNCE loss?", "options": ["$\\log 3 \\approx 1.10$", "0", "$20 \\times 0.5 = 10$", "$\\log 2 \\approx 0.69$"], "answer": 0, "explain": "All logits are equal ($10$ each), so the softmax gives each passage probability $1/3$ and the loss is $-\\log(1/3) = \\log 3$. The scale does not change anything when all scores tie. A loss of 0 would need the true pair to win outright."}
```

```quiz
{"q": "You cannot fit a batch of 512 in memory, so you use batch 64 with 8 steps of gradient accumulation. How many in-batch negatives does each anchor see?", "options": ["63", "511", "512", "8"], "answer": 0, "explain": "Gradient accumulation sums losses from separate forward passes; each anchor is only compared with the 64 passages in its own micro-batch, so it sees 63 negatives. To get 511 you need a loss that builds the full similarity matrix, such as the cached variant."}
```
