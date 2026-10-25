---
title: How many GPUs for peak traffic
minutes: 8
---

If one GPU can serve 13.9 requests per second at saturation and your peak is 100 requests per second, the naive answer is $100/13.9 = 7.2$, so 8 GPUs. That answer will page you at 2 a.m. A server run at 100% of its saturated capacity has no slack: any burst builds a queue, TTFT climbs, and the SLO breaks. The real formula adds a **target utilisation** below 100%, rounds up, and then adds redundancy.

## The sizing formula

With peak request rate $\lambda_{peak}$, saturated per-GPU capacity $\lambda_{max}$ and target utilisation $u \in (0, 1)$:

$$
G = \left\lceil \frac{\lambda_{peak}}{\lambda_{max}\cdot u} \right\rceil
$$

The ceiling matters because GPUs come in whole units. The same formula works in tokens per second (peak output tokens per second divided by per-GPU tokens per second times $u$), which is how it is usually written when you plan from token volumes instead of request counts.

Why $u$ below 1? Queueing theory gives the intuition. In the simplest model (random arrivals, random service times, one server), the mean time a request waits before service grows as

$$
\frac{W_q}{\text{mean service time}} = \frac{\rho}{1 - \rho}
$$

where $\rho$ is utilisation (the fraction of time the server is busy). The wait explodes as $\rho \to 1$:

| Utilisation $\rho$ | Wait as a multiple of service time |
|---|---|
| 0.50 | 1.0 |
| 0.70 | 2.3 |
| 0.80 | 4.0 |
| 0.90 | 9.0 |
| 0.95 | 19 |

A real LLM replica is more complicated (it serves many requests at once, and continuous batching absorbs bursts by raising the batch up to a limit), but the shape is the same: past about 70 to 80% of saturated throughput, latency rises steeply, and the memory limit on concurrent sequences creates a hard wall.

```steps
Sizing the chat fleet
Peak $\lambda_{peak} = 100$ requests/s; per-GPU saturated capacity $\lambda_{max} = 13.9$ req/s (previous topic); target utilisation $u = 0.7$.
---
Raw GPUs at saturation: $100/13.9 = 7.2$.
---
With headroom: $100/(13.9 \times 0.7) = 100/9.73 = 10.3$, so $G = \lceil 10.3 \rceil = 11$ GPUs.
---
Redundancy, N+1: add one spare so that losing a GPU does not push the rest over target: 12 GPUs.
---
Failure-domain redundancy: if the fleet spans 3 zones and must survive losing one, remaining capacity must still cover peak: $G \cdot (2/3) \ge 11$, so $G = \lceil 16.5 \rceil = 17$ GPUs. The cost of surviving a zone outage here is 6 extra GPUs.
```

## Peak versus average

Fleets are sized for the peak, but paid for all month. If the daily curve is spiky, you pay for capacity that sits idle most of the time. The **peak-to-average ratio** $r = \lambda_{peak}/\bar{\lambda}$ determines average utilisation:

$$
\bar{u} = \frac{\bar{\lambda}}{G\,\lambda_{max}}
$$

With $G = 11$, $\lambda_{max} = 13.9$ and an average load of 40 req/s ($r = 2.5$): $\bar{u} = 40/(11 \times 13.9) = 26\%$. Three quarters of the GPU-hours you pay for are idle on average. Cost per request then reflects $\bar{u}$, not the efficiency at peak (next topic).

Ways to lower the bill despite a spiky load:

- **Autoscale** replicas with the daily pattern. GPUs take minutes to start (scheduling the node, pulling the container image, loading tens of GB of weights, warming kernels), so scaling must lead the load rather than follow it, and it works for slow daily curves, not for second-scale bursts.
- **Separate traffic classes**: interactive requests get the headroom; batch and offline work fills the valleys and is paused or preempted at peak.
- **Shed or degrade** at the extreme: serve a smaller model, shorter answers or a queue-with-estimate when load exceeds the plan (lessons in the production module).
- **Spillover**: keep a smaller fleet for the baseline and overflow bursts to a hosted API billed per token.

## See it

```sim
gpu-capacity
{"qps": 100, "promptTokens": 1000, "outputTokens": 300, "model": "llama3-8b", "gpu": "h100", "batch": 64, "targetUtil": 0.7, "gpuPrice": 2.5}
```

Check the sim's GPU count against the 11 above (differences come from its efficiency constants). Move target utilisation from 0.7 to 0.9 and see the GPU count fall and the monthly cost with it; that saving is what you are borrowing from your latency SLO. Then set requests per second to 40 (the average) and compare the cost per 1k requests with the peak-sized fleet. Finally, try an H200 and a B200 and see whether fewer, faster GPUs lower the monthly bill.

```lab
capacity-plan
```

## In practice

Write the plan down as a small table: peak and average load, length distributions, per-GPU capacity (measured), target utilisation and why, redundancy policy, resulting GPU count, and the monthly cost at that count. Revisit when traffic grows 30%, when output lengths drift, or when you change the model. A common mistake is sizing for average load plus a vague "buffer": the SLO is violated exactly at peak, which is the only time anyone is watching.

```quiz
{"q": "Peak load is 60 requests/s, each GPU sustains 8 requests/s at saturation, and you target 75% utilisation. How many GPUs do you need, before redundancy?", "options": ["10", "8", "7.5, so 8", "11"], "answer": 0, "explain": "$60/(8 \\times 0.75) = 60/6 = 10$ exactly. Ignoring utilisation gives $60/8 = 7.5 \\to 8$, which would run at 94% at peak."}
```

```quiz
{"q": "A fleet of 12 GPUs, each saturating at 10 requests/s, serves an average of 36 requests/s. What is the average utilisation?", "options": ["30%", "36%", "300%", "83%"], "answer": 0, "explain": "$36/(12 \\times 10) = 0.30$. The fleet is sized for peak, so on average most capacity is idle. 83% would be the utilisation at a peak of 100 req/s."}
```
