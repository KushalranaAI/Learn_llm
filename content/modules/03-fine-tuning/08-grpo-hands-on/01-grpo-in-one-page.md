---
title: GRPO in one page
minutes: 8
---

```predict
{"q":"GRPO samples four answers to one question, and all four earn the same top reward. How hard does this group push the model towards those answers?","options":["Strongly: all four are rewarded","Not at all: every advantage is zero","Weakly: a quarter of the usual push","It pushes them down"],"answer":1,"reveal":"Advantages are measured against the group mean, so identical rewards give $\\sigma = 0$ and every $\\hat A_i = 0$; only the KL term is left. The worked group of four ends on exactly this case."}
```

You already know the idea from [Verifiable rewards and group-relative advantages](/learn/fine-tuning/preference-tuning/verifiable-rewards-grpo): ask the model the same question several times, score every answer with a checker, and push up the answers that beat their siblings. This page collects the whole algorithm in one place, so that every knob in the trainer later in this lesson maps to a symbol you can point at.

The recipe for one training step has four parts. **Group sampling**: for each prompt $q$, sample $G$ completions $o_1, \dots, o_G$ from the current policy. **Group-relative advantage**: score each completion, then compare it with the group's average. **Clipped update**: raise the probability of tokens in above-average completions and lower it for below-average ones, but never by more than a small ratio per step. **KL leash** (optional): penalise drifting too far from the starting model, the **reference model**.

## The objective

Shao et al. (2024, DeepSeekMath) write GRPO as maximising

$$
\mathcal{J}(\theta) = \mathbb{E}\left[\frac{1}{G}\sum_{i=1}^{G}\frac{1}{|o_i|}\sum_{t=1}^{|o_i|}\Big(\min\big(\rho_{i,t}\hat A_{i},\ \operatorname{clip}(\rho_{i,t}, 1-\epsilon, 1+\epsilon)\,\hat A_{i}\big) - \beta\,\mathbb{D}_{\mathrm{KL}}^{(i,t)}\Big)\right]
$$

with

$$
\rho_{i,t} = \frac{\pi_\theta(o_{i,t}\mid q, o_{i,<t})}{\pi_{\theta_{\text{old}}}(o_{i,t}\mid q, o_{i,<t})}, \qquad \hat A_i = \frac{r_i - \operatorname{mean}(r_1..r_G)}{\operatorname{std}(r_1..r_G)}, \qquad \mathbb{D}_{\mathrm{KL}}^{(i,t)} = \frac{\pi_{\text{ref}}}{\pi_\theta} - \log\frac{\pi_{\text{ref}}}{\pi_\theta} - 1 .
$$

$\pi_\theta$ is the policy being trained, $\pi_{\theta_{\text{old}}}$ the copy that generated the samples, $\pi_{\text{ref}}$ the frozen starting model, $r_i$ the scalar reward of completion $i$, $|o_i|$ its length in tokens, $\epsilon$ the clip range (0.2 is typical) and $\beta$ the KL weight. Every token of completion $i$ shares the same advantage $\hat A_i$. The KL term is a per-token estimator that is always $\ge 0$ and equals 0 when the two models agree.

```steps
One group of four, end to end
A GSM8K question; the policy samples $G = 4$ answers. Rewards (correctness 1 + format 1, explained in the next topic): $r = (2, 1, 0, 1)$.
---
Mean $\mu = (2+1+0+1)/4 = 1$. Deviations $(+1, 0, -1, 0)$. Standard deviation $\sigma = \sqrt{(1+0+1+0)/4} = \sqrt{0.5} \approx 0.707$.
---
Advantages $\hat A = (+1.41, 0, -1.41, 0)$. The fully correct, well-formatted answer is pushed up; the empty-handed one is pushed down; the two middling ones are left alone.
---
Clip check for one token of answer 1: suppose after an earlier update on this batch $\rho = 1.3$. Unclipped term $1.3 \times 1.41 = 1.83$; clipped term $1.2 \times 1.41 = 1.70$. The min picks 1.70, a constant, so this token gives no further gradient: it has already moved enough.
---
KL check for one token: $\pi_\theta = 0.5$, $\pi_{\text{ref}} = 0.4$. Ratio $0.8$; $0.8 - \ln 0.8 - 1 = 0.8 + 0.223 - 1 = 0.023$. Multiplied by $\beta = 0.04$ that subtracts about $0.001$ from the objective at that token.
---
If all four answers had scored 2, then $\sigma = 0$, every $\hat A_i = 0$ and the group contributes nothing except the KL term.
```

## What it removes, and the memory that saves

PPO, the classic RLHF algorithm ([RLHF with PPO](/learn/fine-tuning/preference-tuning/rlhf-ppo)), keeps four networks: the policy, the reference, a reward model and a **value model** that predicts the expected reward at every token. The value model is usually the same size as the policy and is trained too, so it brings its own gradients and Adam states.

For a 1.5B model trained fully in mixed precision at 16 bytes per parameter ([Sizing your first run](/learn/fine-tuning/start-here/sizing-your-first-run)), a trained value model costs $1.5 \times 10^9 \times 16 \approx 24$ GB on its own. GRPO drops it entirely: the group mean is the baseline. With verifiable rewards the reward model goes too, replaced by a Python function. What is left is the policy and, when $\beta > 0$, the reference. With LoRA the reference is free as well: it is the same base weights with the adapter switched off.

| Network | PPO | GRPO with a checker |
|---|---|---|
| Policy (trained) | yes | yes |
| Value model (trained) | yes | no |
| Reward model (frozen) | yes | no, a Python function |
| Reference (frozen) | yes | only if $\beta > 0$; free with LoRA |

The price is generation: GRPO needs $G$ full completions per prompt every step, which dominates the run time (topic 4).

## The same pieces in `part_9`

The companion repo implements this loop from scratch in `llm_from_scratch/part_9`. The loss is a PPO clipped objective with the value term deleted:

```python
# llm_from_scratch/part_9/grpo_loss.py (excerpt, comments added)
ratio = torch.exp(new_logp - old_logp)                   # rho_{i,t}, one per completion token
unclipped = ratio * adv                                  # rho * A
clipped = torch.clamp(ratio, 1.0 - clip_ratio, 1.0 + clip_ratio) * adv
policy_loss = -torch.mean(torch.min(unclipped, clipped)) # minus sign: optimisers minimise
kl_ref = kl_mean if kl_mean is not None else new_logp.new_tensor(0.0)
total = policy_loss - ent_coef * entropy + kl_coef * kl_ref   # kl_coef plays the role of beta
```

`train_grpo.py` builds the advantage by subtracting each prompt's group mean from its rewards (`traj_adv = raw_rewards_t - group_mean`), broadcasts it to every token of the trajectory, then divides by the standard deviation of the whole batch rather than each group. Three differences from the library version are worth knowing:

| `part_9` | TRL `GRPOTrainer` |
|---|---|
| Reward from a learned reward model (Part 7) | Any Python functions you pass as `reward_funcs` |
| Mean over group, std over batch | `scale_rewards="group"` by default; `"batch"` matches `part_9` |
| KL as the mean of $\log\pi_\theta - \log\pi_{\text{ref}}$ | The $\frac{\pi_{\text{ref}}}{\pi_\theta} - \log\frac{\pi_{\text{ref}}}{\pi_\theta} - 1$ estimator, weight `beta` |
| `group_size`, `kl_coef`, `resp_len`, clip 0.2 | `num_generations`, `beta`, `max_completion_length`, `epsilon` |
| One gradient step per batch, so $\rho = 1$ | `num_iterations=1` by default, also $\rho = 1$ |

The last row matters. When each batch of samples is used for a single update, $\pi_\theta = \pi_{\theta_{\text{old}}}$ at the moment the gradient is taken, so $\rho = 1$ and the clip never bites. Clipping only does work when you reuse samples for several updates (`num_iterations > 1` in TRL).

## In practice

TRL's default loss is not the exact formula above. The paper averages each completion over its own length, $1/|o_i|$, which slightly favours short correct answers and long wrong ones; TRL's default `loss_type="dapo"` instead averages over all tokens in the batch, and other options exist (check the current TRL docs for the list). TRL's default `beta` is also 0.0, which skips the reference model. DeepSeekMath used $\beta = 0.04$. Recent reasoning recipes often use 0 or very small values, relying on the clip and a low learning rate to stay close to the start.

```parsons
{"title":"Order one from-scratch GRPO step for a prompt q (`old_logp` holds the sampling policy's log-probabilities; one update per batch, so rho = 1 and the clip is left out)","lines":["group = [sample(policy, q, temperature=1.0) for _ in range(G)]","r = torch.tensor([reward(q, o) for o in group])","adv = (r - r.mean()) / (r.std(unbiased=False) + 1e-4)","loss = -(adv * torch.exp(seq_logp(policy, q, group) - old_logp)).mean()","loss.backward()","optimizer.step()"],"explain":"Sample a group of $G$ answers to the same prompt, score each with the checker, then normalise within this group: subtract the group mean and divide by the group standard deviation, so $\\hat A_i$ says how much better answer $i$ was than its siblings. Only then can the loss weight each answer's ratio by its advantage. The minus sign turns the objective into something the optimiser minimises; the small constant keeps an all-tied group (standard deviation 0) from dividing by zero, and its advantages are all 0."}
```

```quiz
{"q": "A group of $G = 4$ has rewards $(1, 1, 0, 0)$. What advantage does each correct answer get, with the population standard deviation?", "options": ["$+1$", "$+0.5$", "$+2$", "$+0.71$"], "answer": 0, "explain": "$\\mu = 0.5$, deviations $\\pm 0.5$, $\\sigma = \\sqrt{0.25} = 0.5$, so $\\hat A = 0.5/0.5 = +1$. $+0.5$ is the deviation before dividing by $\\sigma$, which is what `part_9` uses before its batch-level normalisation."}
```

```quiz
{"q": "You run GRPO with `num_iterations=1`. Which part of the objective has no effect on the gradient?", "options": ["The advantage", "The clip on the ratio", "The KL term", "The $1/|o_i|$ normalisation"], "answer": 1, "explain": "With one update per batch the policy equals the sampling policy when the gradient is taken, so $\\rho = 1$, which is inside $[0.8, 1.2]$: the clip never activates. The KL term still acts whenever $\\beta > 0$, because the reference differs from the policy once training has moved it."}
```
