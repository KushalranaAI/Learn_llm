---
title: The feed-forward network
minutes: 8
---

Attention is a meeting. Every token gets to hear from the others and leaves with a blended summary. The **feed-forward network** (FFN, also called the MLP) is the desk work afterwards: each token goes away on its own and thinks about what it heard. No information moves between positions here. The same small two-layer network runs on every token separately.

This is the network from the first lesson of this module, a matrix, a non-linearity, then another matrix. It is applied at every position and every layer. It widens the vector to a larger hidden size $d_{ff}$, bends it with an activation, and projects it back to $d$ so the result can be added to the residual stream. Most of a transformer's parameters live here, and so does much of what we informally call its "knowledge". Interpretability work finds that individual FFN neurons often respond to recognisable patterns and that FFN layers store many factual associations.

## In everyday life

Picture a loan clerk checking one applicant's form. The form has a few fields. The clerk's checklist is far longer: dozens of small rules, such as "salary credits regular?" or "existing loans high?". Most rules do not apply and stay silent. The few that do apply each add a short remark. At the end the clerk combines the remarks into a brief note and clips it to the file. The clerk handles one form at a time and never glances at the next applicant's papers.

That is the **feed-forward network** (FFN, also called the MLP) inside each block. It takes one token's vector and widens it into a much longer list, one entry per rule. Each rule is a **neuron**. An **activation function**, such as ReLU or GELU, decides which neurons stay quiet and which fire. The firing neurons then add up their stored remarks, and a second grid of numbers squeezes the result back to the original width. That note is added to the residual stream.

Unlike a clerk, no human wrote these rules. Training writes them, and researchers find that much of a model's stored knowledge sits here. Most of a model's learned numbers live in this part.

**Where you meet it.** When a chatbot answers a factual question, the facts it recalls are largely held in these layers.

```scene
title: A clerk and a long checklist
step: 📄 One applicant's form lands on the clerk's desk | one token's vector
step: 📋 The checklist has far more rules than the form has fields | expand to a larger hidden size
step: ✔️ Rules that do not apply stay silent, and the rest fire | activation such as ReLU or GELU
step: 🗒️ The firing rules add their stored remarks into one short note | second matrix projects back
step: 📎 The note is clipped to this applicant's file only | added to the stream, per position
takeaway: The feed-forward network thinks about each token on its own, widening, switching rules on and off, and narrowing back.
```

## The equations

The classic FFN, used in the original transformer and GPT-2:

$$
\text{FFN}(\mathbf{x}) = W_2\, \sigma(W_1 \mathbf{x} + \mathbf{b}_1) + \mathbf{b}_2
$$

- $\mathbf{x} \in \mathbb{R}^{d}$ is one token's normalised stream vector.
- $W_1 \in \mathbb{R}^{d_{ff} \times d}$ expands it, and $W_2 \in \mathbb{R}^{d \times d_{ff}}$ projects it back. $\mathbf{b}_1$ and $\mathbf{b}_2$ are biases.
- $\sigma$ is a non-linearity: ReLU in 2017, GELU (a smooth ReLU) in GPT-2.
- Convention: $d_{ff} = 4d$.

Parameter count, ignoring the small biases:

$$
d \cdot d_{ff} + d_{ff} \cdot d = 2 \cdot d \cdot 4d = 8d^2
$$

For GPT-2 small, $d = 768$ and $d_{ff} = 3{,}072$: $768 \times 3072 \times 2 = 4{,}718{,}592$ weights, plus $3{,}072 + 768 = 3{,}840$ biases, giving **4,722,432**. Attention in the same block has $4d^2 + 4d = 2{,}362{,}368$. The FFN is two-thirds of the block.

## A worked example

```steps
A toy FFN with $d = 2$, $d_{ff} = 3$, ReLU, zero biases
Input $\mathbf{x} = (2, 1)$. $W_1$ has rows $(1, 0)$, $(0, 1)$, $(1, -1)$.
---
**Expand.** $W_1\mathbf{x} = (1\cdot2 + 0\cdot1,\ 0\cdot2 + 1\cdot1,\ 1\cdot2 - 1\cdot1) = (2, 1, 1)$.
---
**Bend.** ReLU leaves positives alone: $(2, 1, 1)$. Had the third neuron computed $-1$, it would have been switched off and set to 0.
---
**Project back.** $W_2$ has rows $(1, 0, 1)$ and $(0, 1, -1)$: $(2 + 0 + 1,\ 0 + 1 - 1) = (3, 0)$.
---
**Add to the stream.** The block adds $(3, 0)$ to the residual stream at this position only. The neighbouring token is processed by the same weights but sees only its own vector.
```

## SwiGLU: the modern variant

Llama and most recent open models replace the single expand-and-bend with a **gated** unit:

$$
\text{FFN}_{\text{SwiGLU}}(\mathbf{x}) = W_2\Big(\text{SiLU}(W_1\mathbf{x}) \odot W_3\mathbf{x}\Big), \qquad \text{SiLU}(z) = z \cdot \frac{1}{1+e^{-z}}
$$

$W_1$ and $W_3$ both map $d \to d_{ff}$. $\odot$ is element-wise multiplication. One branch acts as a learned gate deciding how much of the other passes through. There are now three matrices, giving $3 \cdot d \cdot d_{ff}$ parameters. To keep the budget near $8d^2$, designers shrink the hidden size to about $\tfrac{2}{3} \cdot 4d = \tfrac{8}{3}d$.

For Llama-2-7B, $d = 4{,}096$ gives $\tfrac83 d \approx 10{,}923$. The model uses $d_{ff} = 11{,}008$, which is that value rounded up to a multiple of 256 ($43 \times 256$) for efficient hardware kernels. Per layer:

$$
3 \times 4096 \times 11008 = 135{,}266{,}304 \text{ parameters}
$$

That is slightly more than $8d^2 = 134{,}217{,}728$.

| | Matrices | Hidden size | Params per layer |
|---|---|---|---|
| GPT-2 small FFN (GELU) | 2 | $4d = 3{,}072$ | 4.72M |
| Llama-2-7B FFN (SwiGLU) | 3 | $\approx \tfrac83 d = 11{,}008$ | 135.3M |

## See it

```sim
transformer-params
```

Change the FFN ratio from 4 to 2 and then to 8, and watch the FFN's share of the total. At a ratio of 4 it is about two-thirds of every block. Then switch the FFN type to a gated (SwiGLU) form, if the calculator offers it, at a ratio near 2.67. The total should barely move.

## In practice

- **The FFN is where FLOPs go for short prompts.** Every token pays roughly $2 \times 8d^2$ FLOPs per layer in the FFN, whatever the context length. Attention's score computation only dominates when the context is long.
- **Mixture-of-experts (MoE)** models replace the single FFN with many expert FFNs and a router that sends each token to a few of them. This raises total parameters without raising per-token compute. It is a change to this sub-layer only; the residual stream and attention stay the same.
- **Don't confuse $d_{ff}$ with $d$.** Model configs list both, for example `hidden_size` and `intermediate_size`. Plugging $d_{ff}$ in where $d$ belongs is the most common parameter-count error.

```quiz
{"q": "A classic (non-gated) FFN has $d = 1{,}024$ and $d_{ff} = 4{,}096$. Ignoring biases, how many parameters does it have?", "options": ["8,388,608", "4,194,304", "12,582,912", "1,048,576"], "answer": 0, "explain": "Two matrices of $1024 \\times 4096$: $2 \\times 4{,}194{,}304 = 8{,}388{,}608$, which is $8d^2$. 4,194,304 counts only one matrix. 12,582,912 counts three, which would be a SwiGLU layer at the same hidden size."}
```

```quiz
{"q": "Why do SwiGLU models use a hidden size of about $\\tfrac{8}{3}d$ instead of $4d$?", "options": ["SwiGLU has three $d \\times d_{ff}$ matrices instead of two, so shrinking $d_{ff}$ by 2/3 keeps the parameter count near $8d^2$", "SiLU needs a smaller input", "To make the FFN smaller than attention", "Because $8/3$ is the optimal ratio for GELU"], "answer": 0, "explain": "$3 \\cdot d \\cdot \\tfrac83 d = 8d^2$, the same budget as two matrices at $4d$. It is a parameter-matching choice, not a property of the activation. At $4d$ a SwiGLU FFN would cost $12d^2$."}
```
