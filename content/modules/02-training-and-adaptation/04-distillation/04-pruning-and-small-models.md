---
title: Pruning, and where small models fit
minutes: 6
---

Distillation is one way to get a small model. There is another that combines naturally with it: start from a large model and **cut it down**, then use distillation to heal the damage. And there is a strategic question of when a small model is the right product choice at all.

## Pruning in one page

**Pruning** removes parameters. **Unstructured** pruning zeroes individual weights; it can remove 50% or more with little loss, but it gives no speed-up on GPUs unless the zeros follow a hardware-supported pattern. **Structured** pruning removes whole units: attention heads, MLP neurons, entire layers, or embedding channels. The result is a genuinely smaller dense model that runs faster everywhere.

A common importance score for a unit is the average magnitude of its activations or the effect of removing it on the loss over a small calibration set. Remove the least important, then **retrain briefly with distillation from the original model** so the pruned network recovers.

```steps
Pruning plus distillation for a 8B model
Start with a model of $N = 8\times10^9$ parameters. Structured pruning removes half of the MLP width and some layers, giving $N' = 4\times10^9$.
---
Training a 4B model from scratch at the compute-optimal 20 tokens per parameter would take $80\text{B}$ tokens, or $6 \times 4\times10^9 \times 8\times10^{10} = 1.9\times10^{21}$ FLOPs. At 150 tokens per parameter (typical over-training) it is $600\text{B}$ tokens.
---
With pruning and distillation, a recovery run of roughly $60\text{B}$ tokens can be enough in published work. Cost: $(6 \times 4\times10^9 + 2 \times 8\times10^9) \times 6\times10^{10} = 2.4\times10^{21}$ FLOPs counting the teacher's forward pass, similar in order to the from-scratch compute-optimal run but starting from a much better model.
---
In the reported experiments, such recovery runs used up to about 40 times fewer tokens than training the same size from scratch, while matching or beating comparable models. Treat the exact multiple as dependent on the setup.
```

## Compression summary

| Technique | What shrinks | Typical effect on quality | Typical effect on speed |
|---|---|---|---|
| Quantisation | Bits per weight (next module) | Small loss at 8-bit; modest at 4-bit | Less memory traffic; faster decode |
| Unstructured pruning | Individual weights | Fine to ~50% | None, without sparse kernels |
| Structured pruning + KD | Heads, neurons, layers | Recoverable with distillation | Real speed-up |
| Distillation to a smaller architecture | Whole model | Student below teacher, above same-size baseline | Real speed-up |

These stack: prune, distil, then quantise.

## Choosing a small model, the economics

Inference cost per token scales with the parameter count ($\approx 2N$ FLOPs, and memory traffic of $N$ times bytes per weight at decode). A model $k$ times smaller is roughly $k$ times cheaper to serve and faster per token. The question is whether it is good enough for the task.

$$
\text{cost per task} = \frac{\text{price per token} \times \text{tokens per request}}{\text{success rate}}
$$

If the large model solves 95% of requests at relative cost 10 and the small model 88% at relative cost 1, the cost per success is $10/0.95 = 10.5$ versus $1/0.88 = 1.14$: about nine times cheaper per success. The picture changes if failures are expensive (a wrong answer costs a human review) or if the small model needs retries. This arithmetic is what routing systems in the production-systems module formalise: send easy traffic to the small model and hard traffic to the large one.

## Limits and licensing

- A student rarely exceeds its teacher on the teacher's own strengths; it is capped by it plus noise.
- Distilled students inherit the teacher's mistakes, biases and style, and can be overconfident in the teacher's errors.
- **Licensing**: many commercial APIs and some open-weight licences restrict using outputs to train other models. Read the terms before building a pipeline on someone else's model.
- **Evaluation** must use held-out prompts and the same metrics as production. A student can match the teacher's average answer quality while failing on rare, important inputs.

## In practice

A realistic workflow for a product team: pick the smallest candidate model that fits your latency budget; build a labelled evaluation set from real traffic; have a strong model generate and filter training data for your task; fine-tune the small model with LoRA; compare it to the large model on your evaluation set and on cost per success; deploy with the large model as a fallback for low-confidence cases.

```quiz
{"q": "A large model succeeds on 90% of requests at relative cost 8; a small one on 80% at relative cost 1. What is the cost per success of each?", "options": ["8.9 and 1.25", "7.2 and 0.8", "8 and 1", "0.11 and 0.8"], "answer": 0, "explain": "Cost per success is cost divided by success rate: $8/0.9 = 8.9$ and $1/0.8 = 1.25$. The small model is about 7 times cheaper per success, before counting the cost of handling its extra failures."}
```

```quiz
{"q": "Why does structured pruning give real speed-ups while unstructured pruning often does not?", "options": ["Unstructured pruning removes too many weights", "Structured pruning produces a smaller dense matrix that GPUs multiply faster; scattered zeros still occupy a dense matrix unless sparse kernels exist", "Structured pruning uses quantisation", "Unstructured pruning needs distillation"], "answer": 1, "explain": "Dense hardware multiplies whole matrices; zeros scattered inside them still cost the same. Removing entire heads, neurons or layers shrinks the matrices themselves."}
```
