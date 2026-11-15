---
title: The map of preference methods
minutes: 8
---

```callout-before
Before you start
This lesson assumes the theory from [Preference Tuning: RLHF and DPO](/learn/fine-tuning/preference-tuning): Bradley-Terry, the KL-regularised objective and the DPO derivation. It also assumes you have an SFT model to start from; [SFT with LoRA, step by step](/learn/fine-tuning/sft-with-lora-step-by-step) produces one.
```

```predict
{"q":"Full fine-tuning of an 8B model with DPO needs about 144 GB of model states (the trained policy plus a frozen reference). Roughly how much does PPO need?","options":["About the same, 144 GB","About 160 GB","About 288 GB","About 576 GB"],"answer":2,"reveal":"About 288 GB: PPO also trains a value model as large as the policy (another 128 GB) and keeps a frozen reward model. The steps under \"The memory arithmetic for an 8B model\" add up every method, and show why LoRA changes the picture."}
```

Open the TRL documentation or a post-training paper from the last three years and you meet an alphabet: PPO, RLOO, GRPO, DPO, IPO, KTO, ORPO, SimPO, CPO, and a dozen more. It looks like a zoo. It is closer to a family tree. Almost every method answers the same four practical questions differently, and once you know the answers you can place any new acronym in seconds.

The four questions are:

1. **What data does it need?** Ranked pairs (chosen and rejected answers to one prompt), single answers with a thumbs-up or thumbs-down label, or just prompts plus a reward function that can score any answer.
2. **Is it online or offline?** An **online** method samples fresh answers from the model being trained and learns from them. An **offline** method learns from a fixed dataset collected in advance, the way SFT does.
3. **Does it need a reference model?** Many methods measure how far the policy has moved from a frozen copy of the starting model, $\pi_{\text{ref}}$. Others drop that copy entirely (**reference-free**).
4. **How many models sit in memory?** This follows from the first three and decides whether the run fits on your GPU.

The 2026 survey by Raheja and Pochhi ("From RLHF to Direct Alignment") makes the same point formally: DPO, IPO, KTO, SimPO, ORPO and the RL methods differ along three axes, which are the preference model behind the loss, the regulariser that keeps the policy near a reference, and the data distribution (online or offline). Most of their failure modes, such as length hacking or the chosen answer's probability falling during training, trace back to particular choices on those axes.

## In everyday life

A singing teacher has a student who already sings in tune after basic lessons. Now the teacher wants to polish the style. There are several ways to give feedback. Play two takes and say which is better. Give a thumbs up or down to one take. Or let a tuner app score any take. The teacher also decides whether the student sings fresh takes each round or learns from old recordings, and whether to keep a recording of the starting voice to check it has not drifted too far.

Methods for preference tuning are these same choices. The model after basic training is the **SFT model**. **Preference pairs** are two answers to one prompt, with one marked as better. **Binary labels** are a single answer marked thumbs up or down. A **reward function** is a program that scores any answer, such as a checker for maths. **Online** methods make fresh answers as they train, while **offline** methods learn from a saved dataset. A **reference model** is a frozen copy of the starting model used as a yardstick. Each acronym, such as DPO or KTO, is one mix of these choices. Memory matters too, because every extra model held in memory takes GPU space.

**Where you meet it.** A team with logged thumbs up and thumbs down from users picks a method built for single labelled answers. A team building a maths tutor, where answers can be checked automatically, picks a method that learns from fresh answers scored by a checker.

```scene
title: Ways a singing teacher gives feedback
step: 🎤 The student already sings well after basic lessons | SFT model
step: 🎧 The teacher plays two takes and picks the better one | preference pairs
step: 👍 Or the teacher just rates one take up or down | binary labels
step: 📏 Or a tuner app scores any take on demand | reward function
step: 📼 Feedback uses old recordings, or fresh takes each round | offline versus online
step: 🎞 A recording of the starting voice stays as a yardstick | reference model
takeaway: Each method is a choice of feedback type, fresh or saved answers, and whether to keep a frozen yardstick.
```

## The family on one page

| Method | Data | Online? | Reference model | Models in memory (full fine-tuning) | Stability in practice |
|---|---|---|---|---|---|
| RLHF with PPO | Pairs (to train a reward model), then prompts | Yes | Yes | 4: policy, value, reward, reference | Fiddly; many knobs |
| RLOO, GRPO | Prompts + reward function or reward model | Yes | Usually (KL term) | 2 to 3: policy, reference, maybe reward model | Good with verifiable rewards |
| DPO | Pairs | No | Yes | 2: policy, reference | High |
| IPO | Pairs | No | Yes | 2 | High; resists overfitting |
| KTO | Single answers + binary label | No | Yes | 2 | High; batch size matters |
| ORPO | Pairs | No | No | 1 | Sensitive to its weight $\lambda$ |
| SimPO | Pairs | No | No | 1 | Sensitive to learning rate |
| CPO | Pairs | No | No | 1 | High (SFT term anchors it) |

Two columns explain most practical choices. The data column is about what you can collect: pairs cost more labelling than thumbs, and a reward function is only free when correctness can be checked. The memory column is about what you can afford.

## The memory arithmetic for an 8B model

Recall from [Sizing your first run](/learn/fine-tuning/start-here/sizing-your-first-run) that full fine-tuning with mixed-precision Adam costs 16 bytes per trained parameter, and a frozen bf16 model costs 2 bytes per parameter. For $N = 8 \times 10^9$:

$$
M_{\text{trained}} = 16N = 128 \text{ GB}, \qquad M_{\text{frozen}} = 2N = 16 \text{ GB}
$$

Add up the models each method needs (before activations and, for online methods, the generation cache):

```steps
Model-state memory per method, 8B, full fine-tuning
**PPO**: trained policy (128) + trained value model of the same size (128) + frozen reward model (16) + frozen reference (16) = **288 GB**.
---
**GRPO / RLOO with a learned reward model**: policy (128) + reference (16) + reward model (16) = **160 GB**. With a verifiable reward (a unit test or answer checker) the reward model disappears: **144 GB**.
---
**DPO, IPO, KTO**: policy (128) + reference (16) = **144 GB**. If the reference log-probabilities are computed once before training, the reference leaves memory: **128 GB**.
---
**ORPO, SimPO, CPO**: policy only = **128 GB**, and no reference forward pass at any step.
---
**With LoRA**: the frozen base (16 GB) is shared, and the reference is simply the base with adapters switched off. Every offline method then needs about **16 GB + 0.7 GB** of adapter states, plus activations.
```

The last step is the important one for this module. Once you train with LoRA, the reference model is almost free, so "reference-free" stops being a memory argument and becomes an argument about compute (one fewer forward pass per step) and about the shape of the loss.

```python
# Model-state memory per preference method (GB), before activations.
def method_memory_gb(n_params, method, lora=False):
    trained, frozen = 16 * n_params / 1e9, 2 * n_params / 1e9
    if lora:                      # base shared; reference = adapters disabled
        return frozen + 16 * 0.005 * n_params / 1e9   # ~0.5% trainable
    models = {
        "ppo":   [trained, trained, frozen, frozen],  # policy, value, reward, ref
        "grpo":  [trained, frozen],                   # policy, ref (verifiable reward)
        "dpo":   [trained, frozen],                   # policy, ref
        "orpo":  [trained],                           # policy only
    }
    return sum(models[method])

for m in ["ppo", "grpo", "dpo", "orpo"]:
    print(m, round(method_memory_gb(8e9, m)), "GB")   # 288, 144, 144, 128
print("dpo + lora", round(method_memory_gb(8e9, "dpo", lora=True), 1), "GB")  # 16.6
```

```sim
training-memory
{"model": "llama3-8b", "precision": "mixed", "optimizer": "adam", "zero": 0, "gpus": 1, "seqLen": 2048, "microBatch": 1, "checkpointing": true, "gpu": "h100"}
```

This is the trained policy alone. Note the model states, about 128 GB, then raise the GPU count and ZeRO stage to 3 until it fits. That is the cheapest a full-fine-tuning preference run can be. DPO adds a 16 GB reference on top, and PPO adds a second 128 GB model. Preference methods also process two sequences per example (chosen and rejected), so the activations are roughly double those of SFT at the same sequence length.

## In practice

Teams pick on data first and memory second. If you have pairs, DPO with LoRA is the default and the other offline methods are variations to try when DPO shows a specific problem (overfitting, verbosity, the cost of a separate SFT stage). If you have only thumbs, use KTO. If correctness is checkable, the online family is worth its cost; that is the subject of [GRPO hands-on](/learn/fine-tuning/grpo-hands-on). PPO is now mainly a reference point.

```quiz
{"q": "You fully fine-tune a 3B model with DPO, keeping the reference model in memory in bf16. Roughly how much do the model states take?", "options": ["54 GB", "48 GB", "96 GB", "6 GB"], "answer": 0, "explain": "Policy: $16 \\times 3 = 48$ GB. Reference: $2 \\times 3 = 6$ GB. Total 54 GB. 48 GB forgets the reference; 96 GB counts the reference as a second trained model, which it is not, since it gets no gradients or optimizer states."}
```

```quiz
{"q": "Why does dropping the reference model (as ORPO and SimPO do) save little memory in a LoRA run?", "options": ["Because LoRA adapters are larger than the reference model", "Because with LoRA the reference is just the frozen base with adapters disabled, which is already in memory", "Because LoRA runs never use a reference model", "Because the reference model is stored in 4 bits"], "answer": 1, "explain": "The base weights are shared by policy and reference; switching adapters off gives $\\pi_{\\text{ref}}$ for free. What a reference-free method still saves is the extra forward pass per step. LoRA preference runs do use a reference, it just costs no extra weights."}
```
