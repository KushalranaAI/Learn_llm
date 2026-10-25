---
title: What one request really costs
minutes: 7
---

Every routing decision rests on one number: what a single request costs. Providers price **input tokens** (the prompt) and **output tokens** (the answer) separately, usually per million tokens, and output tokens are typically several times dearer because they are generated one at a time. So the cost of a request is not "the price of the model" but a small sum you can do in your head once you know the token counts.

## The formula

$$
c = \frac{n_{\text{in}}\, p_{\text{in}} + n_{\text{out}}\, p_{\text{out}}}{10^6}
$$

Here $c$ is the cost of one request in dollars, $n_{\text{in}}$ and $n_{\text{out}}$ are the input and output token counts, and $p_{\text{in}}$ and $p_{\text{out}}$ are the prices in dollars per million tokens. Dividing by $10^6$ converts "per million" into "per token".

Take a hypothetical large model priced at $p_{\text{in}} = \$3$ and $p_{\text{out}} = \$15$ per million, and a support request with a 1,500-token prompt (system instructions plus retrieved context plus the question) and a 300-token answer:

$$
c = \frac{1500 \times 3 + 300 \times 15}{10^6} = \frac{4500 + 4500}{10^6} = \$0.009
$$

Notice that the 300 output tokens cost exactly as much as the 1,500 input tokens. At 100,000 requests a day that is $100{,}000 \times 0.009 = \$900$ a day, or \$27,000 over a 30-day month.

The same request on a hypothetical small model at \$0.25 in and \$1.25 out:

$$
c = \frac{1500 \times 0.25 + 300 \times 1.25}{10^6} = \frac{375 + 375}{10^6} = \$0.00075
$$

That is $0.009 / 0.00075 = 12$ times cheaper. Gaps of 10× to 30× between the small and large tiers of one provider are common, which is why routing is worth engineering effort.

```sim
token-cost
```

Use the calculator to change the prompt length, output length and prices. Try doubling the output length while keeping the prompt fixed and see how quickly output dominates the bill. Then cut the prompt in half and notice that, for this request shape, it saves less than trimming the answer by the same fraction.

## The tokens you forget to count

The prompt you write is rarely the whole input. A realistic request contains:

| Part | Typical tokens | Paid on every request? |
|---|---|---|
| System prompt and instructions | 300–2,000 | yes, unless cached |
| Few-shot examples | 0–3,000 | yes, unless cached |
| Retrieved context (RAG) | 500–8,000 | yes |
| Conversation history | grows each turn | yes |
| User message | 20–500 | yes |
| Hidden reasoning tokens (some models) | 0–10,000+ | billed as output |

Two multipliers then act on the result. **Retries**: if a fraction $r$ of requests is retried once (timeouts, malformed JSON), the effective cost is $c(1 + r)$. **Prompt caching**: if part of the prompt is a reused prefix that the provider bills at a discount, the input term shrinks. With 1,000 of the 1,500 input tokens cached at 10% of the normal price (\$0.30 per million):

$$
c = \frac{500 \times 3 + 1000 \times 0.3 + 300 \times 15}{10^6} = \frac{1500 + 300 + 4500}{10^6} = \$0.0063
$$

a 30% saving with no change to the answer.

## Latency from the same counts

The token counts also give you latency. The user waits for the **time to first token** (TTFT), then one **time per output token** (TPOT) for each remaining token:

$$
T \approx \text{TTFT} + (n_{\text{out}} - 1)\cdot \text{TPOT}
$$

With $\text{TTFT} = 0.4$ s, $\text{TPOT} = 0.02$ s and $n_{\text{out}} = 300$: $T = 0.4 + 299 \times 0.02 = 0.4 + 5.98 = 6.38$ s. Output length drives both cost and latency, so asking the model for shorter answers is often the cheapest optimisation available.

## In practice

Log $n_{\text{in}}$, $n_{\text{out}}$ and cached tokens for every request, exactly as the provider reports them, and compute cost from those logs rather than from estimates. Estimates from character counts are easily off by 20–40%, especially for code or non-English text, which split into more tokens per word.

```quiz
{"q": "A request has 4,000 input tokens and 500 output tokens. Prices are \\$2 per million input and \\$8 per million output. What does it cost?", "options": ["\\$0.012", "\\$0.036", "\\$0.0045", "\\$0.010"], "answer": 0, "explain": "(4000 × 2 + 500 × 8)/10⁶ = (8000 + 4000)/10⁶ = \\$0.012. \\$0.036 comes from pricing all 4,500 tokens as output; \\$0.010 prices all 4,500 tokens at a blended guess instead of using the two separate prices."}
```

```quiz
{"q": "Your feature costs \\$0.01 per request and 8% of requests are retried once. What is the effective cost per user request?", "options": ["\\$0.0108", "\\$0.0180", "\\$0.0092", "\\$0.0100, retries are free"], "answer": 0, "explain": "Effective cost is c(1 + r) = 0.01 × 1.08 = \\$0.0108. Retries are billed like any other call, so ignoring them understates spend; \\$0.018 adds 8 tenths of a cent per retry instead of 8% of requests."}
```
