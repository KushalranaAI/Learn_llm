---
title: What SFT cannot fix, forgetting and new facts
minutes: 6
---

SFT is the most accessible adaptation technique, so it gets asked to do everything: teach a model the company's product catalogue, fix its maths, make it stop hallucinating. Some of these it does well. Some it does badly, and one of them it can make worse.

A helpful mental model: pretraining builds a library; SFT trains the librarian. Training the librarian to answer politely, in a set format, about a set range of topics works well. Handing the librarian three new books once and expecting them to quote every page does not.

## Behaviour is cheap, knowledge is expensive

During pretraining a fact that appears many times across varied documents is stored robustly. In SFT a fact might appear in one or two examples. The model can learn to reproduce that exact answer to that exact question, but generalising it (answering the same fact asked differently, combining it with other facts) is unreliable.

Worse, a study of fine-tuning on facts the model did not already know (Gekhman et al., 2024) found that such examples are learned slowly and that, once learned, they **increase hallucination** on other questions. The intuition: training the model to state confidently an answer it had no basis for teaches it that confident answers without knowledge are what is wanted.

| Goal | Does SFT work? | Better tool |
|---|---|---|
| Output format, tone, structure | Yes, very well | SFT (or just prompting) |
| A narrow task (classify, extract, rewrite) | Yes | SFT, often with LoRA |
| Refusing or redirecting certain requests | Yes, with care | SFT plus preference tuning |
| Up-to-date or private facts | Poorly | Retrieval (RAG, module 06) |
| General reasoning ability | Somewhat, with lots of high-quality data | Better base model, RL on verifiable tasks |

## Catastrophic forgetting, quantified

Fine-tuning moves weights that were serving other skills. Narrow SFT can degrade general abilities, an effect called **catastrophic forgetting**. Measure it, do not guess: keep a fixed general evaluation suite and compare before and after.

$$
\Delta_{\text{general}} = s_{\text{after}} - s_{\text{before}}, \qquad \Delta_{\text{task}} = t_{\text{after}} - t_{\text{before}}
$$

where $s$ is the general-suite score and $t$ the target-task score. A fine-tune is a success when $\Delta_{\text{task}}$ is large and $\Delta_{\text{general}}$ is near zero (or acceptably small for your product).

```steps
Using replay data to limit forgetting
A narrow SFT on legal summaries lifts the task score from 0.55 to 0.80 ($\Delta_{\text{task}} = +0.25$) but drops a general suite from 0.70 to 0.62 ($\Delta_{\text{general}} = -0.08$).
---
Remedy: mix in **replay** data, general instruction examples, at 20% of the training mix. With 10,000 legal examples, that means adding $10{,}000 \times 0.2/0.8 = 2{,}500$ general examples so they make up $2{,}500/12{,}500 = 20\%$.
---
Re-run: suppose the task score is 0.78 and the general score 0.69. You traded 0.02 of task gain to recover 0.07 of general ability: usually a good deal.
---
Other levers: lower learning rate, fewer epochs, or LoRA, which changes fewer parameters and tends to forget less (at the cost of learning somewhat less).
```

## In practice

Before fine-tuning, ask which problem you have. If the model does not know something, retrieval is usually cheaper and more reliable. If it knows but does not behave the way you want, SFT is the right tool. If you must fine-tune on new facts, prefer examples the model can ground (include the source passage in the prompt), add examples where the right answer is "I don't know", and track hallucination on held-out questions alongside task accuracy.

```quiz
{"q": "You want 20% of your SFT mix to be general replay data and you have 6,000 task examples. How many general examples do you add?", "options": ["1,200", "1,500", "4,800", "7,500"], "answer": 1, "explain": "If general examples are 20% of the total, task examples are 80%: total $= 6{,}000/0.8 = 7{,}500$, so add $7{,}500 - 6{,}000 = 1{,}500$. 1,200 is 20% of 6,000, which would make general data only $1{,}200/7{,}200 \\approx 16.7\\%$ of the mix."}
```

```quiz
{"q": "A team fine-tunes a model on 500 Q&A pairs about this quarter's new products, facts the model has never seen. What is the most likely outcome?", "options": ["It reliably answers any question about the new products", "It repeats the trained answers to near-identical questions but generalises poorly, and may hallucinate more elsewhere; retrieval would serve better", "Its general abilities improve", "Nothing changes because SFT cannot change weights"], "answer": 1, "explain": "A handful of exposures to new facts gives brittle recall and can teach confident answering without grounding. Putting the product information in the context with retrieval gives fresh, citable answers without retraining."}
```
