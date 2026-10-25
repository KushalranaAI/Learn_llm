---
title: Counting training compute with C ≈ 6ND
minutes: 7
---

Before any team trains a large model, someone does a back-of-envelope calculation: how many floating-point operations will this run take, and therefore how many GPUs for how many days, and how much money? Remarkably, for a dense transformer this needs only two numbers, the parameter count $N$ and the token count $D$:

$$
C \approx 6 N D
$$

$C$ is the total training compute in **FLOPs** (floating-point operations, not per second). The 6 is not a fitted constant; you can derive it.

## Where the 6 comes from

Almost all the work in a transformer is matrix multiplication by weight matrices. Multiplying an input by a weight costs one multiply and one add, so each parameter costs **2 FLOPs per token** on the forward pass.

```steps
Deriving 6 FLOPs per parameter per token
**Forward pass.** A weight $w$ multiplies an activation and the result is added to a running sum: 1 multiply + 1 add = 2 FLOPs per parameter per token. For the whole model: $2N$ FLOPs per token.
---
**Backward pass, gradient with respect to the activations.** To pass the error back to the previous layer, each weight is used again in a multiply-add: another $2N$.
---
**Backward pass, gradient with respect to the weights.** Each weight's gradient is the product of an activation and an incoming error, accumulated over the batch: another $2N$.
---
Total: $2N + 2N + 2N = 6N$ FLOPs per token, so $C \approx 6ND$ for $D$ tokens. The backward pass costs about twice the forward pass.
---
The approximation ignores the attention score computation (which grows with sequence length) and small costs such as layer norms and the softmax. For typical models and context lengths of a few thousand tokens these add only a modest percentage.
```

The same reasoning gives the cost of **inference**: generating or scoring one token costs about $2N$ FLOPs, because there is only a forward pass. Keep this in mind for the topic on training past the optimum.

## Worked examples

| Run | $N$ | $D$ | $C = 6ND$ |
|---|---|---|---|
| GPT-3 | $1.75 \times 10^{11}$ | $3 \times 10^{11}$ | $3.15 \times 10^{23}$ |
| Chinchilla | $7 \times 10^{10}$ | $1.4 \times 10^{12}$ | $5.88 \times 10^{23}$ |
| A 7B model on 2T tokens | $7 \times 10^{9}$ | $2 \times 10^{12}$ | $8.4 \times 10^{22}$ |

Check Chinchilla: $6 \times 7 \times 1.4 = 58.8$, and $10^{10} \times 10^{12} = 10^{22}$, so $58.8 \times 10^{22} = 5.88 \times 10^{23}$.

## From FLOPs to days and dollars

A GPU has a **peak** throughput (an H100 SXM is about $989 \times 10^{12}$ dense BF16 FLOP/s), but real training reaches only part of it because of communication, memory traffic and idle time. The fraction achieved is the **model FLOPs utilisation (MFU)**; 35% to 55% is typical for well-tuned large runs.

$$
t = \frac{C}{G \cdot F_{\text{peak}} \cdot \text{MFU}}
$$

where $t$ is wall-clock seconds, $G$ the number of GPUs and $F_{\text{peak}}$ the per-GPU peak FLOP/s.

```steps
How long would Chinchilla take on H100s?
Cluster throughput: $G = 1024$ GPUs at $989 \times 10^{12}$ FLOP/s and 40% MFU gives $1024 \times 989\times10^{12} \times 0.4 \approx 4.05 \times 10^{17}$ FLOP/s.
---
Time: $5.88 \times 10^{23} / 4.05 \times 10^{17} \approx 1.45 \times 10^{6}$ seconds.
---
In days: $1.45\times10^{6} / 86{,}400 \approx 16.8$ days.
---
GPU-hours: $1024 \times 16.8 \times 24 \approx 413{,}000$. At an illustrative USD 2 per GPU-hour, about USD 0.83 million of compute, before failed runs, experiments and evaluation, which in practice often cost as much again.
```

The scaling-laws simulation shows $\log_{10} C$ for any choice of $N$ and $D$:

```sim
scaling-laws
{"paramsB": 7, "tokensB": 2000}
```

The defaults here are a 7B model on 2T tokens. Read the compute: $\log_{10}C \approx 22.9$, matching the table. Now double the tokens and confirm the compute doubles too ($\log_{10}C$ rises by $\log_{10}2 \approx 0.3$). Then double the parameters instead: same change in compute, very different change in loss.

## In practice

Planners work in GPU-hours, so they run this calculation in reverse: "we have 500 H100s for 30 days; what can we train?" That gives $C = 500 \times 989\times10^{12} \times 0.4 \times 30 \times 86{,}400 \approx 5.1 \times 10^{23}$ FLOPs, roughly a Chinchilla-sized budget. The next topic decides how to split it between $N$ and $D$. A frequent mistake is to plug in peak FLOP/s with no MFU: that underestimates the time by a factor of two or three.

```lab
plan-a-training-run
```

```quiz
{"q": "Using $C \\approx 6ND$, what is the training compute of a 13B-parameter model trained on 1T tokens?", "options": ["$1.3 \\times 10^{22}$", "$7.8 \\times 10^{22}$", "$2.6 \\times 10^{22}$", "$7.8 \\times 10^{21}$"], "answer": 1, "explain": "$6 \\times 1.3\\times10^{10} \\times 10^{12} = 7.8 \\times 10^{22}$ FLOPs. $2.6\\times10^{22}$ uses $2ND$, the forward-only (inference) cost, and forgets the backward pass."}
```

```quiz
{"q": "A run needs $10^{23}$ FLOPs. You have 256 GPUs at $10^{15}$ peak FLOP/s each and expect 50% MFU. Roughly how long will it take?", "options": ["About 4.5 days", "About 9 days", "About 18 days", "About 1 day"], "answer": 1, "explain": "Throughput is $256 \\times 10^{15} \\times 0.5 = 1.28\\times10^{17}$ FLOP/s, so $10^{23}/1.28\\times10^{17} \\approx 7.8\\times10^{5}$ s $\\approx 9$ days. Ignoring MFU gives about 4.5 days, a common optimistic error."}
```
