---
title: What RLHF costs, and why most teams left it
minutes: 6
---

[RLHF with PPO](/learn/fine-tuning/preference-tuning/rlhf-ppo) is the method that made instruction-following chat models work: train a reward model on pairs, then let the policy write answers, score them, and update with PPO under a KL leash to the SFT model. The theory is in [Preference tuning](/learn/fine-tuning/preference-tuning). This topic is about the bill.

Think of PPO as running a small company with four employees. The **policy** writes answers. The **reward model** grades them. The **reference model** checks the policy has not drifted into strange territory. The **value model** predicts, token by token, how good the answer is going to be, so the policy can tell which tokens deserve credit. Every training step needs all four, and two of them (policy and value) are being trained at the same time.

## In everyday life

A tuition teacher wants a student's essays to improve. One way is to make the student write brand-new essays every round, mark each one, and use the marks to adjust the student's habits. The slow part is not the marking. It is the waiting while the student writes a full essay, word by word. The other way is to mark a big stack of old essays in one sitting, with no waiting.

The first way is **RLHF** with **PPO**, a method where the model writes fresh answers, a **reward model** (a second model trained to grade answers) scores them, and the model updates. The writing step is called the **rollout**, and it is often the slowest part. The method also needs several large models in memory at once. The second way is the idea behind **DPO**, which learns from a saved set of marked answers and trains almost like ordinary fine-tuning. Newer online methods such as **RLOO** keep the fresh writing but drop one expensive helper: each answer is judged against the average of the other answers to the same prompt, so no extra predictor is needed. Many teams now use saved comparisons for taste, and fresh answers with checkable scores for correctness.

The tuition picture stops at memory: a teacher only spends time, but the model also needs room on a GPU for every helper.

**Where you meet it.** A team building a maths helper can check each answer automatically, so fresh answers are worth the wait. A team polishing tone has no checker, so it learns from a stack of saved comparisons instead.

```scene
title: Fresh essays or a stack of old ones
step: ✍ The student writes a brand-new essay, word by word | rollout, answers generated
step: 👩 A marker grades the essay | reward model scores it
step: 📏 Another check ensures the style has not wandered far | reference model and KL penalty
step: 🔁 Habits are adjusted, then the whole round repeats | policy update
step: 🐌 Waiting for fresh essays eats much of the time | generation dominates the cost
step: 📚 A stack of old marked essays skips the waiting | offline method such as DPO
takeaway: Online methods pay for fresh answers and extra models, which is why many teams use cheaper offline methods when they can.
```

## Where the time goes

A PPO step has two phases. In the **rollout** phase the policy generates complete answers for a batch of prompts, one token at a time, which is inference, not training, and it is slow. Then the reward model scores each answer, the reference model computes log-probabilities for the KL penalty, and the value model computes its estimates. Only then does the **update** phase run several gradient passes over that batch.

```steps
A rough cost count for one PPO step
Batch: 256 prompts, answers of 400 tokens. Generation produces $256 \times 400 = 102{,}400$ tokens autoregressively: 400 sequential decoding steps, each limited by memory bandwidth, not compute.
---
Scoring: one forward pass each through the reward model, the reference and the value model over those 102,400 tokens. Forward passes are cheap per token because they run in parallel.
---
Update: with 4 PPO epochs over the batch, the policy and the value model each run 4 forward and 4 backward passes.
---
Result: in many reported setups, rollout generation is the largest single share of wall-clock time. That is why RL frameworks pair the trainer with a fast inference engine such as vLLM.
```

Memory was the other half of the bill: for an 8B model with full fine-tuning, about 288 GB of model states, more than twice the 128 GB of SFT on the same model (see [the map of methods](/learn/fine-tuning/preference-optimization-methods/the-map-of-methods)). And the hyperparameters multiply: $\beta$, the clip range $\epsilon$, two learning rates, the number of PPO epochs, the rollout batch size, the value-loss weight, reward normalisation.

## Why the open-model world moved to DPO-style methods

When DPO appeared in 2023 it offered most of the benefit of RLHF on chat preference data with none of the rollout machinery: two models instead of four, a loss that trains like SFT, and two or three hyperparameters. Open releases followed quickly. Zephyr (late 2023) and Tulu 2 used DPO; Meta's Llama 3 post-training (2024) used rounds of SFT, rejection sampling and DPO rather than PPO. Tulu 3 (late 2024) combined DPO for general preferences with RL on verifiable rewards for maths and instruction constraints.

That last pattern is where the field has largely settled: **offline preference optimisation for taste** (tone, helpfulness, format) and **online RL with checkable rewards for correctness** (maths, code, tool use). The online part uses PPO's simpler relatives, which drop the value model.

## RLOO: the value model replaced by a baseline

**RLOO** (REINFORCE Leave-One-Out, Ahmadian et al., 2024) samples $k$ answers per prompt and uses the average reward of the *other* answers as the baseline for each one:

$$
\hat A_i = r_i - \frac{1}{k-1}\sum_{j \neq i} r_j
$$

where $r_i$ is the reward of answer $i$ (often including the KL penalty to the reference). No value network is trained. GRPO, covered in [Preference tuning](/learn/fine-tuning/preference-tuning/verifiable-rewards-grpo) and practised in [GRPO hands-on](/learn/fine-tuning/grpo-hands-on), uses the group mean and also divides by the group standard deviation.

```python
# RLOO advantages for k answers to one prompt (no value model needed).
import numpy as np

def rloo_advantages(rewards):
    r = np.asarray(rewards, dtype=float)
    k = len(r)
    loo_mean = (r.sum() - r) / (k - 1)   # mean of the *other* k-1 rewards
    return r - loo_mean

print(rloo_advantages([0.9, 0.3, 0.6, 0.2]).round(3))
# [ 0.533 -0.267  0.133 -0.4  ]
```

Check the first one by hand: the others average $(0.3 + 0.6 + 0.2)/3 = 0.367$, so $\hat A_1 = 0.9 - 0.367 = 0.533$. The best answer is pushed up, the worst pushed down, and the policy never needed a second network to know which was which.

## The current TRL picture (late 2026)

| Trainer | Status in TRL 1.x | Notes |
|---|---|---|
| `PPOTrainer`, `PPOConfig`, value-head models | Removed in later 1.x releases (reported for v1.13, September 2026) | Pin an older TRL release, or use a dedicated RL framework |
| `RLOOTrainer` | Stable | Online, $k$ samples per prompt, no value model |
| `GRPOTrainer` | Stable | Online, group-normalised advantages |
| `DPOTrainer`, `RewardTrainer` | Stable | Offline pairs; reward models for RLOO/GRPO |

Library versions move fast. Treat this table as a snapshot and check the current TRL release notes before you pin a version.

## In practice

Use PPO only if you are reproducing older work or you have a team and a framework built around it. For chat preferences, start offline (DPO and relatives, next topics). For checkable tasks, go online with GRPO or RLOO. If you train a reward model anyway, it is still useful: it can label fresh samples from your current model, turning offline DPO into an iterative "sample, score, retrain" loop that recovers much of the benefit of online learning.

```quiz
{"q": "RLOO samples $k = 4$ answers with rewards $(1.0, 0.0, 0.5, 0.5)$. What is the advantage of the first answer?", "options": ["$+0.667$", "$+0.5$", "$+1.0$", "$+0.333$"], "answer": 0, "explain": "The other three average $(0 + 0.5 + 0.5)/3 = 0.333$, so $\\hat A_1 = 1.0 - 0.333 = 0.667$. Using the mean of all four (0.5) gives $+0.5$; that baseline includes the answer itself, which is exactly what leave-one-out avoids."}
```

```quiz
{"q": "Which PPO component do RLOO and GRPO remove, and what replaces it?", "options": ["The reference model, replaced by weight decay", "The value model, replaced by a baseline computed from other samples for the same prompt", "The reward model, replaced by human labels", "The clipped objective, replaced by DPO's loss"], "answer": 1, "explain": "Both sample several answers per prompt and compare each to the others, which estimates 'how good was this compared to expected' without training a value network. They usually keep a KL term to a reference model, and they still need a reward: a reward model or a checker."}
```
