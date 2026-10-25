---
title: TTFT, TPOT and inter-token latency up close
minutes: 7
---

Streaming changes what "fast" means. A non-streamed answer that takes 8 seconds feels broken; the same answer streamed, with the first words after 300 ms and a steady flow afterwards, feels responsive. People judge the start and the rhythm separately, so we measure them separately.

The previous topic defined TPOT as an average. That average hides something users notice immediately: **stutter**. If tokens arrive every 25 ms and then pause for half a second, the average barely moves but the text visibly freezes. To see stutter you need the individual gaps.

## Inter-token latency

Let the client record a timestamp $t_0$ when it sends the request and $t_1, t_2, \dots, t_{n}$ when each output token arrives, with $n = n_{out}$. Then

$$
\text{TTFT} = t_1 - t_0, \qquad \text{ITL}_i = t_{i} - t_{i-1} \quad (i = 2, \dots, n)
$$

Each $\text{ITL}_i$ is one **inter-token latency**. There are $n-1$ of them, and TPOT is their mean:

$$
\text{TPOT} = \frac{1}{n-1}\sum_{i=2}^{n} \text{ITL}_i = \frac{t_n - t_1}{n-1}
$$

The sum telescopes: adding up all the gaps from token 1 to token $n$ gives just the last timestamp minus the first. So TPOT needs only two timestamps, while the ITL distribution needs all of them.

```steps
Ten tokens with a stall
A client sends at $t_0 = 0$ and receives ten tokens at (ms): 300, 325, 350, 375, 400, 900, 925, 950, 975, 1000.
---
TTFT $= 300 - 0 = 300$ ms.
---
The nine gaps are 25, 25, 25, 25, **500**, 25, 25, 25, 25 ms.
---
TPOT $= (1000 - 300)/9 = 77.8$ ms. It looks like a uniformly slow model at about 13 tokens/s.
---
The truth: eight gaps are 25 ms (40 tokens/s) and one is a 500 ms freeze. The median ITL is 25 ms and the maximum is 500 ms. The fix for a stall (often another user's long prompt being prefilled in the same batch) is completely different from the fix for a slow model.
```

That 500 ms freeze is typical of a server that pauses all running decodes while it prefills a newly arrived long prompt. You will meet the cure, **chunked prefill**, in the batching lesson.

## Where TTFT comes from

Of the three terms in $\text{TTFT} = t_{net} + t_{queue} + t_{prefill}$, prefill is the one that scales with the prompt. A forward pass costs about $2N$ floating-point operations per token for a model with $N$ parameters (derived in the next lesson), so a prompt of $n_{in}$ tokens costs about $2 N n_{in}$ FLOPs. On a GPU delivering an effective $F$ FLOP/s:

$$
t_{prefill} \approx \frac{2 N n_{in}}{F}
$$

For an 8-billion-parameter model and a 2,000-token prompt, that is $2 \times 8\times10^{9} \times 2000 = 3.2 \times 10^{13}$ FLOPs. If the GPU sustains $5 \times 10^{14}$ FLOP/s (roughly half the dense BF16 peak of an H100), prefill takes $3.2\times10^{13} / 5\times10^{14} = 0.064$ s, about 64 ms. Quadruple the prompt and prefill takes about 256 ms: TTFT is roughly linear in prompt length until attention's quadratic term starts to matter at long contexts.

## Where TPOT comes from

Each decode step produces one token per active sequence, and the step time is dominated by reading the model's weights from GPU memory (the subject of the next lesson). With more sequences sharing a step, the weights are read once for all of them, so the server's total throughput rises, but each step also has more work, so each user's TPOT rises. That tension, more users per step versus speed for each user, runs through this whole module.

| Symptom | Likely cause | First thing to check |
|---|---|---|
| TTFT high, TPOT normal | Queueing or long prompts | Queue depth, prompt length distribution |
| TPOT high, smooth | Batches too large or long contexts | Running batch size, average context length |
| Median ITL fine, max ITL huge | Prefill interrupting decode | Whether chunked prefill is enabled |
| Both high at the same hour daily | Load peak, capacity short | Requests per second vs capacity |

## See it

```sim
latency-breakdown
{"model": "llama3-8b", "gpu": "h100", "promptTokens": 8000, "outputTokens": 50}
```

Set a short output (about 50 tokens) and a long prompt, then a long output (about 1,000 tokens) and a short prompt. With the short output, TTFT is most of the total; with the long output, decode dominates. A code-completion product lives in the first regime, an essay writer in the second, and they need different optimisations.

## In practice

Measure on the client side whenever you can. Server-side TTFT starts when the server dequeues the request, so it silently drops queue and network time, exactly the parts that blow up under load. Also count tokens the same way the model does: some streaming APIs bundle several tokens in one event, which makes ITL look bursty. Engines and load-testing tools usually report TTFT, TPOT and ITL percentiles directly; know which definition each tool uses before comparing numbers from two of them.

```quiz
{"q": "A stream's first token arrives at 200 ms and its 101st (last) token at 4,200 ms after sending. What is the TPOT?", "options": ["40 ms", "41.6 ms", "42 ms", "39.6 ms"], "answer": 0, "explain": "TPOT $= (t_n - t_1)/(n-1) = (4200 - 200)/100 = 40$ ms. Dividing the whole 4,200 ms by 101 tokens gives 41.6 ms, which wrongly mixes TTFT into the decode rate."}
```

```quiz
{"q": "Users complain that answers \"freeze for a moment\" mid-stream, but your dashboard shows TPOT unchanged at 30 ms. What should you look at?", "options": ["The distribution of inter-token latencies, especially the maximum or p99 ITL", "Mean TTFT", "Total tokens per second across the server", "The number of output tokens per answer"], "answer": 0, "explain": "TPOT is a mean over gaps, so a few long pauses barely move it. The ITL tail shows them directly. TTFT and server throughput describe different things, and answer length does not cause pauses."}
```
