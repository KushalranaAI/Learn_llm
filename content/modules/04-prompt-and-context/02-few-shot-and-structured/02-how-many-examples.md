---
title: How many examples are worth their tokens
minutes: 8
---

Every few-shot example is text the model re-reads on every request. A 150-token example costs almost nothing once, and a lot over a million calls. Meanwhile, its benefit shrinks as you add more: the third example teaches less than the first, and the tenth teaches less than the third. So there is an optimum, and you can find it with a spreadsheet instead of a hunch.

The trade-off has three ingredients:

- **Accuracy as a function of $k$**, written $a(k)$: measured on a golden set, typically rising quickly and then flattening.
- **Token cost per example**: example length times the input price, paid on every call.
- **Cost of an error**: what a wrong answer costs you downstream (a human review, a refund, a lost customer). This is the number teams most often forget to estimate, and it decides the answer.

## The maths: expected cost per call

Let each example be $\ell$ tokens, the input price $p_{\text{in}}$ per token, and the cost of one error $e$. The expected cost per call attributable to the examples and the errors they prevent is

$$
J(k) = \underbrace{k \,\ell\, p_{\text{in}}}_{\text{example tokens}} + \underbrace{\big(1 - a(k)\big)\, e}_{\text{expected error cost}}
$$

Choose $k$ to minimise $J(k)$. Equivalently, add an example only while its marginal benefit $\big(a(k{+}1) - a(k)\big)\,e$ exceeds its marginal cost $\ell\, p_{\text{in}}$.

Worked example with $\ell = 150$ tokens, a hypothetical $p_{\text{in}} = \$3$ per 1M tokens (so one example costs $150 \times 3\times10^{-6} = \$0.00045$ per call), and an error cost $e = \$0.02$ (a quick human review):

| $k$ | $a(k)$ (measured) | Example cost $0.00045\,k$ | Error cost $(1-a)\times 0.02$ | $J(k)$ |
|---|---|---|---|---|
| 0 | 0.800 | \$0.00000 | \$0.00400 | \$0.00400 |
| 2 | 0.880 | \$0.00090 | \$0.00240 | **\$0.00330** |
| 4 | 0.910 | \$0.00180 | \$0.00180 | \$0.00360 |
| 8 | 0.920 | \$0.00360 | \$0.00160 | \$0.00520 |
| 16 | 0.922 | \$0.00720 | \$0.00156 | \$0.00876 |

Two examples win. Going from 2 to 4 buys 3 points of accuracy, worth $0.03 \times 0.02 = \$0.0006$, but costs $\$0.0009$ in tokens. At 100,000 calls a day, the choice between $k = 2$ and $k = 16$ is \$330 versus \$876 per day, for less than 5 points of accuracy.

Now change one input. If an error costs $e = \$0.50$ (say, a wrong medical-billing code that triggers a manual audit), the error term dominates: $J(2) = 0.0009 + 0.12 \times 0.5 = 0.0609$ while $J(8) = 0.0036 + 0.08 \times 0.5 = 0.0436$ and $J(16) = 0.0072 + 0.078 \times 0.5 = 0.0462$. The optimum moves to $k = 8$. The right number of examples depends on what mistakes cost, not just on the accuracy curve.

```steps
Running the calculation on your own task
Build a golden set of at least a few hundred labelled inputs that look like production traffic.
---
Measure $a(k)$ for $k = 0, 1, 2, 4, 8$ with a fixed, sensible choice of examples. Run each setting on the same inputs.
---
Measure the average example length $\ell$ with your tokenizer and look up your input price.
---
Estimate $e$ from what an error triggers downstream. A rough figure within a factor of two is enough.
---
Compute $J(k)$ for each $k$ and pick the minimum. Remember the confidence interval on $a(k)$: with 300 cases, a 1-point difference is noise (Lesson 5 shows how to check).
```

## Things the formula hides

- **Latency.** Extra input tokens lengthen prefill. A few hundred tokens rarely matter; thousands of tokens of examples can add noticeable time to first token on large models.
- **Caching.** If the examples are a fixed block in a stable prefix, prompt caching can make their marginal token cost a fraction of the list price. Dynamically selected examples (next topic) change per request and usually cannot be cached, which shifts the optimum toward fewer, better-chosen examples.
- **Context space.** In a retrieval system, every token of examples is a token not available for documents. [Choosing Context](/learn/prompt-and-context/context-selection) treats the window as a budget shared by all of these.
- **Fine-tuning as the alternative.** If you need 30 examples to reach acceptable accuracy, you are paying to teach the task on every call. Past some volume, training the behaviour into the weights (module 2) is cheaper than prompting it.

```sim
constrained-decoding
{"step": "age", "temperature": 1, "constrained": false, "calls": 100000}
```

The sim starts unconstrained at the age field, where a quoted string competes with the integer the schema wants. Note the invalid rate per call and the chance of at least one invalid output in 100,000 calls. Then switch the mask on. Part of what examples buy is format compliance; once constrained decoding guarantees the format, examples only need to earn their tokens on correctness, which usually lowers the optimal $k$.

```quiz
{"q": "An example is 200 tokens at a hypothetical $3 per 1M input tokens. Errors cost $0.05 each. Adding the example raises accuracy from 0.90 to 0.91. Is it worth it, per call?", "options": ["Yes: any accuracy gain is worth a few tokens", "No: it costs $0.0006 per call and saves only $0.0005 in expected error cost", "Yes: it saves $0.0005 and costs $0.00006", "No: few-shot examples never pay for themselves"], "answer": 1, "explain": "Token cost: 200 × 3 × 10⁻⁶ = $0.0006. Benefit: 0.01 × $0.05 = $0.0005. Cost exceeds benefit, so leave it out (unless errors cost more than $0.06). Writing the token cost as $0.00006 is a factor-of-ten slip."}
```

```quiz
{"q": "With the same accuracy curve, your error cost rises from $0.02 to $0.50. What happens to the optimal number of examples?", "options": ["It increases, because each point of accuracy is now worth 25 times more", "It decreases, because errors are now too expensive to risk", "It stays the same, because the accuracy curve did not change", "It becomes zero"], "answer": 0, "explain": "The optimum sits where marginal accuracy × e equals marginal token cost. Raising e makes small accuracy gains worth buying, so more examples pay off. The curve is unchanged but its value is not."}
```
