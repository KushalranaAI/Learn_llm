---
title: Requirements and the first estimate
minutes: 9
---

```callout-before
Before you start
This case walks the framework from [A Framework for LLM System Design](/learn/llm-system-design/design-framework). If the words QPS, peak factor or tokens per day are new, read its back-of-the-envelope topic first. All prices here are hypothetical and chosen to make the arithmetic easy.
```

The interviewer says: "Design a customer-support assistant for a large online retailer." That sentence hides a dozen decisions. Is it a chat widget or email? Does it only answer questions, or can it also cancel an order? Who picks up when it fails? A strong candidate spends the first five minutes turning the brief into a short list of facts the rest of the design can lean on.

The goal of the assistant is not "answer questions". It is to **resolve contacts** that would otherwise reach a human agent, without resolving them wrongly. That framing matters because it makes the main metric a business one: the **containment rate** (share of conversations finished without a human) balanced against the **false-resolution rate** (share the bot marked as solved that come back or should have been escalated).

## Clarify: the questions worth asking

| Question | Assumed answer | Why it changes the design |
|---|---|---|
| Channels? | Web and app chat; email later | Chat needs streaming and sub-second first token |
| Volume? | 200,000 conversations a day, 6 customer turns each | Drives QPS, tokens and cost |
| Knowledge? | 30,000 help-centre articles, policies, plus live order data | Needs retrieval and tools, not one or the other |
| Actions? | Track order, start a return, refund up to a limit | Tools with permissions and confirmation |
| Languages? | English first, 5 more within a year | Multilingual model and eval sets |
| Hand-off? | Existing human agent desk with a queue | The bot must pass a summary, not a transcript dump |
| Latency SLO? | First token p95 under 1.5 s | Rules out slow multi-step chains on every turn |
| Quality bar? | No policy-violating refunds; correct policy citations | Hard constraints become guardrails, not metrics |

Write the non-functional targets as numbers: availability 99.9% (about 43 minutes of downtime a month), p95 time to first token 1.5 s, and a hard rule that the bot never promises something the policy does not allow.

## Estimate: from conversations to dollars

Define the symbols once. $C$ is conversations per day, $t$ customer turns per conversation, $T_{in}$ and $T_{out}$ input and output tokens per turn, $f$ the peak factor, and $p_{in}, p_{out}$ the price per token.

$$
R = C \cdot t, \qquad \text{QPS}_{avg} = \frac{R}{86{,}400}, \qquad \text{QPS}_{peak} = f \cdot \text{QPS}_{avg}
$$

$$
\text{cost/day} = R\,(T_{in}\,p_{in} + T_{out}\,p_{out})
$$

Each turn re-sends the conversation, so $T_{in}$ is not just the customer's message. Budget it: an 800-token system prompt (persona, policies, tool definitions), about 700 tokens of history on an average turn, and about 1,000 tokens of retrieved help-centre text. That is $T_{in} = 2{,}500$. Replies are short: $T_{out} = 200$.

```steps
The estimate, line by line
Turns per day: $R = 200{,}000 \times 6 = 1{,}200{,}000$.
---
Average load: $1{,}200{,}000 / 86{,}400 = 13.9$ turns per second. With a peak factor $f = 3$ (evenings, sales events): about $41.7$ per second.
---
Tokens per day: input $1.2\text{M} \times 2{,}500 = 3.0$ billion; output $1.2\text{M} \times 200 = 240$ million.
---
Cost per day at the hypothetical large-model price (\$1.00 per 1M input, \$4.00 per 1M output): $3{,}000 \times \$1 + 240 \times \$4 = \$3{,}000 + \$960 = \$3{,}960$.
---
Per month (30 days): $\$118{,}800$. Per conversation: $\$3{,}960 / 200{,}000 = \$0.0198$, about two cents.
```

| Quantity | Value |
|---|---|
| Conversations / day | 200,000 |
| Turns / day | 1.2 M |
| Average / peak turn rate | 13.9 / 41.7 per s |
| Input tokens / day | 3.0 B |
| Output tokens / day | 240 M |
| API cost / day (large model, hypothetical) | \$3,960 |
| API cost / month | \$118,800 |
| Cost per conversation | \$0.0198 |

Notice that input dominates: \$3,000 of the \$3,960. That tells you where optimisation pays. The 800-token system prompt is identical on every turn, so a provider prompt cache that bills cached tokens at a 90% discount cuts input cost to $1.2\text{M} \times (800 \times 0.1 + 1{,}700)/10^6 = \$2{,}136$ a day, and the monthly bill to about \$92,880.

## Concurrency and self-hosting

**Little's law** says the number of things in a system equals arrival rate times time spent: $N = \lambda \cdot W$. A turn's generation takes about $W = 0.8 + 200 \times 0.025 = 5.8$ s (prefill plus 200 tokens at 25 ms each), so at peak $N = 41.7 \times 5.8 \approx 242$ concurrent generations. Open conversations are a different count: about 6.9 new conversations a second at peak, each lasting 8 minutes, gives $6.9 \times 480 \approx 3{,}333$ open sessions to hold state for.

If you self-host an 8B-class model, peak output is $240\text{M} \times 3 / 86{,}400 \approx 8{,}333$ tokens per second. At a measured 1,500 output tokens per second per GPU, run at 70% utilisation, that needs $8{,}333 / 1{,}050 \approx 7.9$, so 8 GPUs, and 10 with two spare for failures: $10 \times \$2.50 \times 730 = \$18{,}250$ a month. Each sequence of about 2,700 tokens holds $2{,}700 \times 131{,}072 \approx 354$ MB of KV cache, and 242 of them need about 86 GB across the fleet, which fits easily.

```callout-key
What the numbers say
Token cost is about two cents a conversation. A human-handled contact costs dollars. The design should therefore optimise for correct containment first and token cost second; that ordering shapes every later decision.
```

## In practice

Teams usually discover that their real input tokens are 30–50% higher than the first estimate because history grows on long conversations. Cap history (summarise turns older than the last four) and put the cap into the estimate. A second common miss is forgetting retries and tool-call turns: a turn that calls a tool is two model calls, not one.

```quiz
{"q": "Each turn re-sends an 800-token system prompt, 700 tokens of history and 1,000 tokens of retrieved text. At 1.2M turns a day and a hypothetical \\$1.00 per 1M input tokens, what is the daily input cost if the system prompt is billed at a 90% discount and everything else at full price?", "options": ["\\$3,000", "\\$2,136", "\\$2,040", "\\$300"], "answer": 1, "explain": "Effective tokens per turn: 800 × 0.1 + 1,700 = 1,780. Then 1.2M × 1,780 / 10⁶ × \\$1 = \\$2,136. \\$2,040 is 1,700 tokens only (it drops the discounted 80); \\$3,000 ignores the cache."}
```

```quiz
{"q": "Peak turn rate is 41.7 per second and each generation takes 5.8 s. Roughly how many generations run at once?", "options": ["7", "42", "242", "3,333"], "answer": 2, "explain": "Little's law: N = λW = 41.7 × 5.8 ≈ 242. 3,333 counts open conversations (which last minutes), not in-flight generations."}
```
