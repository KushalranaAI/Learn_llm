---
title: GAIA, WebArena, OSWorld and Terminal-Bench
minutes: 9
---

SWE-bench and τ-bench cover code and conversations. Agents are also asked to research questions across the web, operate websites, drive a desktop and work in a terminal. Each of these has a benchmark family with its own environment and grading rule. Knowing how they are built tells you what a score on each one can and cannot mean for your product.

A driving licence is a useful comparison: there are separate tests for cars, motorbikes and lorries, each on its own course with its own examiner checklist. A great lorry score says little about motorbike riding, even though both involve roads.

## Four benchmarks side by side

| Benchmark | Environment | What a task looks like | How it is graded | At publication |
|---|---|---|---|---|
| **GAIA** (2023) | Open web + files + tools | A question needing several steps of search, reading and reasoning, with one short factual answer | Exact match on the final answer | 466 questions; humans 92%, GPT-4 with plugins 15% |
| **WebArena** (2023) | Self-hosted websites: shop, forum, GitLab, CMS, plus tools | "Find the cheapest order from last month and cancel it" | Functional checks on site state or answer | 812 tasks; best GPT-4 agent 14.4%, humans 78.2% |
| **OSWorld** (2024) | Real desktop virtual machines (Ubuntu, with apps) | "Convert this spreadsheet column to dates and save as CSV" | Execution-based scripts inspect the final system state | 369 tasks; humans over 72%, best model 12.2% |
| **Terminal-Bench 2.0** (2026) | A container per task, command line only | Compile, configure, debug, train or deploy something | Task-specific tests, each with a human-written reference solution | 89 tasks; frontier agents under 65% |

Two design choices recur. **Self-hosted, resettable environments** (WebArena's sites, OSWorld's VMs, Terminal-Bench's containers) make tasks reproducible: every trial starts from the same snapshot. And **state-based grading** checks what the agent actually changed rather than what it said.

For tool calling in isolation, without a full environment, the **Berkeley Function Calling Leaderboard** (BFCL) checks whether a model emits correct function calls (right function, right arguments, knowing when *not* to call), now including multi-turn and agentic categories. It is a useful component test; it does not measure whether a whole task gets done.

## The trend, and why numbers aged quickly

All four launched with large human-agent gaps, and all saw scores rise steeply within one to two years as models and scaffolds improved: published OSWorld results, for example, went from the low teens to clusters near the top of an audited "OSWorld-Verified" revision. Specific leaderboard numbers change monthly, so treat any quoted figure as dated. The durable lessons are about method: environments get audited and revised (OSWorld-Verified, SWE-bench Verified), and new, harder sets appear as old ones saturate.

## The maths: small benchmarks have wide error bars

Agent benchmarks are small because each task is expensive to build and verify. That makes their scores noisy:

$$
\text{SE} = \sqrt{\frac{\hat p(1-\hat p)}{n}}
$$

```steps
How precise is a Terminal-Bench score?
89 tasks, an agent resolves 50%: $\text{SE} = \sqrt{0.5 \times 0.5 / 89} = \sqrt{0.00281} = 0.053$.
---
95% interval: $0.50 \pm 1.96 \times 0.053 = 0.50 \pm 0.104$, about 40% to 60%.
---
Two agents at 50% and 56% are not distinguishable from one run. Running every task 5 times reduces the noise from the agent's randomness, but not the uncertainty from having only 89 tasks.
---
Compare WebArena: 812 tasks at 50% gives $\text{SE} = 0.0175$, an interval of about $\pm 3.4$ points. More tasks, much tighter.
```

## Matching benchmark to product

| If your agent... | Most relevant public signal | Still build privately |
|---|---|---|
| Fixes code in repositories | SWE-bench family, Terminal-Bench | Tasks from your repos' history |
| Talks to customers and changes records | τ-bench / τ²-bench | Your policies, tools and data |
| Operates websites | WebArena-style results | Your own web flows in a staging environment |
| Uses a desktop or GUI | OSWorld | Your applications |
| Researches and answers questions | GAIA | Questions from your domain with checkable answers |

## In practice

Use these benchmarks to pick a model and scaffold family that is plausible for your kind of task, then reproduce the benchmark's *design* on your own tasks: resettable environment, state-based checks, several trials per task. The design is the transferable part; the leaderboard number is not.

```quiz
{"q": "An agent scores 40% on a 150-task benchmark. What is the approximate 95% confidence interval?", "options": ["40% ± 4 points", "40% ± 7.8 points", "40% ± 1.6 points", "40% ± 15 points"], "answer": 1, "explain": "SE = √(0.4 × 0.6 / 150) = √0.0016 = 0.04. 1.96 × 0.04 = 0.078. ±4 points is one standard error, not a 95% interval."}
```

```quiz
{"q": "Why do WebArena, OSWorld and Terminal-Bench run tasks in self-hosted, resettable environments rather than on live websites or a shared machine?", "options": ["Live sites are too slow", "So every trial starts from the same state and results are reproducible and checkable, without side effects on real systems", "Because agents cannot use the real internet", "To make the tasks easier"], "answer": 1, "explain": "Live sites change and shared machines carry state between trials, which makes results irreproducible and grading unreliable. Resettable sandboxes fix both and prevent real-world side effects."}
```
