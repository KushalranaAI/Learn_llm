---
title: "Validation loss: is it learning or memorising?"
minutes: 8
---

The training loss answers one question: how well does the model predict the text it is being trained on? That is not the question you care about. A 3.35-million-parameter model trained for 66 passes over 249,197 bytes could, in principle, simply memorise them. What you want to know is how well it predicts text it has **not** seen.

That is what the 10% held back in `ByteDataset` is for. The validation buffer never produces a gradient. Every few hundred steps, the loop pauses, measures the average loss on both splits with the model frozen, and prints the two numbers side by side. While they move together, the model is learning patterns that transfer. When training keeps falling and validation stalls or rises, it has started fitting the specific bytes of the training file: [overfitting](/learn/model-foundations/how-networks-learn), now on a real language model.

## Averaging over batches

A single batch's loss is noisy. `estimate_loss` draws $K$ random batches (the repo's `eval_iters`, default 50) from each split and averages:

$$
\hat{\mathcal{L}}_{\text{split}} = \frac{1}{K} \sum_{k=1}^{K} \mathcal{L}\big(x^{(k)}, y^{(k)}\big)
$$

If one batch's loss has standard deviation $\sigma$, the average has standard error $\sigma / \sqrt{K}$. With $\sigma = 0.05$ and $K = 50$, that is $0.05 / 7.07 \approx 0.007$: differences between evaluations smaller than about 0.01 are noise.

The loss is easier to feel as **perplexity**, its exponential:

$$
\text{PPL} = e^{\hat{\mathcal{L}}}
$$

A perplexity of $P$ means the model is, on average, as uncertain as if it were choosing uniformly among $P$ bytes. At initialisation, $e^{\ln 256} = 256$. The [log-probs and perplexity](/learn/model-foundations/sampling) topic derives this. For a byte model, perplexity is per byte, so it cannot be compared with a BPE model's per-token perplexity; bits per byte, $\hat{\mathcal{L}} / \ln 2$, is the fairer common unit.

**Worked example.** A validation loss of 1.64 gives $\text{PPL} = e^{1.64} \approx 5.16$ and $1.64 / 0.693 \approx 2.37$ bits per byte. The model has gone from a 256-way guess to roughly a 5-way guess for each next byte.

## The code

Adapted from `estimate_loss` in `train.py`:

```python
@torch.no_grad()                       # no graph, no stored activations for backward
def estimate_loss(model, ds, eval_iters=50, batch_size=32, device="cpu"):
    model.eval()                       # dropout off (and other train-only behaviour)
    out = {}
    for split in ["train", "val"]:
        losses = torch.zeros(eval_iters)
        for k in range(eval_iters):
            xb, yb = ds.get_batch(split, batch_size, device)   # (B, n), (B, n)
            _, loss = model(xb, yb)
            losses[k] = loss.item()
        out[split] = losses.mean().item()
    model.train()                      # back to training mode
    return out
```

- **`no_grad`** stops PyTorch from recording the computation for backpropagation. The answer is identical; memory use drops sharply because activations are freed immediately.
- **`eval()` and `train()`** switch modules like dropout between their two behaviours. The repo's default dropout is 0, so here `eval()` changes nothing, but forgetting `model.train()` afterwards is a classic bug once dropout is on: the rest of training silently runs without it.
- **Both splits, same procedure.** Measuring training loss this way, rather than reading the last printed batch loss, makes the two numbers directly comparable.

The repo saves a checkpoint whenever validation loss reaches a new best, which acts as early stopping: if the model later overfits, `model_best.pt` still holds the version from before. The standalone script `llm_from_scratch/part_2/eval_loss.py` reloads a checkpoint and reports validation loss alone.

## A real run

The repo's small config ($L = 2$, $d = 128$, $n = 128$, $B = 32$; 477,696 parameters) trained on `tiny.txt` for 4,000 steps on a CPU, evaluated every 500 steps:

| Step | Train loss | Val loss | Gap | Val PPL |
|---|---|---|---|---|
| 500 | 2.207 | 2.213 | 0.007 | 9.1 |
| 1,000 | 1.945 | 1.951 | 0.006 | 7.0 |
| 1,500 | 1.805 | 1.816 | 0.011 | 6.1 |
| 2,000 | 1.710 | 1.741 | 0.031 | 5.7 |
| 2,500 | 1.629 | 1.698 | 0.068 | 5.5 |
| 3,000 | 1.580 | 1.663 | 0.084 | 5.3 |
| 3,500 | 1.538 | 1.650 | 0.112 | 5.2 |
| 4,000 | 1.488 | 1.642 | 0.154 | 5.2 |

Read the last column first: validation is still improving at step 4,000, so the newest checkpoint is the best one. But look at the trend. Over the first 1,500 steps the gap stays near 0.01, which is noise. After that it grows every evaluation, while each 500 steps buys less on validation: 0.043, then 0.034, 0.013, 0.008. Training loss fell by 0.050 in the last interval, validation by 0.008. Most of what the model is now learning is specific to the training bytes. Keep going and validation will eventually flatten and then turn upward.

At step 4,000 the model has seen $4{,}000 \times 32 \times 128 = 16.4$ million training tokens, about 66 passes over the training buffer. The cure is more data or more regularisation (dropout, stronger weight decay), not more steps.

## In practice

- **The split is not random, and that matters here.** The last 10% of `tiny.txt` is the end of *Samson Agonistes*, a verse drama with speaker labels such as "Sam:", while most of the training text is lyric poetry. Part of the gap is genuinely different text, not memorisation. The trend of the gap tells you more than its size.
- **`eval_loss.py` needs a matching `block_size`.** The model is rebuilt from the checkpoint's config, but the batch length comes from the `--block_size` flag (default 256). Evaluate a model trained with $n = 128$ without passing `--block_size 128` and the forward pass's `T <= block_size` assertion fails. The orchestrator passes it explicitly for that reason.
- **Every checkpoint carries its config.** Both `model_best.pt` and `model_final.pt` store the model sizes next to the weights. An earlier version of the repo saved `model_final.pt` without them, so loading it fell back to default sizes and `load_state_dict` failed with shape mismatches for any non-default model. A weights file without its config is only half a checkpoint.
- **Compare like with like.** Two runs are only comparable on the same validation bytes, the same tokenizer and enough eval batches that the difference exceeds the noise.

```quiz
{"q": "A byte-level model reaches validation loss 1.10. What is its perplexity, and how many bits per byte is that?", "options": ["About 3.0, and about 1.59 bits per byte", "About 1.10, and about 0.76 bits per byte", "About 12.6, and about 1.59 bits per byte", "About 3.0, and about 0.76 bits per byte"], "answer": 0, "explain": "$e^{1.10} \\approx 3.00$ and $1.10 / \\ln 2 = 1.10 / 0.693 \\approx 1.59$ bits. Multiplying by $\\ln 2$ instead of dividing gives 0.76, and $10^{1.10} \\approx 12.6$ uses the wrong base: the loss is in nats, so the exponential is $e$."}
```

```quiz
{"q": "Over the last three evaluations, training loss went 1.60, 1.45, 1.30 and validation loss went 1.70, 1.71, 1.74. What should you do?", "options": ["Stop and keep the checkpoint from the first of the three; then add data, dropout or weight decay", "Keep training: training loss is still falling fast", "Raise the learning rate to escape a plateau", "Evaluate with more batches, since the change is likely noise"], "answer": 0, "explain": "Training loss falls by 0.15 per interval while validation rises steadily: the model is memorising. The best-validation checkpoint (1.70) is the one to keep, which is what the repo's save-on-best does. A rise of 0.04 across two evaluations is consistent in direction and well above the roughly 0.01 noise of a 50-batch estimate, and a falling training loss is exactly the symptom, not a reason to continue."}
```
