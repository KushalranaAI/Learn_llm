---
title: The feed-forward network
minutes: 8
---

Attention moves information *between* positions. The **feed-forward network** (FFN, also called the MLP) is the other half of every block, and it does the opposite: it works on each position *on its own*, applying the same small two-layer network to every token vector independently. If attention is the meeting where tokens exchange notes, the FFN is each token going back to its desk to think about what it heard.

The [Transformer Block](/learn/model-foundations/transformer-block) lesson covers why the FFN exists and how much of the model it holds. In code it is the simplest component in the whole architecture: widen the vector by a factor of 4, apply a nonlinearity, narrow it back. Three lines inside an `nn.Sequential`.

Its importance is out of proportion to its simplicity. In a GPT-2 style model the FFN holds two thirds of each block's parameters, and much of what a model "knows" is thought to be stored in these weights.

## In everyday life

At a clinic, the receptionist first collects a short card for each patient: name, age and a line about the complaint. Then the nurse asks a long list of questions about that one patient. Do you have a fever? Is the pain sharp? Since when? Each answer is a soft yes or no, and the nurse boils them down into a short note that fits on a card of the same size. Each patient is handled alone, with the same questions for everyone. One patient's answers never change the next patient's note.

The **feed-forward network** (FFN) is this step. After attention has let the tokens exchange information, the FFN works on each token's vector by itself. It first widens the vector into a much longer list, like the long questionnaire, which gives the model room to ask many small questions. Then a **nonlinearity**, a rule that lets weak signals fade and strong ones pass, acts like the soft yes or no. This lesson uses one called **GELU**. Finally it narrows the list back to the original size.

Much of what a model knows is thought to be stored in these weights.

**Where you meet it.** Every block of a chatbot's model has one. After attention gathers context for the word "capital" in "the capital of France is", the feed-forward step turns it into features for the next word, which is where stored facts are thought to live. Without it, a block could only mix tokens, never transform each one.

```scene
title: A clinic's patient questionnaire
step: 🧾 A patient arrives with a short summary card | One token vector
step: 📋 The nurse asks a long list of questions about this patient | Widen with the first linear layer
step: 🙂 Each answer is a soft yes or no, and weak ones fade | The GELU nonlinearity
step: 📝 The nurse boils the answers down to a note the size of the card | Narrow back with the second layer
step: 🚪 The next patient gets the same questions, answered separately | Same weights, each position independent
takeaway: The feed-forward network widens, filters and narrows each token's vector on its own.
```

## The maths

For one token vector $\mathbf{x} \in \mathbb{R}^{d}$:

$$
\text{FFN}(\mathbf{x}) = W_2\, \text{GELU}(W_1 \mathbf{x} + \mathbf{b}_1) + \mathbf{b}_2, \qquad W_1 \in \mathbb{R}^{4d \times d},\ W_2 \in \mathbb{R}^{d \times 4d}
$$

The hidden width $4d$ is the **expansion factor** (the repo's `mult`) times $d$. **GELU** is a smooth version of ReLU:

$$
\text{GELU}(x) = x \cdot \Phi(x)
$$

where $\Phi$ is the standard normal cumulative distribution: the probability that a standard normal variable is below $x$. Large positive inputs pass almost unchanged ($\Phi \approx 1$), large negative inputs go to almost 0, and the region around zero is curved rather than kinked.

**Worked example, GELU.** $\Phi(1) = 0.8413$, so $\text{GELU}(1) = 0.8413$. By symmetry $\Phi(-1) = 0.1587$, so $\text{GELU}(-1) = -0.1587$: unlike ReLU, a small negative output survives. $\text{GELU}(0.5) = 0.5 \times 0.6915 = 0.3457$, and $\text{GELU}(2) = 2 \times 0.9772 = 1.9545$.

| $x$ | −2 | −1 | −0.5 | 0.5 | 1 | 2 |
|---|---|---|---|---|---|---|
| ReLU | 0 | 0 | 0 | 0.5 | 1 | 2 |
| GELU | −0.0455 | −0.1587 | −0.1543 | 0.3457 | 0.8413 | 1.9545 |

**Worked example, parameters.** $W_1$ has $d \cdot 4d$ weights and $4d$ biases; $W_2$ has $4d \cdot d$ weights and $d$ biases. Total $8d^2 + 5d$. For $d = 768$: $8 \times 589{,}824 + 3{,}840 = 4{,}718{,}592 + 3{,}840 = 4{,}722{,}432$. Compare attention's $4d^2 = 2{,}359{,}296$: the FFN is twice as large.

## The code

```python
import torch.nn as nn

class FeedForward(nn.Module):
    def __init__(self, d: int, mult: int = 4, dropout: float = 0.0):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(d, mult * d),        # (B, n, d)    -> (B, n, 4d)
            nn.GELU(),                     # elementwise, shape unchanged
            nn.Linear(mult * d, d),        # (B, n, 4d)   -> (B, n, d)
            nn.Dropout(dropout),
        )

    def forward(self, x):                  # x: (B, n, d)
        return self.net(x)                 # (B, n, d)
```

Because `nn.Linear` acts on the last axis only (topic 1), no reshaping is needed: every one of the $B \cdot n$ token vectors goes through the same weights. The full version is `llm_from_scratch/part_1/ffn.py`.

A quick property test makes the "per position" claim concrete. Change token 3 of a sequence and run the FFN again: only output row 3 changes. Run the same test on the attention layer and every later row changes too.

```python
ffn = FeedForward(d=16)
x = torch.randn(1, 5, 16)
x2 = x.clone(); x2[0, 3] += 1.0                     # perturb token 3 only
diff = (ffn(x) - ffn(x2)).abs().sum(-1)             # (1, 5) change per position
print(diff)   # non-zero only at index 3
```

## See it

```sim
transformer-params
{"dModel": 768, "layers": 12, "heads": 12, "kvHeads": 12, "ffnHidden": 3072, "vocab": 50257, "gated": false, "tied": true}
```

These are GPT-2 small's settings. Read the "In MLPs" metric: about 46% of all parameters sit in the FFNs, twice attention's 23%, with most of the rest in the embedding table. Now drag the FFN hidden size from 3,072 down to 1,536 ($2d$) and watch the total fall by about 28M. Then switch "Gated MLP" on, which models the SwiGLU variant with three matrices instead of two.

## In practice

- **The 4 is a convention, not a law.** GPT-2 and GPT-3 use $4d$. Llama-style models use SwiGLU with three matrices and a hidden size near $\tfrac{8}{3}d$ so the parameter count stays close to $8d^2$; Llama-2-7B uses $11{,}008$ for $d = 4{,}096$.
- **GELU has two forms.** `nn.GELU()` computes the exact $x\Phi(x)$; `nn.GELU(approximate="tanh")` uses the tanh formula from the original GPT-2 code. They differ by about $10^{-4}$, enough to fail a strict `allclose` when loading GPT-2 weights into your own model.
- **The FFN dominates compute too.** Per token, a linear layer costs about 2 FLOPs per weight, so the FFN's $8d^2$ weights cost about $16d^2$ FLOPs per token per layer, versus $8d^2$ for the attention projections. Only at long context does the $n^2$ score computation catch up.

```quiz
{"q": "A block has $d = 512$ and an FFN with expansion factor 4 and biases. How many parameters does the FFN have?", "options": ["$2{,}099{,}712$", "$2{,}097{,}152$", "$1{,}048{,}576$", "$8{,}388{,}608$"], "answer": 0, "explain": "$8d^2 + 5d = 8 \\times 262{,}144 + 2{,}560 = 2{,}097{,}152 + 2{,}560 = 2{,}099{,}712$: two $512 \\times 2048$ matrices plus biases of size 2,048 and 512. $2{,}097{,}152$ forgets the biases; $1{,}048{,}576$ counts only one matrix."}
```

```quiz
{"q": "You perturb the vector of token 2 (of 6) and pass the sequence through a single FeedForward module. Which output positions change?", "options": ["Only position 2", "Positions 2 to 6", "All six positions", "None, because GELU saturates"], "answer": 0, "explain": "The FFN applies the same weights to each position independently, with no interaction across the sequence axis, so only row 2 changes. 'Positions 2 to 6' is what a causal attention layer would show: later tokens read token 2 through attention, earlier ones cannot."}
```
