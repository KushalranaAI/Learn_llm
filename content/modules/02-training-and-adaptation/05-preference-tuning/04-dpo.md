---
title: DPO, deriving preference tuning without RL
minutes: 9
---

RLHF trains a reward model, then runs a reinforcement-learning loop against it with a KL leash. **Direct Preference Optimization** (DPO) asks: if we know exactly which objective that loop is maximising, can we write down its solution and fit it to the preference pairs directly, like an ordinary supervised loss? The answer is yes, and the derivation is short enough to follow line by line. It is one of the most useful pieces of maths in modern post-training.

## Step 1: the optimal policy has a closed form

Start from the KL-regularised objective of the previous topic, for one prompt $x$:

$$
\max_{\pi}\; \mathbb{E}_{y \sim \pi}\left[r(x, y)\right] - \beta\, \mathbb{D}_{\text{KL}}\!\left[\pi(\cdot\mid x) \,\|\, \pi_{\text{ref}}(\cdot\mid x)\right]
$$

Over all possible distributions $\pi$, this is maximised by re-weighting the reference model by the exponentiated reward:

$$
\pi^*(y \mid x) = \frac{1}{Z(x)}\, \pi_{\text{ref}}(y \mid x)\, \exp\!\left(\frac{r(x, y)}{\beta}\right), \qquad Z(x) = \sum_{y} \pi_{\text{ref}}(y \mid x)\, \exp\!\left(\frac{r(x, y)}{\beta}\right)
$$

(To see why: the objective equals $-\beta\,\mathbb{D}_{\text{KL}}[\pi \,\|\, \pi^*] + \beta \log Z(x)$, and a KL divergence is smallest, zero, when $\pi = \pi^*$.) $Z(x)$ is a normaliser that sums over every possible response, impossible to compute, which is why RLHF has to use sampling and RL.

## Step 2: solve for the reward

Take logs and rearrange to express the reward in terms of the optimal policy:

$$
r(x, y) = \beta \log \frac{\pi^*(y \mid x)}{\pi_{\text{ref}}(y \mid x)} + \beta \log Z(x)
$$

Any policy implicitly defines a reward this way. The term $\beta \log \frac{\pi(y\mid x)}{\pi_{\text{ref}}(y\mid x)}$ is called the **implicit reward**.

## Step 3: plug into Bradley-Terry; the normaliser cancels

Bradley-Terry uses only the reward **difference** for the same prompt, so the troublesome $\beta \log Z(x)$ appears twice and cancels:

$$
P(y_w \succ y_l \mid x) = \sigma\!\left(\beta \log \frac{\pi^*(y_w\mid x)}{\pi_{\text{ref}}(y_w\mid x)} - \beta \log \frac{\pi^*(y_l\mid x)}{\pi_{\text{ref}}(y_l\mid x)}\right)
$$

## Step 4: maximise the likelihood of the data

Replace $\pi^*$ with the trainable policy $\pi_\theta$ and minimise the negative log-likelihood of the observed preferences. That is the **DPO loss**:

$$
\mathcal{L}_{\text{DPO}}(\theta) = -\,\mathbb{E}_{(x, y_w, y_l)}\left[\log \sigma\!\Big(\beta\,\big[\Delta_w - \Delta_l\big]\Big)\right], \qquad
\Delta = \log \pi_\theta(y \mid x) - \log \pi_{\text{ref}}(y \mid x)
$$

No reward model, no sampling during training, no value model: just the log-probabilities of two fixed responses under the policy and the frozen reference.

```steps
The DPO loss for one pair, by hand
Sequence log-probabilities: chosen $y_w$ has $\log\pi_\theta = -40$ and $\log\pi_{\text{ref}} = -42$, so $\Delta_w = +2$. Rejected $y_l$ has $\log\pi_\theta = -45$ and $\log\pi_{\text{ref}} = -44$, so $\Delta_l = -1$.
---
With $\beta = 0.1$, the margin is $0.1 \times (2 - (-1)) = 0.3$.
---
$\sigma(0.3) = 1/(1 + e^{-0.3}) \approx 0.574$, so the loss is $-\ln 0.574 \approx 0.554$. At the start of training $\pi_\theta = \pi_{\text{ref}}$, both $\Delta$ are 0, and the loss is $\ln 2 \approx 0.693$.
---
The gradient is weighted by $\beta\,\sigma(-\text{margin}) = 0.1 \times 0.426 \approx 0.043$: it raises $\log\pi_\theta(y_w)$ and lowers $\log\pi_\theta(y_l)$, pushing hardest on pairs where the implicit reward ranks them wrongly.
```

```sim
preference-loss
{"beta": 0.1, "chosenLogRatio": 2, "rejectedLogRatio": -1}
```

These are the numbers from the walkthrough. Check the margin (0.3), the probability (about 57%) and the loss (about 0.554). Now raise $\beta$ to 0.5 with the same log-ratios: the margin becomes 1.5 and the loss drops sharply, so the same move away from the reference counts for more. Then set $\beta$ back to 0.1 and drag the chosen log-ratio to 5: the loss falls only slowly, which is the KL leash at work. Finally make both log-ratios negative but keep the chosen one higher: the loss still falls, a hint at a known quirk discussed below.

## What β does

$\beta$ plays the same role as in RLHF: small $\beta$ means a weak leash (the policy may move far from the reference to satisfy the preferences), large $\beta$ a strong one. Common values are 0.05 to 0.5, with 0.1 a frequent default.

## In practice

DPO is popular because it trains like SFT: the same data loaders, one extra frozen model for the reference log-probabilities (often precomputed once), and stable losses. Its limits come from being **offline**: it only sees the fixed pairs, never its own new samples, so it cannot discover and correct new failure modes the way on-policy RL can. A known quirk: the loss only cares about the *difference* $\Delta_w - \Delta_l$, so training can lower the probability of both chosen and rejected answers as long as the rejected one falls faster. Teams monitor the chosen log-probability, sometimes add a small SFT term on $y_w$, and often run several rounds of "sample with the current model, label, DPO" to make it more on-policy.

```quiz
{"q": "With $\\beta = 0.2$, $\\Delta_w = 1.0$ and $\\Delta_l = -1.5$, what is the DPO margin and approximately the loss?", "options": ["Margin 0.5, loss about 0.474", "Margin 2.5, loss about 0.079", "Margin −0.1, loss about 0.744", "Margin 0.5, loss about 0.693"], "answer": 0, "explain": "Margin $= 0.2 \\times (1.0 - (-1.5)) = 0.5$; $\\sigma(0.5) \\approx 0.622$; loss $= -\\ln 0.622 \\approx 0.474$. 2.5 forgets $\\beta$; 0.693 is the loss at margin 0."}
```

```quiz
{"q": "Why does DPO not need to compute the partition function $Z(x)$?", "options": ["Because $Z(x) = 1$ for language models", "Because Bradley-Terry uses the reward difference for the same prompt, so $\\beta \\log Z(x)$ cancels", "Because DPO samples to estimate it", "Because the reference model is frozen"], "answer": 1, "explain": "Both implicit rewards for a pair share the same prompt and so the same $\\beta \\log Z(x)$; subtracting them removes it. That cancellation is the core trick that turns an RL problem into a classification-style loss."}
```
