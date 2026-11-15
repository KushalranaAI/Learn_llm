---
title: Warmup and cosine decay, implemented
minutes: 8
---

The part 2 loop used one learning rate for the whole run, $3\times10^{-4}$ from the first step to the last. That is fine for a 2,000-step toy and wasteful for anything longer. Early on it is too aggressive: Adam's first few updates are large and erratic. Late on it is too large to let the model settle into the bottom of the loss valley.

The cure, warmup followed by cosine decay, is derived in [Training at Scale](/learn/training-and-adaptation/training-at-scale). Here the formula becomes twenty lines of Python, and the interesting part is everything around those lines. Which counter drives the schedule? When in the loop do you call it? What must it remember so a resumed run lands on the same curve?

A learning-rate **scheduler** is just a function from the optimizer step $t$ to a number, plus a side effect: it writes that number into every `param_group["lr"]` of the optimizer. PyTorch's optimizer reads `lr` fresh on every `step()`, so whatever value is in the group at that moment is the one used.

## In everyday life

Think of cooking dal in a heavy pan on a gas stove. You do not start on full flame: a cold pan can crack, or the dal can burn at the bottom. You start low, raise the flame to full, and cook fast while there is plenty to do. As the dal nears ready, you lower the flame little by little and let it simmer until it settles.

A model's **learning rate** is the flame. It sets how big a step the model takes each time it adjusts its **weights** (its learned numbers). Early on, those adjustments are wild guesses, so big steps can throw it off. That is why we **warm up**, raising the rate slowly from nearly zero. Later, big steps keep the model bouncing around the best answer instead of settling, so we **decay** the rate along a smooth curve (a half cosine) down to nearly zero. A **scheduler** is the small helper that sets the flame at every step.

Unlike a cook, the scheduler cannot taste the dal. Its plan is fixed in advance, and it must remember where in the plan it is.

**Where you meet it.** A team trains a language model for days. With a flat, high learning rate, the early loss jumps about and the late loss never settles. A warmup and a decay give a calmer curve. If the run is stopped and restarted, the schedule must remember its place, or the flame jumps back to the start.

```scene
title: Cooking dal on a careful flame
step: 🔥 She lights the stove on a very low flame | learning rate starts near zero
step: 📈 She turns it up a little more each minute | linear warmup
step: 🍲 At full flame, the dal cooks fast | peak learning rate
step: 📉 As it nears ready, she lowers the flame bit by bit | cosine decay
step: 🫕 It simmers on a tiny flame and settles | learning rate near zero at the end
step: ⏰ She goes by the clock on the wall, not by each spoon of salt | schedule counts optimizer steps
takeaway: Start gently, work fast in the middle, then ease off so the model settles.
```

## The schedule the repo implements

The part 4 scheduler warms up linearly over $T_w$ steps and then decays along a half cosine all the way to zero over the remaining $T - T_w$:

$$
\eta_t =
\begin{cases}
\eta_{\max}\,\dfrac{t}{T_w} & 1 \le t \le T_w \\[2ex]
\dfrac{\eta_{\max}}{2}\left(1 + \cos\!\left(\pi\,\dfrac{t - T_w}{T - T_w}\right)\right) & T_w < t \le T
\end{cases}
$$

`train.py` sets $T$ = `--steps` (300 in the demo) and $T_w = \min(\text{warmup\_steps}, \max(T/10, 1)) = \min(20, 30) = 20$, with $\eta_{\max} = 3\times10^{-4}$.

```steps
The demo run's learning rate at five steps
$t = 10$ (mid-warmup): $3\times10^{-4} \times 10/20 = 1.5\times10^{-4}$.
---
$t = 20$ (end of warmup): $3\times10^{-4} \times 20/20 = 3\times10^{-4}$, the peak.
---
$t = 160$: progress $= (160 - 20)/(300 - 20) = 140/280 = 0.5$. $\cos(\pi/2) = 0$, so $\eta = 1.5\times10^{-4}$, half the peak.
---
$t = 230$: progress $= 210/280 = 0.75$. $\cos(3\pi/4) \approx -0.707$, so $\eta = 1.5\times10^{-4} \times 0.293 \approx 4.4\times10^{-5}$.
---
$t = 300$: progress $= 1$, $\cos\pi = -1$, $\eta = 0$. The last update is a no-op.
```

## The code

Here is the repo's scheduler, from `part_4/lr_scheduler.py`. Besides the formula it has a clamp so stepping past $T$ cannot make the cosine climb back up, and a `state_dict` so it can be checkpointed (topic 5).

```python
import math

class WarmupCosineLR:
    def __init__(self, optimizer, warmup_steps: int, total_steps: int, base_lr: float):
        self.optimizer = optimizer
        self.warmup_steps = max(1, warmup_steps)
        self.total_steps = max(self.warmup_steps+1, total_steps)
        self.base_lr = base_lr
        self.step_num = 0
        self._apply(self.lr_at(1))

    def lr_at(self, n: int) -> float:
        """Learning rate for optimizer step n (1-based)."""
        if n <= self.warmup_steps:
            return self.base_lr * n / self.warmup_steps
        progress = min(1.0, (n - self.warmup_steps) / (self.total_steps - self.warmup_steps))
        return 0.5 * self.base_lr * (1.0 + math.cos(math.pi * progress))

    def _apply(self, lr: float):
        for g in self.optimizer.param_groups:
            g['lr'] = lr

    def step(self) -> float:
        """Advance after an optimizer step. Returns the lr that step used; sets the lr for the next one."""
        self.step_num += 1
        used = self.lr_at(self.step_num)
        self._apply(self.lr_at(self.step_num + 1))
        return used

    def state_dict(self):
        return {"step_num": self.step_num, "warmup_steps": self.warmup_steps, "total_steps": self.total_steps, "base_lr": self.base_lr}

    def load_state_dict(self, state):
        self.step_num = int(state["step_num"])
        self.warmup_steps = int(state.get("warmup_steps", self.warmup_steps))
        self.total_steps = int(state.get("total_steps", self.total_steps))
        self.base_lr = float(state.get("base_lr", self.base_lr))
        self._apply(self.lr_at(self.step_num + 1))
```

Two ordering details decide whether this does what you think.

**Call it once per optimizer step, not per micro-batch.** With $k = 4$ accumulation steps, calling `sched.step()` on every micro-batch would run the whole schedule four times faster: warmup over in 5 real updates, the learning rate at zero by update 75 of 300.

**Set the rate before the first update.** `train.py` calls `amp.step()` and then `sched.step()`, so each `sched.step()` must leave behind the rate for the *next* update. That is why `step()` applies `lr_at(step_num + 1)` and returns `lr_at(step_num)`, the rate the update just taken actually used, which is what gets logged. The very first update has no earlier `sched.step()`, so the constructor applies `lr_at(1)` itself.

An earlier version of the repo set only the current step's rate inside `step()` and nothing in the constructor. The very first update then ran at whatever learning rate the optimizer was constructed with, the full $3\times10^{-4}$, and warmup only began from step 2. For Adam that first step is the worst possible one to take at full rate: after bias correction, $\hat m_1/\sqrt{\hat v_1} = g/|g| = \pm1$ for every parameter, so every weight moves by the full $\eta$. The same mistake is easy to make with any hand-written scheduler that is called after `optim.step()`.

What changes in the part 2 loop: a scheduler object appears, `sched.step()` sits next to the optimizer step inside the "should step" branch, and the logged learning rate becomes a curve worth plotting. The full version is `llm_from_scratch/part_4/lr_scheduler.py`.

```bughunt
{"q":"This scheduler warms up and decays correctly for a full run. Then you resume the run with a larger `--steps` than the schedule was built for, and the learning rate starts climbing again. Click the line with the bug.","code":"def lr_at(self, n: int) -> float:\n    if n <= self.warmup_steps:\n        return self.base_lr * n / self.warmup_steps\n    progress = (n - self.warmup_steps) / (self.total_steps - self.warmup_steps)\n    return 0.5 * self.base_lr * (1.0 + math.cos(math.pi * progress))\n\ndef step(self) -> float:\n    self.step_num += 1\n    used = self.lr_at(self.step_num)\n    self._apply(self.lr_at(self.step_num + 1))\n    return used","bug":4,"explain":"`progress` is not clamped. Past `total_steps` it exceeds 1, and the cosine, which bottoms out at progress 1, climbs back: at progress 2 the rate is back at the full peak, on a model that has already converged at a near-zero rate. Fix: `progress = min(1.0, (n - self.warmup_steps) / (self.total_steps - self.warmup_steps))`, so the rate stays at the floor once the schedule is over."}
```

## See it

```sim
lr-schedule
{"schedule": "cosine", "peakLr": 0.0003, "warmupSteps": 500, "totalSteps": 10000, "minLrRatio": 0}
```

This is the repo's shape, decaying to zero, on a 10,000-step run. First set warmup to 0 and push the peak to $2\times10^{-3}$: the "Unstable steps" counter jumps, which is what skipping warmup does at a high peak. Restore warmup to 500. Then raise the final ratio to 0.1, the floor most large runs use, and compare the final loss. Finally pick "Warmup-stable-decay" to see the schedule that lets you extend a run without redoing the cosine.

## In practice

- **Compute $T$ in optimizer steps.** If you derive it from the data loader, divide the number of micro-batches by $k$: `train.py` computes `min(args.steps, max(1, args.epochs * len(train_loader) // args.grad_accum_steps))`. An earlier version left out the `// args.grad_accum_steps`, and `len(train_loader)` counts micro-batches, so whenever the epoch term was the smaller one, $T$ was $k$ times too large and the cosine never got near its end.
- **Prefer a small floor over zero.** A floor of about 10% of peak keeps the last steps useful; at exactly zero the final update does nothing.
- **Warmup length is a stability knob.** A few hundred to a few thousand steps, or around 1% of training, is typical. If early loss spikes go away with a longer warmup, the peak was probably too high.
- **`torch.optim.lr_scheduler.LambdaLR`** with `lr_lambda=lambda t: lr_at(t + 1) / base_lr` gives you the same curve plus `state_dict()` for free.

```quiz
{"q": "With the repo's schedule ($\\eta_{\\max} = 6\\times10^{-4}$, decay to 0, $T_w = 100$, $T = 1{,}100$), what is the learning rate at step 850?", "options": ["About $8.8\\times10^{-5}$", "About $7.3\\times10^{-5}$", "$3\\times10^{-4}$", "About $5.1\\times10^{-4}$"], "answer": 0, "explain": "Progress $= (850 - 100)/(1{,}100 - 100) = 0.75$, $\\cos(3\\pi/4) \\approx -0.707$, so $\\eta = 3\\times10^{-4} \\times (1 - 0.707) \\approx 8.8\\times10^{-5}$. Using $850/1{,}100 \\approx 0.77$ without subtracting the warmup gives about $7.3\\times10^{-5}$; adding 0.707 instead of subtracting it gives $5.1\\times10^{-4}$; and $3\\times10^{-4}$ is the midpoint of the decay, not three-quarters of the way."}
```

```quiz
{"q": "A run uses $k = 8$ accumulation steps and calls `sched.step()` on every micro-batch instead of every optimizer step. The schedule was built for $T = 4{,}000$ optimizer steps with $T_w = 200$. What does the learning rate look like?", "options": ["Correct; the scheduler only counts calls", "Warmup ends after 25 optimizer steps and the rate reaches its floor around optimizer step 500, so the remaining 3,500 updates run at the floor", "The rate is 8 times too high throughout", "Warmup takes 1,600 optimizer steps"], "answer": 1, "explain": "The scheduler advances 8 positions per real update, so 200 warmup positions take $200/8 = 25$ updates and all 4,000 positions take $4{,}000/8 = 500$. The schedule's shape is compressed in time, not scaled in height, so the rate is never above the peak."}
```
