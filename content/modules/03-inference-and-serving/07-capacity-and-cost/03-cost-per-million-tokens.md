---
title: Cost per million tokens
minutes: 7
---

Hosted APIs price in dollars per million tokens, and teams that self-host want a number they can compare. The conversion is a single division, but the interesting part is what is *inside* the denominator: the tokens you actually produce while paying for the GPU, including all the hours it sits idle.

## From a GPU-hour to a price per token

A GPU rented at $c$ dollars per hour, producing $X$ output tokens per second while busy, with average utilisation $\bar{u}$ (the fraction of its saturated throughput it actually delivers over the month), has

$$
\text{cost per 1M output tokens} = \frac{c}{3600 \cdot X \cdot \bar{u}} \times 10^{6}
$$

The denominator is the tokens actually produced per hour. Every point of idle capacity raises the price of the tokens you do produce.

```steps
The same GPU at three utilisations
$c = \$2.50$ per GPU-hour, $X = 6{,}670$ output tokens/s at saturation (the 8B chat replica).
---
At 100% utilisation: tokens per hour $= 3600 \times 6670 = 24.0$ million, so the price is $\$2.50 / 24.0 = \$0.104$ per million output tokens.
---
At 70% (the sizing target): $0.104/0.7 = \$0.149$ per million.
---
At 26% (the earlier average, fleet sized for peak): $0.104/0.26 = \$0.40$ per million. The same hardware costs almost four times as much per token because it is idle most of the time.
```

## Input and output are different

The calculation above counted only output tokens. Prompt tokens also consume GPU time (prefill), at roughly 27 ms per 1,000 tokens in the example, versus decode's roughly 45 ms for 300 output tokens at that batch. A fair way to price them separately is to split GPU time: per 1,000 prompt tokens, 27 ms; per 1,000 output tokens, $1000/6670 = 150$ ms. So at the same utilisation an output token costs about $150/27 = 5.5$ times as much GPU time as an input token. That is consistent with the common API pattern of charging several times more for output than input (typically 3 to 5 times).

| Token type | GPU-seconds per 1,000 tokens | Cost at \$2.50/h, 100% util | Cost at 70% util |
|---|---|---|---|
| Input (prefill) | 0.027 | \$0.019 per million | \$0.027 per million |
| Output (decode, batch 64) | 0.150 | \$0.104 per million | \$0.149 per million |

(Input: 27 GPU-seconds per million tokens $\times\ \$2.50/3600 = \$0.019$. Output: 150 GPU-seconds per million $\times\ \$2.50/3600 = \$0.104$.)

## What moves the price

$$
\text{price per token} \;\propto\; \frac{\text{GPU price}}{\text{tokens per second}\times\text{utilisation}}
$$

Every lever in this module changes one factor:

| Lever | Factor it changes | Typical effect on cost per token |
|---|---|---|
| Larger batch (within SLO) | tokens/s up | Down strongly at first, flat later |
| Quantization (INT8/INT4) | tokens/s up (fewer bytes), also memory for a bigger batch | 1.5x to 3x cheaper |
| Prefix and response caching | Work avoided, so effective tokens/s up | Up to 50%+ on shared-prefix workloads |
| Speculative decoding | tokens/s up at low batch | Mostly improves latency; cost gain at low load |
| Better utilisation (autoscaling, offline fill) | utilisation up | Often the largest single saving |
| Cheaper or newer hardware | GPU price per token/s | Depends on bandwidth per dollar |
| Smaller model (routing easy requests) | tokens/s up a lot | 3x to 10x cheaper per routed request |

## See it

```sim
llm-batching
{"model": "llama3-8b", "gpu": "h100", "batch": 64, "promptTokens": 1000, "outputTokens": 300, "gpuPrice": 2.5}
```

Read the cost per million output tokens at batch 64 and compare it with the \$0.104 above (the sim's efficiency constants differ a little). Try GPU prices of 1.0, 2.5 and 5.0: the cost scales linearly with price, so a 2x cheaper GPU only helps if it does not also deliver half the tokens per second. Then switch to a GPU with more bandwidth per dollar and watch whether the cost per token falls even when the hourly price is higher.

## In practice

When comparing a self-hosted cost with an API price, use the *measured average utilisation* for the denominator, include all GPUs (redundancy, staging, idle zones), and add the non-GPU costs: storage, networking, engineering time, monitoring. A frequent error is quoting the 100%-utilisation number (\$0.10 per million tokens) against an API list price, a comparison that flatters self-hosting by a factor of three or more.

```quiz
{"q": "A GPU costs \\$4.00 per hour and delivers 8,000 output tokens/s when saturated. At 50% average utilisation, what is the cost per million output tokens?", "options": ["About \\$0.28", "About \\$0.14", "About \\$0.056", "\\$0.50"], "answer": 0, "explain": "At saturation the GPU makes $3600 \\times 8000 = 28.8$ million tokens per hour; at 50% utilisation that is 14.4 million. $\\$4.00/14.4 = \\$0.278$ per million. \\$0.14 is the cost at 100% utilisation, forgetting the idle half."}
```

```quiz
{"q": "Why do APIs typically charge several times more per output token than per input token?", "options": ["Output tokens are generated one at a time and are limited by memory bandwidth, so each takes much more GPU time than a prefilled prompt token", "Output tokens are longer", "Input tokens are free to compute", "Output tokens need a bigger model"], "answer": 0, "explain": "Prompt tokens are processed in parallel with high arithmetic intensity, while each output token needs a full pass over the weights shared with only a limited batch. In the worked example an output token used about 5.5 times the GPU time of an input token."}
```
