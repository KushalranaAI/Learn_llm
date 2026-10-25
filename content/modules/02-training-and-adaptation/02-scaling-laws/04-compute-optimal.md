---
title: Spending a compute budget, the compute-optimal split
minutes: 8
---

You have been given a fixed budget of compute $C$. You can spend it on a large model that sees few tokens, a small model that sees many, or anything between, because $C \approx 6ND$ lets you trade $N$ against $D$ one for one. Which split gives the lowest loss? This question has a clean answer, and the answer changed how the whole field trains models.

Think of it as filling two leaky buckets with a fixed amount of water. Pour everything into one and the other stays empty. The lowest total "emptiness" comes from balancing them so the last drop helps both equally.

## Deriving the optimum

Minimise $L(N, D) = E + A N^{-\alpha} + B D^{-\beta}$ subject to $6ND = C$. Substitute $D = C/(6N)$ so there is one variable:

$$
L(N) = E + A N^{-\alpha} + B \left(\tfrac{C}{6}\right)^{-\beta} N^{\beta}
$$

Set the derivative with respect to $N$ to zero:

$$
-\alpha A N^{-\alpha - 1} + \beta B \left(\tfrac{C}{6}\right)^{-\beta} N^{\beta - 1} = 0
\;\;\Longrightarrow\;\;
N_{\text{opt}} = G \left(\frac{C}{6}\right)^{\frac{\beta}{\alpha + \beta}}, \quad G = \left(\frac{\alpha A}{\beta B}\right)^{\frac{1}{\alpha+\beta}}
$$

and $D_{\text{opt}} = C / (6 N_{\text{opt}})$, which grows as $C^{\alpha/(\alpha+\beta)}$. With the refit constants ($\alpha = 0.348$, $\beta = 0.366$) the two exponents are $0.513$ and $0.487$: **parameters and tokens should grow at almost the same rate**. Ten times more compute means roughly $\sqrt{10} \approx 3.2$ times more parameters and $3.2$ times more tokens.

There is a neat by-product. The optimality condition says $\alpha \cdot A N^{-\alpha} = \beta \cdot B D^{-\beta}$, so at the optimum the capacity term divided by the data term equals $\beta / \alpha \approx 1.05$. That is why Chinchilla's two terms came out almost equal in the previous topic.

## The 20-tokens rule

Because the exponents are both close to 0.5, the optimal ratio $D/N$ is roughly constant across budgets, about 20. Plug $D = 20N$ into $C = 6ND$:

$$
C = 6 N (20 N) = 120 N^2 \quad\Longrightarrow\quad N_{\text{opt}} \approx \sqrt{\frac{C}{120}}, \qquad D_{\text{opt}} \approx 20 N_{\text{opt}}
$$

```steps
Planning a run with a 10^23 FLOP budget
$N = \sqrt{10^{23}/120} = \sqrt{8.33 \times 10^{20}} \approx 2.89 \times 10^{10}$: about **29B parameters**.
---
$D = 20 \times 2.89\times10^{10} \approx 5.77\times10^{11}$: about **577B tokens**.
---
Check the budget: $6 \times 2.89\times10^{10} \times 5.77\times10^{11} \approx 1.0\times10^{23}$. Correct.
---
The full formula with the refit constants gives $N_{\text{opt}} \approx 29.5\text{B}$ and $D_{\text{opt}} \approx 566\text{B}$ (19 tokens per parameter), with a predicted loss of about 2.03. The rule of thumb is within a few percent.
```

| Budget $C$ (FLOPs) | $N_{\text{opt}}$ | $D_{\text{opt}}$ |
|---|---|---|
| $10^{21}$ | 2.9B | 58B |
| $10^{22}$ | 9.1B | 183B |
| $10^{23}$ | 29B | 577B |
| $10^{24}$ | 91B | 1.8T |

Each row is ten times the compute; each column grows by about 3.16.

## See it

```sim
scaling-laws
{"paramsB": 175, "tokensB": 300}
```

This is GPT-3's configuration, $C \approx 3.15 \times 10^{23}$. Read "Optimal N" and "Optimal D": about 53B parameters on about 990B tokens. Now drag parameters down toward 50B and tokens up toward 1,000B, keeping the compute readout near 23.5, and watch "Loss above optimal" fall toward zero. Then overshoot to 10B parameters on 5T tokens: the loss rises again. The minimum is a valley, not a cliff, which is why being off by a factor of 1.5 in either direction costs little.

```lab
plan-a-training-run
```

## In practice

The compute-optimal split answers "what is the best model I can get for this training budget?". It is the right question for research comparisons and for one-off models. It is the wrong question if the model will be served to millions of users, because then inference compute dominates the lifetime cost. The next topic adds that term and shows why most production models are trained well past 20 tokens per parameter.

```quiz
{"q": "With the 20-tokens-per-parameter rule, what is the compute-optimal model size for $C = 1.2 \\times 10^{22}$ FLOPs?", "options": ["1B", "10B", "100B", "3.2B"], "answer": 1, "explain": "$N = \\sqrt{C/120} = \\sqrt{10^{20}} = 10^{10}$, i.e. 10B parameters, trained on 200B tokens. Forgetting the square root (dividing by 120 only) gives an absurd number; 3.2B is $\\sqrt{10}$ times too small."}
```

```quiz
{"q": "Your compute budget grows 100 times. Under the compute-optimal rule, how should model size and data change?", "options": ["Model ×100, data unchanged", "Model ×10, data ×10", "Model ×50, data ×2", "Data ×100, model unchanged"], "answer": 1, "explain": "Both exponents are close to 0.5, so each grows as roughly $\\sqrt{100} = 10$. The other options put the whole increase into one factor, which leaves the other term dominating the loss."}
```
