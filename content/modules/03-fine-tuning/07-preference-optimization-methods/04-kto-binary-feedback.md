---
title: KTO, learning from thumbs up and thumbs down
minutes: 8
---

Most products do not collect preference pairs. They collect a thumbs-up or thumbs-down on one answer at a time, a "report" button, or a support ticket that says the answer was wrong. Turning that into pairs means finding two answers to the *same* prompt with opposite labels, which throws most of the data away. **KTO** (Kahneman-Tversky Optimisation, Ethayarajh et al., 2024) trains directly on single answers with a binary label: **desirable** or **undesirable**.

The name comes from **prospect theory**, Kahneman and Tversky's model of how people value outcomes. Two of its ideas matter here. People judge an outcome relative to a **reference point**, not in absolute terms: a 5% raise feels good if you expected nothing and bad if you expected 10%. And the value curve is S-shaped, flattening for large gains and large losses, so the hundredth unit of improvement counts less than the first. KTO builds a loss with exactly this shape.

## In everyday life

A small restaurant puts a feedback box by the door. Each guest drops in a card about one dish: a smile or a frown. Nobody tastes two dishes side by side and ranks them. The manager still learns plenty. Dishes with smiles stay, and dishes with frowns get fixed. There is one catch. Most cards are smiles, so the few frowns could get lost. The manager counts each frown a little extra so both kinds are heard.

**KTO** works from exactly this kind of feedback. Its examples are single answers, each marked **desirable** (thumbs up) or **undesirable** (thumbs down). No pair is needed. The model is trained to make liked answers more likely and disliked ones less likely, judged against a **reference point**, which is roughly how far the model has already drifted from its start. A frown matters most when the model has grown fonder of a bad answer than it was before. Because smiles usually outnumber frowns, KTO has weights that boost the rarer label. The name borrows from Kahneman and Tversky, who studied how people judge gains and losses.

One warning from the restaurant: some frowns are about slow service, not the dish. Read a sample of thumbs-down cards before training.

**Where you meet it.** A software company logs thumbs up and thumbs down on its help assistant's replies. Most users never compare two replies, so true pairs are rare. KTO lets the team use every logged rating instead of discarding the unpaired ones.

```scene
title: Smile and frown cards in a restaurant
step: 🍽 Each guest drops a card about one dish: smile or frown | single answer with thumbs up or down
step: 🗂 No two dishes are ranked side by side, yet every card is used | no pairing needed
step: ⚖ Smiles far outnumber frowns, so each frown counts extra | desirable and undesirable weights
step: 📏 Cards are judged against what the kitchen usually serves | reference point
step: 🍳 The cook repeats what earns smiles and drops what earns frowns | raise liked, lower disliked answers
step: 🔍 The manager reads frown cards and finds some blame slow service | noisy labels
takeaway: KTO learns from single thumbs-up or thumbs-down answers, so no pairs are needed and every rating counts.
```

## The loss

Let $r_\theta(x, y) = \log \pi_\theta(y \mid x) - \log \pi_{\text{ref}}(y \mid x)$, the same log-ratio DPO uses. The reference point $z_0$ is an estimate of the KL divergence between policy and reference, computed in practice from mismatched prompt-answer pairs in the batch and treated as a constant (no gradient flows through it). The value of an answer is

$$
v(x, y) =
\begin{cases}
\lambda_D\, \sigma\big(\beta\,(r_\theta(x, y) - z_0)\big) & y \text{ desirable} \\
\lambda_U\, \sigma\big(\beta\,(z_0 - r_\theta(x, y))\big) & y \text{ undesirable}
\end{cases}
$$

and the loss is $\mathcal{L}_{\text{KTO}} = \mathbb{E}\big[\lambda_y - v(x, y)\big]$, where $\lambda_y$ is $\lambda_D$ or $\lambda_U$ for that answer's label. The sigmoid is the S-curve. A desirable answer earns value by rising *above* the reference point; an undesirable one earns value by sinking *below* it. The point is relative: if the whole policy has drifted (large $z_0$), merely matching that drift earns nothing.

```steps
Three answers, β = 0.1, z₀ = 0.5, λ_D = λ_U = 1
A desirable answer with $r_\theta = 3$: $v = \sigma(0.1 \times (3 - 0.5)) = \sigma(0.25) = 0.562$. Loss $1 - 0.562 = 0.438$. Gradient raises its probability.
---
An undesirable answer with $r_\theta = -2$: $v = \sigma(0.1 \times (0.5 - (-2))) = \sigma(0.25) = 0.562$. Loss 0.438. It has already been pushed down; the gradient keeps pushing, with the same strength as the first.
---
An undesirable answer with $r_\theta = +1$ (the policy now likes it *more* than the reference does): $v = \sigma(0.1 \times (0.5 - 1)) = \sigma(-0.05) = 0.488$. Loss 0.512, the largest of the three, so this answer gets the strongest correction.
---
At the start of training $r_\theta = 0$ and $z_0 \approx 0$ for every answer, so $v = \sigma(0) = 0.5$ and the loss per example is 0.5: the KTO analogue of DPO's starting loss of $\ln 2$.
```

## Imbalanced labels

Real feedback is lopsided: perhaps 2,000 thumbs-up and 500 thumbs-down. The KTO paper recommends choosing the weights so that

$$
\frac{\lambda_D\, n_D}{\lambda_U\, n_U} \in \left[1, \tfrac{4}{3}\right]
$$

where $n_D$ and $n_U$ count desirable and undesirable examples. With $\lambda_D = 1$: $2000 / (500\,\lambda_U) \in [1, 1.33]$ gives $\lambda_U$ between 3 and 4. Upweight the rarer label until the two sides contribute about equally, with a slight tilt toward the desirable side.

## When KTO beats DPO

| Situation | Why KTO fits |
|---|---|
| Feedback is per answer, not per pair | No pairing step; every labelled answer is used |
| Labels are heavily imbalanced | $\lambda_D$, $\lambda_U$ rebalance without discarding data |
| Labels are noisy or inconsistent between raters | The loss saturates for extreme answers, so outliers pull less |
| You do have pairs | Split each pair into one desirable and one undesirable row; the paper reports KTO matching or beating DPO from 1B to 30B parameters |

When you have clean pairs from the same prompt, DPO uses strictly more information (the direct comparison), and it remains a strong default.

## Running it

Data is one row per answer:

```python
rows = [
    {"prompt": [{"role": "user", "content": "How do I export my invoices?"}],
     "completion": [{"role": "assistant", "content": "Go to Billing > History, then Export CSV."}],
     "label": True},     # thumbs up
    {"prompt": [{"role": "user", "content": "How do I export my invoices?"}],
     "completion": [{"role": "assistant", "content": "I'm not sure, try contacting support."}],
     "label": False},    # thumbs down
]
```

In the current TRL documentation, `KTOTrainer` and `KTOConfig` are imported from `trl`; some 1.x releases kept them under `trl.experimental`, so check the docs for the version you pin.

```python
from datasets import load_dataset
from peft import LoraConfig
from trl import KTOConfig, KTOTrainer   # or trl.experimental.kto in some releases

dataset = load_dataset("trl-lib/kto-mix-14k", split="train")   # prompt/completion/label

args = KTOConfig(
    output_dir="sft-kto-lora",
    beta=0.1,
    desirable_weight=1.0,           # lambda_D
    undesirable_weight=3.5,         # lambda_U: 2000 up vs 500 down -> 3 to 4
    per_device_train_batch_size=8,  # >= 4: the z0 estimate comes from the batch
    gradient_accumulation_steps=4,
    learning_rate=5e-6,             # docs advise 5e-7 to 5e-6
    num_train_epochs=1,
)
trainer = KTOTrainer(model="path/to/merged-sft-model", args=args,
                     train_dataset=dataset,
                     peft_config=LoraConfig(r=16, lora_alpha=32,
                                            target_modules="all-linear",
                                            task_type="CAUSAL_LM"))
trainer.train()
```

The logs add `kl` (the running $z_0$) to the familiar `rewards/chosen` and `rewards/rejected`, which here mean desirable and undesirable answers. A steadily climbing `kl` means the whole policy is drifting from the reference; if quality evaluations stall while it climbs, raise $\beta$.

## In practice

The per-device batch size matters more than in DPO, because $z_0$ is estimated within the batch: with one or two examples it is mostly noise. Keep the per-step batch at 4 or more and the effective batch between 16 and 128. Before training, read a sample of thumbs-down answers: a share will be correct answers the user disliked for unrelated reasons (slow page, wrong product), and teaching the model to avoid those does harm.

```bughunt
{"q":"Your product logged 2,000 thumbs-up and 500 thumbs-down answers, stored with a `thumb` column that is \"up\" or \"down\". This KTO run trains without errors and the logged rewards move the way you expect, yet the tuned model is worse in every review. Click the line with the bug.","code":"def to_kto(r):\n    return {\"prompt\": [{\"role\": \"user\", \"content\": r[\"question\"]}],\n            \"completion\": [{\"role\": \"assistant\", \"content\": r[\"answer\"]}],\n            \"label\": r[\"thumb\"] == \"down\"}\ndataset = feedback.map(to_kto, remove_columns=feedback.column_names)\nargs = KTOConfig(output_dir=\"sft-kto-lora\", beta=0.1,\n                 desirable_weight=1.0,            # lambda_D\n                 undesirable_weight=3.5,          # lambda_U: 2000 up vs 500 down\n                 per_device_train_batch_size=8, gradient_accumulation_steps=4,\n                 learning_rate=5e-6, num_train_epochs=1)\ntrainer = KTOTrainer(model=\"path/to/merged-sft-model\", args=args,\n                     train_dataset=dataset, peft_config=lora)\ntrainer.train()","bug":4,"explain":"Line 4 sets `label` to `True` for thumbs-down answers. In TRL's KTO format `True` means desirable, so the run raises the probability of the answers users rejected and pushes down the ones they liked; the logs look healthy because the trainer is succeeding at the inverted goal. It also inverts the balance: the 500 rejected answers now get weight 1.0 and the 2,000 liked ones 3.5. Fix: `\"label\": r[\"thumb\"] == \"up\"`, and read a few rows of the mapped dataset before training."}
```

```quiz
{"q": "You have 6,000 desirable and 1,500 undesirable examples. With $\\lambda_D = 1$, which $\\lambda_U$ lands in the recommended range?", "options": ["3.5", "1.0", "0.25", "8.0"], "answer": 0, "explain": "$6000 / (1500\\,\\lambda_U) \\in [1, 1.33]$ requires $\\lambda_U$ between 3 and 4, so 3.5 fits. With 1.0 the ratio is 4, so the desirable side dominates; 0.25 makes it worse; 8.0 gives a ratio of 0.5, with the undesirable side now dominating."}
```

```quiz
{"q": "In KTO, an undesirable answer currently has $r_\\theta$ greater than the reference point $z_0$. What does that mean, and how does the loss treat it?", "options": ["The policy rates the bad answer above average; its loss is relatively high and the gradient pushes it down", "The answer is already suppressed; it contributes no loss", "The reference point is wrong and the example is skipped", "KTO treats it the same as a desirable answer"], "answer": 0, "explain": "For undesirable answers $v = \\lambda_U\\sigma(\\beta(z_0 - r_\\theta))$, which is below $\\lambda_U/2$ when $r_\\theta > z_0$, so the loss $\\lambda_U - v$ is above $\\lambda_U/2$. The model has moved toward a bad answer more than it has moved in general, and that is penalised most."}
```
