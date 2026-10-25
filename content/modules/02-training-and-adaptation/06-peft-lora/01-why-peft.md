---
title: Why not update every weight
minutes: 6
---

```callout-before
Before you start
You should remember the training-memory bill from earlier in this module: roughly 16 bytes for every parameter you train, plus activations. That number is the whole motivation for this lesson.
```

Suppose you want a 7B model to follow your company's ticket-triage format. Full fine-tuning updates all 6.74 billion weights, which needs about $16 \times 6.74 \times 10^9 \approx 108$ GB just for model states. That is more than one 80 GB GPU, so you need several GPUs, sharding, and an expensive afternoon. Then you must store and deploy a full 13.5 GB copy of the model for every task, and a fleet of ten customised models means ten full copies.

Yet the change you want is small. You are not teaching the model language; you are nudging its behaviour. It would be strange if that required rewriting every one of billions of numbers. **Parameter-efficient fine-tuning** (PEFT) is the family of methods that freeze almost everything and train a small number of new or selected parameters.

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
