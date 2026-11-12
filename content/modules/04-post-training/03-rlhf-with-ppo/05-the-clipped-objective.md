---
title: The clipped objective, value loss and entropy
minutes: 9
---

With advantages in hand, the simplest update is the policy gradient from topic 1: raise $\log \pi$ in proportion to $\hat A$. Its weakness is that one batch of samples says nothing about how far the policy can safely move. A large step on a lucky batch can wreck a model that took hours of SFT to build, and in RL the damaged policy then generates the next batch, so the damage feeds itself.

**Proximal Policy Optimization** (Schulman et al., 2017) fixes this with a cheap trick. It compares the new policy with the one that generated the samples, token by token, and stops rewarding any token whose probability has already moved more than a fraction $\epsilon$ in the helpful direction. The [theory lesson](/learn/fine-tuning/preference-tuning/rlhf-ppo) shows the objective; here it is in code, with the value and entropy terms that come with it.

## The three terms

The **probability ratio** for action token $t$ is

$$
\rho_t = \frac{\pi_\theta(a_t \mid s_t)}{\pi_{\theta_{\text{old}}}(a_t \mid s_t)} = \exp\!\big(\log \pi_\theta(a_t \mid s_t) - \log \pi_{\theta_{\text{old}}}(a_t \mid s_t)\big)
$$

and the loss the repo minimises over the $N$ action tokens of a batch is

$$
\mathcal{L} = \underbrace{-\frac{1}{N}\sum_t \min\!\big(\rho_t \hat A_t,\; \text{clip}(\rho_t, 1-\epsilon, 1+\epsilon)\,\hat A_t\big)}_{\text{policy loss}} + c_v \underbrace{\frac{1}{N}\sum_t \big(V_\theta(s_t) - \hat G_t\big)^2}_{\text{value loss}} - c_e\, \underbrace{H}_{\text{entropy}}
$$

with $\epsilon = 0.2$, $c_v = 0.5$ and $c_e = 0$ in `train_ppo.py`. The `min` makes the objective **pessimistic**: it takes the clipped version only when clipping makes things look worse, so the policy can never profit from overshooting, but is always free to undo a step that went the wrong way.

From `llm_from_scratch/part_8/ppo_loss.py`:

```python
def ppo_losses(new_logp, old_logp, adv, new_values, old_values, returns,
               clip_ratio=0.2, vf_coef=0.5, ent_coef=0.0):
    ratio = torch.exp(new_logp - old_logp)                                     # (N,)
    unclipped = ratio * adv                                                    # (N,)
    clipped = torch.clamp(ratio, 1.0 - clip_ratio, 1.0 + clip_ratio) * adv     # (N,)
    policy_loss = -torch.mean(torch.min(unclipped, clipped))                   # scalar

    value_loss = F.mse_loss(new_values, returns)                               # scalar
    entropy = -new_logp.mean()             # proxy: mean surprisal of the sampled tokens
    approx_kl = torch.mean(old_logp - new_logp)                                # logged only
    total = policy_loss + vf_coef * value_loss - ent_coef * entropy
    return PPOLossOut(policy_loss, value_loss, entropy, approx_kl, total)
```

`old_values` is passed in but unused: the repo does not clip the value update, which some implementations also do.

## A worked batch of four tokens

| Token | $\rho_t$ | $\hat A_t$ | $\rho_t \hat A_t$ | clipped term | min | gradient? |
|---|---|---|---|---|---|---|
| 1 | 1.35 | +0.8 | 1.08 | $1.2 \times 0.8 = 0.96$ | 0.96 | no: already pushed up enough |
| 2 | 0.75 | −1.2 | −0.90 | $0.8 \times (-1.2) = -0.96$ | −0.96 | no: already pushed down enough |
| 3 | 1.05 | −0.5 | −0.525 | −0.525 | −0.525 | yes: inside the range |
| 4 | 1.25 | −0.6 | −0.75 | $1.2 \times (-0.6) = -0.72$ | −0.75 | yes: a bad token went *up*, so it is pulled back |

Policy loss: $-\tfrac{1}{4}(0.96 - 0.96 - 0.525 - 0.75) = 0.319$. Token 4 is the case people miss: its ratio is outside the range, but clipping only ever removes the *incentive* to move further, never the penalty for a mistake. Running these numbers through `ppo_losses` and autograd confirms it: the gradient of the policy loss with respect to the four new log-probs is $(0, 0, 0.131, 0.188)$. The two clipped tokens get exactly zero; the positive gradients on tokens 3 and 4 mean gradient descent will lower their probabilities, as their negative advantages demand.

Add a value loss. With predicted values $(0.2, 0.5, -0.1, 0.4)$ and targets $(0.5, 0.1, 0.0, 1.0)$, the squared errors are $0.09, 0.16, 0.01, 0.36$, mean $0.155$. The total is $0.319 + 0.5 \times 0.155 = 0.396$, which is what the function returns.

```parsons
{"title": "Put the clipped policy loss in order", "lines": ["def clipped_policy_loss(new_logp, old_logp, adv, clip_ratio=0.2):", "    ratio = torch.exp(new_logp - old_logp)", "    clipped_ratio = torch.clamp(ratio, 1.0 - clip_ratio, 1.0 + clip_ratio)", "    surrogate = torch.min(ratio * adv, clipped_ratio * adv)", "    policy_loss = -surrogate.mean()", "    return policy_loss"], "explain": "The ratio comes from a difference of log-probs (a division in probability space). The clamp acts on the ratio, *not* on the product with the advantage, and the `min` compares the two products. The minus sign turns the objective PPO maximises into a loss the optimiser minimises."}
```

## Entropy and the approximate KL

The true **entropy** of the next-token distribution is $H = -\sum_{v=1}^{V} \pi(v \mid s_t) \log \pi(v \mid s_t)$, which needs the full softmax. The repo uses $-\frac{1}{N}\sum_t \log \pi(a_t \mid s_t)$, the average surprisal of the tokens that were sampled. For the four tokens above (new log-probs $-1.0, -2.0, -0.5, -1.5$) it is $1.25$ nats. It is a rough single-sample stand-in, and with `ent_coef = 0` it is only logged.

`approx_kl` $= \frac{1}{N}\sum_t (\log \pi_{\text{old}} - \log \pi_\theta)$ measures how far this update moved the policy, $-0.071$ for the example (again a sample estimate, so it can be negative). It is a guard rail: many implementations stop the PPO epochs for a batch early once it passes a threshold such as 0.01 to 0.02.

## The catch in the repo: a ratio of exactly 1

PPO's clip only does anything when the policy is updated *several times* on the same batch. On the first pass, $\theta = \theta_{\text{old}}$, so every $\rho_t = 1$ and nothing is clipped. The repo does one pass per batch (its comment says "This step is done multiple times per batch in practice"). Instrumenting 10 steps of the repo's loop confirmed it: the minimum and maximum ratio were both $1.000000$ on every step.

With $\rho = 1$, the gradient of the policy loss is $-\frac{1}{N}\sum_t \hat A_t \nabla \log \pi_\theta(a_t \mid s_t)$, which is the vanilla policy gradient with a baseline. The repo's loop is therefore an advantage actor-critic with a KL-shaped reward, not yet PPO in the full sense. Topic 6 shows the loop with several epochs, where the clip earns its keep.

## In practice

- **Log the clip fraction**, the share of tokens with $|\rho_t - 1| > \epsilon$. Around 0.1 to 0.2 is healthy; near 0 means the epochs are not moving the policy, near 0.5 means each update is too large.
- **$\epsilon = 0.2$** is the default almost everywhere; some LLM setups use 0.1 for extra caution.
- **Mean over tokens or over sequences.** The repo averages over all action tokens of the batch, so long answers carry more weight than short ones. Some implementations average per sequence first.

```quiz
{"q": "With $\\epsilon = 0.2$, a token has advantage $-1.0$ and ratio $1.4$. What is its term in the `min`, and does it receive a gradient?", "options": ["$-1.4$, and yes", "$-1.2$, and no", "$-1.4$, and no", "$-0.8$, and yes"], "answer": 0, "explain": "Unclipped: $1.4 \\times -1.0 = -1.4$. Clipped: $1.2 \\times -1.0 = -1.2$. The min is $-1.4$, the unclipped term, so the gradient flows and pulls the bad token back down. Picking $-1.2$ treats the clip as symmetric; PPO only clips away the incentive to go further in the helpful direction."}
```

```quiz
{"q": "The repo computes `old_logp` and then performs exactly one gradient step on that batch. Why is the clip never active?", "options": ["The policy has not changed since `old_logp` was computed, so every ratio is exactly 1", "Because `clip_ratio` is 0.2, which is too large", "Because advantages are whitened", "Because the entropy coefficient is zero"], "answer": 0, "explain": "On the first forward pass after sampling, $\\pi_\\theta = \\pi_{\\theta_{\\text{old}}}$, so $\\rho = e^0 = 1$, safely inside $[0.8, 1.2]$. Clipping only binds on the second and later passes over the same batch, after the weights have moved. Whitening and the entropy weight do not affect the ratio."}
```
