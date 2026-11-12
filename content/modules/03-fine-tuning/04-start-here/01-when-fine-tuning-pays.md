---
title: When fine-tuning pays for itself
minutes: 7
---

```predict
{"q":"Prompting needs 3,000 tokens of examples per request at \\$0.50 per million input tokens. A \\$600 LoRA run makes them unnecessary. At 1 million requests a month, how long until the fine-tune pays for itself?","options":["Under two weeks","About six months","About three years","Never: prompting is always cheaper"],"answer":0,"reveal":"The examples cost \\$1,500 a month, so \\$600 is repaid in 0.4 months. At 10,000 requests a month the same run takes over three years: volume decides. The break-even calculation below does the arithmetic."}
```

A pretrained model already knows a great deal. You can steer it two ways. You can put instructions and examples in the **prompt**, which costs tokens on every request and changes nothing permanently. Or you can **fine-tune**: run more training on your own examples so the behaviour moves into the weights. Then the prompt can be short again.

Neither is better in general. Prompting is quick to change and needs no training run. Fine-tuning has an up-front cost (data, a GPU, an evaluation) but makes every later request cheaper and often more consistent. The decision is mostly arithmetic plus one question: is the thing you want a *behaviour* (a format, a tone, a skill) or *knowledge* (facts that change)? Fine-tuning is good at the first and poor at the second. New facts belong in the context at inference time, not in the weights.

## The break-even calculation

Suppose prompting needs $k$ worked examples of $t$ tokens each to reach the quality you want, on every request. With $R$ requests per month and an input price of $p$ per token, those examples cost

$$C_{\text{prompt}} = R \cdot k \cdot t \cdot p \quad \text{per month.}$$

A fine-tuned model drops the examples. If the run costs $F$ once (data work plus compute) and serving the tuned model adds $\Delta p$ per token on a request of $T$ tokens, its monthly cost is $R \cdot T \cdot \Delta p$, and the fine-tune pays for itself after

$$m^\ast = \frac{F}{C_{\text{prompt}} - R\,T\,\Delta p} \text{ months.}$$

**Worked example.** A classification feature needs $k = 20$ examples of $t = 150$ tokens to be reliable, so 3,000 extra input tokens per request. At $R = 1{,}000{,}000$ requests a month and $p = \$0.50$ per million tokens:

$$C_{\text{prompt}} = 10^6 \times 3000 \times 0.5 \times 10^{-6} = \$1{,}500 \text{ per month.}$$

A LoRA run plus a day of data cleaning costs about $F = \$600$. Serving the adapter on the same base model adds nothing per token ($\Delta p = 0$). Then $m^\ast = 600 / 1500 = 0.4$ months: it pays back in under two weeks. At $R = 10{,}000$ requests a month the examples cost only \$15 a month and payback takes over three years. At that volume, keep prompting.

```sim
token-cost
```

Set the prompt length to 3,000 tokens and the request volume to your own traffic. The monthly input cost the sim shows is $C_{\text{prompt}}$, the most a fine-tune can save you each month.

## Behaviour versus knowledge

| You want | Fine-tune? | Why |
|---|---|---|
| A fixed output format or schema, every time | Yes | A pattern repeated thousands of times is exactly what gradient descent learns well |
| A house tone or style | Yes | Hard to describe in words, easy to show in examples |
| A narrow skill (classification, extraction, a domain's jargon) | Often | Small models tuned on a narrow task can match much larger prompted ones |
| Facts that change (prices, policies, documents) | No | Weights go stale; put current facts in the context instead |
| Following a brand-new rule tomorrow | No | Editing a prompt takes minutes; retraining takes a run and an evaluation |

## In practice

Teams usually prompt first, because it gives a working baseline and, more importantly, an **evaluation set**: the inputs and expected outputs you will later use to judge the fine-tuned model ([Evaluation](/learn/evaluation/success-criteria) covers how). Fine-tune when the prompt has grown long and stable, the volume is high, or a smaller tuned model can replace a larger prompted one. The most common mistake is fine-tuning to inject knowledge. The model learns to *sound* like the documents without reliably recalling them, which makes hallucinations more confident, not less.

The rest of this module is hands-on, and every lesson runs on a laptop CPU, a free Colab GPU or a GPU rented for an hour:

| Lesson | What you do |
|---|---|
| [Set up your environment](/learn/fine-tuning/run-fine-tuning-yourself) | Pick CPU, Colab, Kaggle or a rental; install; run a first tiny fine-tune end to end |
| [SFT with LoRA, step by step](/learn/fine-tuning/sft-with-lora-step-by-step) | Prepare data, configure LoRA, train with TRL, judge the result, merge and share |
| [Preference optimization](/learn/fine-tuning/preference-optimization-methods) | RLHF, DPO, IPO, KTO, ORPO and SimPO: what each needs and how to run it |
| [GRPO hands-on](/learn/fine-tuning/grpo-hands-on) | Teach a small model to reason with verifiable rewards |
| [Fine-tuning embedding models](/learn/fine-tuning/fine-tuning-embedding-models) | Contrastive training, hard negatives, Matryoshka embeddings, measuring the gain |

The theory behind them is in [Instruction Tuning](/learn/fine-tuning/instruction-tuning), [LoRA and QLoRA](/learn/fine-tuning/peft-lora) and [Preference Tuning](/learn/fine-tuning/preference-tuning).

```quiz
{"q": "Prompting needs 2,000 extra tokens of examples per request. You serve 200,000 requests a month at \\$1 per million input tokens. A LoRA run costs \\$800 once and adds no serving cost. How long until it pays back?", "options": ["2 months", "0.5 months", "4 months", "It never pays back"], "answer": 0, "explain": "$C_{\\text{prompt}} = 200{,}000 \\times 2{,}000 \\times 10^{-6} = \\$400$ a month, so $800 / 400 = 2$ months. Getting 0.5 months comes from dividing the wrong way round (400 / 800)."}
```

```quiz
{"q": "A support bot must answer using the company's refund policy, which changes every quarter. What is the best way to give it that policy?", "options": ["Put the current policy in the context at request time", "Fine-tune on the policy document each quarter", "Fine-tune once on all past policies", "Raise the sampling temperature"], "answer": 0, "explain": "Changing facts belong in the context: it is current the moment you edit it, and the answer can be checked against the text. Fine-tuning every quarter is tempting but slow, goes stale between runs, and teaches the model to sound like the policy rather than reliably recall it."}
```
