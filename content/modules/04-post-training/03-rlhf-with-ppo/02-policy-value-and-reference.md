---
title: The policy, its value head and the frozen reference
minutes: 8
---

PPO for language models is usually described as needing four models. The **policy** writes answers and is trained. The **value model** predicts how good an answer is going to be from any point in it, and is trained too. The **reward model** scores finished answers and is frozen. The **reference model** is a frozen copy of the SFT policy that the KL penalty measures drift against. The [cost of this cast](/learn/fine-tuning/preference-optimization-methods/rlhf-recap-in-practice) is a big part of why most teams moved to DPO or GRPO.

The repo keeps the cast but shrinks it. The value model is not a separate network: it is a one-layer **value head** bolted onto the policy, so policy and value share a single transformer trunk. The reference is a second instance of the same class with gradients switched off. The reward model is the encoder from the [previous lesson](/learn/post-training/reward-models).

## In everyday life

On a cooking show, a contestant cooks, and a food critic tastes the finished dish and gives a score. Midway through, the contestant also has a gut feeling: "this is going well" or "this is going wrong". Back home, her old recipe notebook sits on a shelf, never changed, so anyone can check how far her cooking has drifted from the original.

PPO, the training method in this chapter, needs four such roles. The **policy** is the model that writes answers and keeps learning, the cook. The **reward model** is the critic. It is frozen, which means never changed, and it scores finished answers only. The **value model** is the gut feeling: from any point in an answer, it guesses how good the final score will be. In the repo it is a small **value head**, an extra tiny layer attached to the policy, so the cook and her gut feeling share one brain. The **reference model** is the notebook, a frozen copy of the model from before this stage, used to measure drift.

The reference must be a separate copy. If it kept learning along with the cook, it would stop measuring drift.

**Where you meet it.** Teams that tune chat models with this method must keep several large models in memory at once. That heavy cost is one reason many teams moved to simpler methods.

```scene
title: A cooking contest with four roles
step: 🍳 The contestant cooks and keeps improving between rounds | policy, trained
step: 😬 Midway, her gut says whether the dish is going well | value head
step: 🍽 A critic tastes the finished dish and scores it | frozen reward model
step: 📓 Her old recipe notebook never changes | frozen reference model
step: 📏 Comparing today's dish with the notebook shows her drift | distance from the reference
takeaway: PPO keeps a learning policy, a value guess, a frozen judge and a frozen reference copy to measure drift.
```

## What the value head predicts

The **value** of a state is the return you expect from it if you keep following the current policy:

$$
V^{\pi}(s_t) = \mathbb{E}_{\pi}\left[\, \sum_{k \ge t} r_k \;\middle|\; s_t \right]
$$

Halfway through an answer that is going well, $V$ should be high; halfway through one that has already gone off the rails, low. It is the **baseline** that turns a raw reward into an advantage: "the answer scored 1.5, and I expected 0.9 from here, so this went better than expected by 0.6".

A normal value head reads the transformer's final hidden state $h_t \in \mathbb{R}^d$ and outputs $v_t = w^\top h_t + b$. The repo takes a shortcut and reads the **logits** $z_t \in \mathbb{R}^V$ instead, so it never has to reach inside `GPTModern`:

$$
v_t = w^\top z_t, \qquad w \in \mathbb{R}^{V}
$$

**Worked example.** Shrink the vocabulary to 3. Logits $z_t = (2.0, -1.0, 0.5)$ and weights $w = (0.1, 0.2, -0.4)$ give $v_t = 0.2 - 0.2 - 0.2 = -0.2$. At the repo's scale, $V = 8000$, so the head has 8000 weights; a head on the hidden state ($d = 128$) would have 129. Either is tiny next to the 2.57 million parameters of the language model.

From `llm_from_scratch/part_8/policy.py`:

```python
class PolicyWithValue(nn.Module):
    def __init__(self, vocab_size, block_size, n_layer=4, n_head=4, n_embd=256, ...):
        super().__init__()
        self.lm = GPTModern(vocab_size=vocab_size, block_size=block_size, n_layer=n_layer,
                            n_head=n_head, n_embd=n_embd, ...)
        self.val_head = nn.Linear(vocab_size, 1, bias=False)   # V -> 1, toy head on logits

    def forward(self, x, y=None):
        logits, loss, _ = self.lm(x, y)                 # logits: (B, T, V)
        values = self.val_head(logits).squeeze(-1)      # (B, T, V) -> (B, T, 1) -> (B, T)
        return logits, values, loss
```

Because the head sits on top of the language model, the value loss sends gradients back through the whole trunk, scaled by `vf_coef = 0.5`. That is a real design choice with a cost: learning to predict rewards can tug the weights that generate text. InstructGPT avoided it by training a separate value model initialised from the reward model.

## Loading the cast

From `llm_from_scratch/part_8/train_ppo.py`:

```python
policy = PolicyWithValue(vocab_size, block_size, n_layer, n_head, n_embd).to(device)
policy.lm.load_state_dict(ckpt['model'])     # SFT weights; val_head stays randomly initialised

ref = PolicyWithValue(vocab_size, block_size, n_layer, n_head, n_embd).to(device)
ref.lm.load_state_dict(ckpt['model'])        # same SFT weights, a separate copy
for p_ in ref.parameters():
    p_.requires_grad_(False)                 # frozen: no gradients, no optimiser state
ref.eval()

rm = RewardModel(...); rm.load_state_dict(rckpt['model']); rm.eval()   # frozen judge
opt = torch.optim.AdamW(policy.parameters(), lr=args.lr)               # only the policy (+ head) trains
```

Two details matter. The reference must be a **separate copy**: if `ref` were the same object as `policy`, the KL penalty would be exactly zero on every step and the leash would vanish. And the value head starts from random weights, so its first predictions are noise; the first few hundred updates are partly spent teaching it what a return looks like.

| Model in the repo | Parameters (demo config, $V = 8000$, $L = 2$, $d = 128$) | Trained? | Used for |
|---|---|---|---|
| Policy LM | 2,572,928 | yes | generating, log-probs |
| Value head | 8,000 | yes | $V(s_t)$ baseline |
| Reference (a full `PolicyWithValue`) | 2,580,928 | no | KL penalty log-probs |
| Reward model (encoder) | 1,453,697 | no | score of the finished answer |

These counts come from instantiating the classes with the demo config. The whole cast is under 7 million parameters and fits on a laptop CPU.

## See it

The trained models are what make PPO expensive at scale, because only they carry gradients and AdamW state.

```sim
training-memory
{"model": "llama2-7b", "precision": "mixed", "optimizer": "adam", "zero": 0, "gpus": 8, "checkpointing": true}
```

This shows the memory for training *one* 7B model. With mixed precision and AdamW the model states cost 16 bytes per parameter, about 112 GB. PPO with a separate value model trains two of those (224 GB) and also holds two frozen 7B models in bf16 at 2 bytes per parameter (28 GB), about 252 GB of model states before any activations. Move the ZeRO slider to 3 and watch how much sharding across 8 GPUs is needed just to fit one of the two trained models.

## In practice

- **Shared trunk or separate critic.** Sharing saves a whole model's memory, which is why small setups do it. Separate critics are more common in large RLHF runs because the value loss and the policy loss want different things from the same features.
- **Initialise the value head sensibly.** A value head that starts by predicting large numbers produces huge advantages on step one. Zero-initialising it, or warming it up for a few steps with the policy frozen, is a cheap fix.
- **The reference never changes.** Keep it in `eval()` mode with gradients off, ideally in bf16. At scale it is often served from the same inference engine as the rollouts.

```quiz
{"q": "A refactor replaces `ref = PolicyWithValue(...)` and its loading with `ref = policy` to save memory. What happens to the KL penalty during training?", "options": ["It is zero on every step, so the policy can drift without limit", "It doubles, because the policy is compared with itself twice", "Nothing changes, because the reference is frozen anyway", "It becomes negative and rewards drift"], "answer": 0, "explain": "The reference log-probs are recomputed from the same, updating weights, so $\\log\\pi - \\log\\pi_{\\text{ref}} = 0$ for every token and the leash disappears. `requires_grad_(False)` would also freeze the policy itself, which is a second bug. The point of the reference is that it stays at the SFT weights while the policy moves."}
```

```quiz
{"q": "The repo's value head is a linear layer on the logits, with $V = 8000$. A conventional head on the final hidden state with $d = 128$ has a bias. How many parameters does each have?", "options": ["8,000 and 129", "8,001 and 128", "128 and 8,000", "1,024,000 and 129"], "answer": 0, "explain": "`nn.Linear(vocab_size, 1, bias=False)` has $8000 \\times 1 = 8000$ weights and no bias; the hidden-state head has $128 + 1 = 129$. 1,024,000 is the size of the token embedding ($8000 \\times 128$), not of a head."}
```
