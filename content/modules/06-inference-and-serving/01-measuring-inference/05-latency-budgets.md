---
title: Turning a product into latency targets
minutes: 7
---

"Make it fast" is not a requirement. A chat assistant, a voice agent, an autocomplete box and a nightly batch job all use the same model, yet each needs a different definition of fast. The job of a serving engineer is to turn the product experience into numbers: a TTFT target, a TPOT target, sometimes an end-to-end target, each at a chosen percentile.

The trick is to ask what the user is *doing* while they wait. Someone reading streamed text cares about the first word and then about keeping ahead of their eyes. Someone listening to a voice cares about the silence before the reply. A program waiting for JSON cares only about the last token, because half a JSON object is useless.

## Streaming text: keep ahead of the reader

Adults typically read on-screen prose at a few words per second, and English averages somewhat more than one token per word (roughly 1.3 is a common rule of thumb). Call the reader's speed $r$ tokens per second. Streaming feels smooth when generation stays ahead of reading:

$$
\frac{1}{\text{TPOT}} \ge r \quad\Longleftrightarrow\quad \text{TPOT} \le \frac{1}{r}
$$

At 4 words/s $\times$ 1.3 tokens/word $\approx 5.2$ tokens/s, the bound is $\text{TPOT} \le 1/5.2 \approx 190$ ms. Real products target far below that (often 30 to 60 ms) because users skim, scroll ahead and copy code, and because the p95 must also stay comfortable. The lesson is that beyond a certain point, faster decoding adds little to a reading experience, while a lower TTFT is always felt.

## Structured output: only the end counts

When a program consumes the answer (a tool call, an extraction, a classification), streaming does not help: the result is useful only when complete. Solve the end-to-end formula for the longest answer that fits a deadline $T$:

$$
n_{out} \le 1 + \frac{T - \text{TTFT}}{\text{TPOT}}
$$

```steps
Will the tool call make its deadline?
An agent step must produce a 120-token JSON tool call within $T = 2$ s. Measured p95 values: TTFT = 400 ms, TPOT = 20 ms.
---
Time needed: $0.4 + 119 \times 0.020 = 0.4 + 2.38 = 2.78$ s. It misses by 0.78 s.
---
Longest answer that fits: $n_{out} \le 1 + (2.0 - 0.4)/0.020 = 1 + 80 = 81$ tokens.
---
Required TPOT to fit 120 tokens: $\text{TPOT} \le (2.0 - 0.4)/119 = 13.4$ ms.
---
Options: shrink the schema (shorter keys, no prose fields) to under 81 tokens, use a faster or smaller model to reach about 13 ms per token, or cut TTFT with a cached prompt prefix. The formula tells you exactly how much each lever must deliver.
```

## Voice: a budget across components

A voice agent chains speech recognition, the LLM and speech synthesis. The silence the user hears is the sum of each stage's delay before the first audio plays:

$$
T_{silence} = t_{asr} + t_{endpoint} + \text{TTFT}_{llm} + t_{tts,first}
$$

where $t_{endpoint}$ is the time spent deciding the user has finished speaking and $t_{tts,first}$ is the time for the synthesiser to produce its first audio chunk. Conversation between people moves quickly, so voice products usually aim for well under a second of silence. If the target is 800 ms and the other stages take 150 + 200 + 150 = 500 ms, the LLM gets only 300 ms for TTFT, network included. Decode speed matters less as long as it outpaces speech: people speak at roughly 2 to 3 words per second, so even a modest decode speed stays ahead.

## See it

```sim
latency-breakdown
{"model": "llama3-8b", "gpu": "h100", "promptTokens": 2000, "outputTokens": 120}
```

Reproduce the tool-call example: set a prompt length that gives a TTFT near 400 ms and an output of 120 tokens, and check the end-to-end time. Then shorten the output until the total drops under 2 seconds and compare the answer with the 81-token bound.

## A table of typical targets

These are illustrative starting points, not standards; your users and competitors set the real bar.

| Product | Metric that matters most | Example target |
|---|---|---|
| Chat assistant | TTFT, then TPOT | p95 TTFT < 1 s, p95 TPOT < 50 ms |
| Code autocomplete | End to end for a short output | p95 total < 500 ms for ~30 tokens |
| Voice agent | TTFT inside a silence budget | LLM TTFT < 300 ms |
| Agent tool call | End to end for structured output | Step < 2 s |
| Batch summarisation | Throughput and cost | Finish overnight; no per-request target |

## In practice

Write the SLO down with its percentile and its workload: "p95 TTFT under 1 second for prompts up to 8k tokens, at 50 requests per second". Without the workload, the target is untestable. Then split the budget: if the product promises 1 second and the network and gateway take 150 ms, the model server has 850 ms, and its queue must stay short enough to leave room for prefill. Finally, set the SLO slightly tighter internally than externally, so that alerts fire before users notice.

```quiz
{"q": "A classifier must return a 40-token JSON label within 1 s. TTFT is 300 ms. What is the largest TPOT that still makes the deadline?", "options": ["About 17.9 ms", "17.5 ms", "25 ms", "About 7.5 ms"], "answer": 0, "explain": "$\\text{TPOT} \\le (T - \\text{TTFT})/(n_{out} - 1) = 0.7/39 = 0.0179$ s. Dividing by 40 instead of 39 gives 17.5 ms; 25 ms ignores TTFT ($1/40$); 7.5 ms has no basis in the formula."}
```

```quiz
{"q": "Your chat product has p95 TPOT of 35 ms and p95 TTFT of 2.5 s. Users say it feels slow. Which improvement will they notice most?", "options": ["Cutting TTFT, for example by reducing queueing or caching the prompt prefix", "Cutting TPOT to 20 ms", "Increasing the batch size to raise throughput", "Streaming larger chunks of tokens per event"], "answer": 0, "explain": "At 35 ms per token (about 28 tokens/s) the stream already outruns reading speed, so faster decoding is hardly visible. A 2.5 s wait before anything appears is what users feel. Bigger batches would make both metrics worse for each user."}
```
