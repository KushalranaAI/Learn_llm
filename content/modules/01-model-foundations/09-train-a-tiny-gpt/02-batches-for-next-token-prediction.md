---
title: Batches for next-token prediction
minutes: 7
---

A language model is trained on one task: given the tokens so far, predict the next one. So a training example is not a sentence with a label attached by a human. The label is already in the text. Take any stretch of bytes; the "answer" for each byte is simply the byte that follows it.

That makes data preparation almost trivial. Load the whole file as one long tensor of byte IDs, cut out a random window of $n$ consecutive tokens as the input $x$, and cut out the same window moved one position to the right as the target $y$. Position $t$ of $y$ is the token that follows position $t$ of $x$. One window of length $n$ is therefore not one example but $n$ of them: predict token 2 from token 1, token 3 from tokens 1 and 2, and so on up to predicting token $n+1$ from all $n$. The [causal mask](/learn/model-foundations/attention) is what makes this legal: position $t$ cannot see positions after $t$, so it cannot peek at its own answer.

## The shift, precisely

Let the training data be a sequence of token IDs $u_0, u_1, \dots, u_{N-1}$. Pick a start index $i$ uniformly from $\{0, \dots, N - n - 2\}$. Then

$$
x = (u_i, u_{i+1}, \dots, u_{i+n-1}), \qquad y = (u_{i+1}, u_{i+2}, \dots, u_{i+n})
$$

so $y_t = x_{t+1}$ for $t < n-1$, and the last target $y_{n-1} = u_{i+n}$ is the one byte that lies just beyond the window. The upper limit $N - n - 2$ keeps $i + n$ inside the data.

A batch stacks $B$ such windows into two tensors of shape $(B, n)$. The number of next-token predictions per step is

$$
\text{tokens per step} = B \cdot n
$$

With the repo's defaults, $B = 32$ and $n = 256$, that is $32 \times 256 = 8{,}192$ predictions per optimiser step.

```steps
One window from "the cat", by hand
The text `the cat` as bytes: t=116, h=104, e=101, space=32, c=99, a=97, t=116. So $u = (116, 104, 101, 32, 99, 97, 116)$ and $N = 7$.
---
Take $n = 4$ and start index $i = 1$. Then $x = (u_1, u_2, u_3, u_4) = (104, 101, 32, 99)$, which is the string `he c`.
---
The target is the same window moved right by one: $y = (u_2, u_3, u_4, u_5) = (101, 32, 99, 97)$, the string `e ca`.
---
Read the pairs column by column: after `h` predict `e`; after `he` predict space; after `he ` predict `c`; after `he c` predict `a`. Four training examples from one window.
---
Any start with $i + n \le N - 1$ works, so $i \in \{0, 1, 2\}$. The repo's formula stops at $N - n - 2 = 1$, one window short, which is harmless (see below). There are very few windows in a 7-byte file, which is why the dataset asserts the file is longer than $n + 1$.
```

## The code

Adapted from `ByteDataset` in the repo:

```python
from pathlib import Path
import torch

class ByteDataset:
    def __init__(self, path, block_size=256, split=0.9):
        data = torch.tensor(list(Path(path).read_bytes()), dtype=torch.long)  # (N,)
        cut = int(len(data) * split)
        self.train, self.val = data[:cut], data[cut:]   # first 90% / last 10%
        self.block_size = block_size                     # n

    def get_batch(self, which, batch_size, device):
        buf = self.train if which == "train" else self.val
        n = self.block_size
        ix = torch.randint(0, len(buf) - n - 1, (batch_size,))   # (B,) start indices
        x = torch.stack([buf[i : i + n] for i in ix])            # (B, n)
        y = torch.stack([buf[i + 1 : i + 1 + n] for i in ix])    # (B, n), shifted by one
        return x.to(device), y.to(device)
```

`torch.randint(low, high, ...)` excludes `high`, so the largest start is `len(buf) - n - 2`. The true maximum would be `len(buf) - n - 1`; losing one window out of hundreds of thousands does not matter.

The full version is `llm_from_scratch/part_2/dataset.py`, and `part_2/tests/test_dataset_shift.py` checks the one property that must never break: `(y[:, :-1] == x[:, 1:]).all()`.

```bughunt
{"q":"With this `get_batch`, training loss drops towards 0 within a few hundred steps, and the samples repeat one byte forever. Click the line with the bug.","code":"def get_batch(self, which, batch_size, device):\n    buf = self.train if which == 'train' else self.val\n    n = self.block_size\n    ix = torch.randint(0, len(buf) - n - 1, (batch_size,))\n    x = torch.stack([buf[i:i+n] for i in ix])\n    y = torch.stack([buf[i:i+n] for i in ix])\n    return x.to(device), y.to(device)","bug":6,"explain":"The targets are not shifted: `y` is the same window as `x`, so the label at position $t$ is the byte the model already sees at position $t$. A causal model learns to copy its input, the loss heads to 0, and at sampling time it predicts \"the same byte again\". Fix: `y = torch.stack([buf[i+1:i+1+n] for i in ix])`. The `- n - 1` in the `randint` bound exists precisely so that this shifted slice stays inside the buffer."}
```

## How much data does a run see?

For `tiny.txt`, $N = 276{,}886$ bytes. The 90/10 split gives a training buffer of $\lfloor 0.9 \times 276{,}886 \rfloor = 249{,}197$ bytes and a validation buffer of $27{,}689$ bytes.

A default run of 2,000 steps processes $2{,}000 \times 8{,}192 = 16{,}384{,}000$ training tokens. Divided by the 249,197 bytes available, each byte is used as a target about $16{,}384{,}000 / 249{,}197 \approx 66$ times. In the language of [epochs](/learn/model-foundations/how-networks-learn), that is roughly 66 epochs, which is a lot: large pretraining runs see most of their data about once. Expect the training loss to keep falling long after the validation loss stops improving. Topic 7 shows how to see that happen.

| Setting | Value |
|---|---|
| File size $N$ | 276,886 bytes |
| Train / val bytes | 249,197 / 27,689 |
| Tokens per step $B \cdot n$ | 8,192 |
| Steps | 2,000 |
| Training tokens seen | 16.4 M |
| Approximate epochs | 66 |

## Random windows versus epochs

The sampler draws start indices **with replacement** and never tracks which bytes it has used. That is simpler than shuffling and iterating, and for a large corpus it barely matters. It does mean two things: some bytes are visited more often than others by chance, and "epoch" is only an expected value. For a short run on a big file this is fine. For exact data accounting, production pipelines instead pre-tokenise the corpus, cut it into fixed blocks and shuffle the order once per epoch.

## In practice

- **Check the shift with your eyes once.** Decode `x[0]` and `y[0]` and print them on two lines. The second should read like the first nudged one character left. This takes ten seconds and rules out the most expensive silent bug in language modelling.
- **The split is contiguous, not random.** The last 10% of the file becomes validation. For a poetry collection, that is a different poem in a different style, so validation loss can sit above training loss even before any overfitting. A random split of overlapping windows would leak training text into validation instead, which is worse.
- **Batch size and block size trade against memory.** Activations grow with $B \cdot n$, and attention scores with $B \cdot h \cdot n^2$. If you run out of memory, halving $B$ keeps the context; halving $n$ shortens what the model can learn to use.
- **Move data to the device in the batch function.** Keeping the whole dataset on the CPU and copying only $(B, n)$ blocks is what the repo does, and for a few hundred kilobytes either choice is fine.

```quiz
{"q": "A run uses $B = 16$, $n = 512$ and 3,000 steps on a training buffer of 1,000,000 bytes. About how many times is each training byte used as a target?", "options": ["About 24.6", "About 3", "About 0.05", "About 12.3"], "answer": 0, "explain": "Tokens per step $= 16 \\times 512 = 8{,}192$; over 3,000 steps that is $24{,}576{,}000$ predictions; divided by $1{,}000{,}000$ bytes gives about 24.6 uses per byte. Counting only steps (3,000) or forgetting the factor $n$ gives answers that are far too small; 12.3 halves the batch."}
```

```quiz
{"q": "A colleague's `get_batch` returns `y = buf[i : i + n]`, the same slice as `x`. What will training look like?", "options": ["Loss drops close to zero quickly, but the model generates garbage", "Loss stays stuck at $\\ln 256 \\approx 5.55$", "Training crashes with a shape error", "Training is normal, just slower"], "answer": 0, "explain": "Each position's target is the token it already sees as input, so the task is copying, which the model learns almost immediately and the loss collapses toward zero. It has learned nothing about what comes next, so samples are useless. The shapes still match, so there is no error, and the loss certainly does not stay at the uniform value."}
```
