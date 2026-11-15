---
title: Configuring LoRA
minutes: 8
---

LoRA freezes every weight of the base model and trains a small pair of matrices next to selected linear layers. [The LoRA update](/learn/fine-tuning/peft-lora/the-lora-update) derives why this works. Here you only need the four settings you will actually type, what each one changes, and how to check the result before spending an hour of GPU time.

In PEFT, those settings live in one `LoraConfig` object:

| Argument | What it sets | Starting value |
|---|---|---|
| `r` | Rank of the update $\Delta W = BA$ | 16 |
| `lora_alpha` | Numerator of the scale $\alpha / r$ | 32 (twice the rank) |
| `lora_dropout` | Dropout on the adapter's input | 0.05 |
| `target_modules` | Which linear layers get an adapter | `"all-linear"` |
| `task_type` | Tells PEFT how to wrap the model | `"CAUSAL_LM"` |

`"all-linear"` adapts every linear layer: the attention projections $W_q, W_k, W_v, W_o$ and the MLP's gate, up and down projections. PEFT's documentation states that it leaves out the output layer, the large matrix that maps hidden states back to vocabulary logits. You don't need to know the module names of each architecture, which is why it is the default choice.

## In everyday life

Picture a restaurant kitchen with one big pot of basic curry base that every dish starts from. The owner wants a spicier house style but will not cook the whole base again. So a small bowl of masala is stirred into each dish at the end.

LoRA works like that. The big model is **frozen**, meaning its numbers are never changed, and you train only a small add-on beside chosen **layers**, the stages the model's processing passes through. Four settings shape the add-on. The **rank** is how many small bowls you prepare, so how rich the add-on can be. The **scale** is how strongly the masala is stirred in, and it is set by the strength setting and the rank together. If you change the rank, change the strength with it, or the add-on speaks louder or softer than you planned for. **Dropout** means skipping part of the add-on at random during practice, so it does not lean on any one bit. The **target modules** are the layers that get an add-on, and the easy choice is all of them. Before training, print how many numbers are trainable and compare with your own count.

The kitchen picture stops at one point: masala is chosen by taste, while the add-on's contents are learned from your data.

**Where you meet it.** A team tuning a small model for a support desk has one GPU with limited memory. If the add-on is too big, or attached to the wrong layers, they waste memory or the model barely changes. Choosing sensible values and checking the count first lets them start a long run with confidence.

```scene
title: Masala bowls on a base curry
step: 🍛 One big pot of base curry feeds every dish and is never remade | frozen base model
step: 🥣 The owner decides how many small bowls of masala to prepare | rank
step: 🧂 How strongly the masala is stirred in is set together with the bowl count | alpha scaled by rank
step: 🍴 Every dish on the menu gets its own masala bowl | target modules, all linear layers
step: 🙈 During practice, some bowls are skipped at random | dropout
step: 🔍 Before opening, count the bowls and compare with your list | check trainable parameters
takeaway: LoRA adds a small trainable add-on to a frozen model, and four settings decide its size, strength and place.
```

## The scale and the count

The adapted layer computes $h = W x + \frac{\alpha}{r} B A x$. The factor $\alpha / r$ sets how strongly the update speaks. With $r = 16$ and $\alpha = 32$ it is $2$. If you later double the rank to 32 and keep $\alpha = 32$, the scale halves to 1, so the effective step size changes and the learning rate you tuned no longer fits. Keep $\alpha = 2r$ when you change the rank, and the scale stays at 2. (PEFT also offers `use_rslora=True`, which uses $\alpha / \sqrt{r}$ instead.)

Each adapted matrix of shape $d_{out} \times d_{in}$ adds $r(d_{in} + d_{out})$ trainable parameters ([Counting LoRA parameters](/learn/fine-tuning/peft-lora/counting-lora-parameters)).

```steps
Counting the adapter for Qwen2.5-0.5B at r = 16
The model has $L = 24$ layers, $d = 896$, MLP width 4,864, and grouped-query attention with 2 key/value heads of size 64, so $W_k$ and $W_v$ map 896 to 128.
---
Attention: $W_q$ and $W_o$ ($896 \to 896$) each add $16 \times 1{,}792 = 28{,}672$. $W_k$ and $W_v$ ($896 \to 128$) each add $16 \times 1{,}024 = 16{,}384$. Together: $90{,}112$.
---
MLP: gate, up and down each connect 896 and 4,864, adding $16 \times 5{,}760 = 92{,}160$ each, so $276{,}480$ for the three.
---
One layer: $90{,}112 + 276{,}480 = 366{,}592$. All 24 layers: $24 \times 366{,}592 = 8{,}798{,}208$, about 8.8M, or 1.8% of the 494M base.
```

The same sum for Qwen2.5-1.5B ($L = 28$, $d = 1536$, MLP 8,960, key/value width 256) gives $28 \times 659{,}456 = 18{,}464{,}768$, about 18.5M. Small models have a larger trainable share because the adapter scales with $d$ while the weights scale with $d^2$.

## LoRA or QLoRA

On a CPU, or on a GPU with plenty of room, load the base in 16 or 32 bits and use plain LoRA. On a 15 GB T4, load the frozen base in 4-bit NF4 and train the same adapters on top. That is **QLoRA** ([QLoRA and NF4](/learn/fine-tuning/peft-lora/qlora-and-nf4)). The 4-bit kernels come from `bitsandbytes` and need a CUDA GPU, so QLoRA is not an option on a CPU or a Mac.

```python
# Pin what works, e.g. pip install "peft==<x.y>" "transformers==<x.y>" bitsandbytes
import torch
from transformers import AutoModelForCausalLM, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model

MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
use_qlora = torch.cuda.is_available()          # CPU: plain LoRA in fp32

if use_qlora:
    bnb = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",             # 4-bit NormalFloat grid
        bnb_4bit_use_double_quant=True,        # quantise the block scales too
        bnb_4bit_compute_dtype=torch.float16,  # T4 has no bf16; use torch.bfloat16 on Ampere+
    )
    model = AutoModelForCausalLM.from_pretrained(MODEL, quantization_config=bnb, device_map={"": 0})
else:
    MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
    model = AutoModelForCausalLM.from_pretrained(MODEL, dtype=torch.float32)

lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05,
                  target_modules="all-linear", task_type="CAUSAL_LM")

# Inspection only. In the training script you pass `lora` to SFTTrainer instead.
peft_model = get_peft_model(model, lora)
peft_model.print_trainable_parameters()
# 0.5B: trainable params: 8,798,208 || all params: 502,830,976 || trainable%: 1.7497
print("scale alpha/r =", lora.lora_alpha / lora.r)
print("base memory: %.2f GB" % (model.get_memory_footprint() / 1e9))
```

Compare the printout with your hand count. A mismatch usually means `target_modules` matched more or fewer layers than you assumed. The "all params" figure is the base plus the adapter. In 4-bit, `bitsandbytes` packs two weights per stored element, so the "all params" figure for a quantised model can come out lower than the real count. Trust the trainable figure and your own count.

```sim
lora-params
{"model": "llama3-1b", "method": "qlora", "rank": 16, "targets": "all", "gpu": "l4"}
```

The sim has no Qwen models, so use Llama-3.2-1B as the nearest small model. Compare the memory for **qlora** and **lora**, then move the rank from 16 to 64. The adapter grows four times but stays small next to the frozen base, and memory barely moves. Then switch the targets to $W_Q, W_V$ only and watch the trainable count fall by more than a factor of five.

## In practice

- Start at $r = 16$, $\alpha = 32$, all linear layers. Raise the rank only if eval quality plateaus. Format and style tasks rarely need more than 16.
- On a T4, the compute dtype must be `float16`. Set `bfloat16` on a T4 and you either get an error or a slow emulated path.
- Leave `lora_dropout` at 0.05 to 0.1 for datasets of a few thousand rows. With 100k rows, 0 is fine.
- The 1.5B model in NF4 takes about 1.2 GB for weights. Most of a T4's memory goes to activations, so sequence length matters more than rank.

```quiz
{"q": "You move from $r = 16, \\alpha = 32$ to $r = 64$ and keep $\\alpha = 32$. What happens to the LoRA scale $\\alpha / r$?", "options": ["It falls from 2 to 0.5, so the update is weaker at the same learning rate", "It stays at 2 because PEFT normalises it", "It rises from 2 to 8", "Nothing; the scale only matters at inference"], "answer": 0, "explain": "$32/16 = 2$ and $32/64 = 0.5$: a fourfold drop in how strongly $BA$ is applied. PEFT does not renormalise unless you choose rsLoRA. To keep the scale, set $\\alpha = 128$ when $r = 64$."}
```

```quiz
{"q": "With $r = 8$, how many trainable parameters does LoRA add to one $896 \\to 4{,}864$ MLP projection?", "options": ["46,080", "92,160", "4,358,144", "7,168"], "answer": 0, "explain": "$r(d_{in} + d_{out}) = 8 \\times (896 + 4{,}864) = 46{,}080$. 92,160 is the rank-16 figure; 4,358,144 is the full matrix $896 \\times 4{,}864$ that LoRA leaves frozen."}
```
