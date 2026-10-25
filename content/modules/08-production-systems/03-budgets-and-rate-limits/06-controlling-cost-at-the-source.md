---
title: Controlling cost at the source
minutes: 7
---

Rate limits and alerts stop bad spending after it starts. The best controls make each request cheaper in the first place. Three levers cover most of the saving: **cap the output**, **cache what repeats**, and **shrink what you send**.

## Lever 1: cap the output

Output tokens are the expensive ones, and models will happily write more than you need. Set `max_tokens` from data: take the 99th percentile of useful answer lengths and add a margin. If answers should be three sentences, ask for three sentences in the prompt and cap the output at about 150 tokens. A cap also bounds the worst case of any single request, which is what makes budgets predictable.

Cost saved by shortening the average answer from $n_{\text{out}} = 400$ to 250 tokens at \$15 per million output tokens:

$$
\Delta c = \frac{(400 - 250) \times 15}{10^6} = \$0.00225 \text{ per request}
$$

At 1 million requests a month that is \$2,250, with no change to the model.

## Lever 2: cache what repeats

A **prompt cache** bills repeated prefixes (system prompt, examples, a long document) at a discount. If a fraction $h$ of requests hit the cache for $n_p$ prefix tokens, and a cached token costs a fraction $\delta$ of the normal price, the effective prefix cost multiplier is

$$
m = h\,\delta + (1 - h)
$$

Take a 3,000-token prompt of which $n_p = 2000$ is a stable prefix, $h = 0.8$ and $\delta = 0.1$:

$$
m = 0.8 \times 0.1 + 0.2 = 0.28
$$

The input cost is $1000 + 2000 \times 0.28 = 1560$ token-equivalents instead of 3000, a 48% saving on input. A **response cache** goes further: if a question has been answered before, return the stored answer and spend nothing. It suits repeated factual queries, with the staleness and privacy cautions covered later in this module.

| Lever | Typical saving | Main risk |
|---|---|---|
| Output cap and concise prompting | 10–40% of output cost | truncated answers |
| Prompt caching | up to about 50–90% of repeated input | prefix must be byte-identical |
| Response caching | 100% on hits | stale or leaked answers |
| Shorter context | proportional to tokens cut | lost information |
| Smaller model for easy traffic | up to 10× on that traffic | quality loss, see routing |

## Lever 3: shrink what you send

Every token of context costs on every request. Trim conversation history with summarisation after a few turns, retrieve fewer and better chunks (retrieve 4 instead of 10 and measure quality), strip boilerplate from documents before inserting them and remove examples that no longer change behaviour. A prompt that has grown from 800 to 2,400 tokens over six months of "one more instruction" triples the input bill without anyone choosing that.

## Putting it together

Start from the earlier example: 1,500 input tokens and 300 output tokens at \$3 and \$15 per million cost \$0.009 per request.

```steps
Stack the savings on one request
Baseline: $(1500 \times 3 + 300 \times 15)/10^6 = \$0.009$.
---
Cap and tighten the answer to 200 tokens: $(1500 \times 3 + 200 \times 15)/10^6 = (4500 + 3000)/10^6 = \$0.0075$.
---
Cache 1,000 of the input tokens at 10% price with an 80% hit rate (multiplier 0.28): input becomes $500 + 1000 \times 0.28 = 780$ token-equivalents, so input cost is $780 \times 3/10^6 = \$0.00234$.
---
New total: $0.00234 + 0.003 = \$0.00534$ per request, a 41% cut from \$0.009.
---
Route half the traffic to a model 10× cheaper: the blended cost falls to about $0.5 \times 0.00534 + 0.5 \times 0.000534 = \$0.0029$, roughly 68% below baseline.
```

Each step is independent and measurable, which is the point: improve one lever, re-measure quality on the evaluation set, then move on.

## In practice

Measure quality at every step. The cheapest change is worthless if it breaks accuracy, and a quality drop is usually quiet. Keep a before-and-after on the same evaluation set, and review the result with the product owner: some quality for cost trades are the owner's to make, not an engineer's.

```quiz
{"q": "A 4,000-token prompt has a 3,000-token stable prefix. Cache hit rate is 90% and a cached token costs 20% of normal. What is the prefix cost multiplier?", "options": ["0.28", "0.2", "0.9", "0.72"], "answer": 0, "explain": "m = hδ + (1 − h) = 0.9 × 0.2 + 0.1 = 0.18 + 0.10 = 0.28. Using only the discount (0.2) forgets the 10% of requests that miss and pay full price."}
```

```quiz
{"q": "Cutting the average answer from 500 to 300 tokens at \\$10 per million output tokens saves how much per 1 million requests?", "options": ["\\$2,000", "\\$200", "\\$5,000", "\\$3,000"], "answer": 0, "explain": "200 fewer tokens × \\$10/10⁶ = \\$0.002 per request, and × 1,000,000 requests = \\$2,000. \\$200 is a factor of ten too small, from a slip in the million."}
```
