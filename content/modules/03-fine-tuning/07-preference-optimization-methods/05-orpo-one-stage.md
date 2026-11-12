---
title: ORPO, SFT and preferences in one stage
minutes: 8
---

The usual recipe has two stages: SFT on demonstrations, then DPO on pairs with the SFT model frozen as the reference. **ORPO** (Odds Ratio Preference Optimisation, Hong, Lee and Thorne, 2024) collapses them into one. It starts from a base model and trains on preference pairs with an ordinary SFT loss on the chosen answer plus a small penalty that pushes the rejected answer down relative to it. There is no reference model and no separate SFT run.

The authors' observation is that SFT alone raises the probability of rejected-style answers too: training on good answers to a prompt also makes similar but worse answers more likely, because they share most of their tokens. A small contrastive push against the rejected answer, applied *during* SFT, is enough to fix that.

## Odds and the odds ratio

ORPO measures how likely the model finds an answer by its per-token average probability, $P_\theta(y \mid x) = \exp\!\big(\tfrac{1}{m}\sum_{t=1}^{m} \log p_\theta(y_t \mid x, y_{<t})\big)$, for an answer of $m$ tokens. The **odds** of the answer are

$$
\text{odds}_\theta(y \mid x) = \frac{P_\theta(y \mid x)}{1 - P_\theta(y \mid x)}
$$

the betting-shop quantity: probability 0.6 means odds of $0.6/0.4 = 1.5$, "three to two on". The **odds ratio** compares chosen and rejected, and the loss is

$$
\mathcal{L}_{\text{ORPO}} = \underbrace{-\frac{1}{m}\sum_t \log p_\theta(y_{w,t} \mid x, y_{w,<t})}_{\mathcal{L}_{\text{SFT}} \text{ on the chosen answer}} \;+\; \lambda \cdot \underbrace{\left(-\log \sigma\!\left(\log \frac{\text{odds}_\theta(y_w \mid x)}{\text{odds}_\theta(y_l \mid x)}\right)\right)}_{\mathcal{L}_{\text{OR}}}
$$

$\lambda$ weights the preference term (TRL calls it `beta`, default 0.1). Only the policy appears: nothing is measured against a reference.

```steps
The ORPO loss for one pair, λ = 0.1
The chosen answer's mean token log-probability is $-0.51$, so $P_w = e^{-0.51} = 0.60$. The rejected answer's is $-1.61$, so $P_l = e^{-1.61} = 0.20$.
---
Odds: chosen $0.60/0.40 = 1.5$; rejected $0.20/0.80 = 0.25$. Odds ratio $1.5/0.25 = 6$, log odds ratio $\ln 6 = 1.79$.
---
Preference term: $\sigma(1.79) = 0.857$, so $\mathcal{L}_{\text{OR}} = -\ln 0.857 = 0.154$. SFT term: $0.51$ (the chosen answer's mean negative log-likelihood).
---
Total: $0.51 + 0.1 \times 0.154 = 0.525$. The SFT term dominates, as intended: ORPO is mostly SFT with a nudge.
---
If instead $P_l = 0.50$ (odds 1.0), the log odds ratio is $\ln 1.5 = 0.405$, $\sigma = 0.60$ and $\mathcal{L}_{\text{OR}} = 0.511$. The penalty more than triples when the rejected answer is nearly as likely as the chosen one.
```

Why odds rather than plain probabilities? Odds stretch near 1: going from $P = 0.9$ to $0.99$ moves the odds from 9 to 99. The authors argue that the odds ratio gives a usefully moderate contrast when combined with the SFT term, where a probability ratio would push the rejected answer's tokens down too aggressively.

## What one stage saves

| | SFT then DPO | ORPO |
|---|---|---|
| Training runs | 2 | 1 |
| Models during preference training (full FT, 8B) | Policy 128 GB + reference 16 GB | Policy 128 GB |
| Forward passes per pair per step | 2 policy + 2 reference (unless precomputed) | 2 policy |
| Data | Demonstrations, then pairs | Pairs only (the chosen answers serve as demonstrations) |

With LoRA the memory gap shrinks to almost nothing (see [the map of methods](/learn/fine-tuning/preference-optimization-methods/the-map-of-methods)), but the saved SFT run remains. The cost is flexibility: you cannot reuse one SFT model for several preference experiments, and the chosen answers must be good enough to imitate, since they are now your SFT targets.

## Running it

ORPO lives in TRL's experimental namespace, which may change in any release:

```python
from datasets import load_dataset
from peft import LoraConfig
from trl.experimental.orpo import ORPOConfig, ORPOTrainer   # check current docs

dataset = load_dataset("trl-lib/ultrafeedback_binarized", split="train")  # prompt/chosen/rejected

args = ORPOConfig(
    output_dir="base-orpo-lora",
    beta=0.1,                       # lambda in the paper: weight of the odds-ratio term
    learning_rate=8e-6,             # an SFT-like rate, since this *is* the SFT run (LoRA)
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    num_train_epochs=1,
    max_length=1024,
)
trainer = ORPOTrainer(model="base-model-id",       # a base model, not an SFT one
                      args=args, train_dataset=dataset,
                      peft_config=LoraConfig(r=16, lora_alpha=32,
                                             target_modules="all-linear",
                                             task_type="CAUSAL_LM"))
trainer.train()
```

Base models have no chat template; make sure the tokenizer you load has one, since the conversational dataset is formatted with it. The logs show `nll_loss` (the SFT term, which should fall like an SFT loss), `log_odds_ratio` (the mean of $\log\sigma(\cdot)$, which should rise toward 0) and `log_odds_chosen` (the mean log odds ratio, which should rise).

## In practice

ORPO is attractive on a budget: one run, one model, no SFT checkpoint to manage. Its weak point is sensitivity. Results move noticeably with $\lambda$ and the learning rate, and too large a $\lambda$ makes the model avoid the rejected style so hard that general quality drops. Sweep $\lambda$ over something like 0.05, 0.1 and 0.25 on a small slice before the full run. If your pairs are on-policy samples from an existing SFT model, ORPO's main saving disappears, and DPO from that SFT model is usually the stronger choice.

```quiz
{"q": "A chosen answer has $P_w = 0.8$ and the rejected one $P_l = 0.5$. What is the log odds ratio?", "options": ["$\\ln 4 \\approx 1.39$", "$\\ln 1.6 \\approx 0.47$", "$\\ln 0.3 \\approx -1.20$", "$\\ln 2 \\approx 0.69$"], "answer": 0, "explain": "Odds: $0.8/0.2 = 4$ and $0.5/0.5 = 1$, so the odds ratio is 4 and its log is 1.39. $\\ln 1.6$ uses the probability ratio $0.8/0.5$ instead of the odds ratio."}
```

```quiz
{"q": "Why can ORPO skip the reference model that DPO needs?", "options": ["Because it computes the reference log-probabilities once in advance", "Because its SFT term on the chosen answers anchors the model, so it does not need a KL leash to a frozen copy", "Because it uses a reward model instead", "Because odds ratios are always bounded"], "answer": 1, "explain": "ORPO's regulariser is the NLL on the chosen answers: the model is kept close to good demonstrations rather than to a frozen model. Precomputing reference log-probabilities is a DPO memory trick, not what ORPO does."}
```
