---
title: A step-by-step build plan for parts 1 to 5
minutes: 9
---

The repo is meant to be read and run side by side with this module. Each part has an orchestrator that runs its tests and a small demo, and each maps onto one lesson here. Running the code before you understand it teaches little. Reading the lesson without running anything leaves you unsure your understanding survives contact with real tensors. The plan below interleaves the two: read a lesson, run its part, check one specific thing, move on.

The checks matter more than the commands. A script that runs without an error proves only that the shapes line up. The checks below are the ones that catch a model that runs but is wrong: a first loss far from $\ln V$, cached and uncached generations that disagree when they should match, a router that sends every token to one expert.

## The one check that applies everywhere

An untrained language model should be equally unsure about every token, so its first cross-entropy loss should be close to that of a uniform guess over the vocabulary:

$$
\mathcal{L}_0 \approx -\ln \frac{1}{V} = \ln V
$$

**Worked example.** For the byte-level models of parts 2 and 3, $V = 256$ and $\ln 256 = 8 \ln 2 = 8 \times 0.693 = 5.545$. For the part 4 demo's BPE vocabulary, $\ln 8{,}000 \approx 8.99$, and for the default, $\ln 32{,}000 \approx 10.37$. A first loss of 5.571 on part 2's quick config, as the snippet below printed, is within 0.03 of the prediction. A first loss of 20 would mean the initialisation is far too large; a first loss near 0 would mean the targets leak into the inputs.

Run it from inside `part_2`:

```python
import torch, math
from model_gpt import GPT

torch.manual_seed(0)
model = GPT(256, 128, 2, 2, 128, 0.0)        # vocab, block, layers, heads, d, dropout
x = torch.randint(0, 256, (4, 128))
_, loss = model(x, x)
print(round(loss.item(), 3), round(math.log(256), 3))   # about 5.57 vs 5.545
```

## The plan

```steps
Part 1: attention and the block
Read [Attention in code](/learn/model-foundations/attention-in-code). Then `cd part_1` and `python orchestrator.py --visualize`. Expect the NumPy attention demo's matrices, two pytest files passing, the step-by-step matrix shapes for $B = 1$, $n = 5$, $d = 12$, $h = 3$, and `All Part 1 demos/tests completed.` **Check** `out/multi_head_attn_grid.png`: every head's map should be lower-triangular, with nothing above the diagonal. Anything above it means the causal mask is broken.
---
Part 2: train a tiny GPT
Read [Train a tiny GPT](/learn/model-foundations/train-a-tiny-gpt). Run `python orchestrator.py` (on Windows, the three commands from topic 2). Expect the loss to fall from about 2.3 at step 50 to about 1.12 at step 400 on `tiny_hi.txt`, with validation loss close to training loss, and samples that look like Devanagari verse with half-formed words. **Check** that val loss tracks train loss; then train the default config on `tiny.txt` and watch for the gap that [validation loss](/learn/model-foundations/train-a-tiny-gpt/validation-loss) describes.
---
Part 3: the modern architecture
Read [Modernising the architecture](/learn/model-foundations/modern-architecture). Run `python orchestrator.py --demo`. Expect four passing tests (the last checks that the KV cache changes nothing, with and without a sliding window) and two timings, about 0.2 s with the KV cache and 0.3 s without for 200 tokens. The text is gibberish: the model is untrained. **Check** the cache yourself: the two printed texts are identical, with or without `--sliding_window 64 --sink 4`, because a correct cache only saves work and never changes the maths.
---
Part 4: a training loop that scales
Read [Scaling the training loop](/learn/model-foundations/scaling-the-training-loop). Run `python orchestrator.py --demo`. Expect `[init] Trained tokenizer ... (vocab=8000)`, checkpoints at steps 250 and 300 plus `model_last.pt` (about 31 MB each), and a sample of English-looking verse. **Check** resuming: delete nothing, rerun the same `train.py` command with `--steps 350`, and confirm it prints `[resume] Loaded checkpoint at step 300`. Then open TensorBoard on `runs/part4-demo` and read the learning-rate curve: a 20-step warmup, then cosine decay.
---
Part 5: mixture of experts
Read [Mixture of experts](/learn/model-foundations/mixture-of-experts). Run `python orchestrator.py --demo`. Expect three passing tests, `Output shape: (2, 3, 128)`, an auxiliary loss near 1 and an expert-load count such as `[3, 2, 1, 0]` (it varies with the random weights). **Check** the auxiliary loss against [load balancing](/learn/model-foundations/mixture-of-experts/load-balancing): perfect balance gives exactly 1, and the further above 1, the more lopsided the routing.
---
Optional: the big part 4 run
On Colab or Kaggle, run part 4's default 57.9M-parameter config with `--mixed_precision` and `--out` on Drive, following topic 3. Expect the first logged loss near $\ln 32{,}000 \approx 10.4$ and samples that contain real words within a few hundred steps. Then disconnect on purpose and resume.
```

## Time per step of the plan

Laptop times were measured on a 16-thread laptop CPU; T4 times are estimates (topic 1). Reading time is not included and is most of the work.

| Step | Command | Laptop CPU | T4 (estimate) | Read alongside |
|---|---|---|---|---|
| Part 1 | `orchestrator.py --visualize` | about 10 s | about 10 s | [Attention in code](/learn/model-foundations/attention-in-code) |
| Part 2, quick | `orchestrator.py` | about 35 s | about 15 s | [The training loop](/learn/model-foundations/train-a-tiny-gpt/the-training-loop) |
| Part 2, default | `train.py --data tiny.txt` | 17 to 20 min | 1 to 2 min | [Validation loss](/learn/model-foundations/train-a-tiny-gpt/validation-loss) |
| Part 3 | `orchestrator.py --demo` | about 10 s | about 10 s | [KV cache in code](/learn/model-foundations/modern-architecture/kv-cache-in-code) |
| Part 4, demo | `orchestrator.py --demo` | about 1.5 min | under 1 min | [Checkpointing and resuming](/learn/model-foundations/scaling-the-training-loop/checkpointing-and-resuming) |
| Part 4, default | `train.py`, 300 steps | about 2 h | about 3 min | [Mixed precision in code](/learn/model-foundations/scaling-the-training-loop/mixed-precision-in-code) |
| Part 5 | `orchestrator.py --demo` | about 10 s | about 10 s | [Implementing an MoE layer](/learn/model-foundations/mixture-of-experts/implementing-an-moe-layer) |

Add the laptop column without the optional big run: about $10 + 35 + 1{,}200 + 10 + 90 + 10 \approx 1{,}355$ s, under 25 minutes of compute for the whole module, most of it the optional default part 2 run. The only step that changes the plan is part 4's default config, where a free T4 turns two hours into a few minutes.

## In practice

- **Change one thing at a time.** After each part runs, edit one flag (`--n_layer`, `--block_size`, `--top_k`) and predict the effect before you look. That habit is what turns a repo you ran into a model you understand.
- **Keep a run log.** A text file with the command, seconds per step, final train and val loss. Two weeks later it is the only record of what worked.
- **When something fails, run the part's tests first.** `python -m pytest -q tests/` isolates whether the bug is in your environment or in your edit.

```quiz
{"q": "You build part 4's model with a 16,000-token BPE vocabulary. What first training loss should you expect before any training step?", "options": ["About 9.68", "About 5.55", "About 16.0", "About 4.20"], "answer": 0, "explain": "An untrained model is close to uniform over the vocabulary, so $\\mathcal{L}_0 \\approx \\ln 16{,}000 \\approx 9.68$. 5.55 is $\\ln 256$, the byte-level value, which no longer applies once the vocabulary changes. 4.20 is $\\log_{10} 16{,}000$; cross-entropy in PyTorch uses natural logarithms."}
```

```quiz
{"q": "Part 3's demo generates 200 tokens twice, once with the KV cache and once without, with `--sliding_window 64 --sink 4`, and prints both. Why is comparing the two texts a meaningful test?", "options": ["At temperature 0 decoding is deterministic, so a correct cache must reproduce full recomputation token for token", "The two runs use different random seeds, so matching text proves the model generalises", "The cache always changes the output slightly, so the texts should differ a little", "Without a cache the window is ignored, so a match means the window has no effect"], "answer": 0, "explain": "Greedy decoding picks the arg-max every step, so the only way the two texts can differ is if the cached path computes different attention than full recomputation. Matching text past the 68-token window (and past the 128-token block size) is the regression test the repo's `tests/test_sliding_window_cache.py` makes exact. A cache never changes the maths, only the cost."}
```
