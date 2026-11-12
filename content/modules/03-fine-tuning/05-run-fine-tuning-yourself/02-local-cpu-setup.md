---
title: Setting up a laptop with no GPU
minutes: 9
---

A CPU-only setup is the cheapest place to make mistakes. Wrong chat template, a dataset column with the wrong name, a LoRA config that targets nothing: all of these show up in the first ten seconds on a 135M model, and none of them cost a cent. The goal of this page is a working Python environment and a **smoke test**: a short script that proves every stage runs and measures how long a real run would take.

Everything here is the Hugging Face stack: **PyTorch** for tensors, **transformers** for models and tokenizers, **datasets** for data, **PEFT** for LoRA, **TRL** for the trainers (SFT, DPO, GRPO) and **accelerate**, which the trainers use to place work on a device. The same five libraries run on a GPU later, so nothing learned here is wasted.

## 1. An isolated environment

Use a **virtual environment** so the versions you test with are the versions you keep. Python 3.10 to 3.12 is the safe range for this stack; brand-new Python releases sometimes lack wheels for a few weeks.

```bash
# macOS / Linux
python3 -m venv ft-env
source ft-env/bin/activate

# Windows (PowerShell)
py -3.12 -m venv ft-env
ft-env\Scripts\Activate.ps1
```

Then install the **CPU wheel** of PyTorch first, from PyTorch's own index. It is far smaller than the default CUDA build and avoids downloading gigabytes of GPU libraries you cannot use:

```bash
pip install --upgrade pip
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install transformers datasets peft trl accelerate
pip freeze > requirements-cpu.txt   # pin exactly what worked
```

The libraries move fast. As of late 2026 the TRL docs describe version 1.17 and transformers 5.22; arguments get renamed between releases (transformers 5 uses `dtype=` where older code says `torch_dtype=`, and TRL uses `max_length` where older tutorials say `max_seq_length`). When a script from the internet fails with "unexpected keyword argument", a version mismatch is the first suspect. The `requirements-cpu.txt` file lets you rebuild the exact environment later with `pip install -r`.

## 2. What will not work on a CPU, and why

Two popular tools are GPU-only. **bitsandbytes** provides the 4-bit NF4 storage that QLoRA relies on, and its kernels are written for CUDA, so QLoRA is not a CPU option ([QLoRA and NF4](/learn/fine-tuning/peft-lora/qlora-and-nf4) explains what those kernels do). **Unsloth**, which speeds up LoRA with hand-written GPU kernels, also needs an NVIDIA GPU. On a CPU you run plain LoRA with fp32 weights, which is fine at 0.5B and below.

Precision needs one deliberate setting. TRL's `SFTConfig` defaults `bf16` to `True` when `fp16` is not set. Some recent CPUs run bf16 well, many laptops run it slowly or emulate it, so for a first run set `bf16=False` and `fp16=False` and train in fp32. Also pass `use_cpu=True` so the trainer does not try to find an accelerator, and pick the plain `adamw_torch` optimizer.

## 3. Threads

PyTorch parallelises matrix multiplications across CPU cores. It usually guesses well, but on laptops with performance and efficiency cores, setting the thread count to the number of *performance* cores can help, and running two heavy programs at once halves both. Check and set it at the top of a script:

```python
import torch
print(torch.get_num_threads())
torch.set_num_threads(8)   # try your physical core count; measure, don't guess
```

## 4. The smoke test

The point of a smoke test is extrapolation. Training time is

$$t_{\text{total}} \approx s \cdot \left\lceil \frac{n}{B \cdot G} \right\rceil \cdot E$$

where $s$ is seconds per optimizer step, $n$ the number of examples, $B$ the per-step batch, $G$ the gradient accumulation steps and $E$ the number of epochs. **Worked example:** 10 steps take 24 s, so $s = 2.4$ s (ignore the first step, which includes warm-up). With $n = 100$, $B = 4$, $G = 1$, $E = 3$ there are $25 \times 3 = 75$ steps and $t \approx 2.4 \times 75 = 180$ s, three minutes. If the same test on a 1.5B model gives $s = 30$ s, a 1,000-example run at $E = 3$ is $250 \times 3 \times 30 = 22{,}500$ s, over six hours: time to move to a GPU.

```steps
Five checks before any real run
**Load.** `AutoTokenizer.from_pretrained` and `AutoModelForCausalLM.from_pretrained(name, dtype=torch.float32)`. Watch RAM in Task Manager or Activity Monitor; it should rise by about $4N$ bytes.
---
**Generate.** Apply the chat template to one prompt and call `model.generate(max_new_tokens=30)`. Sensible text means the tokenizer, template and weights agree.
---
**Train ten steps.** Build an `SFTTrainer` with `max_steps=10`, `use_cpu=True`, `bf16=False`, and a `LoraConfig`. The loss should print and be a finite number, typically between 1 and 4.
---
**Time it.** Read the seconds per step from the progress bar or the log, drop the first step, and extrapolate with the formula above.
---
**Save and reload.** `trainer.save_model("smoke-adapter")`, then load it with `PeftModel.from_pretrained` on a fresh base model. A file of a few megabytes, not hundreds, confirms you saved only the adapter.
```

Here is the whole test as one script. The [first end-to-end run](/learn/fine-tuning/run-fine-tuning-yourself/a-first-end-to-end-run) builds on it with a real task.

```python
# smoke_test.py  -- run with: python smoke_test.py
import time, torch
from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

NAME = "HuggingFaceTB/SmolLM2-135M-Instruct"
tok = AutoTokenizer.from_pretrained(NAME)
model = AutoModelForCausalLM.from_pretrained(NAME, dtype=torch.float32)

msgs = [{"role": "user", "content": "Name a primary colour."}]
inputs = tok.apply_chat_template(msgs, add_generation_prompt=True,
                                 return_dict=True, return_tensors="pt")
out = model.generate(**inputs, max_new_tokens=30, do_sample=False)
print(tok.decode(out[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True))

rows = [{"messages": [{"role": "user", "content": f"Say the number {i}."},
                      {"role": "assistant", "content": str(i)}]} for i in range(64)]
args = SFTConfig(output_dir="smoke", max_steps=10, per_device_train_batch_size=4,
                 learning_rate=2e-4, logging_steps=1, save_strategy="no",
                 use_cpu=True, bf16=False, fp16=False, optim="adamw_torch",
                 gradient_checkpointing=False, max_length=128, report_to="none")
trainer = SFTTrainer(model=model, args=args, train_dataset=Dataset.from_list(rows),
                     processing_class=tok,
                     peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear",
                                            task_type="CAUSAL_LM"))
t0 = time.time(); trainer.train(); dt = time.time() - t0
print(f"{dt / 10:.2f} s per step (includes warm-up)")
trainer.save_model("smoke-adapter")
```

`gradient_checkpointing=False` is deliberate: TRL turns checkpointing on by default to save memory, but it re-runs part of the forward pass, which costs time a tiny model does not need to spend.

## Apple Silicon

On an M-series Mac, PyTorch can use the GPU through the **MPS** backend, and the trainer will pick it automatically when `use_cpu` is not set. It is often several times faster than the CPU for these model sizes, though some operations fall back to the CPU and fp16 support is patchier than on CUDA; if a run errors, retry with `use_cpu=True`. Apple's **MLX** framework, through its `mlx-lm` package, has its own LoRA fine-tuning command and is a good alternative on a Mac; its argument names differ from TRL's, so follow its own docs.

## In practice

Keep the smoke test as a file and run it every time you change environment, model or machine. It takes a minute and catches most setup problems before they cost an hour. If the measured step time predicts more than about an hour of CPU training, stop and use [free Colab](/learn/fine-tuning/run-fine-tuning-yourself/google-colab-step-by-step) instead.

```quiz
{"q": "The smoke test shows 3.0 s per step. Your real run has 400 examples, batch size 4, gradient accumulation 2 and 2 epochs. Roughly how long will it take?", "options": ["5 minutes", "10 minutes", "20 minutes", "40 minutes"], "answer": 0, "explain": "Steps per epoch $= 400 / (4 \\times 2) = 50$, so 100 steps in total and $100 \\times 3 = 300$ s, five minutes. Forgetting that gradient accumulation folds two micro-batches into one optimizer step gives 200 steps and 10 minutes. (If the log reports micro-batch time instead of optimizer-step time, multiply by $G$; check which one your progress bar shows.)"}
```

```quiz
{"q": "On a laptop with no NVIDIA GPU, a tutorial tells you to load the model with `BitsAndBytesConfig(load_in_4bit=True)`. What happens, and what should you do?", "options": ["It fails or falls back, because bitsandbytes 4-bit needs CUDA; use plain LoRA with fp32 weights on a smaller model", "It works but slowly; just wait longer", "It works and saves memory exactly as on a GPU", "Install the CPU wheel of PyTorch and it will work"], "answer": 0, "explain": "QLoRA's NF4 kernels are CUDA code, so on a CPU-only machine this path is not available. The fix is a model small enough for fp32 LoRA (0.5B or below on 8 GB). Reinstalling PyTorch does not help: the CPU wheel has no CUDA at all."}
```
