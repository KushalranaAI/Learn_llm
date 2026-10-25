---
title: Cost per request and cost per useful answer
minutes: 8
---

A price per million tokens is the supplier's unit. Your product's unit is the request, and ultimately the *useful answer*: the one that solved the user's problem. Costs that matter are measured in those units, and the two can differ by a large factor once retries, long contexts and wrong answers are counted.

## Cost per request

With input tokens $n_{in}$, output tokens $n_{out}$, and prices $p_{in}$ and $p_{out}$ (dollars per token):

$$
C_{req} = n_{in}\,p_{in} + n_{out}\,p_{out}
$$

Three things inflate $n_{in}$ without anyone noticing: the system prompt, retrieved documents and conversation history. All of them are re-sent with every request.

```steps
One hosted-API request
Prices: \$3 per million input tokens, \$15 per million output tokens. A request has a 400-token system prompt, 1,100 tokens of retrieved context and user message ($n_{in} = 1500$), and a 400-token answer.
---
Input: $1500 \times 3\times10^{-6} = \$0.0045$. Output: $400 \times 15\times10^{-6} = \$0.0060$. Total $C_{req} = \$0.0105$.
---
At 10,000 requests per day: $\$105$ per day, about $\$3{,}150$ per 30-day month.
---
Output is only 21% of the tokens but 57% of the cost. Halving the answer length saves \$0.003 per request (29%); halving the input saves \$0.00225 (21%).
---
With a cacheable 1,000-token prefix at a 90% read discount and 90% hit rate, input cost falls by about $1000 \times 0.9 \times 0.9 \times 3\times10^{-6} = \$0.0024$ (ignoring write premiums), a 23% saving on the total.
```

Self-hosted, the same quantity is GPU-seconds times price: in the earlier capacity example a request used 0.072 GPU-seconds, so at \$2.50 per GPU-hour its cost at 100% utilisation is $0.072 \times 2.50/3600 = \$0.00005$, and at 26% average utilisation $\$0.00019$. (An 8B model is not interchangeable with a frontier hosted model; the point is the arithmetic, not the comparison.)

## Context growth in multi-step flows

Agents and tool loops call the model repeatedly, and each call re-sends everything so far. If a flow has $k$ steps, a fixed prefix $S$ and each step appends $u$ tokens that stay in the context, the total input tokens processed are

$$
T_{in} = k\,S + u \sum_{i=0}^{k-1} i = k\,S + u\,\frac{k(k-1)}{2}
$$

The second term grows with $k^2$. For $k = 10$, $S = 2000$, $u = 500$: $T_{in} = 20{,}000 + 500 \times 45 = 42{,}500$ tokens, more than twice what the "10 calls of 2,000 tokens" estimate suggests. At \$3 per million that is \$0.128 of input per run before any output, and doubling the steps to 20 gives $40{,}000 + 500 \times 190 = 135{,}000$ tokens, 3.2 times as much. Prefix caching helps most here, since each step's prompt begins with the previous one.

## Cost per useful answer

Not every answer is good. If an attempt costs $c$ and succeeds with probability $s$ (judged by users or a checker), then to get one success you need $1/s$ attempts on average if you retry until success, so

$$
C_{useful} = \frac{c + j}{s}
$$

where $j$ is the cost of verifying an attempt, if any. More generally, $C_{useful} = (\text{total spend})/(\text{number of useful answers})$.

This is the right comparison between models. A cheap model is not cheap if it fails often; an expensive model is not expensive if it succeeds first time.

```steps
A cascade versus always using the big model
Big model: \$0.012 per attempt, succeeds 90% of the time. Small model: \$0.003 per attempt, succeeds 60%; a cheap verifier costs \$0.001 per small attempt and catches failures reliably.
---
Always big: cost per request \$0.012, useful fraction 0.90, so $C_{useful} = 0.012/0.90 = \$0.0133$.
---
Cascade: try small, verify; if it fails (40% of the time) call the big model. Expected cost per request: $0.003 + 0.001 + 0.4 \times 0.012 = \$0.0088$. Useful fraction: $0.6 + 0.4 \times 0.9 = 0.96$.
---
$C_{useful} = 0.0088/0.96 = \$0.00917$, 31% cheaper than always-big, and with more useful answers (96% versus 90%) because the verifier filters bad small-model outputs.
---
The result depends on the small model's success rate and the verifier's reliability; at a small-model success rate of 20% the cascade would cost $0.004 + 0.8 \times 0.012 = \$0.0136$ per request, more than the \$0.012 of always-big. Measure before you route (see the production module on routing).
```

## See it

```sim
token-cost
{"systemTokens": 400, "inputWords": 800, "outputWords": 300, "inputPrice": 3, "outputPrice": 15, "requestsPerDay": 10000}
```

The sim converts words to tokens (for English roughly 1.3 tokens per word, more for code and other languages), so its token counts will be close to the example's. Read the cost per request and per month. Then lengthen the system prompt to 4,000 tokens and watch input cost climb; switch the language setting to code or a non-English language and see the same text cost more tokens; and lower the output price to see how much of the total depends on the output side.

## In practice

Track cost per request by feature and by tenant, and join it with a quality signal to get cost per useful answer. A support bot at \$0.01 per request that resolves 40% of tickets is more expensive per resolution than one at \$0.03 that resolves 80%. Budget alerts should be on cost per useful outcome and on token volume per request: a prompt-template change that quietly doubles input tokens is the most common cause of a surprise bill.

```quiz
{"q": "A request has 3,000 input tokens and 500 output tokens. Prices are \\$2 per million input and \\$10 per million output. What is the cost per request?", "options": ["\\$0.011", "\\$0.0035", "\\$0.006", "\\$0.011 per thousand requests"], "answer": 0, "explain": "$3000 \\times 2\\times10^{-6} = 0.006$ and $500 \\times 10\\times10^{-6} = 0.005$, total \\$0.011. \\$0.006 is the input only. The last option is off by a factor of 1,000."}
```

```quiz
{"q": "A model costs \\$0.02 per attempt and succeeds 80% of the time; retrying until success with no verifier cost. What is the cost per useful answer?", "options": ["\\$0.025", "\\$0.016", "\\$0.02", "\\$0.04"], "answer": 0, "explain": "$C_{useful} = c/s = 0.02/0.8 = \\$0.025$. Multiplying by 0.8 instead of dividing (\\$0.016) is the common slip: failures add cost, they do not reduce it."}
```
