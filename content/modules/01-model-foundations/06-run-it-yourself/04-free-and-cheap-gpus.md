---
title: Kaggle, Colab Pro and renting a GPU by the hour
minutes: 9
---

Free Colab is the default for this module, but it is not the only option, and it is not always available. **Kaggle notebooks** are a second free GPU with a visible weekly allowance. **Colab Pro** sells compute units, which turn into GPU hours at a rate that depends on the card. And a **GPU pod** rented from a marketplace gives you a whole machine for an hour or two, billed by the second or minute while it is switched on.

The rule that ties them together is simple. For every option, the cost is hours multiplied by a price per hour, and the hours you pay for include setup and idle time, not just training. Beginners rarely overspend on training. They overspend on a machine they forgot to turn off.

## In everyday life

Suppose you need transport for a day of errands, and you have three choices. A free bus pass gets you around, but with limits and no promise of a seat. A monthly pass gives you more rides and priority boarding. Or you hire a cab by the hour. It is fast and always there, but the meter runs the whole time you hold it: while you load your bags, and while the driver waits outside because you forgot about him.

Getting a GPU for training follows the same menu. **Kaggle notebooks** and free Colab are the bus pass: free, with a weekly or per-session limit. **Colab Pro** is the monthly pass: you pay for credits, called compute units, and each unit is a share of some GPU time. A **GPU pod** is the cab. You rent a whole machine from a marketplace and pay for every hour it is switched on, whether it is training or not.

For every option the cost is hours multiplied by a price per hour. The hours include setup and waiting, not only the training itself.

**Where you meet it.** A hobbyist rents a pod for an evening, starts a job and falls asleep, leaving the machine on all night. The job needed two hours, but the bill covers the whole night. A short habit fixes it: test first on a free machine, then stop and delete the pod when the work is done.

```scene
title: Hiring a cab by the hour
step: 🚌 You try the free bus pass first for ordinary trips | Free Colab or Kaggle first
step: 📝 You plan the route at home, before any meter starts | Test the command on a free machine
step: 🚕 You book the cab only for the trip that needs it | Rent a GPU pod
step: 💸 The meter runs while you load bags and while the driver waits | Setup and idle time are billed
step: 🧾 You end the ride and check the bill shows the meter stopped | Stop and delete the pod, check billing
takeaway: You pay for every hour a rented machine is on, so switch it off and check the bill.
```

## Kaggle notebooks

Kaggle offers free GPU notebooks with a weekly quota, commonly around 30 GPU hours, shown in your account settings. The exact figure varies and is not in the documentation, so read yours there. GPU options are a single P100 (16 GB) or two T4s, and a session is reported to last up to 12 hours. You must verify a phone number before GPU and internet access are enabled. All figures are as of late 2026.

Getting the repo in works differently from Colab:

```steps
Run the repo on Kaggle
Zip `llm_from_scratch` (without `.venv` or `runs`) and create a private Kaggle Dataset from it (Datasets → New Dataset → upload the zip). Kaggle unpacks it.
---
Create a notebook, open the settings panel, set **Accelerator** to GPU T4 x2 or GPU P100, and add your dataset with **Add Input**. It appears read-only under `/kaggle/input/<dataset-name>/`.
---
Copy the code somewhere writable and run it: `!cp -r /kaggle/input/<dataset-name>/llm_from_scratch /kaggle/working/` then `%cd /kaggle/working/llm_from_scratch/part_4` and the same `train.py` command as on Colab, with `--out /kaggle/working/runs/part4`.
---
Save outputs before you leave. Files in `/kaggle/working` are kept as the notebook's output when you save a version of the notebook; anything elsewhere is lost.
```

The repo's scripts use one GPU, so the second T4 sits idle; that is fine. The P100 is an older card without tensor cores, so `--mixed_precision` speeds it up less than it does a T4. For models this small, either finishes in minutes.

## Colab Pro: compute units into hours

Colab Pro costs US\$9.99 a month for 100 compute units, and extra units cost \$9.99 per 100. A unit is not an hour; each GPU type burns units at its own rate. Measured rates reported in March 2026 were about 1.2 units per hour for a T4, 1.7 for an L4 (24 GB) and 5.4 for an A100 (40 GB). Google does not guarantee them, so check your usage page. The conversion is

$$
\text{hours} = \frac{\text{units}}{\text{units per hour}}, \qquad \text{price per hour} = \text{units per hour} \times \frac{\$9.99}{100}
$$

**Worked example.** 100 units buy $100 / 1.2 \approx 83$ T4 hours at about $1.2 \times \$0.0999 \approx \$0.12$ per hour, or $100 / 5.4 \approx 18.5$ A100 hours at about \$0.54 per hour. Paid units also buy priority access and longer sessions, which is often worth more than the speed. Google's AI subscription plans bundle some Colab benefits too; the details change, so check the current plan page.

For parts 1 to 5 you will not need Pro. It becomes interesting when the free tier keeps refusing you a GPU, or for the [fine-tuning module](/learn/fine-tuning/run-fine-tuning-yourself), where models are a hundred times larger.

## Renting a GPU pod

Marketplaces such as RunPod, Vast.ai and Lambda rent whole GPU machines by the hour. Typical prices in late 2026, which move daily and differ between "community" and "secure" hosts:

| GPU | Memory | Typical price per hour (late 2026) |
|---|---|---|
| RTX 4090 | 24 GB | about \$0.35–0.70 |
| A100 | 80 GB | about \$0.50–1.40 |
| H100 | 80 GB | about \$1–3 |

Storage volumes are billed separately, and keep billing after the pod is stopped until you delete them.

**When does renting make sense for this repo?** Not for memory. Even a scaled-up part 4 model fits a T4. It makes sense when free GPU *time* is the limit. Suppose you widen part 4 to $d = 768$, $L = 12$ (about 162M parameters) and want 10,000 steps. By topic 1's formula each step is $6 \times 138\text{M} \times 32{,}768 \approx 2.7 \times 10^{13}$ FLOPs. At an assumed 15 TFLOP/s on a T4 that is 1.8 s per step, 5 hours: possible on Colab, but one disconnect costs a session. At an assumed 50 TFLOP/s on a 4090 it is 0.54 s per step, 1.5 hours. The bill is

$$
\text{cost} = (t_{\text{setup}} + t_{\text{run}} + t_{\text{idle}}) \times \text{price} = (0.25 + 1.5 + 0.25) \times \$0.50 = \$1.00
$$

Forget the pod overnight, adding 10 idle hours, and the same job costs $(2 + 10) \times \$0.50 = \$6.00$: five sixths of the money bought nothing. The throughput figures are assumptions; time 20 steps on the real card before trusting any estimate.

```sim
training-memory
{"model": "llama3-1b", "precision": "mixed", "optimizer": "adam", "zero": 0, "gpus": 1, "seqLen": 1024, "microBatch": 4, "checkpointing": false, "gpu": "l4"}
```

This sim has no model as small as the repo's, so it shows where rented memory really starts to matter: full training of a 1.2B model, twenty times part 4's largest. With mixed precision, Adam and a micro-batch of 4 at 1,024 tokens it needs about 24.6 GB and does **not** fit the 24 GB L4: 16 bytes per parameter is already almost 20 GB before a single activation. Turn on checkpointing and it drops to about 21 GB; switch the GPU to the A100 and it fits with room to spare. That is the kind of job worth an hour of rented A100, not this module's.

## A checklist for not paying for idle pods

1. Test the exact command on your laptop or free Colab first, with `--steps 20`. Debugging on a meter is the most expensive debugging there is.
2. Check the price and the storage price before you launch, and pick the smallest card that fits.
3. Run training inside `tmux` or with `nohup`, so a dropped SSH connection does not kill it.
4. Write checkpoints with `--save_every` set so a crash loses minutes, not hours.
5. Download the checkpoints and logs as soon as the run ends (`scp`, or the provider's file browser).
6. **Stop the pod, then delete it and its volume**, and look at the billing page to confirm the meter stopped.
7. Set a spending limit or low balance, if the provider allows it, so a forgotten pod runs out of credit instead of running up a bill.

## In practice

- **Free first, then paid.** For parts 1 to 5 the order is laptop, then free Colab or Kaggle, then (rarely) a rented card for an hour.
- **Pay for reliability, not speed.** At these sizes the expensive part is a lost session, not a slow GPU. A paid tier or a short rental buys an uninterrupted run.
- **Prices drift.** Every number on this page is a snapshot from late 2026. Look up today's before budgeting.

```quiz
{"q": "Colab Pro gives 100 units for \\$9.99. An L4 burns about 1.7 units per hour. Roughly how many L4 hours do 100 units buy, and what is the effective price per hour?", "options": ["About 59 hours at about \\$0.17 per hour", "About 170 hours at about \\$0.06 per hour", "100 hours at \\$0.10 per hour", "About 17 hours at about \\$0.59 per hour"], "answer": 0, "explain": "Hours $= 100 / 1.7 \\approx 59$, and the price is $1.7 \\times \\$9.99/100 \\approx \\$0.17$ per hour. Multiplying instead of dividing gives 170 hours. Treating a unit as an hour gives 100 hours at \\$0.10, which is only right for a card that burns exactly one unit per hour."}
```

```quiz
{"q": "A rented 4090 at \\$0.60 per hour runs a 2-hour job after 30 minutes of setup. You stop the pod but leave its 50 GB volume, billed at \\$0.10 per GB per month, for a month. What did the job cost in total?", "options": ["About \\$6.50: \\$1.50 of GPU time plus \\$5 of storage", "\\$1.20: two hours of GPU", "\\$1.50: setup plus training", "About \\$5.00: storage only, since the pod was stopped"], "answer": 0, "explain": "GPU time $= 2.5 \\times \\$0.60 = \\$1.50$, and the volume costs $50 \\times \\$0.10 = \\$5$ for the month, so about \\$6.50. \\$1.20 forgets the setup time and the storage; stopping a pod halts the GPU meter but not the storage meter, which is why the checklist says delete the volume too."}
```
