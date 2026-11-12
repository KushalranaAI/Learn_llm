---
title: "Matryoshka embeddings: one model, many sizes"
minutes: 8
---

A 768-dimensional vector per document is fine for ten thousand documents and expensive for a hundred million. The obvious way to save space is to keep only the first $k$ numbers of each vector. For an ordinary embedding model that is a bad idea: training spread the information across all dimensions, so the first 128 are just an arbitrary slice.

**Matryoshka Representation Learning** (Kusupati et al., 2022) changes the training so that the slice is not arbitrary. Like the nested Russian dolls, the first 64 dimensions form a usable embedding, the first 128 a better one, and so on up to the full vector. You train once and choose the size at deployment time, or even use two sizes in one system: a short vector to shortlist candidates quickly and the full vector to re-score the shortlist.

## Why plain truncation fails

Truncating a vector and renormalising it gives a different cosine from the full vector. Take two unit-length 4-dimensional embeddings, $\mathbf{a} = (0.8, 0.4, 0.4, 0.2)$ and $\mathbf{b} \approx (0.7, 0.5, -0.3, 0.4)$.

```steps
Full versus truncated cosine
Full vectors: $\mathbf{a} \cdot \mathbf{b} = 0.56 + 0.20 - 0.12 + 0.08 = 0.72$. Both norms are about 1, so $\cos \approx 0.72$.
---
Keep the first two dimensions: $(0.8, 0.4)$ and $(0.7, 0.5)$. Dot product $0.56 + 0.20 = 0.76$; norms $\sqrt{0.80} \approx 0.894$ and $\sqrt{0.74} \approx 0.860$.
---
Truncated cosine: $0.76 / (0.894 \times 0.860) \approx 0.99$. The pair looks almost identical at 2 dimensions and only moderately similar at 4. The disagreement lived in dimensions 3 and 4, and truncation threw it away.
---
If a model has not been trained for this, such shifts reorder search results. Matryoshka training explicitly scores the truncated vectors so that their rankings agree with the full ones as far as possible.
```

## The loss

Pick a set of nested sizes $\mathcal{M}$, for example $\{384, 256, 128, 64, 32\}$ for a 384-dimensional model. For each $m \in \mathcal{M}$, truncate every embedding in the batch to its first $m$ components, renormalise, and compute the ordinary contrastive loss on those truncated vectors. The total loss is a weighted sum:

$$
\mathcal{L}_{\text{MRL}} = \sum_{m \in \mathcal{M}} w_m \, \mathcal{L}_{\text{InfoNCE}}\big(\mathbf{e}_{1:m}\big)
$$

where $\mathbf{e}_{1:m}$ means the first $m$ dimensions of each embedding and $w_m$ are weights, usually all $1$. The model runs once per batch; only the cheap loss computation is repeated for each size. Because every size shares its leading dimensions with every larger size, gradients from the small sizes push the most important information to the front of the vector.

In sentence-transformers, `MatryoshkaLoss` wraps any base loss:

```python
from sentence_transformers import SentenceTransformer
try:
    from sentence_transformers.sentence_transformer.losses import MultipleNegativesRankingLoss, MatryoshkaLoss
except ImportError:   # versions before 5.4
    from sentence_transformers.losses import MultipleNegativesRankingLoss, MatryoshkaLoss

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
base_loss = MultipleNegativesRankingLoss(model)
loss = MatryoshkaLoss(model, base_loss, matryoshka_dims=[384, 256, 128, 64, 32])
# pass `loss` to SentenceTransformerTrainer exactly as in the previous topic

# After training: load the model so every vector is cut to 128 dimensions
small = SentenceTransformer("models/minilm-finance-mrl/final", truncate_dim=128)
print(small.encode(["refund window for annual plans"], normalize_embeddings=True).shape)  # (1, 128)
```

The dimensions in `matryoshka_dims` must not exceed the model's output size, and the largest one is normally the full size. Training cost rises only slightly, since the encoder still runs once per batch.

## Storage arithmetic

A vector of $d$ dimensions stored at $b$ bits per number takes $d \cdot b / 8$ bytes. [Embeddings in practice](/learn/model-foundations/embeddings/embeddings-in-practice) showed that dimension and precision multiply; Matryoshka makes the first lever safe, and quantisation pulls the second.

| Format | Bytes per vector at $d = 768$ | at $d = 128$ | 10M vectors at $d = 128$ |
|---|---|---|---|
| float32 (32 bits) | 3,072 | 512 | 5.12 GB |
| float16 (16 bits) | 1,536 | 256 | 2.56 GB |
| int8 (8 bits) | 768 | 128 | 1.28 GB |
| binary (1 bit) | 96 | 16 | 160 MB |

From 768-dimensional float32 to 128-dimensional binary is $3{,}072 / 16 = 192\times$ smaller. **Binary quantisation** keeps only the sign of each component and compares vectors by Hamming distance (count of differing bits), which CPUs compute very fast. **int8 quantisation** maps each dimension's observed range onto 256 levels. Both lose some quality; a common recipe is to search with the compact vectors and re-score the top 100 or so with full-precision vectors kept on disk.

## Quality versus size

What you lose at each size depends on the model and data, so measure it: run the retrieval evaluator from the next topic once per size, with `truncate_dim` set to each value. The pattern people usually report has this shape:

| Dimensions | Storage vs full | Typical behaviour, Matryoshka-trained | Typical behaviour, not Matryoshka-trained |
|---|---|---|---|
| Full | 1× | baseline | baseline |
| Half | 0.5× | within about a point | small to moderate drop |
| Quarter | 0.25× | small drop | clearly worse |
| One-twelfth or less | under 0.1× | noticeable but usable drop | often falls apart |

The Matryoshka paper reported, for ImageNet classification, embeddings up to 14 times smaller at the same accuracy as the full-size baseline. For text retrieval, expect the smallest sizes to lose more; the curve is what tells you where to stop.

## In practice

- **Train with Matryoshka by default** when you fine-tune; it costs little and gives you the option to shrink later without retraining.
- **Renormalise after truncating** if you compute cosines yourself. Loading with `truncate_dim` and encoding with `normalize_embeddings=True` does it for you.
- **Decide the size from a curve, not a guess.** Plot NDCG@10 against dimension for your evaluation set and pick the knee.

```parsons
{"title":"Order a Matryoshka fine-tune, from loading the model to encoding with 128-dimensional vectors (`args` and `train_ds` come from the previous topic)","lines":["model = SentenceTransformer(\"sentence-transformers/all-MiniLM-L6-v2\")","base_loss = MultipleNegativesRankingLoss(model)","loss = MatryoshkaLoss(model, base_loss, matryoshka_dims=[384, 256, 128, 64, 32])","trainer = SentenceTransformerTrainer(model=model, args=args, train_dataset=train_ds, loss=loss)","trainer.train()","model.save_pretrained(\"models/minilm-finance-mrl/final\")","small = SentenceTransformer(\"models/minilm-finance-mrl/final\", truncate_dim=128)","print(small.encode([\"refund window for annual plans\"], normalize_embeddings=True).shape)"],"explain":"`MatryoshkaLoss` wraps an existing loss built on the same model, so the base loss comes first, and the trainer needs the wrapped loss. The truncated model can only be loaded from the folder saved after training. `truncate_dim=128` keeps the first 128 dimensions and `normalize_embeddings=True` renormalises them, so the printed shape is (1, 128)."}
```

```quiz
{"q": "How many bytes does one 256-dimensional binary-quantised embedding take?", "options": ["32", "256", "1,024", "8"], "answer": 0, "explain": "One bit per dimension: $256 / 8 = 32$ bytes. 256 bytes is the int8 size (one byte per dimension) and 1,024 the float32 size."}
```

```quiz
{"q": "Why does MatryoshkaLoss add little training cost even with five nested sizes?", "options": ["The encoder runs once per batch; only the loss on truncated vectors is repeated", "It trains five separate small models in parallel", "It skips the backward pass for the small sizes", "It only uses the smallest size during training"], "answer": 0, "explain": "The expensive part is the transformer forward and backward pass, which is shared. Truncating and computing an extra $B \\times B$ similarity matrix per size is cheap. There is one model, and gradients from every size flow back through it."}
```
