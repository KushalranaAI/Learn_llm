---
title: Sampler settings in production
minutes: 7
---

Real decoding uses a few more controls than temperature and top-p. Penalties discourage repetition, stop sequences and token limits end generation, and seeds make sampling repeatable. Each one is a small edit to the logits or to the loop, and each has a failure mode worth knowing before you ship.

This topic also answers a question every engineer meets in the first week: why does the same prompt give a different answer each time, and how different should you expect it to be?

## Why outputs differ: a calculation

Two independent samples from a distribution $p$ pick the same token with probability

$$
P(\text{agree}) = \sum_{i} p_i^2
$$

because both must pick token $i$ (probability $p_i \cdot p_i$), summed over all $i$. For the distribution $(0.609, 0.224, 0.136, 0.030)$ at $T = 1$:

$$
0.609^2 + 0.224^2 + 0.136^2 + 0.030^2 = 0.371 + 0.050 + 0.018 + 0.001 = 0.440
$$

Two runs agree on this one token only 44% of the time. At $T = 0.5$, with $(0.842, 0.114, 0.042, 0.002)$, it rises to $0.724$.

Over a whole answer it compounds. If two runs agree on each token with probability 0.95, the chance that they agree on all of the first 20 tokens is $0.95^{20} = 0.36$. Even a very confident model at moderate temperature will usually produce different wording each time. (Once two runs diverge they condition on different text, so agreement after that point is not independent; the point is only how fast the paths split.) If you need the same answer every time, sampling at $T > 0$ is the wrong tool: use temperature 0, or sample several times and take a vote.

## Penalties for repetition

Language models trained on human text still fall into loops, especially at low temperature. Two widely used penalties subtract from the logits of tokens already generated:

$$
z_i' = z_i - \alpha \cdot c_i - \beta \cdot \mathbb{1}[c_i > 0]
$$

$z_i$ is the original logit of token $i$, $c_i$ the number of times token $i$ has appeared so far, $\alpha$ the **frequency penalty** (grows with each repeat), $\beta$ the **presence penalty** (a flat cost once a token has appeared at all), and $\mathbb{1}[\cdot]$ is 1 if the condition holds and 0 otherwise.

Worked example: a token with logit $2.0$ has already appeared 3 times; $\alpha = 0.5$, $\beta = 0.5$. Then $z' = 2.0 - 0.5 \times 3 - 0.5 = 0.0$. Its probability relative to an untouched rival is now $e^{-2} \approx 0.14$ times what it was.

A different form, the multiplicative **repetition penalty** used in many open-source libraries, divides positive logits (and multiplies negative ones) of previously seen tokens by a factor such as 1.1 to 1.3.

```callout-warn
Penalties do not understand meaning
A penalty applies to tokens, not ideas. Strong penalties stop a model from repeating " the", a variable name in code, or a required JSON key, and the output breaks. Keep them mild, and turn them off for code and structured output.
```

## Stopping

Generation ends when the model emits its **end-of-sequence** token, when output reaches a **max tokens** limit, or when a **stop sequence** you supplied appears. Max tokens is a hard cut: the answer is truncated mid-sentence and APIs report a "length" finish reason. Always check that finish reason; a truncated JSON object is invalid JSON, and it is a frequent production bug.

## Beam search, briefly

**Beam search** keeps the $b$ highest-probability partial sequences at each step instead of one, and returns the most probable complete sequence. It finds higher-likelihood text than greedy and works well for translation and speech recognition, where there is roughly one right output. For open-ended generation it tends to make text more repetitive and generic, which is the observation that motivated nucleus sampling. Chat LLMs almost always use sampling or greedy.

## See it

```steps
One decoding step with every control
Start from logits for the candidate tokens.
---
Subtract penalties from tokens already generated: $z_i' = z_i - \alpha c_i - \beta \mathbb{1}[c_i > 0]$.
---
Divide by temperature and apply softmax.
---
Apply top-k, then top-p, and renormalise.
---
Draw a token using the random generator (seeded, if you set a seed).
---
Check for end-of-sequence, a stop sequence, or the max-tokens limit; otherwise append and repeat.
```

```sim
sampling
{"temperature": 0.7, "topP": 0.95}
```

These are common chat defaults. Sample with three different seeds and compare the continuations: note where they first diverge. Then rerun with one seed twice: same seed, same parameters, same output. Finally set temperature to 0 and confirm that the seed no longer matters.

## Settings by task

| Use case | Temperature | Top-p | Penalties | Notes |
|---|---|---|---|---|
| JSON extraction, classification | 0 | 1 | off | Pair with constrained decoding for valid structure |
| Code generation | 0 to 0.2 | 0.95 | off | Penalties corrupt repeated identifiers |
| Support chat | 0.3 to 0.7 | 0.9 to 0.95 | mild | Consistency matters more than flair |
| Brainstorming, many candidates | 0.9 to 1.1 | 0.95 | mild presence | You want diverse samples, then a filter |

## In practice

Treat sampler settings as part of the prompt: version them, log them with every request, and evaluate with them fixed. A change from temperature 0.2 to 0.7 can shift an evaluation score as much as a prompt rewrite. And when you evaluate a sampled system, run each test case several times; a single run hides the variance computed above.

```quiz
{"q": "A distribution over next tokens is (0.8, 0.2). What is the probability that two independent samples choose the same token?", "options": ["0.80", "0.68", "0.64", "1.00"], "answer": 1, "explain": "$P(\\text{agree}) = 0.8^2 + 0.2^2 = 0.64 + 0.04 = 0.68$. Answering 0.64 counts only the case where both pick the favourite and forgets both picking the second token."}
```

```quiz
{"q": "A JSON-generating endpoint uses frequency penalty 1.0. Outputs are sometimes missing repeated keys like \"id\" in a list of objects. What is the most likely fix?", "options": ["Raise the temperature", "Remove the frequency penalty for structured output", "Increase max tokens", "Use top-k = 1"], "answer": 1, "explain": "The penalty lowers the logit of every token already seen, including keys and punctuation that must repeat in valid JSON. Remove it (and use temperature 0 or constrained decoding). Raising max tokens helps only when the finish reason is 'length'."}
```

```lab
tune-the-sampler
```
