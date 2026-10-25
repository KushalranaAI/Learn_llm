---
title: Reward models and the Bradley-Terry model
minutes: 7
---

Preferences are comparisons, but reinforcement learning needs a number: a score for any single response. The bridge is a **reward model**: a network $r_\phi(x, y)$ that reads a prompt and a response and outputs one scalar, trained so that preferred responses score higher than rejected ones.

Chess ratings are the right intuition. Nobody measures a player's strength directly; we only see who beat whom. Yet from enough game results we can assign each player a rating such that the rating gap predicts the probability of winning. A reward model does the same for responses.

## The Bradley-Terry model

The **Bradley-Terry** model says the probability that $y_w$ is preferred to $y_l$ depends only on the difference of their scores, passed through the **sigmoid** $\sigma(z) = 1/(1 + e^{-z})$:

$$
P(y_w \succ y_l \mid x) = \sigma\!\left(r_w - r_l\right) = \frac{1}{1 + e^{-(r_w - r_l)}}
$$

where $r_w = r_\phi(x, y_w)$ and $r_l = r_\phi(x, y_l)$. Equal scores give probability $0.5$; a gap of $+1$ gives $\sigma(1) \approx 0.731$; a gap of $+2$ gives $\approx 0.881$. Only differences matter, so adding a constant to every reward changes nothing. That freedom is why reward values are often normalised before RL.

## Training: maximise the likelihood of the observed preferences

The reward model is trained with the negative log-likelihood of the labelled choices:

$$
\mathcal{L}_{\text{RM}}(\phi) = -\,\mathbb{E}_{(x, y_w, y_l)}\left[\log \sigma\!\left(r_\phi(x, y_w) - r_\phi(x, y_l)\right)\right]
$$

This is binary cross-entropy where the "logit" is the reward gap $\Delta = r_w - r_l$.

| Gap $\Delta = r_w - r_l$ | $\sigma(\Delta)$ | Loss $-\log\sigma(\Delta)$ |
|---|---|---|
| $-1$ (ranks them wrongly) | 0.269 | 1.313 |
| $0$ (cannot tell) | 0.500 | 0.693 |
| $+1$ | 0.731 | 0.313 |
| $+2$ | 0.881 | 0.127 |

The gradient tells you where learning happens. Since $\frac{d}{d\Delta}\left[-\log\sigma(\Delta)\right] = -(1 - \sigma(\Delta)) = -\sigma(-\Delta)$, a pair the model already gets right by a wide margin ($\Delta = 2$) pushes with weight $\sigma(-2) \approx 0.12$, while a pair it gets wrong ($\Delta = -1$) pushes with weight $\sigma(1) \approx 0.73$. Mistakes are corrected hardest.

```steps
One reward-model update, by hand
For a pair, the reward model outputs $r_w = 0.4$ and $r_l = 0.9$. The gap is $\Delta = -0.5$: it currently prefers the rejected answer.
---
$\sigma(-0.5) = 1/(1 + e^{0.5}) = 1/2.649 \approx 0.378$. So $P(y_w \succ y_l) \approx 0.378$ and the loss is $-\ln 0.378 \approx 0.974$.
---
The gradient with respect to $\Delta$ is $-(1 - 0.378) = -0.622$. Gradient descent increases $\Delta$: it raises $r_w$ and lowers $r_l$ by equal and opposite amounts (through the shared network weights).
---
Once the gap reaches $+2$, this pair contributes only about $0.12$ of the push. The model spends its effort where it is still wrong.
```

## Architecture

A reward model is usually the SFT model itself with its vocabulary head replaced by a single linear output, read at the final token of the response. Starting from the SFT model matters: the reward model needs the same understanding of language to judge responses, and it should be at least as capable as the policy it will grade.

```sim
preference-loss
{"beta": 1, "chosenLogRatio": 1, "rejectedLogRatio": 0}
```

This simulation is built for DPO (next topics), but with $\beta = 1$ its margin is simply $\Delta_w - \Delta_l$, so you can read the two sliders as $r_w$ and $r_l$. Here the gap is $1$: confirm $P = 0.731$ and loss $0.313$. Drag the rejected slider above the chosen one and watch the loss climb past $\ln 2 \approx 0.693$ and the gradient weight grow toward 1.

## In practice

Reward-model accuracy on held-out pairs is the key number; with noisy human labels it is typically well below 100%, and accuracy near the labellers' own agreement rate is about as good as it gets. Watch for the reward model learning shortcuts, especially **length**: if longer answers were usually preferred, the model may score length itself. Check rewards against response length on a validation set before using the model for RL.

```quiz
{"q": "A reward model gives $r_w = 1.5$ and $r_l = 0.5$. What probability does Bradley-Terry assign to $y_w$ being preferred, and what is the loss?", "options": ["0.731 and 0.313", "0.75 and 0.288", "0.5 and 0.693", "0.881 and 0.127"], "answer": 0, "explain": "Only the gap matters: $\\Delta = 1$, $\\sigma(1) = 0.731$, loss $= -\\ln 0.731 = 0.313$. 0.75 is $1.5/(1.5+0.5)$, a ratio of rewards, which is not the Bradley-Terry model."}
```

```quiz
{"q": "You add 10 to every reward the model outputs. How do the Bradley-Terry probabilities change?", "options": ["They all approach 1", "They do not change, because only differences of rewards appear", "They all approach 0.5", "They change by a factor of $e^{10}$"], "answer": 1, "explain": "$\\sigma((r_w + 10) - (r_l + 10)) = \\sigma(r_w - r_l)$. Rewards are only defined up to a constant, which is why they are normalised before RL."}
```
