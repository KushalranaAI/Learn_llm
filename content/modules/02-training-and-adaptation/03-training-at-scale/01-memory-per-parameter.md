---
title: Sixteen bytes per parameter
minutes: 7
---

```callout-before
Before you start
You should know that training runs a forward pass, a backward pass that computes a gradient for every parameter, and an optimizer step that updates them. You also need the habit of multiplying parameter counts by bytes.
```

```predict
{"q":"Running a 7B model in 16-bit precision needs about 14 GB for its weights. How much memory do the model states need to train it with AdamW, before counting any activations?","options":["About 14 GB","About 28 GB","About 108 GB","About 1 TB"],"answer":2,"reveal":"About 108 GB, roughly eight times the inference figure: 16 bytes per parameter once gradients, a full-precision master copy and Adam's two moments are counted. The byte count below adds them up."}
```

Running a 7B model for inference in 16-bit precision needs about 14 GB for the weights. Training the same model needs roughly eight times that, before you store a single activation. Engineers who move from inference to training are usually surprised by this, so it is worth doing the accounting once, carefully.

The extra memory comes from the **optimizer**. Plain gradient descent needs only the weights and their gradients. **Adam** (and its variant **AdamW**, the standard for LLMs) keeps two running averages for every parameter, and in mixed-precision training an extra full-precision copy of the weights too. Each of those is as large as the model.

## In everyday life

A teacher who only reads out marks needs one report card per student. A teacher who coaches each student to improve needs far more paper. She keeps the card itself, a note of what each student should change after today's test, a precise master copy of the card, and two running summaries: one of how the student has been changing lately, and one of how big and jumpy those changes have been. The coaching is the training, and the paper piles up well beyond the cards.

A model works the same way. Its **weights** (also called parameters) are the report cards, and answering a question needs only them. **Training** also keeps a **gradient** for each weight, the note saying which way to change it. The **optimizer**, the rule that applies the changes (here **Adam**), keeps its two running summaries for every weight, plus a precise copy of the weights. Each of these is as big as the model itself. So training needs several times the memory that using the model needs, before counting anything else. Unlike the teacher, the model cannot keep its paper in a cupboard: it all has to sit in fast GPU memory.

**Where you meet it.** A team wants to fine-tune an open model on its own GPUs. The weights fit, so they start the job, and it crashes with an out-of-memory error at the first update because they counted only the weights. Adding up every extra copy per parameter tells them in advance whether the job fits.

```scene
title: Coaching students, not just grading
step: 📝 Reading out marks needs only each student's report card | weights for inference
step: 🧭 Coaching adds a note on what each student should change | gradient per weight
step: 🔬 She keeps a precise master copy of every card | full-precision master weights
step: 📒 She adds two running summaries of each student's changes | Adam moments
step: 🗄️ Her desk now holds several times the paper of a plain grader | model states memory
takeaway: Training stores much more per parameter than the weights alone, so budget for all of it.
```

## What Adam stores

For every parameter Adam maintains a **first moment** $m$ (a running average of the gradient) and a **second moment** $v$ (a running average of the squared gradient), and updates the weight with

$$
m_t = \beta_1 m_{t-1} + (1 - \beta_1) g_t, \qquad v_t = \beta_2 v_{t-1} + (1 - \beta_2) g_t^2, \qquad
\theta_t = \theta_{t-1} - \eta \frac{\hat m_t}{\sqrt{\hat v_t} + \epsilon}
$$

where $g_t$ is the gradient at step $t$, $\eta$ the learning rate, $\beta_1 \approx 0.9$ and $\beta_2 \approx 0.95$ to $0.999$ the decay rates, $\hat m_t, \hat v_t$ bias-corrected versions of $m_t, v_t$, and $\epsilon$ a tiny constant. AdamW additionally subtracts $\eta \lambda \theta$ for weight decay $\lambda$. The important part for memory: $m$ and $v$ are each one number per parameter, kept in 32-bit floats.

## The byte count

In **mixed-precision training** (next topic), the forward and backward passes use 16-bit weights, while the optimizer updates a 32-bit **master copy**. Per parameter:

| Item | Precision | Bytes |
|---|---|---|
| Working weights | BF16 | 2 |
| Gradients | BF16 | 2 |
| Master weights | FP32 | 4 |
| Adam first moment $m$ | FP32 | 4 |
| Adam second moment $v$ | FP32 | 4 |
| **Total model states** | | **16** |

So the model states take $16N$ bytes:

$$
M_{\text{states}} = (2 + 2 + 12) \, N = 16N \ \text{bytes}
$$

The "12" groups the three FP32 optimizer-side copies; the ZeRO topic will shard exactly these groups.

```steps
Model states for Llama-2-7B
The model has $N = 6.74 \times 10^9$ parameters.
---
Weights in BF16: $2 \times 6.74\times10^9 = 13.5$ GB. This is all inference needs.
---
Add gradients (2 bytes) and optimizer states (12 bytes): $16 \times 6.74\times10^9 = 107.8$ GB.
---
An 80 GB GPU cannot hold even the model states, let alone activations. Training needs at least two GPUs with the states split between them, or a trick such as 8-bit optimizer states, or LoRA (a later lesson), which trains only a tiny fraction of the parameters.
```

```sim
training-memory
{"model": "llama2-7b", "zero": 0, "gpus": 8}
```

This starts on Llama-2-7B with no sharding. Read "State bytes / param": 16. Now switch the optimizer to SGD with momentum and watch it fall to 12 (one FP32 momentum buffer instead of two moments), and to 8-bit AdamW for 10. Then raise the ZeRO stage to 3 and see the per-GPU states divide by the number of GPUs; the ZeRO topic explains why.

## The rest of the memory

Model states are only part of it. During the forward pass every layer saves intermediate results (**activations**) that the backward pass needs. Their size grows with batch size and sequence length, not with $N$ alone, and for long sequences they can exceed the model states. There are also temporary buffers, communication buffers and memory fragmentation, which in practice cost several more gigabytes. A planning rule:

$$
M_{\text{GPU}} \approx \frac{16N}{\text{sharding}} + M_{\text{activations}} + \text{overhead}
$$

## In practice

When someone asks "can we fine-tune this model on our GPUs?", the first calculation is $16N$. A 70B model needs $16 \times 70\times10^9 = 1.12$ TB of model states: at least 14 full 80 GB GPUs just for states, which is why full fine-tuning of large models is a cluster job and why most teams reach for parameter-efficient methods. A common mistake is to budget only $2N$ (the inference number) and be surprised by out-of-memory errors at the first optimizer step.

```quiz
{"q": "How much memory do the model states of a 13B-parameter model take under mixed-precision AdamW?", "options": ["26 GB", "52 GB", "156 GB", "208 GB"], "answer": 3, "explain": "$16 \\times 13\\times10^9 = 208$ GB. 26 GB is the BF16 weights only (inference); 156 GB counts only the 12 bytes of FP32 optimizer-side states."}
```

```quiz
{"q": "Why does mixed-precision Adam keep a separate FP32 copy of the weights when it already has BF16 weights?", "options": ["So that inference can use FP32", "Because tiny updates such as $\\eta \\cdot \\text{step} \\approx 10^{-5}$ would round away in BF16 and the weights would stop changing", "Because gradients are computed in FP32", "Because Adam requires exactly three copies of every weight"], "answer": 1, "explain": "BF16 has only 8 bits of significand precision, so near 1.0 the next representable number is about 0.008 away. Updates much smaller than that vanish. The FP32 master copy accumulates them; the BF16 copy is re-derived from it for the next forward pass."}
```
