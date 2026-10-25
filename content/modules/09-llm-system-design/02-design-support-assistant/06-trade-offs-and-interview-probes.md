---
title: Trade-offs and what the interviewer probes
minutes: 8
---

By the last fifteen minutes the interviewer has a picture of your design. What they want now is evidence that you know where it bends: which choices you would reverse under different constraints, and what you would measure to decide. Good candidates name the alternative, the number that decides between them, and the default they would ship.

## Trade-off 1: one large model or a routed pair

Routing sends easy turns (order status, simple FAQ) to a small model and keeps the large model for complaints, multi-step policy questions and actions. If a fraction $s$ of turns goes to the small model, daily cost is

$$
\text{cost} = (1-s)\,K_{L} + s\,K_{S}
$$

where $K_L$ and $K_S$ are the daily cost of sending *all* turns to the large or small model. With the hypothetical prices, $K_L = \$3{,}960$ and $K_S = 3{,}000 \times 0.10 + 240 \times 0.40 = \$396$. At $s = 0.6$: $0.4 \times 3{,}960 + 0.6 \times 396 = 1{,}584 + 237.6 = \$1{,}821.60$ a day, or about **\$54,648 a month** instead of \$118,800.

| | Single large model | Routed small + large |
|---|---|---|
| Monthly cost (hypothetical) | \$118,800 | about \$54,650 |
| Quality risk | Lowest | Misrouted hard turns get weaker answers |
| Latency | One model, one profile | Small model is faster on easy turns |
| Ops | Simple | Router to train, evaluate and monitor |
| Ship first? | Yes, to set the quality baseline | Add once you have labelled traffic |

Remember the economics topic: a single false resolution costs about \$25, so a router that saves \$2,100 a day but misroutes enough hard turns to cause 100 extra false resolutions a day (\$2,500) loses money. Measure the router's error on hard intents specifically.

## Trade-off 2: API or self-hosted

Self-hosting an 8B-class model on 10 GPUs costs about \$18,250 a month in GPU time; the API costs \$92,880 with prompt caching. The gap looks decisive until you add an engineer or two to run serving, on-call and upgrades, and accept that the self-hosted model is smaller than the API's large model. A reasonable answer: start on the API for quality and speed of iteration; self-host the high-volume, easy-intent traffic once the router has shown which intents a small model handles well, and keep the API as fallback.

## Trade-off 3: autonomy

| Choice | More autonomy (bot acts) | Less autonomy (bot prepares, human approves) |
|---|---|---|
| Containment | Higher | Lower |
| Error cost | Real money and trust | Human time |
| Attack surface | Injection can trigger actions | Injection can only draft |
| When to choose | Reversible, low-value, policy fully codified | Irreversible, high-value, judgement calls |

## Trade-off 4: fixed workflow or open agent

A fixed per-intent workflow (route, retrieve, maybe one tool, answer) is predictable and cheap to debug. An open agent loop handles odd multi-issue conversations better but has more steps to fail: if each step succeeds with probability $p$, $n$ steps succeed with $p^n$, so $0.97^{6} \approx 0.83$. Default to workflows; allow a bounded agent loop (at most four tool calls) only for intents where workflows measurably fail.

## What interviewers probe

| Probe | What a strong answer contains |
|---|---|
| "How do you know it is working?" | Containment *with* 7-day repeat-contact rate, CSAT on bot vs human, offline suite of about 700 conversations |
| "A customer says the bot promised a refund." | Traces with prompt version, chunk ids and tool calls; policy engine logs show it could not have issued it |
| "Policy changed an hour ago." | CMS-triggered re-embedding in minutes, versioned chunks, conflicting-article alerts |
| "Black Friday is 10x traffic." | About 21M input tokens per minute pre-negotiated, degradation order, escalation thresholds |
| "Cut cost by half." | Routing to a small model, prompt caching, history summarisation, and proof that false resolutions did not rise |
| "What about other languages?" | Per-language eval sets, multilingual embeddings, translated policies reviewed by humans |

```steps
A two-minute closing summary
Goal: resolve support contacts correctly; main metric containment with repeat-contact guard.
---
Scale: 200k conversations, 1.2M turns a day, 41.7 turns/s peak, about \$119k a month before optimisation (hypothetical prices).
---
Design: deterministic orchestrator, small router, help-centre RAG with reranking, tools behind a code policy engine, summarised hand-off.
---
Risks and mitigations: injection (identity from session, policy in code), stale policy (versioned ingestion), outages (fallback provider, degradation plan).
---
Next steps: routing and caching for cost, then expand actions tier by tier as audits allow.
```

## In practice

The best design interviews end with a priority order, not a feature list. Say what you would build in week one (answers plus hand-off), month one (read-only tools, evaluation suite) and quarter one (refund tier, routing). It shows you know the order in which risk should be taken on.

```quiz
{"q": "All-large costs \\$3,960 a day and all-small \\$396 a day. What is the daily cost if 60% of turns go to the small model?", "options": ["\\$1,584", "\\$1,821.60", "\\$2,376", "\\$2,534.40"], "answer": 1, "explain": "0.4 × 3,960 + 0.6 × 396 = 1,584 + 237.60 = \\$1,821.60. \\$1,584 forgets the small model's share; \\$2,534.40 swaps the fractions."}
```

Now build it. The lab has you size and wire this design yourself; the sandbox lets you run the agent against tricky customers and watch the guardrails work.

```lab
design-support-bot
```

```sandbox
support-agent
```
