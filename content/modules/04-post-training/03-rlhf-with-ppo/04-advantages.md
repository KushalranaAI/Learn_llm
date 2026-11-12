---
title: "Advantages: who gets the credit"
minutes: 9
---

A shaped reward says what each token earned. The policy gradient needs something different: how much *better than expected* things went after each token. That is the **advantage**, and it is the number that decides whether a token's probability goes up or down. Get it right and the score at the end of an answer flows back to the tokens that earned it. Get it wrong and only the last token ever learns anything.

Think of a football team that wins 1–0 with a goal in the last minute. Crediting only the scorer is unfair to the defender who stopped three shots earlier. Crediting everyone equally ignores who actually played well. A good credit assignment compares each moment with what the team expected at that moment.

## Three ways to compute it

The general form is the return from step $t$ minus the value baseline:

$$
\hat A_t = \hat G_t - V(s_t)
$$

The choices differ in $\hat G_t$.

**1. What the repo does: the immediate reward.** `train_ppo.py` sets the return to the shaped reward of that token alone, $\hat G_t = r_t$. The comment in the code calls this a tutorial simplification.

**2. Reward-to-go.** The textbook Monte Carlo return sums everything from $t$ to the end, with discount $\gamma$ (the repo's `--gamma` default is 1):

$$
\hat G_t = \sum_{k=t}^{T} \gamma^{\,k-t}\, r_k
$$

**3. Generalised Advantage Estimation (GAE).** Schulman et al. (2015) blend one-step bootstrapped errors with a second knob $\lambda$:

$$
\delta_t = r_t + \gamma V(s_{t+1}) - V(s_t), \qquad \hat A_t = \sum_{l=0}^{T-t} (\gamma\lambda)^l\, \delta_{t+l}
$$

with $V(s_{T+1}) = 0$ because the episode is over. With $\lambda = 1$ GAE equals reward-to-go minus the baseline (unbiased, noisy); with $\lambda = 0$ it is the single $\delta_t$ (low variance, but only as good as $V$). The repo parses `--lam 0.95` but never uses it.

## A worked comparison

Take the 4-token answer from the previous topic: shaped rewards $r = (-0.02, 0.02, -0.05, 1.47)$, value estimates $V = (0.3, 0.4, 0.6, 0.9)$, $\gamma = 1$, $\lambda = 0.95$.

**Repo (immediate):** $\hat A_t = r_t - V_t = (-0.32, -0.38, -0.65, 0.57)$.

**Reward-to-go:** $\hat G = (1.42, 1.44, 1.42, 1.47)$, so $\hat A = (1.12, 1.04, 0.82, 0.57)$.

**GAE:** the TD errors are $\delta_1 = -0.02 + 0.4 - 0.3 = 0.08$, $\delta_2 = 0.02 + 0.6 - 0.4 = 0.22$, $\delta_3 = -0.05 + 0.9 - 0.6 = 0.25$, $\delta_4 = 1.47 + 0 - 0.9 = 0.57$. Working backwards: $\hat A_4 = 0.57$, $\hat A_3 = 0.25 + 0.95 \times 0.57 = 0.79$, $\hat A_2 = 0.22 + 0.95 \times 0.79 = 0.97$, $\hat A_1 = 0.08 + 0.95 \times 0.97 = 1.00$.

| Token | $r_t$ | $V(s_t)$ | Repo $\hat A_t$ | Reward-to-go $\hat A_t$ | GAE ($\lambda = 0.95$) $\hat A_t$ |
|---|---|---|---|---|---|
| 1 | −0.02 | 0.3 | −0.32 | 1.12 | 1.00 |
| 2 | 0.02 | 0.4 | −0.38 | 1.04 | 0.97 |
| 3 | −0.05 | 0.6 | −0.65 | 0.82 | 0.79 |
| 4 | 1.47 | 0.9 | 0.57 | 0.57 | 0.57 |

The answer scored well, so every token that produced it should be reinforced. Reward-to-go and GAE agree. The repo's scheme pushes the first three tokens *down*, because their own immediate reward is near zero and the value head expects more. The 1.5 never reaches them. The value targets have the same problem: the repo trains $V(s_1)$ towards $-0.02$, so the value head learns that early states are worth nothing, which is not what a value function means.

So in the repo, only the final token of each answer gets credit for the reward-model score. That is a known limitation worth fixing if you extend the code, and it is the main reason not to expect large reward gains from the demo.

## The code

From `llm_from_scratch/part_8/train_ppo.py`:

```python
# For tutorial simplicity, treat advantages = shaped_r - old_values (no GAE).
returns = shaped_r                                         # (N,) value target = immediate shaped reward
adv = returns - old_values                                 # (N,)
adv = (adv - adv.mean()) / (adv.std().clamp_min(1e-6))     # whiten across the whole batch
```

The last line is **advantage whitening**: shift to mean 0 and scale to standard deviation 1 across all $N$ action tokens of the batch. For the repo's four values the mean is $-0.195$ and the standard deviation $0.530$, so the whitened advantages are $(-0.24, -0.35, -0.86, 1.44)$. Whitening fixes the scale of the update regardless of how large the rewards are, which is why nearly every PPO implementation does it.

A drop-in GAE for one response (not in the repo; it needs the action tokens of each sample in order, so you would loop over samples instead of using the flattened `act_mask` vector):

```python
def gae(rewards, values, gamma=1.0, lam=0.95):
    # rewards, values: (T,) for ONE response's action tokens, in order
    T = rewards.numel()
    adv = torch.zeros(T)
    last = 0.0
    for t in reversed(range(T)):
        next_v = values[t + 1] if t + 1 < T else 0.0   # episode over: nothing to bootstrap
        delta = rewards[t] + gamma * next_v - values[t]
        last = delta + gamma * lam * last
        adv[t] = last
    return adv, adv + values                           # advantages, value targets

gae(torch.tensor([-0.02, 0.02, -0.05, 1.47]), torch.tensor([0.3, 0.4, 0.6, 0.9]))
# (tensor([1.0033, 0.9719, 0.7915, 0.5700]), tensor([1.3033, 1.3719, 1.3915, 1.4700]))
```

The printed values match the hand calculation. The value target `adv + values` is the **$\lambda$-return**; training $V$ toward it is what makes the next batch's baseline better.

## In practice

- **$\gamma = 1$, $\lambda$ near 0.95** is the standard setting for LLM RLHF. Episodes are short and the only real reward is at the end, so discounting it away would only weaken the signal.
- **Whiten advantages, not just rewards.** Both are common; whitening advantages per batch is the one almost every implementation keeps.
- **A bad value head poisons GAE.** With $\lambda < 1$ the advantages lean on $V$. Early in training, when the head is still random, some setups use $\lambda$ closer to 1 or pre-train the head for a few steps.
- **GRPO drops all of this.** It replaces $V$ with the mean reward of a group of answers to the same prompt and gives every token of an answer the same advantage. That is the [next lesson](/learn/post-training/grpo-from-scratch).

```quiz
{"q": "A 2-token answer has shaped rewards $r = (0, 1)$ and values $V = (0.5, 0.8)$. With $\\gamma = 1$ and $\\lambda = 0.9$, what is the GAE advantage of the first token?", "options": ["0.48", "0.30", "−0.50", "0.50"], "answer": 0, "explain": "$\\delta_2 = 1 + 0 - 0.8 = 0.2$ and $\\delta_1 = 0 + 0.8 - 0.5 = 0.3$, so $\\hat A_1 = 0.3 + 0.9 \\times 0.2 = 0.48$. 0.30 stops at $\\delta_1$ ($\\lambda = 0$). −0.50 is the repo's immediate scheme $r_1 - V_1$, which never sees the final reward. 0.50 is reward-to-go ($\\lambda = 1$): $1 - 0.5$."}
```

```quiz
{"q": "Why does the repo's choice `returns = shaped_r` mostly fail to teach early tokens?", "options": ["Each token's return is only its own reward, so the end-of-answer score never reaches earlier tokens", "Advantage whitening cancels the reward", "The KL penalty is larger than the reward", "The value head cannot see the prompt"], "answer": 0, "explain": "With an immediate return, only the last action's return contains $r_\\phi$; earlier actions see only their tiny KL terms. Reward-to-go or GAE would carry the score backwards. Whitening rescales the advantages but keeps their order, so it cannot create credit that is not there."}
```
