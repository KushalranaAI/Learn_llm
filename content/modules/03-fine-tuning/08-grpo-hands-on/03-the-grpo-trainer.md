---
title: The GRPO trainer, end to end
minutes: 10
---

You do not have to write the sampling loop, the log-probability bookkeeping or the clipped loss yourself: Hugging Face TRL's `GRPOTrainer` does all of it (it is one of the stable trainers since TRL v1.0, March 2026). Your job is three things: a dataset of prompts, the reward functions from the previous topic, and a `GRPOConfig` that fits your GPU. This topic builds a complete script for a free Colab T4. Set up the environment first with [Run fine-tuning yourself](/learn/fine-tuning/run-fine-tuning-yourself), and pin the versions that work for you, because TRL's arguments change between releases.

Unlike SFT ([SFT with LoRA, step by step](/learn/fine-tuning/sft-with-lora-step-by-step)) the dataset has **no target answers to imitate**. It only needs a `prompt` column; any other columns, here `ground_truth`, are passed through to the reward functions by name.

## The batch arithmetic

The one constraint that trips everyone: the number of completions processed per optimizer step must split evenly into groups.

$$
\text{completions per step} = N_{\text{GPU}} \times b \times a, \qquad \text{prompts per step} = \frac{N_{\text{GPU}} \times b \times a}{G}
$$

$N_{\text{GPU}}$ is the number of GPUs, $b$ is `per_device_train_batch_size` (here counted in completions, not prompts), $a$ is `gradient_accumulation_steps` and $G$ is `num_generations`. The total must be divisible by $G$, or TRL refuses to start.

Worked example on one T4: $b = 8$, $a = 4$, $G = 8$ gives $1 \times 8 \times 4 = 32$ completions, which is $32/8 = 4$ prompts per step. With $G = 6$ the same settings fail ($32/6$ is not whole); with $b = 6$, $a = 4$, $G = 6$ you get 24 completions and 4 prompts. Over 300 steps at 4 prompts each the model sees 1,200 GSM8K questions, about one sixth of the 7,473-question training split.

## The script

```python
# pip install "trl>=1.0" peft datasets accelerate   (pin the exact versions you tested)
import torch
from datasets import load_dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import GRPOConfig, GRPOTrainer
# correctness_reward, format_reward, length_penalty: paste them from the previous topic

MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"   # step up to Qwen/Qwen2.5-1.5B-Instruct once this works

SYSTEM = ("Solve the problem. Think step by step, then give only the final number "
          "inside <answer></answer> at the very end.")

def to_prompt(example):
    # GSM8K answers end with "#### 72"; keep the number only.
    gt = example["answer"].split("####")[-1].strip().replace(",", "")
    return {
        "prompt": [{"role": "system", "content": SYSTEM},
                   {"role": "user", "content": example["question"]}],   # conversational format
        "ground_truth": gt,
    }

ds = load_dataset("openai/gsm8k", "main")              # splits: train (7,473), test (1,319)
train = ds["train"].map(to_prompt, remove_columns=ds["train"].column_names)

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID, dtype=torch.float16)                     # T4 has no fast bf16; older transformers: torch_dtype=

peft_config = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.0,
                         target_modules="all-linear", task_type="CAUSAL_LM")

args = GRPOConfig(
    output_dir="/content/drive/MyDrive/grpo-gsm8k",    # on Drive so a disconnect does not lose checkpoints
    # --- the GRPO knobs ---
    num_generations=8,              # G: completions per prompt (default 8)
    max_completion_length=256,      # tokens per completion (default 512); the biggest memory/time lever
    temperature=1.0,                # sampling temperature (default 1.0); too low kills group variance
    beta=0.04,                      # KL weight (TRL default 0.0 = no reference model); with LoRA the
                                    # reference is the base model with the adapter disabled
    epsilon=0.2,                    # clip range
    # --- ordinary training knobs ---
    learning_rate=1e-5,             # TRL default 1e-6 is for full fine-tuning; LoRA tolerates more
    per_device_train_batch_size=8,  # in completions; 8 x 4 = 32 = 4 prompts x 8 generations
    gradient_accumulation_steps=4,
    max_steps=300,
    lr_scheduler_type="constant_with_warmup", warmup_steps=10,
    fp16=True, bf16=False,          # GRPOConfig defaults to bf16=True; turn it off on a T4
    gradient_checkpointing=True,    # already the GRPOConfig default; listed so you know it is on
    # --- logging ---
    logging_steps=5,
    log_completions=True, num_completions_to_print=2,
    save_steps=50, save_total_limit=2,
    report_to="none",
)

trainer = GRPOTrainer(
    model=model,
    processing_class=tokenizer,
    reward_funcs=[correctness_reward, format_reward, length_penalty],
    args=args,
    train_dataset=train,
    peft_config=peft_config,
)
trainer.train()
trainer.save_model(args.output_dir)                   # saves the LoRA adapter only
```

```steps
What one optimizer step does inside the trainer
Take 4 prompts and repeat each 8 times: a generation batch of 32.
---
Generate 32 completions with the current policy at temperature 1.0, up to 256 tokens each.
---
Call each reward function on all 32, sum with `reward_weights`, and compute the advantage within each group of 8.
---
Recompute log-probabilities under the policy (and the reference, because $\beta > 0$) in micro-batches of 8.
---
Accumulate the GRPO loss over 4 micro-batches, then one AdamW update of the LoRA weights.
```

## Optional accelerators

**vLLM.** Generation is the slow part (next topic). Setting `use_vllm=True` with `vllm_mode="colocate"` runs vLLM inside the training process on the same GPU, sharing memory with training; a separate `vllm_mode="server"` needs a second GPU. On a 15 GB T4, colocated vLLM works for small models if you cap its memory share with `vllm_gpu_memory_utilization` (default 0.3, the fraction of GPU memory vLLM may take); `vllm_enable_sleep_mode=True` offloads vLLM's weights and cache during the optimizer step when memory is tight. If installation fights you on Colab, skip it: the run is slower, not wrong.

**Unsloth.** Unsloth publishes free Colab GRPO notebooks that patch the model for lower memory and run vLLM generation through `fast_inference=True`. The loading call looks like this, then you hand the model to the same `GRPOTrainer`:

```python
from unsloth import FastLanguageModel
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen2.5-1.5B-Instruct", max_seq_length=1024,
    load_in_4bit=True,             # QLoRA: base weights in 4 bits
    fast_inference=True,           # vLLM generation
    max_lora_rank=16, gpu_memory_utilization=0.6)   # lower this if you run out of memory
model = FastLanguageModel.get_peft_model(model, r=16, lora_alpha=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])
```

Unsloth's arguments change faster than TRL's; start from their current notebook rather than this snippet.

## In practice

Run 5 steps before committing to 300 and check three things: `nvidia-smi` memory, seconds per step, and that the printed completions contain `<answer>` tags at all. If `rewards/format_reward/mean` is 0 for the first 20 steps the system prompt is not being followed; fix the prompt or add a soft format reward rather than waiting. Prompt length counts against memory too: GSM8K questions are short (well under 200 tokens with the system prompt), but if you switch to a dataset with long prompts, filter or truncate them yourself.

```quiz
{"q": "On one GPU with `num_generations=8` and `gradient_accumulation_steps=2`, which `per_device_train_batch_size` is valid?", "options": ["4", "3", "6", "10"], "answer": 0, "explain": "Completions per step are $1 \\times b \\times 2$ and must be divisible by 8. $b = 4$ gives 8, exactly one prompt. $b = 6$ gives 12 and $b = 10$ gives 20, neither divisible by 8; $b = 3$ gives 6."}
```

```quiz
{"q": "You set `temperature=0.1` to get cleaner answers during GRPO. What is the likely effect?", "options": ["Faster learning, because completions are more accurate", "Little learning, because the 8 completions are nearly identical, so rewards tie and advantages are near 0", "Higher KL, because low temperature moves the policy away from the reference", "No effect, because temperature only matters at evaluation"], "answer": 1, "explain": "GRPO learns from differences inside a group. Near-greedy sampling makes the group nearly identical, so $\\sigma \\approx 0$ for most prompts. Accuracy per sample may rise slightly, but the learning signal collapses. Keep temperature near 1.0 for training and use low temperature for evaluation."}
```
