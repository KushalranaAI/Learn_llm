---
title: Requirements and estimation for two products
minutes: 9
---

"Design a code assistant" sounds like one system. Ask one clarifying question and it splits into two: **inline completion** (grey ghost text that appears as you type and is accepted with Tab) and **code chat** (a side panel where you ask "why does this test fail?" and get a multi-paragraph answer). They share a repository index and an identity layer, and almost nothing else. Their latency targets differ by a factor of ten, their request rates by a factor of twenty, and the model you would pick for each is different.

The strongest opening in an interview is to say this out loud, then size each product on its own. The framework from [the design framework lesson](/learn/llm-system-design/design-framework) still applies: requirements, estimation, architecture, deep dives, evaluation, safety, failures, trade-offs.

## Clarify first

| Question | Assumed answer | Why it matters |
|---|---|---|
| Who uses it? | 50,000 developers at one company, mostly one region | Sets traffic and data-residency scope |
| Which products? | Inline completion + chat over the company's repositories | Two latency classes |
| Latency target, inline | p50 under 250 ms from pause to ghost text, p95 under 500 ms | Past ~500 ms the developer has typed on and the suggestion is wasted |
| Latency target, chat | First token under 1.5 s, full answer streaming | Humans read while it streams |
| Code leaves the network? | Only to an approved provider, secrets redacted | Rules out some vendors, forces a redaction step |
| Scale of code | ~20,000 repositories, ~500 million lines | Sizes the index |

## Traffic is concentrated in the workday

The module convention is a peak factor of 3× the 24-hour average. That convention assumes traffic spread over the whole day, which a consumer chat app roughly has. Developers in one region work about 8 hours, so almost all traffic lands in that window, and within it there are bursts after stand-up and after lunch. Estimate from the workday instead:

$$
\bar\lambda_{\text{work}} = \frac{R_{\text{day}}}{T_{\text{work}}}, \qquad \lambda_{\text{peak}} = k \cdot \bar\lambda_{\text{work}}
$$

where $R_{\text{day}}$ is requests per working day, $T_{\text{work}} = 8 \times 3600 = 28{,}800$ s is the working window, $\bar\lambda_{\text{work}}$ the average rate inside it and $k$ the burst factor within the workday (we take $k = 1.5$).

Inline: each developer generates about 400 completion requests per day after **debouncing** (a request only fires when typing pauses). So $R_{\text{day}} = 50{,}000 \times 400 = 20$ million.

```steps
Inline completion, from developers to peak QPS
Requests per day: $50{,}000 \times 400 = 20{,}000{,}000$.
---
Spread over 24 hours this would be $20 \times 10^6 / 86{,}400 \approx 231$ QPS. That number is misleading.
---
Spread over the 8-hour workday: $20 \times 10^6 / 28{,}800 \approx 694$ QPS.
---
Peak inside the workday: $1.5 \times 694 \approx 1{,}042$ QPS. That is $4.5\times$ the 24-hour average, not $3\times$, which is why the convention is overridden here.
```

Chat: 20 messages per developer per day gives 1 million messages, $10^6 / 28{,}800 \approx 35$ QPS average and about 52 QPS at peak. Twenty times less traffic than inline, but each request is far heavier.

## Tokens and cost

Inline requests carry about 2,000 input tokens (code before and after the cursor plus a few retrieved snippets) and return about 40 output tokens. Chat requests carry about 8,000 input tokens (files, search results, history) and return about 500.

$$
\text{cost/day} = R_{\text{day}} \cdot \frac{t_{\text{in}} \, p_{\text{in}} + t_{\text{out}} \, p_{\text{out}}}{10^6}
$$

with $t_{\text{in}}, t_{\text{out}}$ tokens per request and $p_{\text{in}}, p_{\text{out}}$ dollars per million tokens (hypothetical prices: small model \$0.10 / \$0.40, large model \$1.00 / \$4.00). We bill a month as 22 working days because weekends are nearly idle.

| Quantity | Inline completion | Chat |
|---|---|---|
| Requests / working day | 20 M | 1 M |
| Peak QPS | ~1,042 | ~52 |
| Input tokens / day | 40 B | 8 B |
| Output tokens / day | 0.8 B | 0.5 B |
| Model tier | small | large |
| Cost / day (hypothetical) | \$4,000 + \$320 = **\$4,320** | \$8,000 + \$2,000 = **\$10,000** |
| Cost / month (22 days) | **\$95,040** | **\$220,000** |
| Same inline traffic on the large model | \$43,200/day, \$950,400/month | n/a |

Two lessons hide in this table. First, inline is input-dominated: 40 B input tokens against 0.8 B output, so anything that cuts input (prefix caching across keystrokes, a tighter context budget) is the main cost lever. Second, putting inline on the large model would cost ten times more and also blow the latency budget, so latency forces the model choice before cost even enters.

## Self-hosting inline

Because inline is high-volume, latency-critical and served by a small model, it is the classic candidate for self-hosting. Assume an 8B-class code model with $N = 8 \times 10^9$ parameters. Prefill costs about $2N$ FLOPs per input token:

$$
F_{\text{prefill}} = \lambda_{\text{peak}} \cdot t_{\text{in}} \cdot 2N = 1{,}042 \times 2{,}000 \times 2 \times 8\times10^9 \approx 3.3 \times 10^{16}\ \text{FLOP/s}
$$

At an effective 400 TFLOP/s per GPU and a 70% utilisation target that is $3.3\times10^{16} / (4\times10^{14} \times 0.7) \approx 119$, so **120 GPUs**, or $120 \times 730 \times \$2.50 = \$219{,}000$ per month (hypothetical GPU price). That is more than the API bill above, a useful surprise to say out loud. But consecutive keystrokes share most of their prefix, so with a 60% prefix-cache hit rate only 40% of input needs prefill: about **48 GPUs**, \$87,600 per month, with lower latency than any remote API.

KV memory is modest. Each request lives about 0.55 s (150 ms of queue and prefill, then 40 tokens at 10 ms each), so by Little's law concurrency is $1{,}042 \times 0.55 \approx 573$ sequences. At 2,040 tokens each and 131,072 bytes per token that is about **153 GB** across the fleet, a few GB per GPU.

## In practice

The 400-requests-per-day figure is the number teams most often get wrong. Measure it from telemetry: pauses per day after debouncing, minus requests cancelled before they return. A 2× error there is a 2× error in GPUs. Also check the time-zone spread: a company split across two continents has a flatter curve and a peak factor closer to 3×.

```quiz
{"q": "Inline completion receives 20 M requests per working day, concentrated in an 8-hour window with a 1.5× burst factor. What is the peak QPS?", "options": ["About 231", "About 694", "About 1,042", "About 2,083"], "answer": 2, "explain": "$20\\times10^6 / 28{,}800 \\approx 694$ QPS inside the workday, and $1.5 \\times 694 \\approx 1{,}042$. Dividing by 86,400 s (231) spreads traffic over hours when nobody works; multiplying the workday average by 3 (2,083) double-counts the concentration."}
```

```quiz
{"q": "Inline completion uses 2,000 input and 40 output tokens per request on a model priced (hypothetically) at \\$0.10 input and \\$0.40 output per million tokens. Roughly what share of its token cost is input?", "options": ["About 50%", "About 75%", "About 93%", "About 2%"], "answer": 2, "explain": "Per request, input costs $2{,}000 \\times 0.10 = 200$ and output $40 \\times 0.40 = 16$ (in millionths of a dollar). Input is $200/216 \\approx 93\\%$. The 4× output price does not offset a 50× token ratio, so context size and caching are the cost levers."}
```
