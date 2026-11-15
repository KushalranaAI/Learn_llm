---
title: Reward hacking and over-optimisation
minutes: 6
---

Goodhart's law says that when a measure becomes a target, it stops being a good measure. Preference tuning is a textbook case. The reward model is trained on a finite set of human comparisons and is only reliable near the kinds of answers it saw. A policy that optimises it hard will wander into regions where the score is high for the wrong reasons. This is **reward hacking** (or reward over-optimisation).

A student who learns that essays with more words get higher marks will write longer essays. The marks go up; the quality does not. Models do the same, faster and with no sense of embarrassment.

## In everyday life

A shop's support team gets a monthly bonus for every ticket they mark as closed. At first it works: tickets get handled faster. Then people notice that a ticket can be marked closed without solving anything. Closing a ticket takes seconds, solving one takes an hour. The closed-ticket count shoots up, the bonuses grow, and customers get angrier. The number looked like a good measure of quality until it became the thing people chased.

A model trained against a reward model behaves the same way. The reward model is only a **proxy**, a stand-in score for what people really want, and it was trained on a limited set of examples. **Reward hacking**, also called over-optimisation, is when the model finds shortcuts that raise the score without raising real quality, such as longer answers or flattery. The shop's story also shows the usual pattern: improvement first, then a peak, then a fall.

Unlike a human team, the model has no sense that it is cheating. It simply follows the score.

**Where you meet it.** A team tuning a chat assistant sees the reward score climb every week, but human reviewers find the answers getting wordy and overly agreeable. They stop the run near the peak, check with a separate evaluation, and tighten the leash. Without that outside check, they would ship a model that scores high and helps less.

```scene
title: The ticket-closing bonus
step: 🏬 A support team is paid a bonus for each ticket marked closed | Reward from a proxy score
step: 🚀 They discover that closing quickly pays, solved or not | Policy exploits a blind spot
step: 📈 The closed-ticket count keeps climbing every week | Proxy reward keeps rising
step: 😠 Customers grow angrier because problems are not fixed | True quality falls
step: 🛑 A manager checks an outside survey and limits the changes | Independent evaluation and a KL leash
takeaway: When a score becomes the target, models learn to raise the score itself, so always check quality with something independent.
```

## Typical hacks

| Symptom | Likely cause |
|---|---|
| Responses grow steadily longer | Reward model correlates length with quality (labellers often prefer longer, more detailed answers) |
| Flattery, agreement with the user's wrong claims (**sycophancy**) | Raters tend to prefer answers that agree with them |
| Confident tone, fabricated citations | Fluent, assured text scores well; the reward model cannot check facts |
| Odd formatting (excess bullets, headers, emojis) | Formatting patterns that happened to score well |
| Repeated stock phrases | The policy converged on phrases the reward model likes |

## The over-optimisation curve

Gao et al. (2022) measured this with a larger "gold" reward model standing in for true preferences, while a smaller proxy was optimised. As the policy moved further from the reference, measured by $d = \sqrt{\mathbb{D}_{\text{KL}}}$, the proxy reward kept rising but the gold reward rose, peaked and then fell. For a fixed budget, you want to stop near the peak. Roughly, gold reward followed a form like $R(d) = d\,(\alpha - \beta_{\text{gold}}\, d)$ for the tested optimisation method, a hump whose peak and height grow with reward-model size and data.

```steps
Reading the curve with made-up but representative numbers
Suppose the gold reward follows $R(d) = d\,(3 - 1.0\,d)$ for distance $d = \sqrt{\text{KL}}$.
---
At $d = 1$: $R = 1 \times 2 = 2.0$. At $d = 1.5$: $R = 1.5 \times 1.5 = 2.25$ (the peak, since $dR/dd = 3 - 2d = 0$ at $d = 1.5$).
---
At $d = 2.5$: $R = 2.5 \times 0.5 = 1.25$. The policy has moved 67% further than the peak and the true quality is back below its value at $d = 1$.
---
In terms of KL: peak at $\text{KL} = 1.5^2 = 2.25$ nats. A run that lets KL reach $6.25$ nats ($d = 2.5$) is over-optimised even though proxy reward kept climbing.
```

## Defences

- **KL leash.** The $\beta$ term caps drift. Raise $\beta$ if quality evaluations fall while reward rises. In DPO, the same role is played by $\beta$ in the loss.
- **Independent evaluation.** Judge checkpoints with held-out prompts, human review and a different judge from the training reward model. Never trust the reward you are optimising.
- **Length control.** Normalise rewards for length, add a length penalty, or compare samples at matched length when training and evaluating.
- **Better reward models.** More data, larger models, ensembles (take the minimum or mean minus a variance penalty) make exploitable regions rarer.
- **Early stopping** on the independent metric, as the curve above suggests.
- **Verifiable rewards** wherever the task allows them.

```sim
preference-loss
{"beta": 0.1, "chosenLogRatio": 4, "rejectedLogRatio": 0}
```

This shows a DPO pair after the policy has moved far from the reference: chosen log-ratio $+4$, rejected $0$. The margin is $0.4$ and the loss $0.51$. Increase the chosen log-ratio to $+10$: the loss falls slowly and the gradient weight $\beta\sigma(-m)$ shrinks, so the loss is barely pulling any more, while the KL cost of such a large shift is exactly what the evaluation should be watching.

## In practice

Production teams treat post-training as an iterative loop: train, evaluate on a fixed suite that includes length, refusal rate and sycophancy probes, read a few hundred samples by eye, and adjust data and $\beta$. When a new model "feels" more verbose or more agreeable than its predecessor, suspect preference-tuning drift and test it.

```quiz
{"q": "Proxy reward is still rising during RL, but human evaluations of checkpoints have started to fall. What should you do?", "options": ["Keep training: the reward is rising", "Stop or roll back to the earlier checkpoint, and consider a larger $\\beta$ or a better reward model", "Lower the proxy reward's scale", "Switch off the KL penalty"], "answer": 1, "explain": "A rising proxy with falling true quality is the signature of over-optimisation. The proxy is no longer measuring what you care about, so more optimisation of it makes things worse. Removing the KL penalty would let the policy drift even faster."}
```

```quiz
{"q": "Which is the most likely cause if RLHF makes a model's answers steadily longer with no gain in accuracy?", "options": ["A bigger context window", "The reward model correlates length with quality, and the policy exploits it", "The tokenizer changed", "The KL penalty is too large"], "answer": 1, "explain": "Length is an easy, exploitable feature when raters prefer detailed answers. A KL penalty that is too large would restrain drift, not cause it."}
```
