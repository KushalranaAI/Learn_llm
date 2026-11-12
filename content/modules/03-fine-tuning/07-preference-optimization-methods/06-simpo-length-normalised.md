---
title: SimPO, a length-normalised reward without a reference
minutes: 8
---

Preference data has a well-known bias: people and LLM judges tend to prefer longer, more detailed answers, so the chosen answer is longer than the rejected one more often than quality alone would explain. DPO's implicit reward makes this worse, because it is a *sum* over tokens. A long answer can collect a large reward from many tiny per-token nudges, and the cheapest way for the policy to raise its reward is to write more. The result is the familiar post-DPO model that answers "what is 2 + 2" in three paragraphs.

**SimPO** (Simple Preference Optimisation, Meng, Xia and Chen, NeurIPS 2024) changes two things. The reward is the **average** log-probability per token, so length no longer adds up. And the Bradley-Terry comparison must clear a **target margin** $\gamma$, not just be positive. It also drops the reference model.

## Sum versus average

Under DPO, an answer's implicit reward is $\beta \sum_t \big[\log \pi_\theta(y_t \mid \cdot) - \log \pi_{\text{ref}}(y_t \mid \cdot)\big]$. Compare two answers after some training:

| Answer | Tokens | Per-token log-ratio | Summed log-ratio $\Delta$ | Mean per token |
|---|---|---|---|---|
| Long | 300 | +0.01 | 3.0 | 0.01 |
| Short | 50 | +0.05 | 2.5 | 0.05 |

The sum ranks the long answer higher, though the policy has shifted its probability per token five times less. The average ranks them the other way. Generation itself works per token, so a reward measured per token matches what the model actually does when it writes.

## The loss

For an answer $y$ of $|y|$ tokens, SimPO's reward is

$$
r_{\text{SimPO}}(x, y) = \frac{\beta}{|y|} \log \pi_\theta(y \mid x) = \frac{\beta}{|y|}\sum_{t=1}^{|y|} \log \pi_\theta(y_t \mid x, y_{<t})
$$

and the loss on a pair is

$$
\mathcal{L}_{\text{SimPO}} = -\log \sigma\!\left(\frac{\beta}{|y_w|}\log \pi_\theta(y_w \mid x) - \frac{\beta}{|y_l|}\log \pi_\theta(y_l \mid x) - \gamma\right)
$$

$\beta$ scales the rewards (much larger than DPO's, typically 2 to 10, because average log-probabilities are small numbers) and $\gamma > 0$ is the margin the chosen reward must beat the rejected one by before the loss relaxes. No $\pi_{\text{ref}}$ appears anywhere.

```steps
SimPO on one pair, β = 2.5, γ = 1.25
Chosen: 120 tokens, total log-probability $-96$, so the mean is $-0.8$ and $r_w = 2.5 \times (-0.8) = -2.0$. Rejected: 300 tokens, total $-210$, mean $-0.7$, so $r_l = 2.5 \times (-0.7) = -1.75$.
---
The model currently finds the rejected answer slightly likelier *per token*. The argument of the sigmoid is $r_w - r_l - \gamma = -2.0 + 1.75 - 1.25 = -1.5$, and the loss is $\ln(1 + e^{1.5}) = 1.70$. Large: push hard.
---
Note what a raw, unnormalised sum would have said: $-96 > -210$, so the chosen answer already "wins" simply for being shorter. Normalising removes that accident in both directions.
---
After training: chosen mean $-0.5$ ($r_w = -1.25$), rejected mean $-1.2$ ($r_l = -3.0$). Argument $-1.25 + 3.0 - 1.25 = 0.5$, loss $\ln(1 + e^{-0.5}) = 0.474$. The gap of 1.75 clears the margin of 1.25 and the loss eases off.
```

The paper reports SimPO beating DPO by up to 6.4 points on AlpacaEval 2 and 7.5 on Arena-Hard, without a large increase in response length. As always, gains on your own task need your own evaluation.

## Running it in TRL

TRL implements SimPO as a loss option of `CPOTrainer`, in the experimental namespace. **CPO** (Contrastive Preference Optimisation, Xu et al., 2024) is itself a reference-free method: a DPO-style term on raw log-probabilities plus an SFT (behaviour-cloning) term on the chosen answers, weighted by `cpo_alpha`. Setting `loss_type="simpo"` and `cpo_alpha=0.0` gives plain SimPO; leaving `cpo_alpha` above zero gives the "CPO-SimPO" hybrid.

```python
from datasets import load_dataset
from peft import LoraConfig
from trl.experimental.cpo import CPOConfig, CPOTrainer   # check current docs

dataset = load_dataset("trl-lib/ultrafeedback_binarized", split="train")

args = CPOConfig(
    output_dir="sft-simpo-lora",
    loss_type="simpo",
    cpo_alpha=0.0,          # 0 = pure SimPO; > 0 adds an SFT term (CPO-SimPO)
    beta=2.5,
    simpo_gamma=1.25,       # TRL takes gamma itself (gamma/beta = 0.5 here)
    learning_rate=5e-7,     # SimPO is very sensitive to this (full FT values)
    per_device_train_batch_size=4,
    gradient_accumulation_steps=8,
    num_train_epochs=1,
)
trainer = CPOTrainer(model="path/to/merged-sft-model", args=args,
                     train_dataset=dataset,           # prompt/chosen/rejected
                     peft_config=LoraConfig(r=16, lora_alpha=32,
                                            target_modules="all-linear",
                                            task_type="CAUSAL_LM"))
trainer.train()
```

The SimPO authors' repository sets $\gamma$ via a ratio $\gamma/\beta$ (start at 0.5, search between 0 and 1), while TRL's `simpo_gamma` is $\gamma$ itself; convert when copying settings. Separately, `DPOTrainer` has a `sigmoid_norm` loss that length-normalises DPO but keeps the reference model; that is a related idea, not SimPO.

If your TRL version moves or drops this trainer, the loss is a few lines over per-sequence log-probabilities:

```python
import torch.nn.functional as F

def seq_logp(logits, labels, mask):
    """Sum of token log-probs and token count for each sequence (mask = 1 on answer tokens)."""
    logp = F.log_softmax(logits[:, :-1], dim=-1)
    tok = logp.gather(-1, labels[:, 1:].unsqueeze(-1)).squeeze(-1)
    m = mask[:, 1:].float()
    return (tok * m).sum(-1), m.sum(-1)

def simpo_loss(logp_w, len_w, logp_l, len_l, beta=2.5, gamma=1.25):
    r_w = beta * logp_w / len_w        # average log-prob reward, chosen
    r_l = beta * logp_l / len_l        # average log-prob reward, rejected
    return -F.logsigmoid(r_w - r_l - gamma).mean()
```

## In practice

Learning rate is the knob that breaks SimPO. The authors call it the most critical hyperparameter: their released settings use $3 \times 10^{-7}$ to $1 \times 10^{-6}$ for full fine-tuning, and they report that $10^{-5}$ produces incoherent or repetitive text. With no reference model there is no KL leash; only the learning rate and the number of steps keep the model near where it started. Watch for damage to structured outputs (JSON, code formatting) and keep a few such prompts in your evaluation set.

```quiz
{"q": "With $\\beta = 2$ and $\\gamma = 1$, the chosen answer has mean token log-probability $-0.6$ and the rejected $-1.0$. What is the SimPO loss?", "options": ["$\\ln(1 + e^{-0.2}) \\approx 0.598$", "$\\ln(1 + e^{-0.8}) \\approx 0.371$", "$\\ln 2 \\approx 0.693$", "$\\ln(1 + e^{0.2}) \\approx 0.798$"], "answer": 0, "explain": "$r_w = 2 \\times -0.6 = -1.2$, $r_l = 2 \\times -1.0 = -2.0$. Argument $-1.2 + 2.0 - 1 = 0.2$, loss $= \\ln(1 + e^{-0.2}) \\approx 0.598$. Forgetting $\\gamma$ gives an argument of 0.8 and 0.371."}
```

```quiz
{"q": "Why does length normalisation help against verbosity?", "options": ["It truncates long answers", "With an average, extra tokens only raise the reward if they are individually likelier, so padding an answer no longer accumulates reward", "It makes the reference model penalise long answers", "It removes long answers from the dataset"], "answer": 1, "explain": "A summed log-ratio grows with every token that gets a small positive nudge, so longer answers collect more reward. An average does not grow with length. SimPO has no reference model, so the third option cannot be the mechanism."}
```
