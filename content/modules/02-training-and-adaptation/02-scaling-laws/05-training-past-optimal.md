---
title: Why production models train past the optimum
minutes: 7
---

Compute-optimal training minimises the loss you get for a training budget. But a model is trained once and then used, sometimes for trillions of tokens. A restaurant does not pick an oven only by its purchase price; it also asks what it costs to run every day for years. For a widely served model, the running cost is inference, and inference cost grows with the number of parameters.

So the economic question is different: **for a target quality, what is the cheapest model to own over its lifetime?** The answer is usually a smaller model trained on far more tokens than 20 per parameter. This is called **over-training** (a slightly misleading name: the model is not overfitting, it is being trained beyond the compute-optimal point).

## Lifetime compute

Training costs $6ND$. Serving costs about $2N$ FLOPs per token processed (forward pass only). If the model will process $D_{\text{inf}}$ tokens over its life:

$$
C_{\text{life}} = \underbrace{6 N D}_{\text{training}} + \underbrace{2 N D_{\text{inf}}}_{\text{inference}}
$$

Hold quality fixed: pick a target loss $L^*$, and for each model size $N$ find the token count $D(N)$ that reaches it using the loss formula. A smaller $N$ needs a larger $D$, so training gets more expensive, but every served token gets cheaper.

```steps
Two ways to reach Chinchilla's loss
Target: $L^* \approx 1.974$, Chinchilla's predicted loss (refit constants). Option A is Chinchilla itself: $N = 70\text{B}$, $D = 1.4\text{T}$, training $C = 5.88 \times 10^{23}$.
---
Option B: a 30B model. Solve $B/D^{\beta} = L^* - E - A/N^{\alpha}$ for $D$: it needs about $5.0\text{T}$ tokens (166 per parameter). Training: $6 \times 3\times10^{10} \times 5.0\times10^{12} \approx 9.0 \times 10^{23}$, about 1.5 times option A.
---
Serve $D_{\text{inf}} = 10^{13}$ tokens (10T). Inference for A: $2 \times 7\times10^{10} \times 10^{13} = 1.4\times10^{24}$. For B: $2 \times 3\times10^{10}\times10^{13} = 6\times10^{23}$.
---
Lifetime: A $= 5.88\times10^{23} + 1.4\times10^{24} \approx 1.99\times10^{24}$. B $= 9.0\times10^{23} + 6\times10^{23} = 1.5\times10^{24}$. B is about 25% cheaper overall, and every request is also faster because the model is smaller.
---
Break-even: B costs $3.1\times10^{23}$ extra FLOPs to train and saves $2 \times 40\times10^{9} = 8\times10^{10}$ FLOPs per served token, so it pays off after $3.1\times10^{23}/8\times10^{10} \approx 3.9\times10^{12}$ served tokens.
```

## The pattern in real models

Llama 2 trained its 7B, 13B and 70B models all on 2T tokens. For the 7B model that is about 286 tokens per parameter, fourteen times the compute-optimal ratio; for the 70B model it is about 29, close to optimal. Later open models pushed small models to thousands of tokens per parameter. The motivation is exactly the calculation above: small models are what people can afford to run, so it is worth paying extra training compute to make them as good as possible.

```sim
scaling-laws
{"paramsB": 7, "tokensB": 2000}
```

This is Llama-2-7B's configuration. The "Tokens per param" readout is about 286 and "Loss above optimal" shows how much loss is being given up relative to the compute-optimal model for the same budget: small. Now set tokens to 140B (20 per parameter) and compare the loss: more data has bought a real improvement for a model whose inference cost has not changed at all.

## Limits of over-training

The data term $B/D^{\beta}$ keeps shrinking, but it shrinks ever more slowly. Past a point, each extra trillion tokens buys a tiny loss improvement, and the capacity term $A/N^{\alpha}$ becomes a hard floor for that model size. Three practical limits appear:

| Limit | Why it bites |
|---|---|
| Diminishing returns | Halving the data term needs $2^{1/\beta} \approx 6.6$ times more tokens |
| Data supply | Trillions of fresh, high-quality tokens are finite; repetition loses value after a few epochs |
| Fragility | Some studies report that very heavily trained small models become harder to fine-tune or quantize without losing quality |

```callout-key
Decision rule
One-off or research model: train near 20 tokens per parameter. Model that will serve heavy traffic: choose the size you can afford to serve, then train it on as many good tokens as you can get.
```

```quiz
{"q": "Lifetime compute is $6ND + 2ND_{\\text{inf}}$. A 70B model will serve $10^{12}$ tokens. Which statement is true?", "options": ["Inference dominates: $1.4\\times10^{23}$ versus training of $5.88\\times10^{23}$", "Training dominates: inference is $1.4\\times10^{23}$ versus $5.88\\times10^{23}$ for training (at 1.4T tokens)", "Inference and training always cost the same", "Inference cost does not depend on $N$"], "answer": 1, "explain": "$2 \\times 7\\times10^{10} \\times 10^{12} = 1.4\\times10^{23}$, about a quarter of the training compute, so at this traffic level training dominates and over-training a smaller model gains little. At $10^{13}$ served tokens the balance flips."}
```

```quiz
{"q": "Why can a 7B model trained on 2T tokens be a better product choice than the compute-optimal model for the same training compute (about 26B on 530B tokens)?", "options": ["It has a lower training loss", "It is cheaper and faster per request, while being only slightly worse in loss", "It uses less training compute", "Scaling laws do not apply to small models"], "answer": 1, "explain": "Both runs cost $8.4\\times10^{22}$ FLOPs. The compute-optimal model has the lower loss by definition, so the 7B is slightly worse. But each served token costs about $2N$ FLOPs, so the 7B is almost 4 times cheaper to run for every request."}
```
