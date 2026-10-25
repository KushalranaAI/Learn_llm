---
title: "Parallel specialists: latency and tokens"
minutes: 9
---

The strongest case for several agents is a task made of independent pieces. Eight documents to analyse, six competitors to research, ten files to refactor: none of the pieces needs the result of another, so nothing forces them to run one after another. Run them in parallel and the clock stops when the slowest finishes, not when all have.

It is the difference between one cashier serving a queue and four tills open at once. The queue of shoppers is unchanged, but the waiting is quartered, as long as the shoppers do not need to talk to each other.

## Latency: the parallel speedup

Suppose a task has $m$ independent subtasks, each taking time $t$ for one agent. With $A$ agents working in parallel, subtasks are processed in rounds of $A$, so the number of rounds is $\lceil m/A \rceil$. Add a fixed coordination time $c$ for planning and combining:

$$
T_\text{single} = m\,t, \qquad T_\text{multi} = \Big\lceil \frac{m}{A} \Big\rceil t + c, \qquad \text{speedup} = \frac{T_\text{single}}{T_\text{multi}}
$$

```steps
Worked example: 8 subtasks of 20 s, 4 agents, 10 s of coordination
Single agent: $T_\text{single} = 8 \times 20 = 160$ s.
---
Four agents: $\lceil 8/4 \rceil = 2$ rounds of 20 s, plus 10 s of planning and synthesis: $T_\text{multi} = 2 \times 20 + 10 = 50$ s.
---
Speedup: $160 / 50 = 3.2\times$, not the ideal $4\times$, because coordination time is serial.
---
With 8 agents: $1 \times 20 + 10 = 30$ s, speedup $5.3\times$. Doubling agents from 4 to 8 bought only $1.7\times$ more, and the fixed 10 s now makes up a third of the time. Returns diminish.
```

This is **Amdahl's law** in miniature: the serial part (planning, combining) caps the gain however many agents you add. It is also limited by external rate limits: eight agents hitting the same API at once may be throttled, and then the slowest wait dominates.

## Tokens: the surprising effect of isolated contexts

Parallel agents use at least as many calls as one agent, and each repeats the system prompt and tool definitions. So do they cost more tokens? Not necessarily. Because a single agent's context **grows** across all subtasks, its input tokens grow quadratically, whereas isolated agents each start fresh.

```steps
Worked example: 8 subtasks, 5 steps each
Take $c_0 = 3{,}000$ and $\Delta = 1{,}000$ per step. One agent does all $8 \times 5 = 40$ steps in a single growing context: $I = 40 \times 3{,}000 + 1{,}000 \times \frac{40 \times 39}{2} = 120{,}000 + 780{,}000 = 900{,}000$ input tokens.
---
Eight isolated sub-agents each do 5 steps: $I_\text{sub} = 5 \times 3{,}000 + 1{,}000 \times \frac{5 \times 4}{2} = 15{,}000 + 10{,}000 = 25{,}000$. Eight of them: $200{,}000$.
---
Add the orchestrator: one planning call (about 3,000 tokens in) and one synthesis call that reads the plan plus eight short results, about $3{,}000 + 8 \times 600 = 7{,}800$. Overhead $\approx 10{,}800$.
---
Total $\approx 211{,}000$ input tokens against $900{,}000$ for the single long context: about **77% fewer**, as well as faster.
```

The effect is real but depends on the task. If the single agent would have **compacted or pruned** its context (previous lesson), it would close part of the gap. And if the subtasks need shared background that must be copied into every sub-agent, $c_0$ grows and the saving shrinks. The honest conclusion is that parallel specialists can cost less **or** more than a single agent; compute it for your own numbers rather than assuming either.

## What makes a subtask a good candidate

| Property | Why it matters |
|---|---|
| Independent: no subtask needs another's result | Otherwise they cannot run in parallel |
| Self-contained brief | The sub-agent starts with no memory of the conversation, so its prompt must contain everything it needs |
| Small, structured output | The orchestrator pays to read every result; return a summary, not the raw material |
| Roughly equal duration | The slowest sub-agent sets the finish time |

## In practice

The pattern that works is a short, precise **brief** per sub-agent (goal, constraints, what to return, a step budget) and a structured result format (JSON with fixed fields, a few hundred tokens at most). Give each sub-agent its own step cap and deadline, so one stuck worker cannot hold up the rest, and decide beforehand what the orchestrator does if one worker fails: proceed with partial results, retry that worker, or fail the run.

```quiz
{"q": "10 independent subtasks of 12 s each, 5 agents in parallel, 8 s of coordination. What is the total time?", "options": ["32 s", "24 s", "128 s", "20 s"], "answer": 0, "explain": "⌈10/5⌉ = 2 rounds × 12 s = 24 s, plus 8 s coordination = 32 s. The single-agent time is 120 s, so the speedup is 3.75×, not 5×, because the coordination is serial."}
```

```quiz
{"q": "Why can eight isolated sub-agents use fewer input tokens than one agent doing the same 40 steps?", "options": ["Each sub-agent's context stays short, avoiding the quadratic growth of one long context", "Sub-agents do not have system prompts", "Parallel calls are free", "Models read faster in parallel"], "answer": 0, "explain": "Input tokens grow with the square of the number of steps in one context. Eight contexts of 5 steps each cost far less than one context of 40 steps, even though every sub-agent repeats the fixed prompt."}
```
