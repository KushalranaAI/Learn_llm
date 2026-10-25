---
title: One formula for parameters and data together
minutes: 8
---

The power law in the previous topic varied one thing at a time. Real decisions vary two: how big a model to build ($N$ parameters) and how many tokens to train it on ($D$). A big model trained on too little data has spare capacity it never learned to use. A small model trained on endless data hits the ceiling of what its few parameters can store. Loss depends on both, and the cleanest way to see the trade-off is a single formula with one term for each failure.

The DeepMind team behind **Chinchilla** (Hoffmann et al., 2022) trained over 400 models from 70M to 16B parameters on 5B to 500B tokens and fitted exactly such a formula.

## The parametric loss

$$
L(N, D) = E + \frac{A}{N^{\alpha}} + \frac{B}{D^{\beta}}
$$

| Symbol | Meaning |
|---|---|
| $L$ | Final pretraining loss, in nats per token |
| $N$ | Number of parameters |
| $D$ | Number of training tokens (each seen about once) |
| $E$ | Irreducible loss: the entropy of the text, which no model can remove |
| $A / N^{\alpha}$ | **Capacity term**: loss due to the model being finite |
| $B / D^{\beta}$ | **Data term**: loss due to training being finite |
| $\alpha, \beta$ | Exponents: how quickly each term shrinks |

The two reducible terms are independent. Making the model bigger cannot fix the data term; adding tokens cannot fix the capacity term. That separation is what makes the formula a planning tool.

## Which constants?

The constants depend on the dataset, the tokenizer and the training recipe, so treat them as illustrative, never as universal. The original paper reported $E = 1.69$, $A = 406.4$, $B = 410.7$, $\alpha = 0.34$, $\beta = 0.28$. A 2024 replication (Besiroglu et al.) re-fitted the same data and found the original fit was inconsistent with the paper's own compute-optimal results. Their refit is

$$
E = 1.817,\quad A = 482.0,\quad B = 2085.4,\quad \alpha = 0.348,\quad \beta = 0.366
$$

and it agrees with the famous "about 20 tokens per parameter" rule. The simulation in this lesson uses the refit, so we do too.

```steps
Chinchilla's own loss, by hand (refit constants)
Chinchilla has $N = 7 \times 10^{10}$ and $D = 1.4 \times 10^{12}$.
---
Capacity term: $N^{0.348} = e^{0.348 \ln(7\times10^{10})} = e^{0.348 \times 24.97} \approx 5{,}900$, so $A/N^{\alpha} \approx 482.0 / 5{,}900 \approx 0.082$.
---
Data term: $D^{0.366} = e^{0.366 \ln(1.4\times10^{12})} = e^{0.366 \times 27.97} \approx 27{,}700$, so $B/D^{\beta} \approx 2085.4 / 27{,}700 \approx 0.075$.
---
Total: $L \approx 1.817 + 0.082 + 0.075 = 1.974$ nats per token. The two reducible terms are almost equal, which is no accident: a compute-optimal model balances them.
---
Now GPT-3 ($N = 1.75\times10^{11}$, $D = 3\times10^{11}$): capacity term $\approx 0.059$, data term $\approx 0.132$, $L \approx 2.009$. Bigger model, worse loss: its data term is more than twice its capacity term. It was starved of tokens.
```

## See it

The simulation starts at Chinchilla itself.

```sim
scaling-laws
{"paramsB": 70, "tokensB": 1400}
```

Try three things. First, move to GPT-3's configuration (175B parameters, 300B tokens) and read the "Loss above optimal" metric: for the same compute, a smaller model on more tokens would do better. Second, hold parameters at 70B and multiply tokens by 10: the loss falls, but only the data term moves, and it flattens toward $E$ plus the capacity term. Third, shrink the model to 7B while keeping 1.4T tokens and see which term now dominates.

## Reading the formula as an engineer

The formula answers "which knob should I turn next?". Compare the two reducible terms for your current plan:

- If $B/D^{\beta}$ is much larger than $A/N^{\alpha}$, you are **data-limited**: more tokens buy more than more parameters.
- If $A/N^{\alpha}$ is much larger, you are **capacity-limited**: a bigger model helps more.
- If they are close, you are near the compute-optimal balance for this budget.

The next two topics turn this into arithmetic: first, how much compute a choice of $N$ and $D$ costs; then, for a fixed compute budget, which $N$ and $D$ minimise $L$.

```callout-warn
Losses are not portable
A loss of 1.97 means something only for Chinchilla's dataset and tokenizer. Change either and every constant changes. Use the formula's shape and its ratios to reason; fit your own constants before trusting its numbers.
```

```quiz
{"q": "Under the formula, a team doubles its training tokens but keeps the model the same. Which part of the loss changes?", "options": ["Only the capacity term $A/N^{\\alpha}$", "Only the data term $B/D^{\\beta}$", "Both reducible terms and $E$", "None: loss depends only on compute"], "answer": 1, "explain": "The terms are separate functions of $N$ and $D$. More tokens shrink $B/D^{\\beta}$ by a factor $2^{-\\beta} \\approx 0.78$; the capacity term and the floor $E$ are untouched."}
```

```quiz
{"q": "For some plan, the capacity term is 0.03 and the data term is 0.15. What is the most useful next step for a fixed compute budget?", "options": ["Make the model bigger and train on fewer tokens", "Make the model smaller and train on more tokens", "Keep both and lower the learning rate", "Nothing: loss is already at E"], "answer": 1, "explain": "The data term dominates, so the plan is data-limited. Moving compute from parameters to tokens (smaller model, more tokens) lowers the total. A bigger model would only shrink the already-small capacity term."}
```
