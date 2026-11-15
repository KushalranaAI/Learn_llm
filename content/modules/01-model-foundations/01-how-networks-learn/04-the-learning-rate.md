---
title: The learning rate, too small, just right, too big
minutes: 7
---

Back on the foggy hillside: the gradient tells you which way is downhill, but not how far to walk. Take tiny shuffling steps and you will still be on the hill at nightfall. Take giant leaps and you overshoot the valley, land high on the opposite slope, and leap back even higher. The **learning rate** $\eta$ is that stride length, and it is the single most important number to get right when training a network.

It is a **hyperparameter**: a setting chosen by the engineer, not learned by gradient descent. Too small wastes compute; too large makes the loss bounce or explode to infinity (engineers say the run **diverged**). There is a precise reason for both, and it fits in three lines of algebra.

## In everyday life

Think of learning to drive. The car drifts left of the lane and you steer back towards the middle. How much you steer matters. With tiny corrections you do get back, but it takes ages. With huge corrections it is worse: you swerve across the lane, end up further out on the other side, and correct even harder. A well-sized correction settles the car in the lane quickly.

In training, the size of the correction is the **learning rate**. Each step of **gradient descent** (the repeated nudging of a model's numbers to lower its error) moves the numbers by the slope times the learning rate. It is a **hyperparameter**: a setting the engineer chooses, not something the model learns. Too small wastes time and compute. Too large makes the loss bounce or blow up, which engineers call the run **diverging**.

Unlike a driver, the model cannot see the road ahead. It only gets the slope at its current spot.

**Where you meet it.** Engineers training a language model watch the loss curve. If it falls very slowly, they try a larger learning rate. If it jumps around or shoots off to an error value, the rate is too large, so they lower it or raise it gently at the start.

```scene
title: Steering a car back into the lane
step: 🚗 The car drifts left of the lane centre | the loss is the error
step: 🧭 You steer back towards the middle | one gradient step
step: 🐢 With tiny corrections you straighten, but only after a very long time | learning rate too small
step: 🔀 With huge corrections you swerve further out each time | learning rate too large, diverging
step: 🛣 A well-sized correction settles the car in the lane quickly | a good learning rate
takeaway: The learning rate is the size of each correction: too small crawls, too large swerves out of control.
```

## Why there is a speed limit

Near a minimum, almost any smooth loss looks like a bowl. Write it as a parabola with **curvature** $a$ (how sharply the bowl bends) and minimum at $w^*$:

$$
L(w) = \tfrac{a}{2}(w - w^*)^2, \qquad \frac{dL}{dw} = a\,(w - w^*)
$$

One gradient step gives $w_{\text{new}} = w - \eta\,a\,(w - w^*)$. Subtract $w^*$ from both sides to track the distance to the minimum, $e = w - w^*$:

$$
e_{\text{new}} = (1 - \eta a)\, e \quad\Longrightarrow\quad e_t = (1 - \eta a)^t \, e_0
$$

Each step multiplies the error by the same factor $r = 1 - \eta a$. Everything follows from the size of $r$:

| Learning rate | Factor $r = 1 - \eta a$ | What happens |
|---|---|---|
| $\eta < 1/a$ | between 0 and 1 | smooth approach from one side; slow if $r$ is close to 1 |
| $\eta = 1/a$ | 0 | lands on the minimum in one step |
| $1/a < \eta < 2/a$ | between $-1$ and 0 | overshoots, flips sides each step, still converges |
| $\eta = 2/a$ | $-1$ | bounces between two points forever |
| $\eta > 2/a$ | below $-1$ | each bounce is bigger: diverges |

So the rule is: **gradient descent converges only if $\eta < 2/a$**, and the sharpest curvature in the landscape sets the limit.

## Worked numbers you can check

Use the previous topic's loss $L(w) = (w - 3)^2$. Written as $\tfrac{a}{2}(w-3)^2$, the curvature is $a = 2$, so the limit is $\eta < 1$ and the perfect step is $\eta = 0.5$. Start at $w = 0$:

| $\eta$ | $r$ | $w$ after steps 1 to 5 |
|---|---|---|
| 0.01 | 0.98 | 0.06, 0.119, 0.176, 0.233, 0.288 (crawling) |
| 0.1 | 0.8 | 0.6, 1.08, 1.464, 1.771, 2.017 |
| 0.5 | 0 | 3, 3, 3, 3, 3 (done in one step) |
| 1.0 | $-1$ | 6, 0, 6, 0, 6 (stuck bouncing) |
| 1.1 | $-1.2$ | 6.6, $-1.32$, 8.18, $-3.22$, 10.47 (diverging) |

Check one entry: at $\eta = 1.1$, the gap $-3$ becomes $-3 \times (-1.2) = 3.6$, so $w = 6.6$; then $3.6 \times (-1.2) = -4.32$, so $w = -1.32$.

## Many directions, one learning rate

With many parameters, the landscape curves differently in different directions. The **narrow ravine** in the sim is $L = \tfrac12(x^2 + 10y^2)$: curvature 1 along $x$ and 10 along $y$. A single $\eta$ must satisfy $\eta < 2/10 = 0.2$ for the steep direction, which makes progress along the gentle direction slow: at $\eta = 0.15$ the $x$ error shrinks by only $1 - 0.15 = 0.85$ per step, while $y$ flips sign with factor $1 - 1.5 = -0.5$. The ratio of largest to smallest curvature, the **condition number** $\kappa$ (here 10), measures how badly a landscape slows gradient descent.

```sim
gradient-descent
{"surface": "ravine", "lr": 0.15, "steps": 40}
```

Try exactly these values in turn: $\eta = 0.01$ (count the steps it needs; it may not converge within the step budget), $0.15$ (zig-zag across the ravine but converging), $0.19$ (violent zig-zag, nearly at the limit) and $0.21$ (the diverged flag turns on). Then set momentum to 0.5 at $\eta = 0.15$ and see the zig-zags damp out while progress along the floor speeds up.

## In practice

- **LLM learning rates are small**, typically somewhere between $10^{-4}$ and $10^{-3}$ for the Adam optimiser, with larger models generally using smaller values. The exact peak is usually found by short trial runs.
- **Schedules beat constants.** Training starts with a **warm-up** (the learning rate ramps up from near 0 over the first few hundred or thousand steps, because the early landscape is rough and gradients are large) and then **decays**, often along a cosine curve, so the final steps settle into the minimum instead of bouncing around it. Module 02 has a sim for this.
- **Recognise the failure mode.** Loss falling but very slowly: try a larger $\eta$. Loss jumping up and down or suddenly shooting to `NaN`: $\eta$ is too large, or you need warm-up or gradient clipping. A loss spike late in a long run often means the same thing.
- **Changing the batch size changes the right learning rate.** Bigger batches give less noisy gradients and usually tolerate a larger $\eta$. If you double the batch, retune.

```quiz
{"q": "A loss behaves like $L = 2(w - 1)^2$ near its minimum. What is the largest learning rate that still converges?", "options": ["$\\eta < 2$", "$\\eta < 0.5$", "$\\eta < 1$", "$\\eta < 0.25$"], "answer": 1, "explain": "Write it as $\\tfrac{a}{2}(w-1)^2$ with $a = 4$ (the slope is $4(w-1)$). Convergence needs $\\eta < 2/a = 0.5$, and $\\eta = 0.25 = 1/a$ would land in one step. Reading the curvature as 2 gives the tempting but wrong limit of 1."}
```

```quiz
{"q": "Your training loss goes 4.1, 3.6, 3.9, 5.2, 9.8, NaN over successive logs. What is the most likely fix?", "options": ["Train for more steps", "Lower the learning rate or add warm-up", "Add more hidden layers", "Use a larger learning rate to escape the bad region"], "answer": 1, "explain": "Growing oscillation that ends in NaN is the $|1 - \\eta a| > 1$ regime: steps overshoot by more each time. Lowering $\\eta$ (or warming up, or clipping gradients) fixes it. Training longer only diverges further, and a larger $\\eta$ makes it worse."}
```
