---
title: SFT data, quality over quantity
minutes: 7
---

Pretraining needs trillions of tokens. SFT, remarkably, can work with thousands of examples. The reason is that SFT is not teaching knowledge; it is selecting a behaviour the base model can already produce. A strong base model has seen countless question-answer pairs, tutorials and dialogues. SFT says "be that, consistently".

Because each example pulls the model toward its style, **every example is an instruction about how to behave**. A thousand excellent answers teach excellence. Ten thousand answers with a sprinkling of wrong facts, lazy refusals or inconsistent formatting teach the model that those are acceptable too. The LIMA study made this vivid: about 1,000 carefully curated examples were enough to turn a strong base model into a competitive assistant.

## How small SFT is, computed

```steps
The compute of a typical SFT run
A dataset of 50,000 examples averaging 600 tokens (prompt plus response), trained for 3 epochs: $50{,}000 \times 600 \times 3 = 9 \times 10^{7}$ tokens processed.
---
For a 7B model, $C \approx 6ND = 6 \times 7\times10^9 \times 9\times10^7 = 3.78 \times 10^{18}$ FLOPs.
---
Pretraining the same model on 2T tokens: $6 \times 7\times10^9 \times 2\times10^{12} = 8.4\times10^{22}$ FLOPs.
---
Ratio: $3.78\times10^{18} / 8.4\times10^{22} = 4.5\times10^{-5}$. SFT costs about 0.005% of pretraining. On 8 GPUs it is a matter of hours, which is why data work, not compute, is the bottleneck.
---
Steps: with a global batch of 64 examples, $50{,}000 \times 3 / 64 \approx 2{,}344$ optimizer steps.
```

(The FLOPs counted every token. With prompt masking, the backward pass still flows through prompt positions, so the compute is essentially the same; only the gradient signal is restricted to responses.)

## Where SFT data comes from

| Source | Strengths | Risks |
|---|---|---|
| Human-written demonstrations | Highest quality, matches your users | Slow and expensive; inconsistent between writers without guidelines |
| Existing task datasets reformatted as instructions | Broad task coverage, cheap | Short, templated answers; stilted style |
| Model-generated (synthetic) data | Scales easily, controllable | Copies the generating model's errors and quirks; licence terms of the generator |
| Logs from your product (with consent) | Real distribution of requests | Privacy; answers may be from an older, worse system |

**Synthetic data** deserves a closer look because it dominates modern SFT. Methods such as Self-Instruct generate new instructions from a few seed examples, then answers, then filter. The filtering is the important part: deduplicate (near-duplicate instructions are common), verify what can be verified (run generated code, check maths answers), and score the rest with a judge model or human spot checks.

## Measuring diversity

A dataset can be large and narrow. A cheap diagnostic is the fraction of near-duplicate pairs, using the same MinHash machinery as pretraining deduplication, and the spread of tasks. If you have $k$ task categories with counts $n_i$, the **entropy** of the category distribution

$$
H = -\sum_{i=1}^{k} q_i \log_2 q_i, \qquad q_i = \frac{n_i}{\sum_j n_j}
$$

measures balance: $H = \log_2 k$ when all categories are equal, lower when a few dominate. With four categories in shares $0.7, 0.1, 0.1, 0.1$: $H = -(0.7\log_2 0.7 + 3 \times 0.1 \log_2 0.1) = 0.360 + 0.997 = 1.357$ bits, against a maximum of $2$ bits for four equal categories. That number moves when you rebalance, which makes it a useful thing to track between dataset versions.

## In practice

The workflow that works: write clear guidelines for what a good answer looks like, build a few hundred gold examples by hand, generate or collect more, filter hard, deduplicate, hold out an evaluation set **from the same distribution** (and check it for overlap with training), then train and read many outputs before trusting any metric. Scaling to more examples helps only while quality holds. When a fine-tuned model has a bad habit (over-apologising, a fixed opening phrase), search the training data for it first: it is usually there.

```quiz
{"q": "An SFT set has 20,000 examples of 500 tokens each and is trained for 2 epochs on a 13B model. Approximately how many FLOPs is that?", "options": ["$1.56 \\times 10^{18}$", "$1.56 \\times 10^{19}$", "$2.6 \\times 10^{17}$", "$7.8 \\times 10^{18}$"], "answer": 0, "explain": "$D = 20{,}000 \\times 500 \\times 2 = 2\\times10^7$ tokens, so $6 \\times 1.3\\times10^{10} \\times 2\\times10^7 = 1.56\\times10^{18}$. $2.6\\times10^{17}$ uses the forward-only $2ND$ and forgets the second epoch; $7.8\\times10^{18}$ uses $10^{8}$ tokens, five times too many."}
```

```quiz
{"q": "You fine-tune on 5,000 synthetic examples and the model now starts most answers with 'Certainly! Here is'. What is the most likely cause and fix?", "options": ["The learning rate; lower it", "The phrase is common in the synthetic responses; find and rewrite or remove those openings in the data", "The base model is too small; use a larger one", "The chat template is wrong"], "answer": 1, "explain": "SFT imitates the style of its targets. A habit that appears in a large share of responses becomes the model's default. Fix the data; changing hyperparameters only changes how fast the habit is learned."}
```
