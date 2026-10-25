---
title: Entropy: how unsure is the model right now?
minutes: 7
---

Look at two next-token distributions. In one, a single token has 95% and the rest share 5%. In the other, ten tokens each have about 10%. Both have the same top-token probability ranking, but they describe very different states of mind: the first model is sure, the second is choosing among ten equally good options. You want one number that tells these apart. That number is **entropy**.

Entropy measures how spread out a distribution is: how much uncertainty there is about which token comes next. It is the expected amount of surprise, and it underlies almost every quality number you will meet for language models, including cross-entropy loss and perplexity.

## Surprise, then its average

The **surprise** (or information content) of seeing a token with probability $p$ is

$$
s(p) = -\log_2 p \quad \text{bits}
$$

A certain event ($p = 1$) carries 0 bits of surprise. A coin flip ($p = 0.5$) carries 1 bit. A 1-in-8 event carries 3 bits. Rare events are surprising, and the log makes surprises of independent events add up.

**Entropy** is the average surprise when tokens are drawn from the distribution itself:

$$
H(p) = -\sum_{i=1}^{V} p_i \log_2 p_i
$$

$p_i$ is the probability of token $i$ and $V$ the vocabulary size. Using $\log_2$ gives bits; using the natural log $\ln$ gives **nats** (1 nat = 1.443 bits). Training losses are reported in nats because frameworks use $\ln$.

Two reference points: a distribution with all mass on one token has $H = 0$. A uniform distribution over $m$ tokens has $H = \log_2 m$, the maximum possible for $m$ options. For GPT-2's vocabulary of 50,257 tokens, the ceiling is $\log_2 50257 \approx 15.6$ bits.

## Worked example

Use the familiar distribution at $T = 1$: $(0.609, 0.224, 0.136, 0.030)$.

| token | $p_i$ | surprise $-\log_2 p_i$ | contribution $p_i \cdot (-\log_2 p_i)$ |
|---|---|---|---|
| " Paris" | 0.609 | 0.715 | 0.436 |
| " the" | 0.224 | 2.158 | 0.483 |
| " a" | 0.136 | 2.878 | 0.392 |
| " Lyon" | 0.030 | 5.059 | 0.152 |
| **total** | | | **$H = 1.46$ bits** |

The maximum for four tokens is $\log_2 4 = 2$ bits, so this distribution is moderately confident. A useful translation is $2^{H}$, the **effective number of choices**: $2^{1.46} \approx 2.76$. The model behaves as if it were choosing uniformly among about 2.8 tokens.

Temperature moves entropy directly. Computing the same table for the other temperatures:

| $T$ | probabilities | $H$ (bits) | effective choices $2^H$ |
|---|---|---|---|
| 0.5 | 0.842, 0.114, 0.042, 0.002 | 0.78 | 1.7 |
| 1.0 | 0.609, 0.224, 0.136, 0.030 | 1.46 | 2.8 |
| 2.0 | 0.434, 0.263, 0.205, 0.097 | 1.83 | 3.5 |
| ∞ | 0.25 each | 2.00 | 4 |

As $T \to 0$, entropy goes to 0 (greedy); as $T \to \infty$, it climbs to the uniform maximum.

## See it

```sim
sampling
{"temperature": 0.2, "topP": 1}
```

Read the entropy shown by the simulation at temperature 0.2. Raise temperature in steps of 0.3 up to 2 and write down the entropy each time: it rises steadily but never past $\log_2$ of the number of candidate tokens. Then, at temperature 1, set top-p to 0.5. Entropy drops because truncation removes the tail, and the tail contributes surprise out of proportion to its probability (look at " Lyon" above: 3% of the mass, 10% of the entropy).

## Entropy and loss are the same family

The cross-entropy loss used to train language models is the average surprise of the *correct* next token under the model's distribution:

$$
\mathcal{L} = -\frac{1}{n}\sum_{t=1}^{n} \ln p_\theta(x_t \mid x_{<t})
$$

where $x_t$ is the true token at position $t$, $x_{<t}$ the tokens before it, $p_\theta$ the model with parameters $\theta$, and $n$ the number of predicted tokens. Entropy averages surprise over the model's own guesses; cross-entropy averages it over what actually happened. A well-trained model's entropy and its cross-entropy on real text end up close; if the model is confidently wrong, cross-entropy is much higher than entropy.

## In practice

Per-token entropy is a cheap, useful signal, available from the logprobs an API returns. High-entropy spans in an answer often mark where the model was unsure: a date, a name, a number. Some teams flag answers whose key spans have high entropy for review or retrieval. It is a signal, not a guarantee: a model can have low entropy and still be wrong, if it learned the wrong fact confidently.

```quiz
{"q": "A next-token distribution puts 0.5 on one token and 0.25 on each of two others. What is its entropy in bits?", "options": ["1.0 bit", "1.5 bits", "2.0 bits", "0.5 bits"], "answer": 1, "explain": "$H = 0.5 \\cdot 1 + 0.25 \\cdot 2 + 0.25 \\cdot 2 = 1.5$ bits, since $-\\log_2 0.5 = 1$ and $-\\log_2 0.25 = 2$. 2.0 bits would need four equally likely tokens; 1.0 bit is a fair coin."}
```

```quiz
{"q": "A model's entropy on a step is near 0, but the token it chose is wrong. What does this tell you?", "options": ["The sampler must be broken", "The model was confidently wrong: low entropy measures certainty, not correctness", "Temperature was set too high", "Entropy cannot be near 0 for a wrong token"], "answer": 1, "explain": "Entropy is computed from the model's own distribution and knows nothing about the truth. Confident errors show up as low entropy but high cross-entropy (large surprise at the correct token). High temperature would raise entropy, not lower it."}
```
