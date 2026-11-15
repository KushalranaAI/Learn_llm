---
title: Mixed precision in code, autocast and the gradient scaler
minutes: 9
---

[Training at Scale](/learn/training-and-adaptation/training-at-scale) explains the number formats: FP16 has precision but a tiny range, BF16 has FP32's range but only about three significant digits, and updates must accumulate in FP32. This topic is about what those ideas look like as five lines of PyTorch, and about the ordering mistakes that make those lines silently wrong.

Two tools do the work. **Autocast** is a context manager that, for each operation inside it, decides on the fly which dtype to run in. Matrix multiplies and convolutions run in 16-bit on tensor cores. Numerically touchy operations such as softmax, log-softmax, cross-entropy and normalisation reductions are upcast to FP32. Nothing about your model changes: the parameters stay FP32, and autocast casts temporary 16-bit copies as each layer uses them.

The **gradient scaler** exists only for FP16. It multiplies the loss by a large factor before `backward()` so that small gradients do not underflow to zero, then divides them back before the optimizer sees them. With BF16 you do not need it.

## In everyday life

A shopkeeper adds up the day's sales on a rough pad, rounding to the nearest rupee, because that is quick. The master ledger, though, keeps every paise, since small rounding errors repeated every day would grow into real money. There is another trouble: a sale of a few paise is so small that it rounds to nothing on the pad and vanishes. So she counts in big units on the pad, then divides the units back out before posting to the ledger.

**Mixed precision** training works the same way. A computer stores each number with a fixed number of digits, called its **precision**: fewer digits is faster and smaller, but rougher. The heavy multiplications run in the quick 16-bit form, while the master copy of the **weights** (the model's learned numbers) stays in the exact 32-bit form. **Autocast** picks the form for each operation automatically. In the older 16-bit format, tiny **gradients** (the signals saying how to adjust the weights) can round to zero, so the **gradient scaler** multiplies them up first and divides them back before they touch the weights.

**Where you meet it.** A team trains a language model on a GPU that is short of memory and time. Doing every sum in full precision is slow and bulky. Using the quick form for the heavy arithmetic, while keeping a precise master copy and rescuing tiny signals, speeds training up without wrecking the learning.

```scene
title: A rough pad and an exact ledger
step: 📒 The master ledger keeps every paise exactly | FP32 master weights
step: 🧮 Quick sums go on a rough pad with fewer digits | 16-bit matmuls under autocast
step: 🔬 Tiny sales would round to zero on the pad | small gradients underflow in FP16
step: 🔢 She counts in big units so small sales stay visible | gradient scaler multiplies the loss
step: 🚫 A number too big for the pad is skipped, and she uses smaller units next time | skipped step, smaller scale
step: ✅ Before posting to the ledger, she divides the units back out | unscale, then optimizer step
takeaway: Do the heavy sums quickly in rough numbers, but keep an exact master copy and protect tiny signals.
```

## The scaler, worked

FP16's smallest positive (subnormal) value is $2^{-24} \approx 5.96\times10^{-8}$, and the largest is $65{,}504$. A gradient smaller than about half the smallest subnormal rounds to exactly zero. **Dynamic loss scaling** keeps gradients inside that window with a scale $S$:

$$
\tilde{\mathcal{L}} = S \cdot \mathcal{L} \;\Rightarrow\; \tilde{g} = S \cdot g, \qquad g = \tilde{g} / S \text{ (in FP32, before the update)}
$$

If any $\tilde g$ is infinite or NaN, the step is skipped and $S$ is halved. After a run of clean steps, $S$ is doubled.

```steps
GradScaler with PyTorch's defaults
Start: $S = 2^{16} = 65{,}536$, growth factor 2, backoff factor 0.5, growth interval 2,000 steps.
---
A weight has true gradient $g = 2\times10^{-8}$. Unscaled in FP16 it is below $2.98\times10^{-8}$ (half the smallest subnormal), so it flushes to 0. Scaled: $2\times10^{-8} \times 65{,}536 = 1.31\times10^{-3}$, comfortably representable. Unscaling happens in FP32, so the optimizer sees the true $2\times10^{-8}$.
---
A few steps later a large gradient appears: $g = 2.0$, scaled to $131{,}072 > 65{,}504$. It overflows to `inf`. `scaler.step()` sees the inf, **skips** the optimizer step, and `scaler.update()` sets $S = 32{,}768$.
---
2,000 consecutive clean steps later, `update()` doubles $S$ back to $65{,}536$. The scale hovers just below the overflow edge, which is exactly where it protects the most small gradients.
```

## The code

The part 4 loop wraps the forward pass in autocast and routes the backward pass and step through the scaler. Written out by hand with the current API, an FP16 step with gradient clipping looks like this:

```python
scaler = torch.amp.GradScaler("cuda")                 # FP16 only

with torch.autocast(device_type="cuda", dtype=torch.float16):
    logits, loss, _ = model(xb, yb)                   # matmuls in FP16; loss in FP32
scaler.scale(loss / accum).backward()                 # .grad holds S * g (FP32 params)

if amp.should_step():
    scaler.unscale_(optim)                            # .grad /= S, in place
    gnorm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    scaler.step(optim)                                # skipped if any grad is inf/nan
    scaler.update()                                   # adjust S
    optim.zero_grad(set_to_none=True)
```

The BF16 version is shorter, because its range matches FP32 and nothing underflows:

```python
with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
    logits, loss, _ = model(xb, yb)
(loss / accum).backward()
# clip, optim.step(), zero_grad() exactly as without mixed precision
```

What changes in the part 2 loop: the forward pass moves inside `autocast`, and on FP16 every `backward()` and `step()` goes through the scaler. Part 2 already had this in skeleton form behind `--amp`; part 4 combines it with accumulation in one helper, whose step does the unscale, clip and scaler calls in the order above:

```python
def step(self, clip: float | None = None) -> float:
    """Optimizer step. With `clip`, the global gradient norm is clipped first (after unscaling, under AMP).
    Returns the gradient norm before clipping, so the training loop can log it."""
    params = [p for g in self.optim.param_groups for p in g['params'] if p.grad is not None]
    if self.amp:
        self.scaler.unscale_(self.optim)
    norm = torch.nn.utils.clip_grad_norm_(params, clip if clip else float('inf')) if params else torch.tensor(0.0)
    if self.amp:
        self.scaler.step(self.optim)
        self.scaler.update()
    else:
        self.optim.step()
    return float(norm)
```

`train.py` calls it as `amp.step(clip=args.grad_clip or None)`, with `--grad_clip` defaulting to 1.0. With clipping off, the threshold is infinity, so the norm is still measured and returned for logging. An earlier version of `AmpGrad.step` had no clipping at all, a quiet regression from part 2: nothing breaks until the one bad batch that clipping exists for. The full version is `llm_from_scratch/part_4/amp_accum.py`, and the loop is in `llm_from_scratch/part_4/train.py`.

```mermaid
flowchart LR
  F["forward in autocast"] --> S["scale(loss / k).backward()"]
  S --> U["unscale_"]
  U --> C["clip_grad_norm_"]
  C --> T["scaler.step: skip if inf"]
  T --> P["scaler.update: S x2 or x0.5"]
```

```parsons
{"title":"Order one FP16 micro-batch with gradient accumulation and clipping","lines":["with torch.autocast(device_type=\"cuda\", dtype=torch.float16):","    logits, loss, _ = model(xb, yb)","scaler.scale(loss / accum).backward()","if amp.should_step():","    scaler.unscale_(optim)","    gnorm = torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)","    scaler.step(optim)","    scaler.update()"],"explain":"Only the forward pass sits inside `autocast`; the backward goes through the scaler so small FP16 gradients do not underflow. At a step boundary, `unscale_` must come **before** clipping, otherwise the norm is measured on gradients multiplied by $S$ and the clip threshold means nothing. `scaler.step` then skips the update if any gradient is inf or NaN, and `scaler.update` adjusts $S$ afterwards based on whether that happened."}
```

## Where the memory and speed come from

Because autocast leaves parameters in FP32, the model states cost the same 16 bytes per parameter as the [Training at Scale](/learn/training-and-adaptation/training-at-scale) accounting, just arranged differently: 4 for FP32 weights, 4 for FP32 gradients, 8 for Adam's two moments, plus short-lived 16-bit copies of the weights. For the 57.9M-parameter part 4 model that is about $57.9\text{M} \times 16 = 0.93$ GB either way. The saving is in **activations**: the outputs of every matmul saved for the backward pass are stored in 2 bytes instead of 4, which roughly halves the part of memory that grows with $B \times n$.

The speed comes from tensor cores. On an A100 the peak dense rates are:

| Mode | Peak TFLOPS | Relative to FP32 |
|---|---|---|
| FP32 (no tensor cores) | 19.5 | 1× |
| TF32 tensor cores | 156 | 8× |
| BF16 / FP16 tensor cores | 312 | 16× |

Peak ratios are an upper bound. A 58M-parameter model with small matmuls spends much of its time on memory traffic and Python overhead, so the real end-to-end gain is usually a small multiple, not 16×. Measure tokens per second before and after (topic 6).

## In practice

- **Prefer BF16 on hardware that supports it** (A100, H100 and newer). No scaler, no skipped steps, fewer surprises. Keep the FP16 path for older GPUs such as the V100 and T4.
- **Unscale before you clip.** Clipping scaled gradients at 1.0 clips everything, because they are $S \approx 65{,}536$ times too large. `scaler.unscale_(optim)` must come first.
- **Do not call `model.half()`** to "use mixed precision". That turns the master weights into FP16 and tiny updates vanish, exactly the failure autocast is designed to avoid.
- **Update deprecated calls.** `torch.cuda.amp.autocast(enabled=...)` and `torch.cuda.amp.GradScaler`, used in the repo, still work but are deprecated in favour of `torch.autocast("cuda", ...)` and `torch.amp.GradScaler("cuda")`.
- **Turn on TF32 for whatever stays in FP32**: `torch.set_float32_matmul_precision("high")`.
- **Watch the scale.** Log `scaler.get_scale()`. If it keeps halving towards 1, something in the model is producing infinities; the scaler is hiding a real numerical problem.

```quiz
{"q": "An FP16 run uses GradScaler with $S = 32{,}768$ and clips gradients at norm 1.0, but calls `clip_grad_norm_` before `scaler.unscale_`. The true gradient norm is 0.5. What happens?", "options": ["Nothing; clipping does not apply because 0.5 < 1.0", "The scaled norm is about 16,384, so clipping shrinks the gradient by that factor and the effective update is tiny", "The step is skipped because the norm overflows", "The scaler detects the mistake and unscales automatically"], "answer": 1, "explain": "Before unscaling, `.grad` holds $S \\cdot g$, so the measured norm is $32{,}768 \\times 0.5 = 16{,}384$. Clipping rescales it to 1, which after unscaling is a true norm of about $3\\times10^{-5}$ instead of 0.5. The intuition that 0.5 is under the threshold is right only after unscaling."}
```

```quiz
{"q": "Why does switching from FP32 to BF16 autocast not reduce the memory used by AdamW's optimizer states?", "options": ["Autocast only changes the dtype of individual operations; parameters, gradients and Adam's $m$ and $v$ stay in FP32", "BF16 has the same number of exponent bits as FP32, so it uses the same memory", "Optimizer states are stored on the CPU", "It does reduce them by half"], "answer": 0, "explain": "Autocast casts temporary 16-bit copies for matmuls but leaves every parameter and its optimizer state in FP32, so model-state memory is unchanged. The saving is in activations. BF16 values take 2 bytes regardless of how their bits are split, so the exponent argument is irrelevant."}
```
