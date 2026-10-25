---
title: Why tokens need to read each other
minutes: 6
---

```callout-before
Before you start
You should know that each token enters the model as a vector of $d$ numbers (its embedding) and what a dot product measures. Both come from the embeddings lesson.
```

Read this sentence: "The trophy did not fit in the suitcase because **it** was too big." What does "it" refer to? You answered by looking back at "trophy", "suitcase" and "big" and weighing them. Change "big" to "small" and the answer flips to the suitcase. The meaning of a token depends on other tokens, sometimes far away, and which ones matter depends on the sentence.

After the embedding lookup, each position holds a vector that knows only its own token. To predict the next word well, the vector at "it" must collect information from "trophy" or "suitcase". **Attention** is the mechanism that does this: each position computes how relevant every other position is, turns those relevance scores into weights that add up to 1, and takes a weighted average of information from the positions it finds relevant.

## The idea as one equation

Suppose position $i$ has relevance scores $s_{i1}, \dots, s_{in}$ for the $n$ positions in the context. Attention turns scores into weights with the **softmax** function and averages some vectors $\mathbf{v}_j$ with those weights:

$$
\alpha_{ij} = \frac{e^{s_{ij}}}{\sum_{k=1}^{n} e^{s_{ik}}}, \qquad \mathbf{o}_i = \sum_{j=1}^{n} \alpha_{ij}\, \mathbf{v}_j
$$

Here $\alpha_{ij}$ is the **attention weight** from position $i$ to position $j$, and $\mathbf{o}_i$ is the output at position $i$. Softmax makes every weight positive (the exponential is never negative) and makes each row sum to $1$ (dividing by the total). So $\mathbf{o}_i$ is a genuine average, tilted toward the positions with the largest scores.

```steps
Softmax and a weighted average, by hand
Position "it" scores three earlier tokens: trophy $s = 2$, suitcase $s = 1$, because $s = 0$.
---
Exponentiate: $e^{2} \approx 7.389$, $e^{1} \approx 2.718$, $e^{0} = 1$. Total $\approx 11.107$.
---
Divide: weights $\approx 0.665, 0.245, 0.090$. They sum to $1$.
---
If the value vectors are trophy $(1, 0)$, suitcase $(0, 1)$, because $(0, 0)$, the output is $0.665\,(1,0) + 0.245\,(0,1) + 0.090\,(0,0) = (0.665, 0.245)$: mostly "trophy", a little "suitcase".
```

Two properties make this the right tool. It is **differentiable**, so gradient descent can learn what the scores should be. And it is **content-based**: the weights depend on what the tokens are, not on fixed positions, so the same mechanism can link "it" to a word three tokens back or three hundred.

## Why not something simpler?

| Approach | What goes wrong |
|---|---|
| Use each token's vector alone | "it" never learns what it refers to |
| Average all previous tokens equally | relevant and irrelevant tokens get the same say; signal drowns in long contexts |
| Fixed window of the last $k$ tokens | anything further back is invisible |
| Recurrent network carrying a running state | information must survive many sequential steps, and steps cannot run in parallel during training |
| Attention | every position reaches every allowed position in one step, with learned, content-dependent weights |

The last row is why the 2017 transformer paper could drop recurrence entirely. The price, which you will compute at the end of this lesson, is that every position compares with every other, so cost grows with $n^2$.

## See it

```sim
attention-heatmap
```

Each row of the heatmap is one position's attention weights over the sentence; each row sums to 1. Pick a pronoun row and see which earlier words it attends to. Then switch head presets: different heads look for different things, which is the subject of the multi-head topic.

## In practice

Attention weights are tempting to read as explanations ("the model looked at *trophy*"). Use them carefully. A large weight shows where information was *gathered* in one head of one layer, not why the model produced its final answer; information is mixed across dozens of layers and heads. Treat heatmaps as a debugging aid, not as proof.

```quiz
{"q": "Three scores are $s = (0, 0, \\ln 2)$. What are the softmax weights?", "options": ["$(0.25, 0.25, 0.5)$", "$(0, 0, 1)$", "$(1/3, 1/3, 1/3)$", "$(0.5, 0.5, 0)$"], "answer": 0, "explain": "$e^0 = 1$, $e^0 = 1$, $e^{\\ln 2} = 2$; total $4$; weights $1/4, 1/4, 2/4$. Softmax never gives exactly 0 or 1 for finite scores, so $(0,0,1)$ is the hard argmax, not softmax."}
```

```quiz
{"q": "Why must attention weights for a position sum to 1?", "options": ["So the output is a weighted average of value vectors, staying on the same scale however long the context is", "So the model can only attend to one token", "Because dot products are always between 0 and 1", "So that gradients are zero"], "answer": 0, "explain": "Normalising makes $\\mathbf{o}_i$ an average: with 10 or 10,000 positions the output stays on the scale of the value vectors. It does not force attention onto one token (that would be argmax), and raw dot products can be any real number."}
```
