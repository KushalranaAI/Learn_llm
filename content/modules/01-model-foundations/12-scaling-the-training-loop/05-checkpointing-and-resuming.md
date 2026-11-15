---
title: Checkpointing and resuming without a trace
minutes: 9
---

The part 2 loop saved `model.state_dict()` whenever validation improved. That is enough to **sample** from the model later. It is not enough to **continue training** it. Long runs get interrupted all the time: preempted cloud instances, a full disk, a driver crash at 3 a.m. A good resume is invisible. The loss curve of a run stopped and resumed at step 150 should lie exactly on top of the curve of a run that never stopped.

Think of a training run as a machine with several dials, not just the weights. The optimizer remembers a running average of every gradient. The scheduler knows where on its curve it is. The gradient scaler has learned a safe loss scale. The data loader is part-way through a shuffled epoch, and the random number generators are at some point in their sequences. Restore only the weights and you have rebuilt the machine with every other dial reset to zero.

This topic is not about **activation checkpointing** (recomputing activations to save memory), which [Training at Scale](/learn/training-and-adaptation/training-at-scale) covers. Here "checkpoint" means a resumable snapshot on disk.

## In everyday life

Two friends are halfway through a long game of chess when the power goes and the table is knocked over. One of them had taken a photo of the board, so they set the pieces back. But the photo shows only where the pieces stand. Whose turn is it? How much time is left on each clock? Which pieces were captured? Without those, a game continues, but not the same game. A good save records the board and everything around it.

A **checkpoint** is a save of a training run. The **weights** (the model's learned numbers) are the board. The rest is the **optimizer state**, the running memory of recent adjustments, plus the **scheduler** position (where the learning-rate plan has reached), the step count and how far through the data the run had read. Skip any of these, and the run resumes with a loss spike or a wrong learning rate, and nothing warns you. Also write each new save to a spare sheet first and swap it in only when complete, so a power cut never destroys your last good save.

**Where you meet it.** A cloud job training a model is cut off in the middle of the night because the machine was needed elsewhere. If it saved only the weights, the restart behaves oddly for a while and ends a little worse. If it saved everything, the team restarts it and the curve carries on as if nothing happened.

```scene
title: Saving a chess game properly
step: ⏳ The game runs long, so the friends save it now and then | saving checkpoints during training
step: 📸 A photo of the board alone shows where each piece stands | saving the weights only
step: 💥 The table is knocked over, and the clocks and turn are lost | resuming without optimizer and scheduler state
step: 📋 A full note records board, clocks, captured pieces and whose turn | model, optimizer, scheduler and step saved
step: 📝 The note is written on a fresh sheet and swapped in when finished | write a temp file, then rename
step: 🎉 The game continues as if nothing had happened | an invisible resume
takeaway: Save everything the run remembers, not just the weights, and replace the old save only when the new one is complete.
```

## What must be saved, and what it costs

| State | Size | If you forget it on resume |
|---|---|---|
| Model weights (FP32) | 4 bytes/param | Nothing to resume |
| AdamW $m$ and $v$ (FP32), per-param step | 8 bytes/param | Bias correction restarts: every weight moves by about $\eta$ on the first step; loss spike |
| Scheduler position | one integer | Warmup and cosine restart from step 0 |
| GradScaler scale and growth counter | two numbers | Scale resets to $2^{16}$; a few skipped steps (minor) |
| Global step | one integer | Logging, saving and the step limit are all off |
| RNG states, data position | a few KB | Data is re-seen or skipped; the run is not reproducible |
| Model config and tokenizer | tiny | Cannot rebuild the right model or decode its outputs |

Gradients are not saved: a checkpoint is taken on an optimizer-step boundary, and the next step zeroes them and recomputes them from scratch. The bytes per parameter are therefore

$$
b_{\text{ckpt}} = \underbrace{4}_{\text{weights}} + \underbrace{4 + 4}_{m,\ v} = 12 \text{ bytes/param}
$$

For the 57.9M-parameter part 4 model that is $57.9\text{M} \times 12 \approx 695$ MB per checkpoint, three times the size of a weights-only file. For a 7B model it is $7\times10^9 \times 12 = 84$ GB, which is why large runs keep only the last few checkpoints (`--keep_last_k 2` in `train.py`) and write them asynchronously.

## A silent bug, worked

The repo's `save_checkpoint` stores the scheduler with `scheduler.state_dict() if hasattr(scheduler, "state_dict") else None`. An earlier version of the part 4 `WarmupCosineLR` had no `state_dict` method, so the scheduler was saved as `None`, nothing complained, and on resume its counter started again at 0. The scheduler now has `state_dict()` and `load_state_dict()` (previous topic), but the failure is worth walking through, because it is what any custom scheduler without them does.

```steps
Resume the demo run ($\eta_{\max} = 3\times10^{-4}$, $T_w = 20$, $T = 300$) at step 150
**Correct schedule at step 150:** progress $= 130/280 = 0.464$, $\cos(0.464\pi) \approx 0.112$, so $\eta = 1.5\times10^{-4} \times 1.112 \approx 1.67\times10^{-4}$.
---
**Resumed step 151:** the restored scheduler thinks it is at step 1, so $\eta = 3\times10^{-4}/20 = 1.5\times10^{-5}$. The rate drops by more than 10 times.
---
**Step 170:** the scheduler is at its step 20, the peak $3\times10^{-4}$, higher than at any point since the real warmup. A model that had settled at a lower rate now takes its largest steps.
---
**Step 300:** the scheduler is at its own step 150, so $\eta \approx 1.67\times10^{-4}$ instead of 0. The run "finishes" in the middle of its decay, missing the low-rate end where much of the final loss improvement happens.
```

Nothing crashes and the loss still goes down, so the only evidence is a final loss slightly worse than an uninterrupted run. That is what "resuming wrong silently hurts" means. The same `hasattr` pattern would hide a missing optimizer or scaler too.

## The code

A complete save, written atomically so a crash mid-write never destroys the last good checkpoint:

```python
import os, random, numpy as np, torch

def save_all(path, model, optim, sched, scaler, step, cfg, data_pos):
    state = {
        "model": model.state_dict(),            # (V, d) embeddings, blocks, (d, V) head
        "optimizer": optim.state_dict(),        # exp_avg, exp_avg_sq, step per param
        "scheduler": sched.state_dict(),        # {"step_num": ...}
        "scaler": scaler.state_dict(),          # {"scale": ..., "_growth_tracker": ...}
        "step": step, "config": cfg, "data_pos": data_pos,
        "rng": {"torch": torch.get_rng_state(),
                "cuda": torch.cuda.get_rng_state_all(),
                "numpy": np.random.get_state(), "python": random.getstate()},
    }
    tmp = f"{path}.tmp"
    torch.save(state, tmp)
    os.replace(tmp, path)                       # atomic rename on the same filesystem
```

Resuming is the mirror image, in a fixed order: build the model from `config`, move it to the device, construct the optimizer on its parameters, then call `load_state_dict` on model, optimizer, scheduler and scaler, restore the RNG states, and skip the data loader forward to `data_pos`.

The repo does several of these things: it saves the model config and refuses to resume if the architecture or vocabulary size disagrees, it records the tokenizer directory, and it installs a `SIGTERM` handler so a preempted job saves before exiting. Its `save_checkpoint` uses the same temp-file-and-rename step:

```python
tmp = out / (DEF_NAME + ".tmp")          # DEF_NAME = "model_last.pt"
torch.save({...}, tmp)                   # model, optimizer, scheduler, amp_scaler, step, config
os.replace(tmp, out / DEF_NAME)
```

An earlier version wrote `model_last.pt` in place. A crash or a full disk mid-write then left a truncated file under the only name the resume code looks for, destroying the last good checkpoint at the moment you needed it. `os.replace` swaps the name only after the new file is complete, so `model_last.pt` is always either the old checkpoint or the new one. What it still leaves out is the RNG states and the data position, so a resumed run does not replay the exact batch order of an uninterrupted one. The full version is `llm_from_scratch/part_4/checkpointing.py`.

What changes in the part 2 loop: "save the best weights" becomes "save everything every `--save_every` optimizer steps", and the script's start-up gains a branch that loads all of it before the first batch.

## In practice

- **Test the resume path before you need it.** Train 200 steps straight; separately train 100, kill, resume, train 100. With fixed seeds on the same hardware the two loss curves should overlap closely. Any visible kink at step 100 is missing state.
- **Re-seeding at start-up is not restoring RNG.** If the script calls `torch.manual_seed(1337)` on every launch, a resumed shuffled loader replays the same order from the start of the epoch, so the run sees exactly the batches it has already trained on. Restore the saved generator state or skip ahead.
- **Load optimizer state after the model is on its device.** `optim.load_state_dict` moves state tensors to match the parameters it was built on.
- **Keep the per-step copies.** A rolling window of checkpoints (`model_step0000150.pt`, and so on) lets you roll back past a loss spike, which is a routine operation in large runs.

```quiz
{"q": "A 1.3B-parameter model is trained with AdamW and autocast (FP32 parameters). Roughly how big is a full resumable checkpoint, not counting RNG and config?", "options": ["About 15.6 GB", "About 5.2 GB", "About 20.8 GB", "About 2.6 GB"], "answer": 0, "explain": "FP32 weights (4 bytes) plus Adam's $m$ and $v$ (4 + 4 bytes) is 12 bytes per parameter: $1.3\\times10^9 \\times 12 = 15.6$ GB. 5.2 GB is a weights-only file; 20.8 GB wrongly adds the gradients, which are not needed to resume because the next step zeroes them and recomputes them from scratch."}
```

```quiz
{"q": "A run is resumed with the model and scheduler restored, but the optimizer state is lost and AdamW is constructed fresh. What happens on the first resumed step?", "options": ["Nothing noticeable; Adam adapts within one step", "After bias correction $\\hat m/\\sqrt{\\hat v} = \\pm1$ for every weight, so every parameter moves by roughly the full learning rate at once, often causing a loss spike", "The learning rate restarts its warmup", "The step is skipped because $v = 0$"], "answer": 1, "explain": "With fresh moments, Adam's first bias-corrected update is $g/|g|$, a step of size $\\eta$ in every coordinate regardless of how small that weight's gradient is. A trained model is far more sensitive to this than a random one, so the loss jumps. The warmup restarting would be the symptom of a lost scheduler state, which here was restored."}
```
