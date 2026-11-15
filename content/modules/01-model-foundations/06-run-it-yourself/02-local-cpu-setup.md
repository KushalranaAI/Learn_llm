---
title: Set up a laptop with no GPU
minutes: 10
---

A laptop with no GPU runs all of parts 1 to 5. The setup has one trap worth understanding before you type anything: the repo's `requirements.txt` pins `torch==2.8.0`, and on Linux the default PyPI build of that version is the CUDA build, which drags in several gigabytes of NVIDIA libraries you cannot use. The fix is to install the **CPU-only PyTorch wheel** first, from PyTorch's own package index, and let `requirements.txt` find torch already satisfied.

Everything goes into a **virtual environment**: a private folder with its own Python and packages, so the repo's pinned versions cannot break anything else on your machine. The repo's README uses conda; Python's built-in `venv` works just as well and needs nothing extra.

## In everyday life

Imagine you walk into a cycle shop to buy a bike for your daily ride to college. The shop's default package is the mountain model, with heavy gears and shock absorbers built for steep tracks. You will never use them on city roads, and they make the bike heavy and costly. What you actually want is the light city version, asked for by name before the shopkeeper adds anything else.

Installing the course code has the same trap. The main library, **PyTorch** (the toolkit that does the number crunching), comes in a big version built for NVIDIA graphics cards and a small version for ordinary processors. On many Linux machines the default download is the big one, even when your laptop has no such card. So you ask for the small **CPU-only** version first.

You also keep everything in a **virtual environment**, which is a private folder with its own copy of Python and its own packages. Think of a labelled shelf at home: this project's tools stay on it and never get mixed up with anything else you own.

**Where you meet it.** A student with an older laptop and no graphics card wants to run the course code. If she installs the packages in the wrong order, she downloads several gigabytes of files she cannot use and may fill her disk. Installing the light version first, inside its own environment, keeps the setup small and easy to repeat.

```scene
title: Buying the light city bike
step: 🏠 You clear a labelled shelf at home just for this bike | Create a virtual environment
step: 🚲 You ask the shop for the light city bike by name first | Install the CPU-only PyTorch wheel
step: 🔧 The shop adds the remaining parts, and your bike already counts | Install requirements.txt
step: 🔍 You check there is no mountain gear on it | Check that cuda is_available prints False
step: 🚴 You take a short test ride before any long trip | Run each part from its own folder
takeaway: Ask for the small CPU version first, and keep each project in its own environment.
```

## Why the order of installs matters

A pip requirement such as `torch==2.8.0` with no local label also matches `2.8.0+cpu`. So if the CPU wheel is installed first, pip sees the pin as satisfied and moves on. Installed the other way round, you download the large build and then replace it.

The size difference is real. The CPU wheel is a couple of hundred megabytes. The Linux CUDA build plus its `nvidia-*` dependency packages runs to several gigabytes on disk, which on a laptop with 20 GB free is the difference between "fine" and "disk full".

| Platform | What `pip install torch==2.8.0` gives from PyPI | What to do |
|---|---|---|
| Linux x86-64 | CUDA build plus NVIDIA libraries | Install the CPU wheel first |
| Windows | CPU build | Either way works; the CPU index is explicit |
| macOS (Apple Silicon) | CPU build with `mps` support | Plain `pip` is fine |

**Python version.** Use 3.11, as the README does, or 3.12. Some pins (for example `numpy==2.3.2` and `contourpy==1.3.3`) need at least 3.11, and very new Pythons may not have wheels for these exact versions yet.

## Step by step

```steps
Install the CPU-only setup
Install Python 3.11 (python.org installer on Windows and macOS, your package manager or `pyenv` on Linux) and check it with `python --version`. Put the repo in a folder whose path has **no spaces**, for example `C:\code\llm_from_scratch` or `~/code/llm_from_scratch`. Part 2's orchestrator builds a command from an absolute path and splits it on spaces.
---
Create and activate a virtual environment inside the repo folder: `python -m venv .venv`, then `.venv\Scripts\activate` on Windows or `source .venv/bin/activate` on macOS and Linux. Your prompt now starts with `(.venv)`.
---
Install the CPU wheel of the pinned version: `pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu`. On macOS skip the index URL.
---
Install the rest: `pip install -r requirements.txt`. If a pin fails to build, install only what parts 1 to 5 import instead: `pip install numpy matplotlib pytest tokenizers tensorboard`.
---
Check it: `python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.get_num_threads())"` should print something like `2.8.0+cpu False 8`.
```

The same thing as commands, for Windows PowerShell:

```bash
cd C:\code\llm_from_scratch
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt
$env:PYTHONUTF8 = "1"        # lets Python print Hindi text and check marks
```

And for macOS or Linux:

```bash
cd ~/code/llm_from_scratch
python3.11 -m venv .venv
source .venv/bin/activate
pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu   # macOS: drop --index-url
pip install -r requirements.txt
```

With conda, as in the README: `conda create -n llm_from_scratch python=3.11`, `conda activate llm_from_scratch`, then the same two `pip` lines.

## Running each part on a CPU

Every script picks the device the same way: `cuda` if an NVIDIA GPU is visible, else `mps` on Apple Silicon, otherwise `cpu`. The scripts that train or sample, part 4's `train.py` included, also take `--cpu` to force the CPU even on a GPU machine. Run each part from inside its own folder, because all imports are local. The `;` separators below work in both bash and PowerShell.

```bash
cd part_1; python orchestrator.py --visualize; cd ..
cd part_2; python orchestrator.py; cd ..
cd part_3; python orchestrator.py --demo; cd ..
cd part_4; python orchestrator.py --demo; cd ..
cd part_5; python orchestrator.py --demo; cd ..
```

The orchestrators run each step with the same Python as the orchestrator itself (your venv), use paths relative to the part's folder, and force UTF-8 output, so they work on Windows and in folders with spaces. (Older copies of the repo broke part 2's sampling step on Windows: if yours does, update it or run the three commands yourself.) To see each step, or to add `--cpu`, run them by hand:

```bash
cd part_2
python train.py --data tiny_hi.txt --steps 400 --sample_every 100 --eval_interval 100 --batch_size 32 --block_size 128 --n_layer 2 --n_head 2 --n_embd 128 --cpu
python sample.py --ckpt runs/min-gpt/model_best.pt --tokens 200 --prompt "Once upon a time " --cpu
python eval_loss.py --data tiny_hi.txt --ckpt runs/min-gpt/model_best.pt --iters 50 --block_size 128 --cpu
```

The `FutureWarning` about `torch.cuda.amp` that some scripts print is harmless.

```parsons
{"title":"Order the commands that take a fresh macOS or Linux machine from an empty repo folder to a sample from part 2","lines":["cd ~/code/llm_from_scratch","python3.11 -m venv .venv","source .venv/bin/activate","pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu","pip install -r requirements.txt","cd part_2","python train.py --data tiny_hi.txt --steps 400 --batch_size 32 --block_size 128 --n_layer 2 --n_head 2 --n_embd 128 --cpu","python sample.py --ckpt runs/min-gpt/model_best.pt --tokens 200 --prompt \"Once upon a time \" --cpu"],"explain":"The venv is created inside the repo folder and activated **before** any `pip install`, otherwise packages land in the system Python. The CPU wheel of torch goes in **before** `requirements.txt`: the pin `torch==2.8.0` is then already satisfied by `2.8.0+cpu`, while the other order downloads the multi-gigabyte CUDA build on Linux first. `requirements.txt` lives in the repo root, so that install happens before `cd part_2`. Imports are local, so training runs from inside `part_2`, and `sample.py` can only run after `train.py` has written `runs/min-gpt/model_best.pt` (at its first evaluation, step 200)."}
```

## Threads and smaller configs

PyTorch picks a thread count from your CPU's cores automatically, which is usually right. Fewer threads cost little on these small models: limiting a 16-thread laptop to 4 threads slowed part 2's default config from 0.52 to 0.61 s per step, about 16%. If the laptop becomes unusable while training, cap the threads before launching:

```bash
export OMP_NUM_THREADS=4          # PowerShell: $env:OMP_NUM_THREADS = "4"
python train.py --data tiny.txt --steps 300 --cpu
```

In your own scripts the equivalent is `torch.set_num_threads(4)` at the top.

For an **8 GB laptop**, the only run that needs care is part 4 at its default size, which peaks near 8 GB. Shrink the micro-batch and accumulate to keep the effective batch:

```bash
cd part_4
python train.py --data ../part_2/tiny.txt --out runs/part4-8gb --bpe --vocab_size 32000 --batch_size 8 --grad_accum_steps 16 --steps 300 --log tensorboard
```

The memory arithmetic from topic 1, with activations scaling linearly in $B$:

$$
M(B) \approx 16N + M_{\text{act}}(32) \cdot \frac{B}{32} = 0.93 + 5.56 \times \frac{8}{32} = 0.93 + 1.39 \approx 2.3 \ \text{GB}
$$

plus about 0.4 GB for PyTorch itself; the measured peak was 3.2 GB. The time per optimizer step barely changes, because each step still processes $8 \times 16 \times 256 = 32{,}768$ tokens, the same as $32 \times 4 \times 256$. Alternatively drop to the demo's `--n_embd 128 --n_layer 2 --vocab_size 8000`, which needs well under 1 GB.

**Apple Silicon.** As above, every script picks the best device it finds: an NVIDIA GPU (`cuda`), else the Mac GPU (`mps`), else the CPU, and `--cpu` forces the CPU. For parts 1 to 5 the CPU is enough; `mps` helps most on the big part 4 run. Mixed precision (`--mixed_precision`) stays off on `mps` and CPU, because the repo's AMP code is CUDA-only. If an operation is missing on `mps`, set `PYTORCH_ENABLE_MPS_FALLBACK=1` to run it on the CPU, or pass `--cpu`.

## In practice

- **Check the venv is active** before every `pip install`. Installing into the system Python is the most common setup mistake, and the symptom is "I installed it but `import` fails".
- **Keep one environment per project.** The [fine-tuning setup lesson](/learn/fine-tuning/run-fine-tuning-yourself) wants newer library versions than this repo pins.
- **Time the first 50 steps.** Part 2 prints the seconds per 50 steps; multiply to predict the whole run before committing to it.

```quiz
{"q": "On a Linux laptop you run `pip install -r requirements.txt` first and then `pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu`. What happens?", "options": ["The first command downloads the CUDA build and its NVIDIA libraries; the second then replaces torch with the CPU build, so you paid for gigabytes you did not need", "The second command fails because torch is already installed", "Nothing different: both orders install the CPU build", "The CUDA build makes the CPU training faster"], "answer": 0, "explain": "On Linux the PyPI build of torch 2.8.0 is the CUDA one, so the requirements file pulls it in. Reinstalling from the CPU index swaps torch but leaves the `nvidia-*` packages taking up disk. Installing the CPU wheel first makes the `torch==2.8.0` pin already satisfied. A CUDA build gives no speed-up on a machine with no NVIDIA GPU."}
```

```quiz
{"q": "Why does lowering `--batch_size` from 32 to 8 make part 4's default run fit on an 8 GB laptop, while lowering `--steps` from 300 to 100 does not?", "options": ["Peak memory depends on the tokens in one micro-batch, not on how many steps you run", "Fewer steps means a smaller optimizer state", "Lowering steps also lowers the vocabulary size", "Batch size changes the number of parameters"], "answer": 0, "explain": "Activations scale with $B \\cdot n$ and are freed after each backward pass, and model states are a fixed $16N$ bytes. The number of steps changes only how long the run takes. Optimizer state is per parameter, so it does not shrink with fewer steps, and neither batch size nor steps changes the parameter count."}
```
