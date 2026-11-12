---
title: Kaggle, and renting a GPU by the hour
minutes: 9
---

Colab is not the only free GPU. **Kaggle**, Google's data-science community site, also runs free notebooks with GPUs, and its quota is more predictable: a weekly allowance of GPU hours you can see in your account. When free hardware is too small or too slow, the next step is not a cloud contract. It is **renting a single GPU for an hour or two** from a marketplace, which for a typical LoRA run costs less than a sandwich.

The skill that matters on paid hardware is different from the one on free hardware. On Colab the danger is losing your work; on a rented GPU the danger is losing your money, because the meter runs whether or not anything is training.

## Kaggle notebooks

```steps
From account to GPU notebook
**Verify your phone.** In Kaggle, open your profile Settings and complete phone verification. Without it, GPU accelerators and internet access stay disabled in notebooks.
---
**Create a notebook** (Code → New Notebook). In the right-hand panel, under Session options, set **Accelerator** to *GPU T4 x2* or *GPU P100*, and switch **Internet** on so pip and the Hub work.
---
**Check your quota.** The same panel and your account settings show GPU hours used this week. As of late 2026 it is commonly around 30 hours a week, but Kaggle varies it, so read your own number.
---
**Add your token as a secret** (Add-ons → Secrets, name it `HF_TOKEN`), then read it with `from kaggle_secrets import UserSecretsClient; UserSecretsClient().get_secret("HF_TOKEN")` and pass it to `huggingface_hub.login`.
---
**Save outputs** under `/kaggle/working`, then use **Save Version** so they persist as notebook output, and push the adapter to the Hub as well.
```

Two Kaggle details trip people up. First, "T4 x2" is two separate 15 GB cards, not one 30 GB card: a plain single-process training script uses one of them, and spreading a model across both needs `device_map="auto"` or a multi-GPU launch. Second, sessions are reported to end at about 12 hours, so the checkpoint-and-resume habit from [Colab](/learn/fine-tuning/run-fine-tuning-yourself/google-colab-step-by-step) applies unchanged. The P100 is an older card with no fast fp16 tensor cores; for QLoRA the T4 is usually the better pick.

## Renting a GPU: what it costs

GPU marketplaces (for example RunPod, Vast.ai and Lambda; there are others, and none is endorsed here) rent a machine with one or more GPUs, billed by the second or minute. Late-2026 prices move daily and differ between "community" hosts and "secure" data-centre hosts, but typical ranges are:

| GPU | Memory | Typical price per hour (late 2026) | Good for |
|---|---|---|---|
| RTX 4090 | 24 GB | about \$0.35–0.70 | LoRA up to ~8B, QLoRA up to ~14B |
| A100 | 80 GB | about \$0.50–1.40 | LoRA up to ~30B, fast 8B runs |
| H100 | 80 GB | about \$1–3 | Speed when the run is long |

The bill is simple multiplication, but it has three parts, not one:

$$\text{cost} = p_{\text{GPU}} \cdot (t_{\text{setup}} + t_{\text{train}} + t_{\text{idle}}) + \text{storage}.$$

**Worked example.** LoRA (bf16 base) on an 8B model with 20,000 examples of 512 tokens for 2 epochs: $T = 2.05 \times 10^7$ tokens. Using the $4N$ rule from [Choosing where to run](/learn/fine-tuning/run-fine-tuning-yourself/choosing-where-to-run), training needs $4 \times 8 \times 10^9 \times 2.05 \times 10^7 \approx 6.6 \times 10^{17}$ FLOPs. An A100 peaks at 312 TFLOP/s in bf16; fine-tuning jobs typically sustain somewhere around 30 to 50% of that, so take 125 TFLOP/s. Then

$$t_{\text{train}} \approx \frac{6.6 \times 10^{17}}{1.25 \times 10^{14}} \approx 5{,}200 \text{ s} \approx 1.5 \text{ h}.$$

Add half an hour to install packages, download the 16 GB model and test, and the bill at \$1.30 per hour is $1.30 \times 2 \approx \$2.60$. Now suppose you go to dinner and leave the pod running for 4 more hours: another \$5.20, twice the cost of the work. Idle time, not training time, is what makes rented GPUs expensive for beginners.

## Moving data and results

A rented machine starts empty. Get data onto it and results off it through something that outlives the pod:

- **The Hugging Face Hub**, both ways. Push your dataset as a private dataset repository from your laptop, `load_dataset("you/my-data")` on the pod, and `push_to_hub` the adapter at the end. The `hf` command-line tool that ships with `huggingface_hub` (older guides call it `huggingface-cli`) can upload a whole folder; check `hf --help` for the current subcommands.
- **scp or rsync** over SSH for files you do not want on the Hub: `scp -P <port> root@<host>:/workspace/out/adapter.tar.gz .` with the port and host the provider shows.
- **A network volume** from the provider, if you will run several sessions. It survives stopping the pod but is billed per GB per month even when nothing is running.

Write outputs to the provider's persistent path (often `/workspace`), not the container's root disk, which some providers wipe when the pod stops.

## The stop-the-pod checklist

```steps
Before you stop the meter
**Confirm the adapter is off the machine.** Open the Hub repository in your browser, or list the downloaded files on your laptop. "The save finished" is not the same as "I have it".
---
**Copy the logs.** The training loss log and your evaluation outputs are what tell you, next week, whether the run worked.
---
**Stop or terminate the pod**, not just the notebook kernel. Closing the browser tab does nothing to the bill.
---
**Delete volumes you no longer need**; they bill per month on their own.
---
**Check the billing page** a few minutes later and confirm the hourly charge has gone to zero.
```

## In practice

Develop and debug on the laptop or Colab, and rent only to run a script that already works end to end; paying A100 rates to discover a typo in a column name is the classic waste. Set a spending limit or low prepaid balance on the marketplace account. Many people also run `sleep 7200 && shutdown` style timers or the provider's auto-stop feature, so a forgotten pod stops itself.

```quiz
{"q": "A training job needs 3 hours on a rented 4090 at \\$0.50 per hour. Setup takes 30 minutes and you forget to stop the pod for 9 hours afterwards. What does the GPU time cost, and what share of it was wasted?", "options": ["\\$6.25, with 72% wasted", "\\$1.50, with none wasted", "\\$6.25, with 12% wasted", "\\$4.50, with 67% wasted"], "answer": 0, "explain": "Total time $= 0.5 + 3 + 9 = 12.5$ h, so $12.5 \\times 0.50 = \\$6.25$. Idle time is 9 of 12.5 hours, 72%. \\$1.50 counts only the training hours; the meter runs whenever the pod is on."}
```

```quiz
{"q": "On Kaggle you choose 'GPU T4 x2' and load a 13B model in fp16 (about 26 GB) in a plain single-process script. What happens?", "options": ["It runs out of memory on one 15 GB card unless you spread the model across both GPUs", "It fits, because two T4s give 30 GB", "It falls back to the P100", "It automatically uses 4-bit quantisation"], "answer": 0, "explain": "The two T4s are separate 15 GB devices. A single-process script puts the model on one of them, and 26 GB does not fit. Adding up the cards' memory is the tempting mistake; using both needs `device_map=\"auto\"` (splitting layers across cards) or a multi-GPU launch, and QLoRA would be the simpler fix."}
```
