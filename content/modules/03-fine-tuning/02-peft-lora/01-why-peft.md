---
title: Why not update every weight
minutes: 6
---

```callout-before
Before you start
You should remember the training-memory bill from [Training at scale](/learn/training-and-adaptation/training-at-scale): roughly 16 bytes for every parameter you train, plus activations. That number is the whole motivation for this lesson.
```

```predict
{"q":"Full fine-tuning a 7B model updates all 6.74 billion weights. LoRA at rank 16 on the query and value matrices gets close on many tasks. What share of the weights does it train?","options":["About 50%","About 10%","About 1%","About 0.12%"],"answer":3,"reveal":"About 0.12%, roughly 8.4 million parameters. Model-side memory falls from about 108 GB to 13.6 GB, so a 24 GB GPU can train it. The worked steps below do the accounting."}
```

Suppose you want a 7B model to follow your company's ticket-triage format. Full fine-tuning updates all 6.74 billion weights, which needs about $16 \times 6.74 \times 10^9 \approx 108$ GB just for model states. That is more than one 80 GB GPU, so you need several GPUs, sharding, and an expensive afternoon. Then you must store and deploy a full 13.5 GB copy of the model for every task, and a fleet of ten customised models means ten full copies.

Yet the change you want is small. You are not teaching the model language; you are nudging its behaviour. It would be strange if that required rewriting every one of billions of numbers. **Parameter-efficient fine-tuning** (PEFT) is the family of methods that freeze almost everything and train a small number of new or selected parameters.

## In everyday life

Imagine a school that owns one thick textbook covering the whole subject. A new school wants it taught in their own style, with their own examples and exam format. Nobody would reprint and rebind every page for that.

The sensible way is to leave the printed book alone. The teacher writes a few notes on a slip of paper that goes with it. Another school writes its own slip. Everyone shares the one book, and each school stores only a thin slip.

This is the idea behind **parameter-efficient fine-tuning**, or PEFT. A **parameter** is one of the numbers inside the model, also called a weight, and a model has billions of them. **Fine-tuning** means training a model further so it behaves the way you want. Full fine-tuning rewrites every number, like reprinting the book. PEFT **freezes** the original numbers, meaning they are never changed, and trains only a small add-on, like the slip. The add-on can be small because you are changing behaviour, not teaching the subject again.

One point does not fit. A slip of notes is always read beside the book, but the most popular kind of add-on, called LoRA, can be merged into the model afterwards, so it adds no delay.

**Where you meet it.** A software company offers a writing assistant to several clients, each wanting its own tone and house format. Training a full copy of the model per client needs many GPUs and a huge file each time. With PEFT, the company keeps one shared base model and one small add-on file per client.

```scene
title: One textbook, many small slips
step: 📚 The school owns one big textbook that already covers the whole subject | pretrained base model
step: 🏫 A new school wants its own style and examples, not a new subject | task-specific behaviour change
step: 💸 Reprinting the whole book for every school is slow and costly | full fine-tuning
step: 📝 The teacher leaves the book alone and writes notes on a slip | frozen weights, small trained add-on
step: 🎒 Each school keeps only its own slip; all share the one book | one base model, many adapters
takeaway: PEFT freezes the big model and trains a small add-on, so each new task costs a little memory and storage.
```

## The PEFT family

| Method | What is trained | Typical trainable share |
|---|---|---|
| Adapters (Houlsby et al.) | Small bottleneck layers inserted in each block | 1% to 4% |
| Prompt / prefix tuning | A few learned vectors prepended to the input or each layer | under 0.1% |
| BitFit | Only the bias terms (many modern LLMs have none) | about 0.1% |
| **LoRA** | A low-rank update added to selected weight matrices | 0.1% to 2% |
| **QLoRA** | LoRA on top of a 4-bit quantised frozen base | same as LoRA, far less memory |

LoRA became the default because it is simple, adds **no inference latency** once merged into the weights, and matches full fine-tuning quality on many tasks.

## Why a small change can be enough

Research on **intrinsic dimension** (Aghajanyan et al.) found that large pretrained models can be fine-tuned effectively while optimising only a tiny random subspace of their parameters, sometimes a few hundred to a few thousand dimensions for a model with hundreds of millions. Pretraining has already put the model in a good region; adapting to a task needs only a few directions of movement. LoRA exploits a cousin of this observation: the weight update $\Delta W$ needed for a task tends to have a **low rank**, meaning it is well approximated by a product of two thin matrices.

## The saving, in numbers

```steps
Full fine-tuning versus LoRA on a 7B model
Full fine-tuning: model states $= 16 \times 6.74\times10^9 = 107.8$ GB. Activations are extra.
---
LoRA with rank 16 on the query and value matrices of all 32 layers: about $8.4\text{M}$ trainable parameters (derived in the next topic), or 0.12% of the model.
---
The frozen weights are only stored in BF16 (13.5 GB, no gradients or optimizer states). The trainable part needs $16 \times 8.4\times10^6 \approx 0.13$ GB.
---
Total model-side memory $\approx 13.5 + 0.13 = 13.6$ GB, an eightfold reduction from 107.8 GB. A 24 GB GPU can now train it.
---
Deployment: the adapter file is about $2 \times 8.4\times10^6 = 17$ MB in BF16, against a 13.5 GB full copy. Ten task-specific models cost one base model plus ten small files.
```

```sim
lora-params
{"model": "llama2-7b", "method": "full", "gpu": "a100"}
```

The simulation opens on full fine-tuning of Llama-2-7B on an A100 80 GB: see "Training memory" and "Fits". Switch the method to LoRA, then QLoRA, and watch the memory and trainable-parameter counts. We unpack each number in the next topics.

## In practice

PEFT is not free quality: on hard tasks that need substantial new behaviour (large domain shifts, long-horizon reasoning), full fine-tuning can still win, and LoRA's gap shrinks with rank. But for style, format, classification, extraction and moderate domain adaptation, LoRA is usually within noise of full fine-tuning at a tenth of the cost, so it is the right first attempt.

```quiz
{"q": "Why can ten LoRA-tuned variants of one 7B model be cheaper to store than ten fully fine-tuned ones?", "options": ["LoRA compresses the base model", "Each variant needs only its small adapter file on top of one shared frozen base", "LoRA models cannot be saved", "Because LoRA uses fewer layers"], "answer": 1, "explain": "The base weights are unchanged, so all variants share one copy; each variant adds only its low-rank matrices (tens of MB). Full fine-tuning changes every weight, so each variant is a full copy."}
```

```quiz
{"q": "Roughly how much model-state memory does full fine-tuning of a 13B model need with mixed-precision AdamW (16 bytes per parameter)?", "options": ["26 GB", "104 GB", "208 GB", "416 GB"], "answer": 2, "explain": "$16 \\times 13\\times10^9 = 208$ GB. 26 GB is the BF16 weights alone, which is inference memory."}
```
