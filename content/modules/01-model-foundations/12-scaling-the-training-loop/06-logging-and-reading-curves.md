---
title: Logging and reading training curves
minutes: 9
---

The part 2 loop printed one line every 50 steps: step, loss, seconds. That works while you are watching the terminal. A run that lasts hours needs a flight recorder: every important number written to disk with its step, so you can plot it, compare it with the last run, and look back at the minutes before something went wrong.

Part 4 adds a small logger with three back ends: **TensorBoard** (event files on local disk, viewed with `tensorboard --logdir runs/part4-demo`), **Weights & Biases** (a hosted dashboard), and a no-op logger for tests. All three take the same call, `logger.log(step=step, loss=..., lr=...)`, so the training loop does not care which one is active.

The important question is not which tool to use but **what to log**. Five signals answer almost every question about a run: the loss, the learning rate, the gradient norm, throughput, and a sample of generated text. Each one is cheap, and each one catches a class of bugs the others miss.

## In everyday life

Picture a student preparing for an entrance exam over many months. She does not just feel that she is improving. She keeps a notebook: the score of every practice test, her study plan for the week, how many questions she solves per hour, and now and then one of her own answers copied out in full. When her marks suddenly drop, the notebook shows what changed.

A training run needs the same notebook. **Logging** means writing key numbers to disk together with the step they belong to, so you can plot them as **curves**. The **loss** is the model's mistake score (lower is better). The **learning rate** is how big its adjustments are. The **gradient norm** measures how hard the model is being pushed to change, and **throughput** is how much text it gets through per second. A sample of text the model writes is the "read one answer" check. Curves matter because most training problems do not crash anything. They only show up as odd shapes.

**Where you meet it.** A team starts a training run on a Friday evening. On Monday the loss curve shows a sudden jump, at the same step where the logged learning rate changed, which points straight at the cause. Without those logs, they would only know that the final result came out worse.

```scene
title: A study notebook for a long run
step: 📝 After each practice test she writes down the score | logging the loss
step: 📅 She notes her study plan for the week | logging the learning rate
step: 🏃 She counts how many questions she solves per hour | logging throughput
step: 📈 When marks suddenly drop, she checks what else changed | reading a spike against other curves
step: 🔎 She copies out one full answer to see if it makes sense | sampling generated text
step: 🧠 Old papers score higher and higher, but a fresh paper does worse | training loss falls, validation loss rises
takeaway: Log several signals side by side, because odd curves explain silent problems that never raise an error.
```

## The numbers worth computing

**Throughput** is tokens processed per second, and from it you get **model FLOPs utilisation** (MFU), the fraction of the GPU's peak you are actually using. With the standard estimate of about $6N$ training FLOPs per token for a model with $N$ parameters (2 forward, 4 backward):

$$
\text{tokens/s} = \frac{B\,n\,k}{t_{\text{step}}}, \qquad \text{MFU} = \frac{6N \times \text{tokens/s}}{\text{peak FLOP/s}}
$$

**Smoothing** is what the TensorBoard slider does to a noisy curve, an exponential moving average with weight $\beta$:

$$
s_t = \beta\, s_{t-1} + (1 - \beta)\, x_t
$$

```steps
Throughput, MFU and smoothing for the part 4 model
One optimizer step: $B = 32$, $n = 256$, $k = 4$, so $32 \times 256 \times 4 = 32{,}768$ tokens. Suppose it takes $t_{\text{step}} = 0.5$ s. Throughput is $65{,}536$ tokens/s.
---
Model FLOPs: $6 \times 57.9\times10^6 \times 65{,}536 \approx 2.28\times10^{13}$ FLOP/s, about 22.8 TFLOPS.
---
On an A100 (312 TFLOPS BF16 peak) that is $22.8 / 312 \approx 7.3\%$ MFU. Small models typically sit in the single digits to low tens; large, well-tuned runs reach 40% to 50%. A low number tells you to look for wasted time (data loading, Python overhead, tiny matmuls), not that the GPU is broken.
---
Smoothing at $\beta = 0.9$: the smoothed loss is 3.00 and one step logs a spike of 3.50. The new smoothed value is $0.9 \times 3.00 + 0.1 \times 3.50 = 3.05$. A spike of half a nat shows up as a bump of 0.05. Always look at the raw curve too.
```

## The code

Here is a logging block placed correctly inside the "should step" branch. Two details matter. The gradient norm must be read **after unscaling and before `zero_grad()`**, and the loss should be the mean over the accumulation window, kept as a tensor so the loop does not force a GPU sync on every micro-batch.

```python
loss_acc = torch.zeros((), device=device)      # running sum over k micro-batches
t_last = time.time()
for i, (xb, yb) in enumerate(train_loader):    # xb, yb: (B, n)
    with torch.autocast("cuda", dtype=torch.bfloat16):
        _, loss, _ = model(xb, yb)
    (loss / k).backward()
    loss_acc += loss.detach() / k
    if (i + 1) % k == 0:
        gnorm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)  # pre-clip norm
        optim.step(); optim.zero_grad(set_to_none=True); lr = sched.step(); step += 1
        if step % 50 == 0:
            torch.cuda.synchronize()                       # CUDA is async; time honestly
            dt = time.time() - t_last; t_last = time.time()
            tok_s = 50 * B * n * k / dt
            logger.log(step=step, **{
                "train/loss": loss_acc.item(), "train/lr": lr,
                "train/grad_norm": gnorm.item(), "sys/tokens_per_s": tok_s,
                "sys/mfu": 6 * n_params * tok_s / 312e12})
        loss_acc.zero_()
```

Compare this with the repo's `train.py`, which gets the first two details right:

```python
if amp.should_step():
    grad_norm = amp.step(clip=args.grad_clip or None)   # clips, and returns the norm before clipping
    lr = sched.step()
    step += 1
    step_loss, loss_sum = loss_sum / amp.accum, 0.0
    ...
    if step % 50 == 0:
        logger.log(step=step, loss=step_loss, lr=float(lr), grad_norm=grad_norm)
        ...
        _log_model_stats(logger, model, step, do_hists=False)
        ...
    amp.zero_grad()   # after logging, so the logged gradient stats are real
```

An earlier version got all three wrong in ways worth recognising. It logged `loss.item()` from the last micro-batch only, so the curve was noisier than the loss the step optimised. It never logged the clip norm. And it called `amp.zero_grad()` with `set_to_none=True` before `_log_model_stats`, so every `.grad` was `None` and the logged gradient norm was NaN on every step. None of these crash, which is the point: a logger that runs without errors can still be logging the wrong thing.

Two smaller differences remain. The repo's `loss_sum += float(loss.item())` syncs with the GPU on every micro-batch, and `_log_runtime` times only the last micro-batch without a CUDA sync, so its throughput is a rough figure. Also note that `grad_norm` is the pre-clip norm while `_log_model_stats`'s `train/grad_global_l2` is measured after clipping, so with clipping on the second never exceeds 1.0. The repo's logger also records generated samples as text and per-layer Q/K/V histograms, both worth keeping. The full versions are `llm_from_scratch/part_4/logger.py` and the `_log_*` helpers in `llm_from_scratch/part_4/checkpointing.py`.

What changes in the part 2 loop: `print` becomes `logger.log`, logging moves inside the optimizer-step branch, and the loop gains three new signals (lr, gradient norm, throughput).

## Reading the curves

| What you see | Likely cause | What to do |
|---|---|---|
| First loss far from $\ln V$ (10.37 for $V = 32{,}000$) | Wrong vocab size or misaligned targets | Check shapes and the shift-by-one before anything else |
| Loss flat from step 1 | Learning rate 0, no gradients reaching weights, `zero_grad` in the wrong place | Plot lr; check grad norm is non-zero |
| Single spike that recovers in tens of steps | An unusual batch, lr near the stability edge | Usually ignore; if frequent, lower peak lr or lengthen warmup |
| Grad norm creeping up for hundreds of steps, then loss spikes or NaN | Instability building | Roll back to an earlier checkpoint, lower lr; on FP16 check the loss scale |
| Long plateau, then a drop near the end | Normal with cosine: the low-lr tail anneals | Nothing; this is why the decay matters |
| Train loss falls, validation rises | Overfitting | More data, fewer parameters, stop earlier |
| Staircase drops at each epoch boundary | The model is memorising repeated data | Same as overfitting; deduplicate |
| Regular dips in tokens/s | Checkpoint saves, evaluation, sample generation | Expected; make them less frequent or asynchronous |

The part 4 demo trains a model with millions of parameters on `tiny.txt`, about 277 KB of text. Expect the overfitting row: training loss heads towards zero while samples start reciting the training text.

## In practice

- **Plot lr on the same dashboard as loss.** Most "mysterious" curve shapes are explained by the schedule, including the resume bug from the previous topic.
- **Log the pre-clip gradient norm.** `clip_grad_norm_` returns it. If it sits above the threshold on most steps, clipping has become a second learning-rate schedule.
- **Calling `.item()` forces the CPU to wait for the GPU.** Calling it on every micro-batch can cost real throughput; accumulate on the device and read once per log interval.
- **Name runs and log hyperparameters** (the repo's `_log_hparams_tb` does this) so a curve from three weeks ago still says what produced it.

```quiz
{"q": "A 350M-parameter model trains on 8 GPUs with a peak of 989 TFLOPS each and processes 1.2 million tokens per second in total. What is its MFU?", "options": ["About 32%", "About 4%", "About 53%", "About 11%"], "answer": 0, "explain": "Achieved: $6 \\times 3.5\\times10^8 \\times 1.2\\times10^6 = 2.52\\times10^{15}$ FLOP/s. Peak: $8 \\times 989\\times10^{12} = 7.91\\times10^{15}$. MFU $= 2.52/7.91 \\approx 32\\%$. Dividing by one GPU's peak gives an impossible 255%; using $2N$ instead of $6N$ gives about 11%."}
```

```quiz
{"q": "Your dashboard shows train/grad_norm as NaN on every logged step, while the loss decreases normally. What is the most likely cause?", "options": ["The model has diverged", "The gradient norm is computed after `zero_grad(set_to_none=True)`, so there are no gradients left to measure", "Mixed precision overflow on every step", "The learning rate is too high"], "answer": 1, "explain": "If training were producing NaN gradients, the loss would become NaN too. A healthy loss with a NaN norm means the measurement is wrong, not the training: after `set_to_none=True` every `.grad` is `None`, and a helper like the repo's `_log_model_stats` returns NaN when it finds no gradients. Read the norm from `clip_grad_norm_` before zeroing, or zero only after logging."}
```

```lab
plan-a-training-run
```
