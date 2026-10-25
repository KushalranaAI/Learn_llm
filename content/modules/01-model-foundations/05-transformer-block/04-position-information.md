---
title: Where am I? Position information
minutes: 8
---

"Dog bites man" and "man bites dog" use the same three words. Only the order differs, and the order is the whole story. Yet attention, as defined so far, cannot see order. Each token compares its query with every key and takes a weighted average of the values. Shuffle the tokens and you shuffle the outputs in exactly the same way, but no output changes value. Attention treats its input as a *set*.

Formally, attention is **permutation-equivariant**. Reorder the input rows with a permutation $P$ and the output rows reorder with the same $P$: $\text{Attn}(PX) = P\,\text{Attn}(X)$. The causal mask adds a little order (a token can see only earlier tokens), but the model still could not tell "two tokens back" from "two hundred tokens back". So position has to be injected explicitly. There are three main ways to do it.

## 1. Learned absolute positions (GPT-2)

Keep a second embedding table with one learned vector per position, $P \in \mathbb{R}^{n_{\max} \times d}$, and add it to the token embedding:

$$
\mathbf{x}_0^{(p)} = E[\text{token}_p] + P[p]
$$

GPT-2 small has $n_{\max} = 1{,}024$ and $d = 768$, so this table is $1024 \times 768 = 786{,}432$ parameters. It is simple and effective, but the model has no vector at all for position 1,025. The context length is a hard limit built into the weights.

## 2. Sinusoidal positions (original transformer)

Instead of learning $P$, compute it with waves of geometrically spaced frequencies:

$$
P[p, 2i] = \sin\!\left(\frac{p}{10000^{2i/d}}\right), \qquad P[p, 2i+1] = \cos\!\left(\frac{p}{10000^{2i/d}}\right)
$$

Here $p$ is the position, $i$ indexes pairs of dimensions, and 10000 is a fixed base. Low dimensions oscillate fast and high dimensions slowly, like the second, minute and hour hands of a clock. Together they give every position a unique pattern with no parameters.

## 3. Rotary position embeddings (RoPE, Llama and most modern LLMs)

RoPE adds nothing to the stream. Instead it **rotates** each query and key just before the attention dot product. Split $\mathbf{q}$ and $\mathbf{k}$ into pairs of coordinates and rotate pair $i$ of a token at position $m$ by the angle $m\theta_i$, where $\theta_i = \text{base}^{-2i/d_h}$. In two dimensions:

$$
R(m\theta) = \begin{pmatrix} \cos m\theta & -\sin m\theta \\ \sin m\theta & \cos m\theta \end{pmatrix}, \qquad \text{score} = \big(R(m\theta)\mathbf{q}\big)^{\top}\big(R(n\theta)\mathbf{k}\big) = \mathbf{q}^{\top} R\big((n-m)\theta\big)\,\mathbf{k}
$$

Rotations compose by adding angles, so the score depends only on the **offset** $n - m$, not on where the pair sits in absolute terms. Attention becomes naturally **relative**: "the word two before me" means the same thing at position 10 as at position 10,000.

```steps
RoPE on a 2-D query and key, $\theta = 0.5$ rad
Let $\mathbf{q} = \mathbf{k} = (1, 0)$. Query at position $m = 3$, key at position $n = 2$.
---
Rotate the query by $3 \times 0.5 = 1.5$ rad: $(\cos 1.5, \sin 1.5) = (0.0707, 0.9975)$. Rotate the key by $1.0$ rad: $(\cos 1.0, \sin 1.0) = (0.5403, 0.8415)$.
---
Dot product: $0.0707 \times 0.5403 + 0.9975 \times 0.8415 = 0.0382 + 0.8394 = 0.8776$.
---
Now move both one step earlier: query at 1, key at 0. Query $(\cos 0.5, \sin 0.5) = (0.8776, 0.4794)$, key $(1, 0)$. Dot product $= 0.8776$.
---
Same score, because the offset is 1 in both cases: $\cos(0.5) = 0.8776$. Only relative position entered the score.
```

## Comparison

| Scheme | Parameters | Where applied | Relative by construction | Used by |
|---|---|---|---|---|
| Learned absolute | $n_{\max} \cdot d$ | added to embeddings | no | GPT-2 |
| Sinusoidal | 0 | added to embeddings | partly | original transformer |
| RoPE | 0 | rotates $\mathbf{q}, \mathbf{k}$ in every layer | yes | Llama, most open LLMs |

## See it

```sim
transformer-params
```

Compare a configuration with learned positions against one without them. The position table appears as its own line, and it grows with the maximum context. RoPE adds no line at all, because it has no parameters.

## In practice

- **Context extension.** A model trained with RoPE at 4,096 tokens has never seen rotation angles beyond that range. Pushing it to 32,000 tokens without adjustment usually degrades it badly. Methods such as position interpolation rescale positions, or change the RoPE base, so long inputs map onto angles the model knows, often followed by a short fine-tune on long documents.
- **Advertised versus effective context.** A model accepting $n$ tokens does not mean it uses all of them equally well. Retrieval of facts from the middle of long contexts is often weaker (see the lesson on context windows).
- **Mismatch bugs.** Loading weights with the wrong RoPE base or a different pairing convention (interleaved versus split halves) produces a model that runs but generates nonsense. It is one of the first things to check when a converted checkpoint misbehaves.

```quiz
{"q": "With RoPE in 2-D, $\\mathbf{q} = \\mathbf{k} = (1, 0)$ and $\\theta = 0.5$ rad, what is the attention score between a query at position 7 and a key at position 5?", "options": ["$\\cos(1.0) \\approx 0.540$", "$\\cos(6.0) \\approx 0.960$", "$1.0$", "$\\cos(3.5) \\approx -0.936$"], "answer": 0, "explain": "The score depends only on the offset: $(7 - 5) \\times 0.5 = 1.0$ rad, and $\\cos 1.0 \\approx 0.540$. Adding the positions ($12 \\times 0.5 = 6$) is the tempting error; rotations of query and key cancel, leaving their difference."}
```

```quiz
{"q": "You shuffle the order of the tokens fed to an attention layer that has no position information and no mask. What happens to the outputs?", "options": ["The same output vectors come out, shuffled in the same order", "All outputs become identical", "The outputs change values because the softmax changes", "The layer raises an error"], "answer": 0, "explain": "Attention is permutation-equivariant: each token still sees the same set of keys and values, so its output is unchanged. It just appears at its new position. That is exactly why position must be added."}
```
