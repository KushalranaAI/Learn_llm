---
title: How far prompting goes, and when tokens add up
minutes: 7
---

Prompting is the first rung because it is fast, reversible and free of training. You change text, run the evaluation set, and know within minutes whether it helped. Modern models follow detailed instructions and learn from a handful of examples placed in the prompt, so a surprising number of "we need to fine-tune" problems turn out to be "we need a clearer prompt".

## What good prompting includes

Before concluding that prompting has failed, check you have done the following:

- **Precise instructions**: the task, the audience, the format, what to do when unsure.
- **Examples** (few-shot) that cover the hard and borderline cases, not only the easy ones.
- **Structured output**: a schema or constrained decoding, rather than "please respond in JSON".
- **Decomposition**: split a complex task into steps, each with its own prompt and checks.
- **The right context**: retrieved facts, tool results, relevant history.
- **A measured comparison** on a proper evaluation set, not a few hand-picked cases.

If after that the failures that remain are consistent stylistic or format deviations, the cost of long prompts becomes the argument for fine-tuning.

## The token tax of a long prompt

Every request pays for the whole prompt. If instructions and examples occupy $n_{\text{p}}$ tokens and input costs $p_{\text{in}}$ dollars per million tokens, the **prompt overhead** per request is

$$
c_{\text{overhead}} = \frac{n_{\text{p}}\, p_{\text{in}}}{10^6}
$$

Suppose 1,800 tokens of instructions and few-shot examples, at \$3 per million tokens:

$$
c_{\text{overhead}} = \frac{1800 \times 3}{10^6} = \$0.0054 \text{ per request}
$$

At 1,000,000 requests a month, that is \$5,400. A fine-tuned model that has absorbed those instructions can run with a very short prompt, so in principle it saves this amount. This is the main economic case for fine-tuning behaviour: you pay once to bake the examples into the weights instead of paying for them on every request.

## Caching changes the sum

Prompt caching undermines the argument. If the 1,800-token prefix is identical across requests, a cache bills most of it at a discount. With a 90% hit rate and cached tokens costing 10% of the normal price, the multiplier on the prefix is

$$
m = h\,\delta + (1 - h) = 0.9 \times 0.1 + 0.1 = 0.19
$$

where $h$ is the hit rate and $\delta$ the relative price of a cached token. The overhead falls to $0.19 \times 5{,}400 = \$1{,}026$ a month, so the fine-tune's saving from shorter prompts shrinks by 81%. Before you argue for fine-tuning on token cost, price the **cached** prompt.

| Scenario | Prompt tokens | Monthly overhead at 1M requests |
|---|---|---|
| Long prompt, no caching | 1,800 | \$5,400 |
| Long prompt, 90% cache hit at 10% price | 1,800 (effective 342) | \$1,026 |
| Fine-tuned, short prompt | 200 | \$600 |
| Fine-tuned, short prompt, cached | 200 (effective 38) | \$114 |

The fine-tuned, cached case is cheapest, but the gap between the long cached prompt (\$1,026) and the fine-tuned one (\$114) is only \$912 a month, much less than the headline \$5,400. That is the number to compare with the one-time and ongoing cost of fine-tuning.

## Latency also drops with shorter prompts

Prefill time grows with prompt length, so a 1,800-token prompt shortened to 200 tokens reduces time to first token. If prefill runs at 10,000 tokens per second on your deployment, that saves $(1800 - 200)/10{,}000 = 0.16$ s on every request. Whether 160 ms matters depends on the product; for a voice assistant it can.

## Signs that prompting has reached its limit

- The prompt keeps growing as you add rules, and fixing one case breaks another.
- The same format or tone mistakes recur at a steady rate despite examples (say 5% to 15%).
- Examples placed in the prompt help, but you need so many that cost and latency suffer.
- A smaller, cheaper model could do the job if only it behaved more consistently.

The last one is the strongest signal. The best case for fine-tuning is usually to teach a **small** model a narrow behaviour so that you can stop paying for a large one, combining the routing ideas from earlier in this module with the economics in the next topics.

```steps
Exhaust prompting honestly
Write down the behaviour you want in measurable terms and build an evaluation set that tests it.
---
Improve instructions, add 5 to 20 well-chosen examples including hard cases, and add output constraints. Measure after each change.
---
Price the final prompt with caching. Note the pass rate and the cost per request.
---
If failures remain stylistic and consistent, collect them as training signal: each failure with its correct version is a candidate training example.
---
Move to the break-even calculation before committing to a fine-tune.
```

## In practice

Keep the failing cases from this stage: they are exactly the examples a fine-tune would need, and the evaluation set that tells you whether the fine-tune worked. Teams that skip this stage tend to produce training data from scratch with no sense of what actually fails.

```quiz
{"q": "A prompt has 2,500 tokens of instructions and examples. Input costs \\$2 per million tokens and you serve 500,000 requests a month. What is the monthly prompt overhead, with no caching?", "options": ["\\$2,500", "\\$250", "\\$5,000", "\\$1,250"], "answer": 0, "explain": "2,500 × 2/10⁶ = \\$0.005 per request, and × 500,000 = \\$2,500. \\$5,000 doubles it; \\$250 loses a factor of ten."}
```

```quiz
{"q": "With an 80% cache hit rate and cached tokens at 25% of the normal price, what multiplier applies to the cached prefix?", "options": ["0.40", "0.25", "0.80", "0.20"], "answer": 0, "explain": "m = 0.8 × 0.25 + 0.2 = 0.2 + 0.2 = 0.40. Using just the discount (0.25) forgets that 20% of requests miss and pay the full price."}
```
