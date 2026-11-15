---
title: Generation as a reinforcement-learning episode
minutes: 8
---

```predict
{"q": "In the repo's PPO loop, the policy writes a 32-token answer and the reward model gives it one score. How many of the 32 token positions receive that score in the reward tensor?", "options": ["All 32, split evenly", "Only the last one", "Only the first one", "None: the score goes straight into the loss"], "answer": 1, "reveal": "Only the last action position gets the reward-model score. Every other position gets just a small KL penalty. Working out which earlier tokens deserve the credit is the job of the advantage, covered in topic 4."}
```

Supervised fine-tuning gives the model a target for every token: here is the right next token, raise its probability. Reinforcement learning gives no target. The model writes a whole answer, someone grades it, and the model has to work out which of its choices led to the grade. The [theory lesson](/learn/fine-tuning/preference-tuning/rlhf-ppo) covered the RLHF objective and why PPO puts the model on a KL leash. This lesson builds it in plain PyTorch, following `llm_from_scratch/part_8/`, on top of the SFT model and the [reward model](/learn/post-training/reward-models) you trained earlier.

The first step is translation. Reinforcement learning talks about agents, states, actions and episodes. A language model talks about prompts, tokens and completions. Once the two vocabularies line up, the code reads like ordinary RL code.

## In everyday life

Think of a cab driver on one trip. At every junction he picks a turn. Nobody tells him after each turn whether it was right. Only when the passenger steps out does a rating arrive: one number for the whole ride. Over many trips he has to work out which turns made the ride good and which wasted time.

This is what **reinforcement learning** looks like. It means learning by trying things and getting a score afterwards, instead of being shown the right move. The language model plays the driver and is called the **policy**, the thing that chooses what to do. Each token it writes is one turn, called an **action**. The prompt plus the tokens written so far is the **state**, the place it currently stands. One whole answer, from prompt to the end marker, is an **episode**, one trip. The **reward** is the score from the reward model, and it is **sparse**: it arrives once, after the last token.

Fine-tuning on examples was different, because it showed the right next token at every step. Here there is only a grade at the end. One part does not fit a cab ride: each turn is picked from thousands of possible tokens, and the road never surprises you, since each token simply gets added to the text.

**Where you meet it.** A chat assistant is improved using scores from a reward model. The score arrives only when the reply is finished, so the training method must work out which words in a long reply earned the credit.

```scene
title: One cab ride, one rating
step: 🚕 A passenger gives the driver a destination | the prompt
step: 🧭 At every junction the driver picks one turn | each token is an action
step: 🗺 The route so far decides which turns are open next | state: prompt plus tokens so far
step: 🏁 The ride ends when the passenger gets out | episode ends at the end marker
step: ⭐ One rating arrives after the ride, not after each turn | sparse reward on the last token
takeaway: Writing an answer is a sequence of choices, and the single score at the end must be traced back to them.
```

## The dictionary

| RL term | In text generation | In `train_ppo.py` |
|---|---|---|
| **Policy** $\pi_\theta$ | the language model being trained | `policy` (SFT weights plus a value head) |
| **State** $s_t$ | the prompt plus every token written so far | the prefix `seq[:, :t+1]` |
| **Action** $a_t$ | the next token, one of $V$ vocabulary entries | `seq[:, t+1]` |
| **Transition** | append the token; fully deterministic | `torch.cat` inside `generate` |
| **Episode** | one completion, ending at `</s>` or after `resp_len` tokens | one row of `seq` |
| **Reward** $r_t$ | reward-model score, only after the last token | `rewards[i, L-1] = r_scalar` |

Two things are unusual compared with textbook RL. The action space is huge: with the repo's BPE tokenizer every step chooses among $V = 8000$ tokens. And the reward is **sparse**: a single number arrives at the end of the episode, after up to 64 actions (the `--resp_len` default) with nothing in between.

## The objective, in RL notation

For a prompt $x$ and a sampled completion $y = (a_1, \dots, a_T)$, the probability of the whole episode is the product of the per-token probabilities, because transitions are deterministic:

$$
\pi_\theta(y \mid x) = \prod_{t=1}^{T} \pi_\theta(a_t \mid s_t), \qquad \log \pi_\theta(y \mid x) = \sum_{t=1}^{T} \log \pi_\theta(a_t \mid s_t)
$$

The goal is to maximise the expected **return**, the sum of rewards over the episode, $J(\theta) = \mathbb{E}_{y \sim \pi_\theta}\left[\sum_t r_t\right]$. The **policy gradient theorem** says how to push on it without differentiating through the sampling:

$$
\nabla_\theta J = \mathbb{E}\left[\sum_{t=1}^{T} \nabla_\theta \log \pi_\theta(a_t \mid s_t)\, \hat A_t\right]
$$

where $\hat A_t$, the **advantage**, says how much better than expected things went after taking action $a_t$. Raise the log-probability of tokens with positive advantage, lower it for negative ones. Everything PPO adds (clipping, a value model, a KL penalty) is about making that estimate less noisy and the steps less reckless.

**Worked example.** A 4-token answer has per-token log-probabilities $-0.9, -1.2, -0.4, -2.0$. The episode log-probability is $-4.5$, so the policy wrote this exact answer with probability $e^{-4.5} \approx 0.011$. If its advantage at every token were $+1$, the gradient would push all four log-probabilities up together; if only the last token had positive advantage, only that token would be reinforced.

## Lining the episode up with the tensors

The trickiest part of `train_ppo.py` is bookkeeping: which positions in the padded batch are actions, and where the reward goes. A causal LM's log-probability at position $j$ is $\log p(\text{seq}_{j+1} \mid \text{seq}_{\le j})$, so the log-prob tensor is one shorter than the sequence and shifted by one. From `llm_from_scratch/part_8/train_ppo.py`:

```python
# per sample i: ids = prompt + response, boundary b = number of prompt tokens, L = length
seq[i, :L] = ids[-L:]            # (B, T) token ids, padded with <pad> = 2
mask[i, b:L] = True              # (B, T) True on response tokens
rewards[i, L-1] = r_scalar       # (B, T) RM score on the final token only

pol_lp = model_logprobs(policy, seq)   # (B, T-1): log p(seq[:, j+1] | seq[:, :j+1])
act_mask = mask[:, 1:]                 # (B, T-1): position j is an action if token j+1 is a response token
old_logp = pol_lp[act_mask]            # (N,) flattened action log-probs across the batch
```

`act_mask = mask[:, 1:]` is the whole trick: shifting the mask by one aligns "token $j+1$ is a response token" with "log-prob at $j$ is an action". The same shift applied to `rewards[:, 1:]` lands the score on the last action.

```steps
One episode laid out in the tensors
The prompt has 5 tokens (indices 0–4) and the response 4 tokens (indices 5–8), so $b = 5$ and $L = 9$. `mask` is True at 5, 6, 7, 8.
---
`pol_lp` has 8 entries, $j = 0 \dots 7$. Entry $j$ scores token $j+1$. The actions are the entries that score tokens 5–8: $j = 4, 5, 6, 7$. `act_mask = mask[:, 1:]` is True at exactly those four.
---
`rewards[i, 8] = r`. In `rewards[:, 1:]` that value sits at $j = 7$, the last action. Entries $j = 4, 5, 6$ hold 0.
---
After `pol_lp[act_mask]`, the four actions become four entries of a flat vector of length $N$ (all action tokens of all samples), and the per-sample structure is gone. That is why the repo cannot easily compute per-episode returns, a point topic 4 returns to.
```

## In practice

- **Off-by-one errors are the classic RLHF bug.** If the mask is not shifted, the first response token is never trained and the first padding position is trained as if it were an action. Shapes stay correct, so nothing crashes. Print one row of `seq`, `act_mask` and `rewards[:, 1:]` side by side before trusting a run.
- **Episodes have different lengths.** Generation stops early when every sample in the call emits `</s>` (id 1), and the repo generates one prompt at a time, so lengths differ. Padding is filled with id 2 and excluded by the mask.
- **The prompt is not an action.** Prompt tokens were chosen by the dataset, not by the policy, so they get no gradient, exactly like the masked labels in SFT.

```quiz
{"q": "A prompt has 6 tokens and the policy adds 3 response tokens, so $L = 9$. Which positions $j$ of the shifted log-prob tensor `pol_lp` are actions?", "options": ["$j = 5, 6, 7$", "$j = 6, 7, 8$", "$j = 0, \\dots, 5$", "$j = 6, 7$"], "answer": 0, "explain": "Response tokens sit at indices 6, 7, 8. Log-prob $j$ scores token $j+1$, so the actions are $j = 5, 6, 7$, which is what `mask[:, 1:]` selects. Answer $6, 7, 8$ forgets the shift; index 8 does not even exist in a tensor of length $L - 1 = 8$."}
```

```quiz
{"q": "Why is the reward signal in RLHF called sparse?", "options": ["One scalar arrives after the final token, and nothing after the earlier actions", "Most tokens in the vocabulary are never sampled", "The reward model outputs mostly zeros", "Only a few prompts in the batch receive a reward"], "answer": 0, "explain": "The reward model scores the finished answer, so of up to 64 actions only the last carries the score. The learner must spread that credit backwards, which is the advantage's job. The vocabulary being large is a separate difficulty (a big action space), not sparsity."}
```
