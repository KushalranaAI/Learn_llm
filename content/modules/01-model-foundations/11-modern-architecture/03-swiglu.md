---
title: SwiGLU, a gated feed-forward network
minutes: 8
---

The feed-forward network in the part 2 block is two linear layers with a GELU between them: expand each token's vector from $d$ to $4d$, apply the nonlinearity element by element, project back to $d$. Every hidden unit fires according to its own pre-activation and nothing else.

**SwiGLU** adds a second branch that decides how much of each hidden unit to let through. One projection produces candidate features, another produces a **gate**, the gate goes through the SiLU (also called swish) nonlinearity, and the two are multiplied element-wise. The network can now say "this feature, but only when that other pattern is present", a multiplicative interaction that a plain activation cannot express in one layer. Shazeer's experiments with gated linear unit variants found that this consistently lowered perplexity at the same parameter count, and Llama, Mistral and most open models since use it. The FFN theory is covered in [The feed-forward network](/learn/model-foundations/transformer-block); this topic is about the formula, the sizing rule and the code.

## The maths

With input $\mathbf{x} \in \mathbb{R}^d$ and hidden width $f$:

$$
\text{FFN}_{\text{GELU}}(\mathbf{x}) = W_2\,\text{GELU}(W_1 \mathbf{x}), \qquad W_1 \in \mathbb{R}^{f \times d},\; W_2 \in \mathbb{R}^{d \times f}
$$

$$
\text{FFN}_{\text{SwiGLU}}(\mathbf{x}) = W_{\text{down}}\big(\text{SiLU}(W_{\text{gate}}\mathbf{x}) \odot W_{\text{up}}\mathbf{x}\big), \qquad \text{SiLU}(z) = z\,\sigma(z) = \frac{z}{1 + e^{-z}}
$$

$\odot$ is element-wise multiplication, $\sigma$ the logistic sigmoid. SiLU is close to ReLU for large $|z|$ ($\text{SiLU}(5) \approx 4.97$, $\text{SiLU}(-5) \approx -0.03$) but smooth around 0.

```steps
One SwiGLU hidden layer with $f = 3$
**Gate pre-activations.** Suppose $W_{\text{gate}}\mathbf{x} = (2, -1, 0)$.
---
**SiLU.** $2\,\sigma(2) = 2 \times 0.881 = 1.762$; $-1 \times \sigma(-1) = -1 \times 0.269 = -0.269$; $0 \times 0.5 = 0$. Gate $= (1.762, -0.269, 0)$.
---
**Up branch.** Suppose $W_{\text{up}}\mathbf{x} = (0.5, 3, 4)$.
---
**Multiply.** $h = (1.762 \times 0.5,\; -0.269 \times 3,\; 0 \times 4) = (0.881, -0.807, 0)$. The third unit had the largest candidate value, 4, and the gate shut it off completely. $W_{\text{down}}$ then maps $h$ back to $d$ dimensions.
```

### Why the hidden size is about $\tfrac{2}{3} \cdot 4d$

SwiGLU has **three** weight matrices where the GELU FFN had two. Counting weights (ignoring biases):

$$
\underbrace{2 \cdot d \cdot 4d}_{\text{GELU, } f = 4d} = 8d^2, \qquad \underbrace{3 \cdot d \cdot f}_{\text{SwiGLU}} = 8d^2 \;\Rightarrow\; f = \frac{8d}{3} = \frac{2}{3} \cdot 4d
$$

Shrinking the hidden width by a third keeps parameters and FLOPs equal, so any quality gain is a fair comparison rather than a bigger layer. Implementations then round $f$ up to a hardware-friendly multiple. Llama-2-7B has $d = 4096$: $\tfrac{8}{3} \times 4096 = 10{,}922.7$, rounded up to the next multiple of 256 gives $f = 11{,}008$. Check: $3 \times 4096 \times 11{,}008 = 135{,}266{,}304$ against $8 \times 4096^2 = 134{,}217{,}728$, within 0.8%.

## The code

This replaces the `nn.Sequential(Linear, GELU, Linear)` FFN of the part 2 block.

```python
import torch.nn as nn
import torch.nn.functional as F

class SwiGLU(nn.Module):
    def __init__(self, d: int, hidden: int | None = None, multiple_of: int = 64):
        super().__init__()
        f = hidden or int(8 * d / 3)
        f = multiple_of * ((f + multiple_of - 1) // multiple_of)   # round up
        self.w_gate = nn.Linear(d, f, bias=False)
        self.w_up   = nn.Linear(d, f, bias=False)
        self.w_down = nn.Linear(f, d, bias=False)

    def forward(self, x):                        # x: (B, n, d)
        h = F.silu(self.w_gate(x)) * self.w_up(x)    # (B, n, f)
        return self.w_down(h)                    # (B, n, d)
```

The full version is `llm_from_scratch/part_3/swiglu.py`. Two things differ there, and both are worth noticing.

- **It does not shrink the hidden size.** The block builds `SwiGLU(n_embd, mult=4)`, so $f = 4d$ and the FFN has $3 \cdot d \cdot 4d = 12d^2$ weights, 50% more than the GELU FFN. At $d = 128$ that is 196,608 against 131,712 (the GELU version has biases). Compare the two models in that configuration and SwiGLU wins partly because it is bigger. Pass $f \approx 8d/3$ for a fair test.
- **Names.** The repo calls the plain branch `w1`, the SiLU branch `w2` and the output `w3`. Meta's Llama code uses `w1` for the gate, `w3` for the up branch and `w2` for the output. Map weights by role, not by name, when porting a checkpoint.

Biases are dropped too. Llama-style models use `bias=False` in every linear layer; the part 2 FFN kept PyTorch's default biases.

## See it

```sim
transformer-params
{"dModel": 4096, "layers": 32, "heads": 32, "kvHeads": 32, "ffnHidden": 11008, "vocab": 32000, "gated": true, "tied": false}
```

This starts at Llama-2-7B. Note the FFN's share of the parameters, then turn the gated MLP off: the FFN loses a third of its weights. Now raise the FFN width to 16,384 ($4d$) and the total climbs back to almost exactly where it was. That is the $\tfrac{2}{3}$ rule in action: gated at 11,008 and ungated at 16,384 cost the same.

## In practice

- **Memory, not just weights.** During training the FFN stores activations for backward. SwiGLU keeps two $f$-wide tensors (gate and up) instead of one $4d$-wide one, so with $f = \tfrac{8}{3}d$ activation memory rises by about a third even when parameters are matched.
- **Fusing.** `w_gate` and `w_up` read the same input, so production code often stores them as one $d \times 2f$ matrix and splits the output, one matmul instead of two.
- **Mixture of experts reuses this.** Each expert in Mixtral-style MoE is a SwiGLU FFN, so this module reappears in the [Mixture of Experts](/learn/model-foundations/mixture-of-experts) lesson.

```quiz
{"q": "A model has $d = 768$. You want a SwiGLU FFN with the same number of weights as a GELU FFN of width $4d$. What hidden size $f$ do you need (before rounding)?", "options": ["2,048", "3,072", "2,304", "1,536"], "answer": 0, "explain": "Match $3 d f = 8 d^2$, so $f = 8d/3 = 8 \\times 768 / 3 = 2{,}048$. 3,072 is $4d$, which keeps the GELU width and makes SwiGLU 50% bigger, exactly what the repo's `mult=4` does."}
```

```quiz
{"q": "A SwiGLU unit has gate pre-activation $-6$ and up-branch value 10. What does it contribute to $h$, approximately?", "options": ["About $-0.15$", "$-60$", "$0$ exactly", "$10$"], "answer": 0, "explain": "$\\text{SiLU}(-6) = -6\\,\\sigma(-6) \\approx -6 \\times 0.00247 \\approx -0.0148$, and $-0.0148 \\times 10 \\approx -0.15$. The gate nearly closes, so a large candidate becomes small. It is not exactly 0 because SiLU, unlike ReLU, is slightly negative for negative inputs; $-60$ forgets the gate's nonlinearity entirely."}
```
