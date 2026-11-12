---
title: What each part of the repo needs
minutes: 9
---

```predict
{"q":"Part 4's default model has 57.9 million parameters; its weights plus AdamW states take under 1 GB. Roughly what peak RAM does training it on a laptop CPU with the default batch need?","options":["Under 1 GB","About 2 GB","About 8 GB","About 60 GB"],"answer":2,"reveal":"About 8 GB (8.25 GB measured). The model states are only 0.93 GB; the rest is activations, and more than half of those are the logits over a 32,000-token vocabulary. The memory section below derives it."}
```

Before you install anything, it helps to know how big the job is. The models in `llm_from_scratch` parts 1 to 5 are tiny by modern standards: the largest default configuration has 57.9 million parameters, about 1/140th of an 8B model. Almost everything in these five parts runs on an ordinary laptop with no GPU. One configuration, part 4's full-size training run, is where a free cloud GPU starts to pay for itself.

Two questions decide where a script can run. **Does it fit in memory?** And **does it finish in a time you are willing to wait?** Both can be estimated in a minute with arithmetic you already know from earlier lessons, and it is worth doing before every run, because a laptop that runs out of RAM does not fail politely: it starts swapping to disk and becomes unusable.

## Memory: model states plus activations

Training memory has two parts. **Model states** are the fp32 weights, their gradients and AdamW's two moment estimates, 4 bytes each, so 16 bytes per parameter (derived in [memory per parameter](/learn/training-and-adaptation/training-at-scale/memory-per-parameter)):

$$
M_{\text{states}} = 16N \ \text{bytes}
$$

**Activation memory** is everything the forward pass saves so the backward pass can use it. It grows with the tokens in a batch, $B \cdot n$, and with the model's width and depth. A rough fp32 count for these models is

$$
M_{\text{act}} \approx 4\,\text{bytes} \times B n \left(16\,dL + 2\,h n L + 3V\right)
$$

The $16dL$ term is the roughly sixteen width-$d$ tensors each layer stores (norm inputs, $Q$, $K$, $V$, the attention output and the wider FFN hidden state). The $2hnL$ term is the attention scores and probabilities, an $n \times n$ matrix per head. The $3V$ term is the logits, their softmax and its gradient. It is a rule of thumb, not an exact count: on the larger configurations it lands within about 20% of measured peak memory, and on the small ones PyTorch's own overhead (about 0.4 GB) dominates anyway.

**Worked example: part 4's default config.** `train.py` defaults to $V = 32{,}000$, $d = 512$, $L = 6$, $h = 8$, $n = 256$, $B = 32$, which builds a model with $N = 57{,}939{,}968$ parameters.

- Model states: $57.9\text{M} \times 16 = 0.93$ GB.
- Tokens per micro-batch: $B n = 32 \times 256 = 8{,}192$.
- Inside the brackets: $16 \times 512 \times 6 = 49{,}152$, plus $2 \times 8 \times 256 \times 6 = 24{,}576$, plus $3 \times 32{,}000 = 96{,}000$, total $169{,}728$.
- Activations: $4 \times 8{,}192 \times 169{,}728 \approx 5.56$ GB.

Together that is about 6.5 GB, and the peak measured on a CPU was 8.25 GB once the Python process itself is counted. On a 16 GB laptop that fits. On an 8 GB laptop it does not, because the operating system and browser already use 2 to 4 GB. Notice which term dominates: the logits, $3V = 96{,}000$, are more than half the bracket. A large vocabulary is expensive in activations, as [the BPE topic](/learn/model-foundations/scaling-the-training-loop/from-bytes-to-bpe) showed.

The fix is in the formula: activations scale with $B$, model states do not. Drop to $B = 8$ and activations fall to about 1.4 GB, with a measured peak of 3.2 GB. Raise `--grad_accum_steps` from 4 to 16 and the effective batch, $8 \times 16 = 128$ sequences, is exactly the default's $32 \times 4$. That is [gradient accumulation](/learn/model-foundations/scaling-the-training-loop/gradient-accumulation) doing what it was invented for.

## Time: FLOPs divided by throughput

Training costs about $6$ floating-point operations per parameter per token (2 forward, 4 backward). The embedding lookup is a table read, not a matrix multiply, so count only the matmul parameters $N_{\text{mm}}$:

$$
T_{\text{step}} \approx \frac{6\, N_{\text{mm}} \cdot \text{tokens per step}}{\text{achieved FLOP/s}}
$$

For the part 4 default, $N_{\text{mm}} = 57.9\text{M} - 32{,}000 \times 512 = 41.6$M, and one optimizer step is 4 micro-batches of 8,192 tokens, 32,768 tokens. That is $6 \times 41.6\text{M} \times 32{,}768 \approx 8.2 \times 10^{12}$ FLOPs per step.

A 16-thread laptop CPU measured 5.9 seconds per micro-batch, 23.8 seconds per step: an achieved $8.2 \times 10^{12} / 23.8 \approx 0.34$ TFLOP/s. The default 300 steps take $300 \times 23.8 \approx 7{,}100$ s, about **2 hours**. A T4 has a peak of about 65 TFLOP/s in fp16; small models in plain PyTorch typically reach a quarter of that or less. At an assumed 15 TFLOP/s a step takes about 0.55 s and 300 steps about **3 minutes**. That T4 figure is an estimate, not a measurement; time a few steps yourself (topic 3).

## The whole repo at a glance

CPU times below were measured on a 16-thread laptop with a CPU-only PyTorch build (limiting PyTorch to 4 threads made them up to about 40% slower). T4 times are estimates from the FLOP count.

| Part and command | Parameters | Peak RAM | Laptop CPU | T4 (estimate) | Verdict |
|---|---|---|---|---|---|
| 1: `orchestrator.py --visualize` | 576 (shapes demo) | under 0.5 GB | about 10 s | same | Laptop OK |
| 2: `orchestrator.py` (quick config) | 477,696 | about 0.5 GB | about 35 s | about 15 s | Laptop OK |
| 2: `train.py --data tiny.txt` (defaults, 2,000 steps) | 3,352,064 | about 1.1 GB | 17 to 20 min | 1 to 2 min | Laptop OK |
| 3: `orchestrator.py --demo` | 557,568 | under 0.5 GB | about 10 s | same | Laptop OK |
| 4: `orchestrator.py --demo` | 2,572,800 | under 1 GB | about 1.5 min | under 1 min | Laptop OK |
| 4: `train.py` defaults, 300 steps | 57,939,968 | 8.25 GB ($B = 32$) | about 2 h | about 3 min | 16 GB laptop slow; Colab recommended |
| 5: `orchestrator.py --demo` | 786,948 (MoE layer) | under 0.5 GB | about 10 s | same | Laptop OK |

Most of the 10 seconds in parts 1, 3 and 5 is Python and pytest starting up, not computation.

```sim
transformer-params
{"dModel": 512, "layers": 6, "heads": 8, "kvHeads": 8, "ffnHidden": 2048, "vocab": 32000, "gated": true, "tied": false}
```

This is the part 4 default (SwiGLU with a hidden width of 2,048, no weight tying); the total should read about 57.9M, give or take the final norm's 512 weights. Look at the embedding share: well over half the parameters are the 32,000-row embedding and head. Now set the vocabulary to 8,000 as the part 4 demo does and watch the total fall by about 24.6M, then turn on tying and see the head disappear from the count.

## In practice

- **Estimate before you run, measure in the first minute.** Run 20 steps, read seconds per step, multiply by the total. If the answer is over an hour on your laptop, that run belongs on a GPU.
- **Watch RAM, not just time.** Open Task Manager, Activity Monitor or `htop` during the first steps. If memory climbs toward the total and the disk light stays on, stop and halve `--batch_size`.
- **The small configs are the point.** Every lesson in this module is written so the small config teaches the idea. The 57.9M run is a bonus for seeing a BPE model produce recognisable words, not a requirement.

```quiz
{"q": "Part 4's default run peaks at about 8.25 GB on a CPU with $B = 32$. You lower `--batch_size` to 8 and raise `--grad_accum_steps` to 16. What happens to model-state memory and to the effective batch?", "options": ["Model states stay at about 0.93 GB and the effective batch stays at 128 sequences", "Both fall by a factor of 4", "Model states fall to about 0.23 GB and the effective batch stays at 128", "Model states stay the same and the effective batch falls to 32"], "answer": 0, "explain": "Model states are $16N$ bytes and do not depend on the batch, so they stay at $57.9\\text{M} \\times 16 \\approx 0.93$ GB; only activations shrink, roughly by 4. The effective batch is micro-batch times accumulation steps: $8 \\times 16 = 128 = 32 \\times 4$. Dividing states by 4 is the tempting mistake of treating all memory as batch-dependent."}
```

```quiz
{"q": "A configuration has $N_{\\text{mm}} = 10$M matmul parameters and processes 16,384 tokens per optimizer step. Your CPU achieves 0.3 TFLOP/s. Roughly how long do 1,000 steps take?", "options": ["About 55 minutes", "About 9 minutes", "About 18 minutes", "About 5.5 hours"], "answer": 0, "explain": "FLOPs per step $= 6 \\times 10^7 \\times 16{,}384 \\approx 9.8 \\times 10^{11}$. At $3 \\times 10^{11}$ FLOP/s that is about 3.3 s per step, so 1,000 steps take about 3,300 s, roughly 55 minutes. Using 2 FLOPs per parameter (forward only) gives about 18 minutes, which forgets the backward pass."}
```
