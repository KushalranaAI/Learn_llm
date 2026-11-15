---
title: From PPO to GRPO
minutes: 9
---

```predict
{"q": "In `part_8`, PPO's value head is a single linear layer from the logits to one number. GRPO deletes it. On the tiny policy (2.58M parameters, 8,000-token vocabulary), roughly what share of the trainable parameters does that remove?", "options": ["About half", "About a quarter", "About 0.3%", "Nothing: the head is still there"], "answer": 2, "reveal": "The head is an $8000 \\times 1$ matrix: 8,000 of 2,580,928 parameters, about 0.3%. The big saving only appears at scale, where PPO's critic is a second full-size model. The section on memory below works both cases."}
```

The [previous lesson](/learn/post-training/rlhf-with-ppo) built PPO on the tiny model: sample one response per prompt, score it with the reward model, and use a **value head** to say how much reward was expected, so the update can tell "better than usual" from "worse than usual". GRPO keeps almost everything from that loop and changes one question: where does "usual" come from?

PPO learns it. The value head is a regression model trained alongside the policy to predict the reward from each position. GRPO samples it. Ask the policy the same prompt $G$ times, score all $G$ answers, and call their average the expected reward. Each answer is then judged against its own siblings. That average is the **group-relative baseline**, and it is the whole idea of Group Relative Policy Optimization (Shao et al., 2024). The theory lesson covers why it works with [verifiable rewards](/learn/fine-tuning/preference-tuning/verifiable-rewards-grpo); here we follow the code in `llm_from_scratch/part_9`, which still uses the learned reward model from [Reward models](/learn/post-training/reward-models).

## In everyday life

Think about how a teacher marks a class test. A raw mark of 14 out of 20 means little on its own. Was the paper hard or easy? What the teacher really wants to know is whether this student did better or worse than usual on this paper.

One way is to hire an assistant who studies old papers and predicts, before marking, what a typical student will score. That assistant is an extra person to train and pay. The simpler way is to mark every paper in the class, take the class average, and judge each student against it.

Reinforcement learning has the same problem. The model being trained is called the **policy**. It writes an answer, and a **reward model** gives that answer a score. A score alone does not say whether the answer was better than usual. The older method, PPO, trains a second network, the **value head**, to predict the usual score. **GRPO** skips it. The policy writes several answers to the same prompt, and their average score becomes the **baseline**, the "usual" to compare against. One difference from a class: all these answers come from one model, and there are only a few of them, so their average is a rough estimate.

**Where you meet it.** A team trains a model to write short summaries, and a reward model scores each one. Without a baseline, almost every positive score pushes its summary up, and the useful signal drowns in noise. With a group average, the better summaries for each prompt go up, the weaker ones go down, and no second large network is needed.

```scene
title: Marking against the class average
step: 📝 The teacher sets one paper and several students answer it | sample G completions per prompt
step: 🧮 Every paper gets a mark from the same marking scheme | reward model scores each completion
step: 📊 The teacher averages the class marks instead of predicting them | group mean as the baseline
step: ⚖️ Each paper is compared with that average | reward minus baseline
step: 👍 Papers above the average are encouraged, those below are discouraged | policy update, no value head
takeaway: GRPO replaces a trained predictor of the usual reward with the plain average of a group of answers.
```

## Why any baseline is allowed

The policy gradient for one sampled completion $o$ with reward $r$ is $\nabla_\theta \log \pi_\theta(o)\, r$: raise the log-probability of what you sampled, in proportion to how good it was. Subtracting a **baseline** $b$ that does not depend on $o$ gives $\nabla_\theta \log \pi_\theta(o)\,(r - b)$, and the expected gradient is unchanged, because the extra term averages to zero:

$$
\mathbb{E}_{o\sim\pi_\theta}\big[\nabla_\theta \log \pi_\theta(o)\, b\big] = b \sum_o \pi_\theta(o)\,\frac{\nabla_\theta \pi_\theta(o)}{\pi_\theta(o)} = b\,\nabla_\theta \sum_o \pi_\theta(o) = b\,\nabla_\theta 1 = 0 .
$$

So the baseline cannot bias the update; it only changes the noise. A good baseline is close to the typical reward, so that $r - b$ is positive for genuinely good samples and negative for bad ones.

**Worked example.** The reward model scores four answers to one prompt: $r = (0.9, 0.5, 0.1, 0.5)$. With no baseline, every answer has a positive weight, so the update pushes all four up, including the worst one at $0.1$; only the relative sizes carry information, and that information arrives as noise across many steps. With the group mean $b = (0.9+0.5+0.1+0.5)/4 = 0.5$ the weights become $(+0.4, 0, -0.4, 0)$: the best answer goes up, the worst goes down, the two typical ones are left alone. One step now carries a clear signal.

Keep the identity above in mind. The same "score function averages to zero" argument comes back in topic 4, where it explains a quirk of the repo's KL term.

## The code diff

Put the two training scripts side by side and almost every line is shared: the tokenizer, the padding and masks, `model_logprobs`, the optimiser and the gradient clip. The differences are the advantage and the loss.

```python
# llm_from_scratch/part_8/train_ppo.py (excerpt): baseline = learned value, per token
shaped_r = rewards[:, 1:][act_mask] - args.kl_coef * kl  # (N_act,) RM score on last token, KL on every token
returns = shaped_r
adv = returns - old_values                               # (N_act,) value head predicts expected reward

# llm_from_scratch/part_8/ppo_loss.py
total = policy_loss + vf_coef * value_loss - ent_coef * entropy
```

```python
# llm_from_scratch/part_9/train_grpo.py (excerpt): baseline = mean of the siblings, per completion
traj_adv = raw_rewards_t - group_mean      # (B,) with B = P * G trajectories

# llm_from_scratch/part_9/grpo_loss.py
total = policy_loss - ent_coef * entropy + kl_coef * kl_ref   # no value loss; KL moves into the loss
```

Three things moved. The value loss is gone, so nothing is trained to predict reward. The baseline is computed once per completion, not once per token. And the KL penalty, which PPO folded into the reward, becomes a separate term in the loss (topic 4).

| | PPO (`part_8`) | GRPO (`part_9`) |
|---|---|---|
| Samples per prompt | 1 | $G$ (`--group_size`, default 4) |
| Baseline | value head, per token | group mean, per completion |
| Trained outputs | policy + value | policy only |
| KL to the reference | subtracted from the reward | added to the loss |
| Sampling temperature in the loop | 0.2 | 2.0 |

## The memory that saves

Count it for the repo first. With the fallback config in `train_grpo.py` ($L = 2$, $h = 2$, $d = 128$) and an 8,000-token BPE vocabulary, `PolicyWithValue` has 2,580,928 parameters, of which the value head is $8000 \times 1 = 8{,}000$. In fp32 with AdamW, every trained parameter costs 16 bytes (weights, gradient, two Adam moments), so the head costs $8000 \times 16 = 128$ KB out of about 41 MB. On the tiny model, dropping the head saves nothing you would notice.

At scale it is a different story, because real PPO setups use a **critic**: a separate transformer, usually initialised from the reward model and as large as the policy. For a 7B policy the critic adds $7 \times 10^9 \times 16 \approx 112$ GB of trained state, plus its own activations. GRPO deletes all of it.

```sim
training-memory
```

Pick a model the size of a policy you might train and read the model-states figure: that is roughly what a same-size PPO critic adds on top, and what GRPO gives back.

## In practice

- **The head is still in the file.** `part_9/policy.py` is the same `PolicyWithValue` as `part_8`, and `train_grpo.py` simply ignores the second output. The head never receives a gradient, and AdamW skips parameters whose `.grad` is `None`, so it costs no optimiser state either. A cleaner version would instantiate the bare `GPTModern`.
- **The bill moves to generation.** With the orchestrator's settings (`--batch_prompts 4 --group_size 4 --resp_len 128`) each step samples $4 \times 4 = 16$ completions of up to 128 tokens, against PPO's 4. The baseline is free in memory and expensive in sampling time.
- **Group size is a variance knob.** The mean of $G$ samples is a noisy estimate of the true expected reward; its standard error shrinks like $1/\sqrt{G}$. DeepSeekMath sampled 64 outputs per question; small replications use 4 to 16.

```quiz
{"q": "A group of four completions scores $r = (2.0, 1.0, 3.0, 2.0)$. Using the group mean as the baseline, which completions are pushed down?", "options": ["Only the one scoring 1.0", "None: all rewards are positive", "The ones scoring 1.0 and 2.0", "All four, by different amounts"], "answer": 0, "explain": "The mean is $8/4 = 2.0$, so the weights are $(0, -1, +1, 0)$: only the 1.0 answer is pushed down, and the two 2.0 answers are untouched. Positive raw rewards do not matter once a baseline is subtracted; that is exactly the point of the baseline."}
```

```quiz
{"q": "Why can GRPO subtract the group mean from the reward without biasing the policy gradient, at least approximately?", "options": ["Because $\\mathbb{E}_{o\\sim\\pi}[\\nabla \\log \\pi(o)] = 0$, so any baseline that does not depend on the scored sample adds zero in expectation", "Because the clip keeps the ratio near 1", "Because the KL term cancels the bias", "Because rewards from the reward model already have mean zero"], "answer": 0, "explain": "The score function has zero mean, so $\\mathbb{E}[\\nabla\\log\\pi(o)\\,b] = 0$ for a constant $b$. The group mean does include the sample's own reward, so it is only approximately independent; the effect shrinks as $G$ grows, and a leave-one-out mean of the other $G-1$ rewards would remove it entirely. The clip and the KL term play no part in this argument, and reward-model scores have an arbitrary offset, not zero mean."}
```
