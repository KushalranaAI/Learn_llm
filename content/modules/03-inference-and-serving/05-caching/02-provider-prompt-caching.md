---
title: Provider prompt caching, discounts and break-even
minutes: 8
---

If you call a hosted model, you do not run the server, but you still benefit from prefix caching: many API providers offer a cheaper price for input tokens that hit their cache. Details differ between providers (whether caching is automatic or opted into with markers, the minimum prefix length, how long entries live, and the exact prices), so treat the numbers below as an illustrative pricing shape and always read the current price list. The arithmetic is the same everywhere.

## The pricing model

Let the normal input price be $p$ dollars per token. A typical structure has three prices:

- **Uncached input**: $p$.
- **Cache read** (the token was served from cache): $d\,p$, with a discount factor $d$ well below 1 (a read price of about a tenth of normal is common; $d = 0.1$).
- **Cache write** (the first request stores the prefix): $(1 + w)\,p$, where $w \ge 0$ is a write premium (some providers charge extra, some do not; $w = 0.25$ is an illustrative value).

Output tokens are priced separately, often several times higher than input, and are never cached.

With a shared prefix of $P$ tokens, a unique suffix of $S$ tokens, an output of $O$ tokens, output price $p_o$ per token, and a cache hit probability $h$, the expected cost per request is

$$
C(h) = p\left[\, S + P\big(h\,d + (1-h)(1+w)\big) \right] + p_o\, O
$$

On a hit the prefix costs $d\,p$ per token; on a miss it is written at $(1+w)\,p$ per token. The uncached cost is $C_0 = p\,(S + P) + p_o\,O$.

```steps
A document-QA bot with an 8,000-token prefix
$P = 8000$, $S = 500$, $O = 300$, $p = \$3$ per million input tokens ($3\times10^{-6}$ per token), $p_o = \$15$ per million, $d = 0.1$, $w = 0.25$, hit rate $h = 0.8$.
---
No caching: input $8500 \times 3\times10^{-6} = \$0.0255$; output $300 \times 15\times10^{-6} = \$0.0045$; total $C_0 = \$0.0300$.
---
Prefix cost factor: $h\,d + (1-h)(1+w) = 0.8(0.1) + 0.2(1.25) = 0.08 + 0.25 = 0.33$.
---
With caching: input $= 3\times10^{-6} \times [500 + 8000 \times 0.33] = 3\times10^{-6} \times 3140 = \$0.00942$; total $C = \$0.01392$.
---
Saving: $1 - 0.01392/0.0300 = 53.6\%$. At $h = 0.95$ the total is $\$0.0098$, a 67% saving; at $h = 0.5$ it is $\$0.0222$, a 26% saving.
```

## Break-even hit rate

When $w > 0$ caching can cost more than not caching, if prefixes rarely repeat. The break-even hit rate sets the prefix factor equal to 1:

$$
h\,d + (1-h)(1+w) = 1 \quad\Longrightarrow\quad h^{*} = \frac{w}{1 + w - d}
$$

With $w = 0.25$ and $d = 0.1$: $h^* = 0.25/1.15 = 21.7\%$. Below that hit rate, writing prefixes into the cache costs more than the reads save. With $w = 0$ (no write premium) $h^* = 0$: caching never loses on price.

| Hit rate $h$ | Cost per request | Saving vs no cache |
|---|---|---|
| 0 | \$0.0360 | $-20\%$ (pure write premium) |
| 0.2 | \$0.0305 | $-1.6\%$ |
| 0.5 | \$0.0222 | 26% |
| 0.8 | \$0.0139 | 54% |
| 0.95 | \$0.0098 | 67% |

The saving is capped by how much of the bill is input and cached: in this example the uncacheable output tokens ($\$0.0045$) and the 500 suffix tokens set a floor of about $\$0.006$ per request even at a perfect hit rate.

## See it

```sim
prompt-cache
{"prefixTokens": 8000, "suffixTokens": 500, "outputTokens": 300, "hitRate": 0.8, "readDiscount": 0.1, "writePremium": 0.25, "priceIn": 3}
```

The sim's output price is fixed at five times the input price, matching the example. Check that it reports a cost saving near 54% and a break-even hit rate near 22%. Then try three experiments. Move the hit rate down to 0.2 and see the saving go to roughly zero. Increase the unique suffix to 3,000 tokens and watch the saving shrink, since less of the prompt is cacheable. Set the write premium to zero and confirm the break-even disappears.

## Latency matters as much as cost

A hit also cuts TTFT: skipping the prefill of 8,000 tokens saves about 200 ms of compute on the 8B example from the previous topic, and more for larger models and longer prefixes. Provider caches typically live for minutes, refreshed each time they are used, so steady traffic keeps a prefix warm.

## In practice

The first step is to look at your actual requests: count how many tokens are identical at the start across requests (many providers report cached versus uncached input tokens in the response's usage data, which gives you the measured hit rate for free). Calculate $h^*$ with your provider's real prices and compare with your measured $h$. Teams are often surprised: the cache is only as good as the prompt's stable prefix, and a timestamp at the top of a system prompt can reduce a 90% hit rate to zero overnight, silently multiplying the bill.

```quiz
{"q": "A provider charges 10% of the normal input price for cache reads and a 25% premium for cache writes. What is the break-even hit rate?", "options": ["About 21.7%", "25%", "10%", "About 78%"], "answer": 0, "explain": "$h^* = w/(1 + w - d) = 0.25/(1.25 - 0.10) = 0.25/1.15 = 0.217$. Quoting 25% or 10% just repeats one of the prices. 78% is the complement."}
```

```quiz
{"q": "$P = 4000$, $S = 200$, $p = \\\\$2$ per million input tokens, no output, $d = 0.1$, $w = 0$, $h = 0.9$. What is the input cost per request with caching?", "options": ["\\\\$0.00192", "\\\\$0.0084", "\\\\$0.0012", "\\\\$0.00080"], "answer": 0, "explain": "Prefix factor $= 0.9(0.1) + 0.1(1) = 0.19$ (misses pay full price since $w = 0$). Token-equivalents $= 200 + 4000 \\\\times 0.19 = 960$, and $960 \\\\times 2\\\\times10^{-6} = \\\\$0.00192$. \\\\$0.0012 wrongly charges every prefix token at the read price; \\\\$0.0084 is the uncached cost."}
```
