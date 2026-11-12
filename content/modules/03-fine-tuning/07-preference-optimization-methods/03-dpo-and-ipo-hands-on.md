---
title: DPO and IPO hands-on
minutes: 10
---

DPO is the workhorse: if you have preference pairs and an SFT model, it is the first thing to run. The [derivation in Preference tuning](/learn/fine-tuning/preference-tuning/dpo) ends in one line. With $\Delta = \log \pi_\theta(y \mid x) - \log \pi_{\text{ref}}(y \mid x)$ for the chosen answer $y_w$ and the rejected answer $y_l$:

$$
\mathcal{L}_{\text{DPO}} = -\log \sigma\big(\beta\,(\Delta_w - \Delta_l)\big)
$$

This topic is about running it: what $\beta$ does to the numbers, why **IPO** exists, what the data looks like, and how to read the training logs.

## What β does, with numbers

Write $h = \Delta_w - \Delta_l$ for the log-ratio gap: how much more the policy has moved toward the chosen answer than toward the rejected one, in nats. The loss sees only $\beta h$. Suppose training has reached $h = 4$:

| $\beta$ | margin $\beta h$ | $\sigma(\beta h)$ | loss | gradient weight $\beta\,\sigma(-\beta h)$ |
|---|---|---|---|---|
| 0.1 | 0.4 | 0.599 | 0.513 | 0.040 |
| 0.5 | 2.0 | 0.881 | 0.127 | 0.060 |

With $\beta = 0.5$ a gap of 4 nats already makes the pair "solved" (loss 0.127): the policy has little reason to move further from the reference, so a large $\beta$ is a tight leash. With $\beta = 0.1$ the same gap still leaves most of the loss on the table, so the policy keeps moving: a loose leash. Typical values are 0.05 to 0.5; 0.1 is TRL's default.

```sim
preference-loss
{"beta": 0.1, "chosenLogRatio": 2, "rejectedLogRatio": -2}
```

This is the $h = 4$, $\beta = 0.1$ row. Check the margin (0.4) and the loss (about 0.513). Raise $\beta$ to 0.5 and confirm the second row. Then return to $\beta = 0.1$ and drag the chosen log-ratio to 5: the loss keeps falling and never reaches zero, which is the issue IPO addresses.

## IPO: give the gap a target

DPO's loss decreases for every increase in $h$, all the way to infinity. If a pair's preference is **deterministic** (the same answer wins every time, which is true of almost every pair in a dataset where each pair was labelled once), the DPO optimum is an infinite gap, and the KL leash is effectively ignored: the policy can push the rejected answer's probability toward zero and keep going. Azar et al. (2023) showed this and proposed **IPO** (Identity Preference Optimisation), which regresses the gap onto a fixed target instead:

$$
\mathcal{L}_{\text{IPO}} = \left(h - \frac{1}{2\tau}\right)^2, \qquad h = \Delta_w - \Delta_l
$$

$\tau$ plays $\beta$'s role (TRL passes it as `beta`). With $\tau = 0.1$ the target gap is $1/(2 \times 0.1) = 5$ nats.

```steps
DPO and IPO on the same pair, τ = β = 0.1
Gap $h = 2$. IPO loss $(2 - 5)^2 = 9$, gradient $2(2 - 5) = -6$: increase the gap. DPO loss $-\log\sigma(0.2) = 0.598$: also increase the gap.
---
Gap $h = 5$. IPO loss $0$, gradient $0$: this pair is done. DPO loss $-\log\sigma(0.5) = 0.474$: still pushing.
---
Gap $h = 8$. IPO loss $(8 - 5)^2 = 9$, gradient $+6$: shrink the gap, pull back toward the reference. DPO loss $-\log\sigma(0.8) = 0.371$: still pushing outward.
---
So IPO is a spring with a rest length of $1/(2\tau)$; DPO is a slope that never flattens. On small or noisy datasets, where DPO overfits by driving rejected probabilities to zero, IPO stays put.
```

Some implementations average the log-probabilities over tokens for IPO, which changes the scale of $h$ and therefore what a sensible $\tau$ is. Check your library version's documentation before copying a $\tau$ from a paper.

## The data

TRL's preference format is one row per comparison, with an explicit prompt (recommended) and conversational messages:

```python
row = {
    "prompt":   [{"role": "user", "content": "Summarise this ticket in one line: ..."}],
    "chosen":   [{"role": "assistant", "content": "Customer cannot reset password; link expired."}],
    "rejected": [{"role": "assistant", "content": "The customer wrote in about an issue they are having ..."}],
}
```

The chat template is applied for you. Ideally chosen and rejected were both sampled from your SFT model; pairs written by a different, stronger model work, but the further they are from what your model would say, the more DPO spends lowering probabilities of text it was never going to produce.

## The training script, with LoRA

Start from the SFT checkpoint produced in [SFT with LoRA, step by step](/learn/fine-tuning/sft-with-lora-step-by-step), with its adapter merged into the weights (or load it as a trainable `PeftModel` and pass no `peft_config`). Set up the environment as in [Run fine-tuning yourself](/learn/fine-tuning/run-fine-tuning-yourself).

```python
from datasets import load_dataset
from peft import LoraConfig
from trl import DPOConfig, DPOTrainer

dataset = load_dataset("trl-lib/ultrafeedback_binarized", split="train")

args = DPOConfig(
    output_dir="sft-dpo-lora",
    beta=0.1,                        # the KL leash; for IPO this is tau
    loss_type=["sigmoid"],           # ["ipo"] for IPO
    learning_rate=5e-6,              # LoRA tolerates more than full FT (~5e-7 to 1e-6)
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,   # effective batch 16 pairs
    num_train_epochs=1,              # preference data overfits fast
    max_length=1024,                 # prompt + answer, per sequence
    logging_steps=10,
)

trainer = DPOTrainer(
    model="path/to/merged-sft-model",
    ref_model=None,                  # None: reference = the model before training
    args=args,
    train_dataset=dataset,
    peft_config=LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
                           target_modules="all-linear", task_type="CAUSAL_LM"),
)
trainer.train()
```

With `ref_model=None` and a LoRA config, there is no second copy of the model: the trainer computes reference log-probabilities by running the same base with the adapters disabled, which is exactly the model before DPO began. Setting `precompute_ref_log_probs=True` instead computes them once over the dataset before training starts.

## Reading the logs

| Metric | Meaning | Healthy pattern |
|---|---|---|
| `rewards/chosen` | Mean $\beta\Delta_w$ | Near 0 or slightly positive; a steady fall is a warning |
| `rewards/rejected` | Mean $\beta\Delta_l$ | Falls |
| `rewards/margins` | Mean of the two differences | Rises, then flattens |
| `rewards/accuracies` | Share of pairs with chosen reward > rejected | Starts at 0.5, rises to 0.7 to 0.9 on held-out pairs |
| `logps/chosen` | Mean log-probability of chosen answers | Should not collapse |

Two classic failures show up here. Training accuracy near 1.0 with eval accuracy flat means overfitting: lower the epochs, raise $\beta$ or try IPO. Both `rewards/chosen` and `rewards/rejected` falling together means the margin is growing only because everything is becoming less likely, the "likelihood displacement" quirk; add an SFT term (`loss_type=["sigmoid", "sft"]` with weights) or raise $\beta$.

## In practice

One epoch, $\beta = 0.1$, a learning rate an order of magnitude below SFT for full fine-tuning, and a held-out set of a few hundred pairs to watch `rewards/accuracies` on. Then judge the model on generated answers, not on the loss ([choosing a method](/learn/fine-tuning/preference-optimization-methods/choosing-a-method) covers how).

```parsons
{"title":"Order the lines of the DPO loss for a batch of pairs (inputs are summed log-probabilities of each answer; F is torch.nn.functional)","lines":["def dpo_loss(policy_w, policy_l, ref_w, ref_l, beta=0.1):","    delta_w = policy_w - ref_w              # chosen: how far the policy moved from the reference","    h = delta_w - (policy_l - ref_l)        # the log-ratio gap, Delta_w - Delta_l","    loss = -F.logsigmoid(beta * h)          # one loss per pair","    return loss.mean()"],"explain":"Each line needs the one before: the chosen log-ratio $\\Delta_w$, then the gap $h = \\Delta_w - \\Delta_l$, then $-\\log\\sigma(\\beta h)$ for each pair, averaged over the batch. $\\beta$ multiplies the gap inside the sigmoid, which is why a large $\\beta$ makes a pair look solved at a smaller gap. With `ref_w` and `ref_l` computed by the base with adapters disabled, this is the loss `DPOTrainer` uses for `loss_type=[\"sigmoid\"]`."}
```

```quiz
{"q": "With IPO and $\\tau = 0.25$, a pair has log-ratio gap $h = 3$. Which way does the gradient push $h$?", "options": ["Down, because the target is 2 and $h$ is above it", "Up, because larger gaps always lower the loss", "Nowhere, the loss is already zero", "Up, because the target is 4"], "answer": 0, "explain": "The target is $1/(2 \\times 0.25) = 2$. The loss $(3 - 2)^2 = 1$ has gradient $2(3 - 2) = +2$, so descent reduces $h$ toward 2. 'Larger is always better' is DPO's behaviour, not IPO's."}
```

```quiz
{"q": "During DPO, `rewards/margins` rises steadily but both `rewards/chosen` and `rewards/rejected` are falling. What is happening?", "options": ["The model is improving on both answers", "Both answers are becoming less likely; the rejected one just falls faster", "The reference model is being updated", "$\\beta$ is too large"], "answer": 1, "explain": "The implicit rewards are $\\beta\\Delta$; negative values mean the policy gives the answer lower probability than the reference does. DPO only constrains the difference, so it can widen the margin by lowering both. A larger $\\beta$ or an added SFT term on the chosen answers counters it."}
```
