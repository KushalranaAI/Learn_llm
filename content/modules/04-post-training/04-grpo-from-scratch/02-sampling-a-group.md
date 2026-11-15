---
title: Sampling a group and normalising within it
minutes: 9
---

A group-relative baseline only works if the group disagrees with itself. Four identical answers to the same prompt get four identical scores, the mean equals every score, and nothing is learned. So GRPO asks two things of the sampler: draw $G$ completions per prompt from the current policy, and make them different enough that the reward model can rank them.

`train_grpo.py` gets the difference in a blunt way. PPO in `part_8` samples at temperature 0.2; GRPO samples at **temperature 2.0** with top-$k = 3$. Dividing the logits by 2 flattens the distribution, so the second and third candidates are picked far more often, while top-$k$ stops the flattening from reaching the long tail of junk tokens. The result is a group of plausible but varied completions.

```sim
sampling
{"temperature": 2, "topK": 3}
```

These are the repo's GRPO settings. Read "Distinct in 20 draws", then drag the temperature down to 0.2, PPO's setting: the draws collapse onto the top token. A group sampled like that would tie on almost every prompt. Then set top-k to 0 at temperature 2 and watch rare tokens appear: that is what the top-$k$ guard is for.

## In everyday life

A chai-stall owner wants to improve her tea. From one order she makes four cups, each with slightly different ginger, sugar or boiling time, and asks regulars to score them. If she brews four identical cups, the scores come out the same and she learns nothing. The cups have to differ.

Scores also mislead. A strict regular gives every cup a 3, and a cheerful one gives every cup an 8. What matters is how each cup did against the rest of its own batch. So she compares each cup with the batch average, then divides by how widely the scores spread. Now a strict taster and a generous one push her equally hard.

GRPO does this with a model. For one prompt it draws a **group** of answers. The **sampling temperature** is the knob that makes them differ: higher means more adventurous word choices. The **reward model** scores each answer. The **advantage** of an answer is its score minus the group average, divided by the spread of the group. If every answer ties, every advantage is zero and that prompt teaches nothing.

**Where you meet it.** A team trains a model to answer customer questions. If it sampled almost greedily, many questions would give several near-copies and no signal. Normalising inside each group also stops the reward model's own scale from deciding how hard each question pushes the model.

```scene
title: Four cups, one fair comparison
step: 🍵 She brews four cups from one order, each with a small change | sample G completions at a temperature
step: 🗣️ Regulars score every cup | reward model scores each completion
step: 🧮 She averages the four scores for this batch | group mean
step: ➖ Each cup is judged against the batch average | subtract the mean
step: 📏 She rescales by how spread out the scores were | divide by the group spread
step: 🟰 If all four cups tie, nothing is learned that day | zero-variance group
takeaway: A group only teaches something when its answers differ, and normalising inside it makes every prompt count fairly.
```

## Normalising inside the group

Write the rewards of the $G$ completions for prompt $q$ as $r_1, \dots, r_G$. The **group-relative advantage** of completion $i$ is its reward measured against its siblings, in units of their spread:

$$
\mu = \frac{1}{G}\sum_{k=1}^{G} r_k, \qquad \sigma = \sqrt{\frac{1}{G}\sum_{k=1}^{G}(r_k - \mu)^2}, \qquad \hat A_i = \frac{r_i - \mu}{\sigma + \varepsilon}
$$

$\varepsilon$ is a small constant (around $10^{-4}$) that keeps a tied group from dividing by zero. Subtracting $\mu$ is the baseline from topic 1. Dividing by $\sigma$ makes the advantage scale-free: a prompt where the reward model's scores spread over 0.1 and one where they spread over 3.0 push the policy equally hard.

That scale-freedom matters more with a learned reward model than with a checker. A Bradley-Terry reward model is trained only on differences $r_w - r_l$, so its scores have an arbitrary offset and an arbitrary per-prompt scale. Group normalisation throws both away.

**Worked example.** Three prompts, $G = 4$ each.

| Prompt | Rewards $r$ | $\mu$ | Deviations | $\sigma$ | $\hat A$ |
|---|---|---|---|---|---|
| A | $(0.9, 0.5, 0.1, 0.5)$ | 0.5 | $(+0.4, 0, -0.4, 0)$ | $\sqrt{0.08} = 0.283$ | $(+1.41, 0, -1.41, 0)$ |
| B | $(0.3, 0.3, 0.3, 0.3)$ | 0.3 | $(0, 0, 0, 0)$ | 0 | $(0, 0, 0, 0)$ |
| C | $(-2, -1, -3, -2)$ | $-2$ | $(0, +1, -1, 0)$ | $\sqrt{0.5} = 0.707$ | $(0, +1.41, -1.41, 0)$ |

Check prompt A by hand: $\sigma^2 = (0.16 + 0 + 0.16 + 0)/4 = 0.08$, and $0.4 / 0.283 = 1.41$. Prompt C has every reward negative and a spread ten times wider in deviation terms, yet its best answer gets exactly the same $+1.41$ as A's. Prompt B is a **zero-variance group**: every advantage is 0, and the prompt contributes no policy gradient at all. How often that happens for pass/fail rewards is worked out in [Reading a GRPO run](/learn/fine-tuning/grpo-hands-on/reading-a-grpo-run); with a continuous reward model exact ties are rare, but near-ties are common once the policy has converged on a prompt.

```parsons
{"title": "Group-normalised advantages, one row per prompt", "lines": ["rewards = torch.tensor(raw_rewards, dtype=torch.float)   # (B,), B = P*G, grouped by prompt", "r = rewards.view(P, G)                                   # (P, G): one row per prompt", "mean = r.mean(dim=1, keepdim=True)                       # (P, 1)", "dev = r - mean                                           # (P, G)", "std = dev.pow(2).mean(dim=1, keepdim=True).sqrt()        # (P, 1), population std", "adv = (dev / (std + 1e-4)).view(-1)                      # (B,): one advantage per completion"], "explain": "Reshape to one row per prompt first, because every statistic is taken along `dim=1`, inside a group. The deviation needs the mean, the standard deviation needs the deviation, and the advantage needs both. The `view(P, G)` only works because the loop in `train_grpo.py` appends the $G$ completions of each prompt consecutively. The `1e-4` keeps a tied group at advantage 0 instead of `nan`."}
```

## What `part_9` actually computes

The repo splits normalisation into two halves and does them at different granularities. Centring is per group, as above:

```python
# llm_from_scratch/part_9/train_grpo.py (excerpt)
group_mean = torch.zeros(B, dtype=torch.float, device=device)   # (B,)
for pid in range(P):
    idxs = [i for i in range(B) if prompt_id_of[i] == pid]      # the G siblings of prompt pid
    if not idxs:
        continue
    idxs_t = torch.tensor(idxs, dtype=torch.long, device=device)
    group_mean[idxs_t] = raw_rewards_t[idxs_t].mean()           # same mean written to all G
traj_adv = raw_rewards_t - group_mean                           # (B,) centred, not yet scaled
```

Scaling is per batch: after the advantages are copied onto tokens (next topic), the whole flat tensor is standardised with one mean and one standard deviation. The `prompt_id_of` bookkeeping makes the grouping explicit and works whatever order the trajectories arrive in, at the cost of a Python loop.

Batch scaling changes the numbers. Put prompts A and C in one batch, with equal completion lengths. The centred values are $\pm 0.4$ (A), $\pm 1$ (C) and zeros; their standard deviation across the batch is about 0.54. So A's best answer gets $0.4 / 0.54 \approx 0.74$ and C's gets $1 / 0.54 \approx 1.85$. Per-group scaling would give both $1.41$. In the repo's version, prompts on which the reward model spreads its scores widely get pushed harder.

Neither choice is wrong. Per-group scaling treats every prompt as equally informative and amplifies tiny differences in near-tied groups: a group with rewards $(0.300, 0.301, 0.300, 0.300)$ gets a full $\pm$-sized advantage from a difference the reward model cannot really resolve. Batch scaling keeps such a group quiet. Liu et al. (2025) argue for dropping the per-group division for exactly this kind of reason, and TRL exposes both as `scale_rewards="group"` (the default) and `"batch"`, the latter matching `part_9`.

## In practice

- **Temperature is part of the algorithm.** If groups tie too often, raise the sampling temperature or $G$ before touching the learning rate. If completions turn to noise, lower it. Temperature 2.0 is unusually high; it suits a tiny model whose distribution is already sharp after SFT. Library runs usually sample at 0.7 to 1.0.
- **`torch.std` is not the population std.** It divides by $G - 1$ by default. For $G = 4$ that makes $\sigma$ larger by $\sqrt{4/3} \approx 1.15$ and every advantage 13% smaller. It does not change directions, only the effective learning rate.
- **Keep groups contiguous.** Shuffling trajectories before reshaping to `(P, G)` silently mixes prompts into each other's groups; the shapes still line up.

```quiz
{"q": "A group of four has rewards $(1.0, 0.0, 0.0, 0.0)$. What is the advantage of the one rewarded answer, with the population standard deviation and $\\varepsilon$ ignored?", "options": ["$+1.73$", "$+0.75$", "$+1.0$", "$+3.0$"], "answer": 0, "explain": "$\\mu = 0.25$, deviations $(0.75, -0.25, -0.25, -0.25)$, $\\sigma^2 = (0.5625 + 3 \\times 0.0625)/4 = 0.1875$, $\\sigma = 0.433$, so $\\hat A = 0.75/0.433 = 1.73$. $+0.75$ is the centred value before dividing by $\\sigma$, which is what `part_9` holds before its batch-level scaling."}
```

```quiz
{"q": "You double every reward-model score and add 5 to it. What happens to the group-normalised advantages $\\hat A_i$?", "options": ["Nothing: centring removes the 5 and dividing by $\\sigma$ removes the factor 2", "They double", "They all increase by 5", "They double and the zero-variance groups change sign"], "answer": 0, "explain": "$\\mu$ shifts by the same 5 and doubles, so $r_i - \\mu$ doubles; $\\sigma$ also doubles, and the ratio is unchanged (up to the tiny $\\varepsilon$). That invariance is why a Bradley-Terry reward model's arbitrary offset and scale do not matter to GRPO. Without the division by $\\sigma$, the advantages would double, which is the tempting answer."}
```
