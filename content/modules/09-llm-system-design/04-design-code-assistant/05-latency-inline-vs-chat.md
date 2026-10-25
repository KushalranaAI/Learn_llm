---
title: "Deep dive: latency for inline completion versus chat"
minutes: 9
---

Inline completion and chat are both "an LLM answering", but they live on different clocks. Inline competes with the developer's own fingers: if the suggestion arrives after they have typed the next three characters, it is useless, however good it is. Chat competes with the developer's patience: they asked a question and will happily read a streaming answer, as long as it starts promptly.

So the two products optimise different numbers. Inline cares about **end-to-end latency of a short output**: from the last keystroke to complete ghost text. Chat cares about **time to first token (TTFT)** and then a streaming rate faster than reading speed. Mixing them up leads to classic mistakes, like streaming inline completions token by token (flicker) or holding chat answers until they are complete (feels slow).

## The inline budget

End-to-end latency is a sum of stages:

$$
T_{\text{e2e}} = T_{\text{debounce}} + T_{\text{net}} + T_{\text{gw}} + T_{\text{ctx}} + T_{\text{queue}} + T_{\text{prefill}} + t_{\text{out}} \cdot \tau + T_{\text{render}}
$$

where $t_{\text{out}}$ is the number of output tokens and $\tau$ the time per output token. Prefill time is roughly the uncached input tokens times $2N$ FLOPs divided by effective GPU throughput. For the 8B model ($N = 8\times10^9$) at 400 TFLOP/s effective, a cold 2,000-token prompt takes $2{,}000 \times 1.6\times10^{10} / 4\times10^{14} = 80$ ms; with 60% of it already in the prefix cache, the 800 new tokens take 32 ms.

| Stage | Warm cache (ms) | Cold cache (ms) | Notes |
|---|---|---|---|
| Debounce | 75 | 75 | Client-side wait for a pause |
| Network round trip | 30 | 30 | Nearest region |
| Gateway (auth, redaction) | 10 | 10 | |
| Context assembly (server) | 15 | 15 | Index lookups in parallel |
| Queue | 5 | 5 | Kept low by 70% utilisation target |
| Prefill | 32 | 80 | 800 vs 2,000 uncached tokens |
| Decode, 12 tokens × 6 ms | 72 | 72 | One line of code |
| Post-process + render | 5 | 5 | |
| **Total** | **244** | **292** | Target: p50 < 250, p95 < 500 |

Under peak load, larger batches push $\tau$ from about 6 ms to about 10 ms, which is why the capacity estimate in the first topic used 10 ms. That is the usual tension: bigger batches raise throughput per GPU and lower cost, but every request decodes more slowly.

```sim
latency-breakdown
```

Try this in the simulator. Set a prompt of about 2,000 tokens and an output of about 12 tokens, and see that prefill and decode are comparable, so trimming either helps. Then set a chat-like request (8,000 in, 500 out) and watch decode dominate end-to-end time while TTFT stays near a second. Finally raise queueing delay: inline has almost no room for it, chat barely notices.

## The debounce trade-off

A shorter debounce makes ghost text feel instant but fires more requests that the developer will overtake. Model the gaps between keystrokes as exponential with mean $\mu$ (a simplification; real typing is burstier). A request fires when a gap exceeds the debounce $d$, which happens with probability

$$
P(\text{gap} > d) = e^{-d/\mu}
$$

so requests per keystroke equal $e^{-d/\mu}$. With $\mu = 200$ ms:

| Debounce $d$ | Requests per keystroke | Relative load (vs 75 ms) |
|---|---|---|
| 50 ms | 0.78 | 1.13× |
| 75 ms | 0.69 | 1.00× |
| 150 ms | 0.47 | 0.69× |
| 250 ms | 0.29 | 0.42× |

Going from 75 to 150 ms cuts load by about 31% but adds 75 ms to every suggestion. Teams usually pick a short debounce plus aggressive cancellation, and some vary $d$ per context (shorter after a newline or an opening bracket, where a completion is likely wanted).

## Tricks that only inline needs

- **Prefix caching across keystrokes.** Each new request shares almost its whole prompt with the previous one. Route a developer's requests to the same replica (session affinity) so the cache is warm.
- **Client-side reuse.** If the developer types the exact characters the current suggestion predicted, shift the suggestion instead of asking again. No request at all.
- **Small model, speculative decoding off or on.** A draft model helps long outputs; for 12 tokens the gain is small, so measure before adding it.
- **Regional deployment.** 30 ms of round trip is affordable; 150 ms across an ocean is not. Inline clusters go near developers.

## The chat budget

For chat, $T_{\text{TTFT}} = T_{\text{net}} + T_{\text{retrieval}} + T_{\text{queue}} + T_{\text{prefill}}$. With 40 ms network, 300 ms of hybrid search and reranking, 100 ms queue, and an 8,000-token prefill on a 70B model spread over 8 GPUs ($8{,}000 \times 2 \times 7\times10^{10} / (8 \times 4\times10^{14}) = 0.35$ s), TTFT is about $40 + 300 + 100 + 350 = 790$ ms, inside the 1.5 s target. The 500-token answer then streams at 25 ms per token for 12.5 s, about 40 tokens per second, comfortably faster than anyone reads.

## In practice

Report latency percentiles per product, never blended: one dashboard averaging inline (250 ms) and chat (12 s) shows a number that describes neither. For inline, also track the **overtake rate**: the fraction of suggestions that arrive after the developer has typed past them. It is the metric that tells you whether the latency budget is really met where it matters.

```quiz
{"q": "Keystroke gaps are modelled as exponential with mean 200 ms. Moving the debounce from 75 ms to 150 ms changes requests per keystroke from about 0.69 to about what?", "options": ["0.35", "0.47", "0.60", "0.22"], "answer": 1, "explain": "$e^{-150/200} = e^{-0.75} \\approx 0.47$. Halving 0.69 (0.35) assumes load is inversely proportional to the debounce, which the exponential model does not give."}
```

```quiz
{"q": "Inline completion p50 is 290 ms against a 250 ms target. Telemetry shows prefix-cache hit rate is 15% because requests are load-balanced round-robin. What is the most direct fix?", "options": ["Switch to a larger model", "Route each developer's requests to the same replica (session affinity) so consecutive keystrokes reuse the cached prefix", "Increase the debounce to 250 ms", "Stream inline completions token by token"], "answer": 1, "explain": "Consecutive requests share most of their prompt, but only the replica that served the previous one holds it. Affinity raises the hit rate and cuts prefill from ~80 ms toward ~32 ms. A longer debounce adds more latency than it removes."}
```
