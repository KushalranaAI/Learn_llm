---
title: One advantage, every token
minutes: 9
---

The reward model reads a whole completion and returns one number. The loss, though, is a sum over tokens: each token's log-probability gets its own gradient. Something has to decide how much credit each token gets for the final score.

PPO in `part_8` answers token by token. It places the reward-model score on the last token, subtracts a per-token KL, and lets the value head estimate, at every position, how much reward is still to come. In principle that lets an early, decisive token get more credit than filler. In practice the tiny value head is a rough guess, and credit assignment is only as good as that guess.

GRPO gives up on per-token credit. Every token of completion $i$ receives the same advantage $\hat A_i$, so a good answer is reinforced as a whole and a bad one is discouraged as a whole. This is **outcome supervision**: the signal says which completion won, not which step won it. It sounds crude, and it is, but across many groups the tokens that keep showing up in winners accumulate positive pushes and those that show up in losers accumulate negative ones. DeepSeekMath also tried process supervision, with a per-step reward, as a variant; the outcome version is what most replications use.

## In everyday life

In a school group project, the whole team gets one mark for the finished report. Nobody marks each sentence. So the paragraphs that helped and the ones that did not all share the same mark that day. Over many projects, a habit that keeps showing up in high-scoring reports, like opening with a clear summary, earns credit again and again. A habit that keeps showing up in poor reports gets the blame.

GRPO gives credit to a language model in just this way. The reward model reads a whole completion and gives one score. A **token** is a small chunk of text, a word or part of a word, and a completion is a string of them. Working out which token deserved the credit is hard, so GRPO gives every token of a completion the same **advantage**: how much better or worse than the group's average the whole answer was. This is called **outcome supervision**. It judges the result, not each step.

One point does not fit a fair teacher. The loss here is averaged over all the tokens in the batch, so a long completion carries more total weight than a short one with the same advantage.

**Where you meet it.** A team trains a model that drafts replies, and the reward model returns one score per reply. Copying that reply's advantage onto each of its tokens lets the usual training code run unchanged. The price is that nobody learns which step of the reply mattered.

```scene
title: One mark for the whole report
step: 👥 The team hands in one report and gets one mark | one reward per completion
step: 🧮 The mark is compared with how the other teams did | group-relative advantage
step: 📄 Every paragraph in the report gets that same verdict | advantage copied to every token
step: ✅ After a good mark, the habits in that report are encouraged | token log-probabilities pushed up
step: ❌ After a poor mark, the same habits are discouraged | token log-probabilities pushed down
step: 📏 A longer report has more paragraphs, so it counts for more | token-mean loss weights by length
takeaway: GRPO judges the whole answer and gives every one of its tokens the same share of the credit or blame.
```

## The loss with a broadcast advantage

Index completions by $i$ and their tokens by $t = 1, \dots, |o_i|$. With $\rho_{i,t} = \pi_\theta(o_{i,t}) / \pi_{\text{old}}(o_{i,t})$ (context omitted), the repo's policy loss averages over every response token in the batch:

$$
\mathcal{L}_{\text{pol}} = -\frac{1}{N}\sum_{i=1}^{B}\sum_{t=1}^{|o_i|}\min\!\big(\rho_{i,t}\hat A_i,\ \operatorname{clip}(\rho_{i,t}, 1-\epsilon, 1+\epsilon)\hat A_i\big), \qquad N = \sum_{i=1}^{B}|o_i| .
$$

The only change from PPO is that $\hat A_i$ carries no $t$. Because the mean runs over all $N$ tokens, a completion's total weight is proportional to its length: a 30-token answer contributes three times as much gradient as a 10-token answer with the same advantage. The DeepSeekMath paper instead averages each completion over its own length first ($\frac{1}{G}\sum_i \frac{1}{|o_i|}\sum_t$), which gives every completion equal weight; that version slightly favours short correct answers and long wrong ones.

## Length meets batch normalisation

Topic 2 noted that `part_9` scales advantages over the whole batch. It also re-centres them there, after the broadcast, so the token counts leak into the mean.

**Worked example.** One batch, two prompts, $G = 4$. Prompt A has rewards $(0.9, 0.5, 0.1, 0.5)$, centred to $(+0.4, 0, -0.4, 0)$. Prompt B is a tied group at $0.3$, centred to all zeros. If all eight completions are 10 tokens long, the token-level mean is 0 and the result is clean: A gets $(+1.99, 0, -1.99, 0)$ and B stays at zero.

Now make A's best completion 30 tokens long and leave the rest at 10, so $N = 100$. The token-weighted mean is

$$
\frac{30(0.4) + 10(0) + 10(-0.4) + 10(0) + 40(0)}{100} = \frac{12 - 4}{100} = 0.08 .
$$

Subtracting it moves every token. The token standard deviation (with Bessel's correction, as `torch.std` does) comes out at 0.241. The final advantages are $0.32/0.241 = +1.33$ for A's best answer, $-0.48/0.241 = -1.99$ for its worst, and $-0.08/0.241 = -0.33$ for the two middling answers and for every completion of the tied prompt B. A group with no preference at all is now pushed down, because a sibling prompt happened to produce a long winner. Running the repo's normalisation line on these inputs reproduces these numbers.

## The code: from rows to flat tokens

`train_grpo.py` keeps everything as flat tensors over **action tokens**: the response tokens, selected by a boolean mask. Rows are padded sequences of shape $(B, T)$; log-probabilities are $(B, T-1)$ because position $t$ predicts token $t+1$.

```python
# llm_from_scratch/part_9/train_grpo.py (excerpt)
mask[i, b:L] = True                     # (B, T) response tokens of row i, prompt ends at b
act_mask = mask[:, 1:]                  # (B, T-1) aligned with log p(x[t+1] | x[:t+1])
old_logp = pol_lp_full[act_mask]        # (N_act,) flattened row by row

for i in range(B):                      # which trajectory owns each flat token
    n_i = int(act_mask[i].sum().item())
    traj_id_for_token.extend([i] * n_i)
traj_id_for_token = torch.tensor(traj_id_for_token)        # (N_act,)

adv_flat = traj_adv[traj_id_for_token]                     # (N_act,) broadcast: same value per completion
adv_flat = (adv_flat - adv_flat.mean()) / adv_flat.std().clamp_min(1e-6)   # token-level batch norm
```

The broadcast works because boolean indexing in PyTorch walks the mask row by row, so the flat tokens of row 0 come first, then row 1, and so on. `traj_id_for_token` lists the owner of each flat token in exactly that order, and indexing `traj_adv` with it copies each completion's advantage onto all of its tokens. `traj_adv.repeat_interleave(act_mask.sum(1))` is the one-line equivalent.

```steps
Following one batch through the broadcast
Two completions, $B = 2$. Row 0 has 3 response tokens, row 1 has 2. Centred advantages: `traj_adv = (+0.5, -0.5)`.
---
`act_mask.sum(1) = (3, 2)`, so $N_{\text{act}} = 5$ and `traj_id_for_token = (0, 0, 0, 1, 1)`.
---
`traj_adv[traj_id_for_token] = (+0.5, +0.5, +0.5, -0.5, -0.5)`: every token carries its completion's advantage.
---
Token-level mean $= (1.5 - 1.0)/5 = 0.1$. Row 0's tokens become $+0.4$, row 1's $-0.6$ before scaling: the longer completion has shifted the centre.
---
`old_logp`, `ref_logp` and `new_logp` are all indexed with the same `act_mask`, so position $k$ of each flat tensor refers to the same token. The loss can now multiply them element by element.
```

```bughunt
{"q": "This rewrite of the advantage step is meant to normalise within each prompt's group and broadcast to tokens. Rewards for each prompt's $G$ completions are stored consecutively. Which line is wrong?", "code": "rewards = torch.tensor(raw_rewards, dtype=torch.float)  # (B,), B = P*G\nr = rewards.view(P, G)                                  # (P, G)\nmean = r.mean()                                         # baseline\nstd = r.std(dim=1, keepdim=True)                        # (P, 1)\nadv = ((r - mean) / (std + 1e-4)).view(-1)              # (B,)\ncounts = act_mask.sum(dim=1)                            # (B,) response tokens per row\nadv_tok = adv.repeat_interleave(counts)                 # (N_act,)\nnew_logp = new_logp_all[act_mask]                       # (N_act,)\nratio = torch.exp(new_logp - old_logp)                  # (N_act,)\nloss = -torch.min(ratio * adv_tok, ratio.clamp(0.8, 1.2) * adv_tok).mean()", "bug": 3, "explain": "`r.mean()` with no `dim` averages over the whole batch, so the baseline is shared by all prompts. Every completion of an easy prompt (high rewards) then gets a positive advantage and every completion of a hard prompt a negative one, which teaches the model about prompt difficulty instead of which answer was better. It needs `r.mean(dim=1, keepdim=True)`. The other lines are fine: `repeat_interleave(counts)` matches the row-by-row order of boolean indexing, and the std already has its epsilon."}
```

## In practice

- **Length is a hidden reward.** Under a token-mean loss, long completions carry more weight in both directions. If the reward model also mildly prefers length, the two compound and responses grow step after step. Watch mean completion length next to the reward.
- **Normalise before broadcasting, per group.** If you want the paper's behaviour, compute $\hat A_i$ on the $(P, G)$ matrix and only then copy to tokens; normalising the flat token tensor mixes in lengths and other prompts.
- **Check the alignment once.** An off-by-one between `mask` and `act_mask` shifts every completion's window by one position: the first response token loses its gradient, or the last prompt token or a pad token gains one, and nothing crashes. Print `counts` against the real response lengths on one batch.

```quiz
{"q": "A completion has advantage $\\hat A = +1.2$ and 50 response tokens. Another in the same batch has $\\hat A = +1.2$ and 10 tokens. Under the repo's token-mean loss with $\\rho = 1$, how do their total contributions to the gradient compare?", "options": ["The 50-token completion contributes about 5 times as much", "They contribute equally, because their advantages are equal", "The 10-token completion contributes 5 times as much", "Only the last token of each contributes"], "answer": 0, "explain": "Each token adds $\\hat A\\,\\nabla \\log\\pi$ with the same weight $1/N$, so a completion's share scales with its token count: 50 against 10. Equal contributions is what the paper's per-sequence $1/|o_i|$ averaging would give, not the repo's flat mean. Only PPO-style reward placement puts the raw score on the last token; GRPO broadcasts it to all of them."}
```

```quiz
{"q": "In `part_9`, a prompt's four completions all receive reward 0.3 (a tied group). After the token-level batch normalisation, what can their advantages be?", "options": ["Nonzero and all equal, set by the other prompts' rewards and lengths", "Exactly zero, always", "Different for each completion", "`nan`, because the group standard deviation is zero"], "answer": 0, "explain": "Group centring makes them all 0, but the batch-wide re-centring subtracts the token-weighted mean of the whole batch, which is generally not zero, and then divides by the batch std. All four shift by the same amount. They would stay exactly 0 under per-group normalisation. There is no `nan`: the repo never divides by a group's own std, and the batch std is clamped at $10^{-6}$."}
```
