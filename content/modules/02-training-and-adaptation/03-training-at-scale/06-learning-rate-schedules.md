---
title: Warmup and cosine decay
minutes: 7
---

The learning rate is the size of each step downhill. Early in training the model is random, its gradients are large and erratic, and Adam's running averages $m$ and $v$ have barely started, so a big step can throw the weights somewhere they never recover from: the loss spikes or turns into `NaN`. Late in training the model is near a good region, and big steps make it bounce around the bottom of the valley instead of settling into it.

So nobody trains a large model with a constant learning rate. They use a **schedule**: start tiny and **warm up** to a peak over the first few thousand steps, then **decay** slowly to a small final value. The most common decay shape is a half cosine.

## The formula

Let $t$ be the step, $T$ the total number of steps, $T_w$ the warmup steps, $\eta_{\max}$ the peak learning rate and $\eta_{\min}$ the final one. Warmup is linear:

$$
\eta_t = \eta_{\max} \cdot \frac{t}{T_w} \qquad \text{for } t < T_w
$$

and after warmup, cosine decay:

$$
\eta_t = \eta_{\min} + \frac{1}{2}\left(\eta_{\max} - \eta_{\min}\right)\left(1 + \cos\!\left(\pi \cdot \frac{t - T_w}{T - T_w}\right)\right) \qquad \text{for } T_w \le t \le T
$$

At the end of warmup the cosine's argument is 0, $\cos 0 = 1$, and $\eta = \eta_{\max}$. At $t = T$ the argument is $\pi$, $\cos \pi = -1$, and $\eta = \eta_{\min}$. In between it falls smoothly: slowly at first, fastest in the middle, slowly again at the end.

```steps
Evaluate a schedule at four steps
Settings: $\eta_{\max} = 3\times10^{-4}$, $\eta_{\min} = 3\times10^{-5}$ (10% of peak), $T_w = 2{,}000$, $T = 50{,}000$. So $\eta_{\max} - \eta_{\min} = 2.7\times10^{-4}$ and the decay lasts $48{,}000$ steps.
---
$t = 1{,}000$ (mid-warmup): $3\times10^{-4} \times 1000/2000 = 1.5\times10^{-4}$.
---
$t = 26{,}000$ (halfway through decay): the fraction is $24{,}000/48{,}000 = 0.5$, $\cos(\pi/2) = 0$, so $\eta = 3\times10^{-5} + 0.5 \times 2.7\times10^{-4} \times 1 = 1.65\times10^{-4}$. Halfway through the decay, the rate is halfway between peak and floor.
---
$t = 38{,}000$ (three-quarters): $\cos(3\pi/4) \approx -0.707$, so $\eta = 3\times10^{-5} + 0.5 \times 2.7\times10^{-4} \times 0.293 \approx 6.95\times10^{-5}$.
---
$t = 50{,}000$: $\eta = \eta_{\min} = 3\times10^{-5}$.
```

## See it

```sim
lr-schedule
{"schedule": "cosine", "peakLr": 0.0003, "warmupSteps": 2000, "totalSteps": 50000, "minLrRatio": 0.1}
```

This is the schedule from the worked example; read the four values off the curve. Then try: set warmup to 0 and the peak to $2 \times 10^{-3}$ and watch the "Unstable steps" counter and the simulated loss spike early. Restore warmup to 2,000 and compare. Next switch the shape to "constant" at the original peak: the loss falls fast but never gets the late drop that comes from annealing. Finally try "Warmup-stable-decay", which holds the peak for most of training and decays only in the last 20%.

## Why the decay matters, and alternatives

Much of the final loss improvement in a cosine run arrives during the decay, as the step size shrinks and the model settles into the valley. That has a practical consequence: **you must know $T$ in advance**. If you decide halfway through to train twice as long, the cosine schedule you were following was wrong for the new length. This is one reason the **warmup-stable-decay** (WSD) schedule has become popular: train at a constant peak for as long as you like, and when you want a finished model, branch off and decay quickly over the last 10% to 20% of steps. Checkpoints from the stable phase can be continued later.

| Schedule | Shape after warmup | Main advantage | Main drawback |
|---|---|---|---|
| Cosine | Smooth half-cosine to $\eta_{\min}$ | Robust, well understood | Must fix $T$ up front |
| Linear | Straight line to $\eta_{\min}$ | Simple; common for fine-tuning | Same as cosine |
| WSD | Constant, then short decay | Extend training at any time | Needs a well-chosen decay length |
| Inverse square root | $\propto 1/\sqrt{t}$ | No fixed end | Never fully anneals |

## In practice

Typical pretraining peaks for models of several billion parameters are around $10^{-4}$ to $3 \times 10^{-4}$ with AdamW, smaller for bigger models; warmup is often a few thousand steps or around 1% of training; and the floor is commonly 10% of the peak. Fine-tuning uses much lower peaks (around $10^{-5}$ to $2\times10^{-5}$ for full fine-tuning) and short warmups. When a run spikes, the first suspects are a peak that is too high, warmup that is too short, or bad data in that batch.

```quiz
{"q": "With $\\eta_{\\max} = 2\\times10^{-4}$, $\\eta_{\\min} = 0$, warmup 1,000 steps and $T = 11{,}000$, what is the learning rate at step 6,000?", "options": ["$2\\times10^{-4}$", "$1\\times10^{-4}$", "$0.5\\times10^{-4}$", "$1.7\\times10^{-4}$"], "answer": 1, "explain": "The decay runs from 1,000 to 11,000, so step 6,000 is halfway: $\\cos(\\pi/2) = 0$ and $\\eta = 0 + 0.5 \\times 2\\times10^{-4} \\times 1 = 10^{-4}$. Taking the fraction as $6000/11000$ without subtracting the warmup gives the wrong point on the curve."}
```

```quiz
{"q": "A team using a cosine schedule for 100k steps decides at step 60k to train to 200k steps instead. What is the problem?", "options": ["None; the schedule adapts automatically", "The learning rate has already decayed as if training ends at 100k, so the extension starts from an already-low rate and the schedule shape is wrong for 200k", "Warmup must be repeated from zero", "Cosine schedules only work for exactly 100k steps"], "answer": 1, "explain": "A cosine schedule bakes $T$ into every step's learning rate. Changing $T$ mid-run leaves you with a schedule that decayed too early. WSD schedules avoid this by holding the rate constant until the final decay."}
```
