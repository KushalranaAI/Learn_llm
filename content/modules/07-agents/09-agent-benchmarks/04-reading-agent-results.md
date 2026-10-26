---
title: Reading agent results: scaffold, attempts and cost
minutes: 9
---

"Model X scores 72% on benchmark Y" sounds like a fact about model X. For agents it almost never is. An agent result is a joint measurement of the **model**, the **scaffold** (the loop, tools, prompts and context management around it, sometimes called the agent harness), the **attempt policy** (how many tries, and how the answer is chosen), and the **budget** (steps, time and money allowed). Change any one and the number moves, sometimes by more than the gap between models.

It is like comparing lap times between racing teams. The driver matters, but so do the car, the tyres, how many laps you were allowed before the timed one, and the fuel budget. A lap record means little without the conditions.

## Four things to find before comparing

| Question | Why it matters | Where it shows up |
|---|---|---|
| **Which scaffold?** | The same model can differ by many points across scaffolds | SWE-bench's "Bash Only" view runs every model in one minimal loop to isolate the model; its two scaffold versions are flagged as not comparable |
| **How many attempts, and who chooses?** | pass@1 vs best-of-k with an oracle vs best-of-k with the agent's own selector | Footnotes, "pass@k", "with test-time compute" |
| **What did it cost?** | A higher score bought with 10× the spend may be a worse product | Cost-aware leaderboards such as HAL; ARC-AGI's efficiency figure |
| **Which version and split?** | Datasets get audited and changed; public vs held-out splits differ | "Verified", "Pro (public)", "v2.0", dates |

## The maths: attempts and cost per solved task

An **oracle** pass@k counts a task as solved if *any* of $k$ attempts is correct, even though in real use nobody tells you which one. It is an upper bound. A realistic best-of-$k$ needs a **selector** (run the tests, use a verifier, ask a judge) that picks the right attempt with some probability $q$:

$$
\text{solved}_{\text{selector}} \approx q \cdot \big(1 - (1 - p)^k\big)
$$

and every attempt costs money, so the honest efficiency number is

$$
\text{cost per solved task} = \frac{k \cdot c}{\text{solved rate}}
$$

where $c$ is the cost of one attempt.

```steps
Two reported results, read properly
Agent A: pass@1 = 0.60 at \$0.50 per attempt. Cost per solved task: $0.50 / 0.60 = \$0.83$.
---
Agent B reports "78%" using the same model with $k = 5$ attempts. Per-attempt success $p = 0.60$ gives oracle pass@5 $= 1 - 0.4^5 = 0.99$; the reported 78% implies a selector that picks correctly about $0.78 / 0.99 = 79\%$ of the time.
---
B's cost per solved task: $5 \times \$0.50 / 0.78 = \$3.21$, almost four times A's.
---
If a human must review every failure at \$5 each, the full cost per task is A: $0.50 + 0.40 \times 5 = \$2.50$; B: $2.50 + 0.22 \times 5 = \$3.60$. A is still cheaper. If failures cost \$50 each, B wins easily. The right answer depends on what failure costs you.
```

The paper "AI Agents That Matter" (2024) made this argument for the field: reporting accuracy without cost rewards needlessly expensive agents, and simple baselines that retry cheaply often sit on the cost-accuracy **Pareto frontier** where elaborate agents do not. It also warned about benchmarks without proper held-out sets, which let agents overfit.

```sim
agent-reliability
{"p": 0.9, "n": 10, "retries": 1, "verify": true}
```

This shows a 10-step task with 90% per-step success. Toggle verification and retries and watch end-to-end success rise: the same model looks much stronger inside a scaffold that checks its work. That is exactly why a benchmark result belongs to the model *and* its scaffold.

## A trend measure that travels well

Because raw scores are tied to specific task sets, METR proposed the **50% time horizon**: the length of task, measured in how long it takes a skilled human, that a model completes with 50% success. It lets results from different task suites sit on one axis. METR estimated that this horizon has doubled roughly every seven months since 2019. It is still a measurement with a scaffold and error bars, but it is a useful way to talk about progress without quoting a single benchmark.

## A reading checklist

1. Model, scaffold and version of each named.
2. Attempts per task and how the final answer was chosen.
3. Cost (or tokens) per task, and the step or time limit.
4. Dataset version and split; contamination safeguards.
5. Error bars, or at least the number of tasks and trials.
6. Whether the authors are also the scaffold's or model's vendor.

If several are missing, treat the number as marketing until reproduced.

```lab
evaluate-an-agent
```

```quiz
{"q": "An agent has per-attempt success 0.5. A result reports oracle pass@3. What value is that, and why is it optimistic?", "options": ["0.875; it assumes you always know which attempt is right", "0.125; it requires all attempts to succeed", "0.5; attempts do not matter", "1.5; three times the single-attempt rate"], "answer": 0, "explain": "1 − 0.5³ = 0.875. In real use you need a selector to pick the correct attempt, which succeeds less than 100% of the time, and you pay for all three attempts. 0.125 is pass^3."}
```

```quiz
{"q": "Agent P: 55% success at 0.20 dollars per task. Agent Q: 70% at 1.00 dollar per task. Cost per solved task?", "options": ["P ≈ 0.36, Q ≈ 1.43 dollars", "P ≈ 0.11, Q ≈ 0.70 dollars", "P ≈ 0.36, Q ≈ 0.70 dollars", "They are equal"], "answer": 0, "explain": "P: 0.20/0.55 = 0.364. Q: 1.00/0.70 = 1.43. Q solves more tasks but each success costs about four times as much; multiplying instead of dividing gives the second option."}
```
