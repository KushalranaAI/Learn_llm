---
title: The full cost and risk of a fine-tune
minutes: 8
---

The break-even in the last topic counted money at launch. A fine-tuned model has a life afterwards, and that life has costs and risks that decide whether the project was a good idea. This topic walks through what happens in months 3 to 24.

## Total cost of ownership

The base model underneath your fine-tune will change. Providers retire model versions, open-weight bases are superseded, and your own data and requirements drift. Each time, you need to re-run the tuning and the evaluation. Include **retraining** in the cost model. Using the earlier example (one-time cost $C = \$9{,}100$, saving $\Delta c = \$0.008$, volume $V = 200{,}000$ per month, hosting $M = \$500$ per month) and adding a retraining every quarter at \$1,500:

$$
\text{TCO}(t) = C + t\,M + \left\lfloor \frac{t}{3} \right\rfloor R
$$

where $t$ is months, $R = \$1{,}500$ is the cost of one retraining and $\lfloor t/3 \rfloor$ is the number of quarters elapsed. The savings are $S(t) = t\,V\,\Delta c = 1{,}600\,t$.

| Months $t$ | TCO | Cumulative saving | Net position |
|---|---|---|---|
| 6 | $9{,}100 + 3{,}000 + 3{,}000 = \$15{,}100$ | \$9,600 | −\$5,500 |
| 12 | $9{,}100 + 6{,}000 + 6{,}000 = \$21{,}100$ | \$19,200 | −\$1,900 |
| 18 | $9{,}100 + 9{,}000 + 9{,}000 = \$27{,}100$ | \$28,800 | +\$1,700 |
| 24 | $9{,}100 + 12{,}000 + 12{,}000 = \$33{,}100$ | \$38,400 | +\$5,300 |

Spreading the retraining over the months adds \$500 a month, so the effective ongoing cost is \$1,000 a month and the net monthly saving is $1{,}600 - 1{,}000 = \$600$. Payback is $9{,}100/600 = 15.2$ months, almost double the 8.3 months found before retraining was counted. A project that looked like an 8-month win is a 15-month one, and is exposed to anything that shortens the model's useful life.

## Quality risks

Fine-tuning changes the whole model, not only the behaviour you targeted:

- **Regression elsewhere**: narrow training can degrade general abilities or other tasks (sometimes called catastrophic forgetting). Evaluate on tasks you did not train on.
- **Overfitting**: the model learns your examples rather than the skill. A rising training score with a flat or falling held-out score is the warning sign.
- **Leaked evaluation data**: if examples from the evaluation set (or near duplicates) enter training, the score is inflated. Split by source, not at random, and deduplicate.
- **Learned bad habits**: training on historical human replies teaches their errors, rudeness and outdated policy along with their style.
- **Safety drift**: alignment properties of the base model can weaken after further training, so repeat safety and red-team tests.

## Data you will need

For a behavioural fine-tune, examples in the low thousands often suffice, and quality matters more than quantity: a few hundred excellent, consistent examples beat tens of thousands of noisy ones. Practical requirements:

| Requirement | Why |
|---|---|
| Representative inputs | the tuned model sees the real distribution, including hard and odd cases |
| Consistent outputs | conflicting examples teach inconsistent behaviour |
| Reviewed labels | label noise puts a ceiling on quality |
| Separate held-out set | the only honest measure of the result |
| Personal data removed or approved | training data can be memorised and reproduced |
| Licence and consent checked | you must have the right to train on it |

## Choosing the method

Parameter-efficient methods train small adapter matrices instead of all weights. They cost far less, are quicker to iterate and can be swapped per use case, as the LoRA lesson in the training module explains. With full fine-tuning, you also store a complete model copy per variant. Most behaviour-tuning projects should start with an adapter method on a small or medium model.

## Operating a tuned model

```steps
Run a fine-tuned model responsibly
Version the training data, the code, the base model and the resulting weights together, so any version can be reproduced and compared.
---
Gate release on the evaluation set: the tuned model must beat the prompt baseline on target behaviour and not regress on general and safety checks.
---
Ship it through the rollout playbook: shadow, canary, guard metrics and a rollback to the untuned setup.
---
Monitor quality in production with sampled grading, and watch for drift as inputs change.
---
Calendar the next retraining and the base model's deprecation date, and keep the prompt-based fallback working.
```

Keep the **untuned fallback** alive: a good prompt on a stock model. It is your rollback path and your benchmark for whether the fine-tune is still earning its keep.

## In practice

The most reliable pattern is incremental: begin with prompts, add retrieval, route easy traffic to a small model, and fine-tune only for the specific behaviour that remains. Teams that fine-tune first often discover, a year later, that a better prompt and a cache would have captured most of the benefit, and they are left maintaining a model nobody wants to touch.

```quiz
{"q": "Using TCO(t) = C + tM + ⌊t/3⌋R with C = \\$5,000, M = \\$300 per month and R = \\$1,200 per quarter, what is the cost at 12 months?", "options": ["\\$13,400", "\\$8,600", "\\$8,000", "\\$14,600"], "answer": 0, "explain": "5,000 + 12 × 300 + 4 × 1,200 = 5,000 + 3,600 + 4,800 = \\$13,400. \\$8,600 leaves out the quarterly retraining."}
```

```quiz
{"q": "A fine-tuned model scores 96% on the training distribution but 78% on a held-out set from the same task. What is the most likely problem?", "options": ["Overfitting to the training examples", "The learning rate is too low", "The held-out set is too easy", "The model needs more layers"], "answer": 0, "explain": "A big gap between training and held-out performance is the signature of overfitting or of leakage in the other direction. A too-easy held-out set would make the held-out score higher, not lower."}
```
