---
title: "Measuring wrongness: the loss"
minutes: 8
---

Before you can improve something you need a score. A darts player gets one from the distance between the dart and the bullseye. A network gets one from a **loss function**: a formula that takes the model's prediction and the right answer and returns a single number that is zero when the prediction is perfect and grows as it gets worse.

The loss is the only thing training ever looks at. The model never "understands" that it should translate well or write good code; it only ever pushes one number down. So the choice of loss decides what the model learns. Two losses cover almost everything in this course: **mean squared error** for predicting numbers and **cross-entropy** for predicting categories, which is what a language model does every time it picks the next token.

## Mean squared error: for numbers

Suppose the model predicts a house price, a temperature or any other real number. For each example $i$ the model outputs $\hat y_i$ (read "y-hat", the prediction) and the true value is $y_i$. The **error** is $\hat y_i - y_i$. Squaring it makes every error positive and punishes big misses much more than small ones. Averaging over $N$ examples gives the **mean squared error**:

$$
\text{MSE} = \frac{1}{N} \sum_{i=1}^{N} (\hat y_i - y_i)^2
$$

```steps
MSE on three predictions
Predictions $\hat y = (2.5,\ 0.0,\ 2.1)$, targets $y = (3.0,\ -0.5,\ 2.0)$.
---
Errors: $2.5 - 3.0 = -0.5$, $\;0.0 - (-0.5) = 0.5$, $\;2.1 - 2.0 = 0.1$.
---
Squares: $0.25,\ 0.25,\ 0.01$. The small miss of $0.1$ contributes 25 times less than a miss of $0.5$, although it is only 5 times smaller.
---
Mean: $(0.25 + 0.25 + 0.01)/3 = 0.51/3 = 0.17$.
```

Why square instead of taking the absolute value? Two reasons. Squaring is smooth, so its slope is defined everywhere, which gradient descent needs (next topic). And the slope is simple: the derivative of $(\hat y - y)^2$ with respect to $\hat y$ is $2(\hat y - y)$, proportional to the error itself. A big miss produces a big correction; a tiny miss a tiny one.

## Cross-entropy: for choices

A language model does not output one number. It outputs a probability for every token in its vocabulary: "the next token is *Paris* with probability 0.7, *Lyon* with 0.2, *London* with 0.1". Squared error is a poor fit here. What we want is for the model to put high probability on the token that actually came next.

**Cross-entropy loss** does exactly that. If $p_c$ is the probability the model gave to the correct class $c$, the loss for that example is

$$
\mathcal{L} = -\ln p_c
$$

where $\ln$ is the natural logarithm. Since $0 < p_c \le 1$, $\ln p_c \le 0$, and the minus sign makes the loss positive. When $p_c = 1$ the loss is $0$; as $p_c \to 0$ the loss shoots towards infinity. The model is barely punished for being confidently right and heavily punished for being confidently wrong.

| Probability on the correct answer $p_c$ | Loss $-\ln p_c$ | Reading |
|---|---|---|
| 1.0 | 0 | perfect |
| 0.7 | 0.357 | mostly right |
| 0.2 | 1.609 | unsure |
| 0.1 | 2.303 | wrong-ish |
| 0.001 | 6.908 | confidently wrong |

With the *Paris / Lyon / London* prediction above, if the right answer is *Paris* the loss is $-\ln 0.7 = 0.357$. If the right answer was *London*, it is $-\ln 0.1 = 2.303$, more than six times larger.

The name comes from information theory: the general formula for a target distribution $y$ and prediction $p$ over $K$ classes is $\mathcal{L} = -\sum_{k=1}^{K} y_k \ln p_k$. With a **one-hot** target (1 for the right class, 0 elsewhere) every term vanishes except the correct class, which gives back $-\ln p_c$.

```callout-math
From scores to probabilities, and a beautiful gradient
Networks output raw scores called **logits** $z_k$. The **softmax** turns them into probabilities: $p_k = e^{z_k} / \sum_j e^{z_j}$. For logits $(2, 1, 0)$: $e^2 = 7.389$, $e^1 = 2.718$, $e^0 = 1$, sum $11.107$, so $p = (0.665, 0.245, 0.090)$. If class 0 is correct the loss is $-\ln 0.665 = 0.408$. Combining softmax with cross-entropy, the derivative with respect to each logit is simply $p_k - y_k$: here $(0.665 - 1,\ 0.245,\ 0.090) = (-0.335,\ 0.245,\ 0.090)$. Raise the correct logit, lower the others, each in proportion to how wrong it was.
```

## See it

A neuron is the thing being scored. In the sim below, the output with the default settings is $0.9$. If the target for this input were $1.0$, the squared error would be $(0.9 - 1.0)^2 = 0.01$.

```sim
neuron
{"x1": 1, "x2": -0.5, "w1": 1.2, "w2": 0.8, "b": 0.1, "act": "relu"}
```

Pick a target in your head, say $y = 2$. Work out the squared error at the starting output, then move $w_1$ until the output reaches 2. You have just done what training does: change knobs to make the loss zero. Note how many different knob settings reach the same output. That is why the loss needs many examples, not one, to pin the weights down.

## In practice

- **The starting loss tells you something.** A freshly initialised language model spreads probability roughly evenly over its vocabulary $V$, so $p_c \approx 1/V$ and the loss is about $\ln V$. For GPT-2's $V = 50{,}257$ that is $\ln 50{,}257 \approx 10.82$. If your first logged loss is far above that, something is broken (exploding initialisation, wrong labels).
- **Loss is reported per token, averaged.** "The model reached a loss of 2.0" means the average of $-\ln p_c$ over all predicted tokens. You will meet its exponential, **perplexity** $e^{\mathcal{L}}$, in the sampling lesson: a loss of 2.0 means a perplexity of $e^2 \approx 7.4$, as if the model were choosing among about 7 equally likely tokens.
- **A common mistake** is computing $\ln$ of a softmax output that underflowed to exactly 0, which gives infinity. Libraries avoid this by computing cross-entropy straight from the logits ("log-softmax"); always use the fused function rather than doing softmax then log yourself.

```quiz
{"q": "A classifier gives the correct class probability 0.25. What is its cross-entropy loss on this example?", "options": ["0.25", "1.386", "0.602", "0.75"], "answer": 1, "explain": "$-\\ln 0.25 = \\ln 4 \\approx 1.386$. 0.602 is $-\\log_{10} 0.25$: cross-entropy in ML uses the natural log. 0.75 is $1 - p$, which is not the loss."}
```

```quiz
{"q": "Model A predicts $(\\hat y) = (1, 1)$ and model B predicts $(0, 2)$ for targets $(1, 3)$. Which has the lower MSE?", "options": ["A, with MSE 2", "B, with MSE 1", "They are equal", "A, with MSE 1"], "answer": 1, "explain": "A: errors $0, -2$, squares $0, 4$, mean 2. B: errors $-1, -1$, squares $1, 1$, mean 1. Squaring makes one big miss cost more than two small ones, so B wins even though both have the same total absolute error of 2."}
```
