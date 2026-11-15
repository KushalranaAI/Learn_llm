---
title: Choosing where to run
minutes: 9
---

```predict
{"q":"Can you fine-tune Qwen2.5-0.5B with LoRA on an 8 GB laptop that has no GPU?","options":["Yes: it needs about 3.5 to 4 GB in all","No: fine-tuning needs a GPU","Only with 4-bit QLoRA to shrink the weights","No: LoRA needs about as much memory as full fine-tuning"],"answer":0,"reveal":"Yes, just: about 2 GB of fp32 weights, 0.14 GB of adapter states and 1 to 2 GB of activations. QLoRA is not even available on a CPU, and full fine-tuning would need 7.9 GB of states alone. The worked example under \"Bytes per parameter\" adds it up."}
```

You do not need a GPU to learn fine-tuning. You need the *right size of model* for the machine in front of you. A laptop with no GPU can fine-tune a 135M-parameter model in minutes, and that run exercises every piece of the real pipeline: tokenizer, chat template, LoRA, optimizer, checkpoint, adapter file. The same script then runs on a free cloud GPU with a bigger model, and on a rented GPU with a bigger one still.

So the first decision is not "which library" but "which model on which machine". Two numbers settle it: **memory** (does it fit at all?) and **time** (will it finish while you are still interested?). Memory is a hard wall: cross it and the run dies, or on a laptop the operating system starts swapping to disk and a step that took two seconds takes two minutes. Time is softer, but a 40-hour CPU run is a run you will never finish.

## In everyday life

If you are learning a new biryani recipe, you do not start by cooking for a wedding. You make a small batch on your home stove, work out the spices, and only then scale up in a bigger kitchen. The recipe stays the same. Only the pot gets bigger.

Fine-tuning works the same way. The first question is not which library to use, but which model should run on which machine. Two limits decide it. **Memory** is the pot size: if the model plus training does not fit, the run fails, or the computer slows to a crawl as it shuffles data to the disk. **Time** is how long the cooking takes: a run that needs two days on your laptop is one you will never finish.

A small model on a laptop is a complete rehearsal, because it uses every step of the real pipeline. Later the same script moves to a free shared GPU, or one you rent by the hour.

The kitchen picture has one gap: a pot that is too big only wastes gas, but a model that is too big for your memory simply does not run.

**Where you meet it.** A student with an 8 GB laptop wants to learn fine-tuning without paying for anything. She picks a very small model, works out roughly how much memory and time it needs, and finishes in minutes. Jumping straight to a huge model would have frozen her laptop and taught her nothing.

```scene
title: Practise small, then cook for the wedding
step: 🍳 You test a new recipe in a small batch on the home stove | Small model on a laptop CPU
step: 🫕 The pot has a fixed size, and overfilling makes it spill | Memory is a hard wall
step: 🕒 Even if it fits, an eight-hour simmer is no use for practice | Estimate training time first
step: 🏫 The same recipe moves to a bigger shared kitchen | Free Colab or Kaggle GPU
step: 🎪 Wedding-sized batches go to a catering kitchen booked by the hour | Rented GPU
takeaway: Match the model size to your machine, learn on the small one, and move the same script up when you need more.
```

## Bytes per parameter, by where you run

[Sizing your first run](/learn/fine-tuning/start-here/sizing-your-first-run) gave the 16 bytes per trainable parameter of mixed-precision Adam on a GPU. On a CPU there is no mixed precision worth using, so everything is **fp32**, 4 bytes per number. The totals for a model of $N$ parameters, of which $N_t$ are trained:

$$M \approx \underbrace{N \cdot b_w}_{\text{frozen or trained weights}} + \underbrace{N_t \cdot 12}_{\text{gradient + Adam } m, v} + M_{\text{act}}$$

where $b_w$ is bytes per stored weight: 4 for fp32 (CPU), 2 for fp16 or bf16 (GPU), about 0.5 for 4-bit **NF4** (QLoRA, GPU only). For full fine-tuning in fp32, $N_t = N$ and the total is $4N + 12N = 16N$: the same 16 bytes as mixed precision on a GPU, but with no bf16 copy and a 4-byte master weight. For LoRA, $N_t$ is under 2% of $N$, so the weights dominate. $M_{\text{act}}$ grows with batch size times sequence length; for short sequences on small models budget 1 to 2 GB.

**Worked example: Qwen2.5-0.5B-Instruct with LoRA on an 8 GB laptop.** The model has $N \approx 0.494$B parameters, 24 layers, $d = 896$, an MLP width of 4,864 and 2 key/value heads of size 64 (so $W_k$, $W_v$ map 896 to 128). LoRA at rank $r = 16$ on all linear layers adds, per layer,

$$2 \cdot 16(896+896) + 2 \cdot 16(896+128) + 3 \cdot 16(896+4864) = 366{,}592,$$

so $24 \times 366{,}592 \approx 8.8$M trainable parameters. Memory:

- weights: $0.494 \times 10^9 \times 4 = 1.98$ GB
- adapter states: $8.8 \times 10^6 \times 16 = 0.14$ GB
- activations at batch 4, 256 tokens: roughly 1 to 2 GB

About 3.5 to 4 GB in all. An 8 GB laptop with Windows or macOS and a browser open has perhaps 4 GB free, so this fits, just. Full fine-tuning of the same model needs $16 \times 0.494 = 7.9$ GB of states alone: it does not.

## Time: the 4N rule for LoRA

A forward pass costs about $2N$ floating-point operations per token. Full training adds a backward pass of about $4N$ (gradients for activations and for weights), the familiar $6N$. With LoRA the frozen weights need no weight gradients, so the cost drops to roughly $4N$ per token. For $T$ training tokens on hardware that sustains $S$ FLOP/s,

$$t \approx \frac{4\,N\,T}{S}.$$

Take SmolLM2-135M-Instruct, 100 examples of 256 tokens, 3 epochs: $T = 76{,}800$ tokens and $4 \times 1.35 \times 10^8 \times 76{,}800 \approx 4.1 \times 10^{13}$ FLOPs. A laptop CPU in PyTorch sustains somewhere between tens and a few hundred GFLOP/s, depending on the chip and cores. At 50 GFLOP/s that is about 14 minutes; at 200 GFLOP/s, about 3.5. The same run on Qwen2.5-0.5B takes about 3.7 times longer: 13 to 50 minutes. Treat these as order-of-magnitude estimates; the [smoke test](/learn/fine-tuning/run-fine-tuning-yourself/local-cpu-setup) replaces them with a measurement.

## The decision table

Largest model that comfortably fits, by method and hardware. "Comfortably" means short sequences (512 to 1,024 tokens), small batches and gradient checkpointing; long contexts shrink every entry.

| Hardware (usable memory) | Full fine-tune | LoRA | QLoRA (4-bit) | GRPO with LoRA/QLoRA | Embedding fine-tune |
|---|---|---|---|---|---|
| 8 GB laptop, CPU (~4 GB free) | ~135M | ~0.5B | Not available (needs CUDA) | Toy only (135M), very slow | Small encoders, ~110M |
| 16 GB laptop, CPU (~11 GB free) | ~360M | ~1.5B, slow | Not available | Toy only, 135–360M | Up to ~335M |
| Colab or Kaggle T4, 15 GB (fp16) | ~0.5B | ~3B | 7–8B at short context | ~1–4B | Any common embedding model |
| L4, 24 GB | ~1B | ~8B, tight | ~14B | ~8B | Any |
| A100, 80 GB | ~3–4B | ~30B | ~70B | ~14B with LoRA | Any |

Recommended starting models, all on the Hugging Face Hub: **SmolLM2-135M-Instruct** and **SmolLM2-360M-Instruct** (`HuggingFaceTB/...`) and **Qwen2.5-0.5B-Instruct** (`Qwen/...`) for a CPU; a 1B to 8B instruct model (Llama 3.2 1B or 3B, Qwen2.5 1.5B to 7B, Llama 3.1 8B) with QLoRA on a T4. GRPO is listed separately because it must *generate* several completions per prompt every step, which is slow on any CPU and adds memory for the generations; the [GRPO lesson](/learn/fine-tuning/grpo-hands-on) runs it on a T4. Embedding models are small encoders, so even full fine-tuning is cheap; see [Fine-tuning embedding models](/learn/fine-tuning/fine-tuning-embedding-models).

```sim
quantization
{"paramsB": 0.5, "format": "fp32"}
```

This is the weight memory column of the formula. Read off the fp32 figure for 0.5B (about 2 GB), then switch the format to **bf16** and **nf4** and watch it halve and halve again. Now set the model size to 8B: in fp32 it would need 32 GB, which is why an 8B model is a GPU job, and in NF4 it drops to roughly 4 to 5 GB, which is why it fits a free T4.

## In practice

Learn the loop on the laptop, then move the *same script* up a tier by changing the model name and three precision flags. Keep a column of headroom: on a GPU, aim to use at most about 85% of the card, because memory fragments and some batches are longer than others. On a CPU, close the browser before a run; a few dozen tabs can take the 2 GB you were counting on. The most common mistake is the reverse of what people expect: not picking too small a model, but jumping straight to a 7B model on a laptop, watching it swap, and concluding that fine-tuning "needs a big GPU".

```quiz
{"q": "You want full fine-tuning (not LoRA) of SmolLM2-360M in fp32 on a CPU with Adam. Roughly how much memory do the weights, gradients and optimizer states take?", "options": ["5.8 GB", "1.4 GB", "2.9 GB", "0.7 GB"], "answer": 0, "explain": "fp32 full fine-tuning is 4 bytes of weight plus 4 of gradient plus 8 of Adam moments: $16 \\times 0.36 \\times 10^9 \\approx 5.8$ GB, before activations. 1.4 GB is the fp32 weights alone, which is all you need for LoRA, not for full fine-tuning."}
```

```quiz
{"q": "A LoRA run on a 0.5B model processes 200,000 training tokens. Your CPU sustains about 100 GFLOP/s. Roughly how long will training take?", "options": ["About 1 hour", "About 1 minute", "About 6 hours", "About 10 seconds"], "answer": 0, "explain": "$t \\approx 4NT/S = 4 \\times 0.5 \\times 10^9 \\times 2 \\times 10^5 / 10^{11} = 4{,}000$ s, a little over an hour. Using $2N$ (forward only) halves it; forgetting the factor of $N$ entirely gives seconds. Measure a few steps to confirm before committing."}
```
