---
title: Measuring a student and the break-even point
minutes: 6
---

A distilled model is only worth shipping if it is good enough and the saving repays the cost of making it. Both are measurable, and the arithmetic is short.

## Three ways to compare student and teacher

| Metric | What it measures | Computed on |
|---|---|---|
| Held-out KL | How closely the student's distributions track the teacher's | Held-out text, per token |
| Top-1 agreement | How often both pick the same most likely token | Held-out text, per token |
| Task score retained | $\text{score}_S / \text{score}_T$ on the real task | Your evaluation set |

The first two are proxies you can compute cheaply during training; the third is what matters. A student can have a low KL on average text and still fail on the rare formats your product depends on, so always finish with task-level evaluation.

```python
import numpy as np

def kl(p, q, eps=1e-12):
    p, q = np.asarray(p), np.asarray(q)
    return float(np.sum(p * (np.log(p + eps) - np.log(q + eps))))

teacher = [[0.7, 0.2, 0.1], [0.5, 0.4, 0.1], [0.9, 0.05, 0.05]]
student = [[0.6, 0.3, 0.1], [0.3, 0.5, 0.2], [0.8, 0.1, 0.1]]

kls = [kl(p, q) for p, q in zip(teacher, student)]
agree = np.mean([np.argmax(p) == np.argmax(q) for p, q in zip(teacher, student)])
print([round(k, 3) for k in kls], round(float(np.mean(kls)), 3), agree)
# per-position KL [0.027, 0.097, 0.037], mean 0.053, top-1 agreement 0.667
```

Run it by hand for the first position: $0.7\ln(0.7/0.6) + 0.2\ln(0.2/0.3) + 0.1\ln(0.1/0.1) = 0.1079 - 0.0811 + 0 = 0.0268$ nats. For the second, the student ranks the second token first, so top-1 disagrees there; two of three positions agree, giving $2/3 \approx 0.667$.

## Quality retained

If the teacher scores $85\%$ on your evaluation set and the student $78\%$, the student retains $78/85 = 91.8\%$ of the teacher's quality. A same-size model trained without distillation might retain, say, $70/85 = 82\%$. The 10-point gap is the benefit of distillation. Set your acceptance bar in advance, by cost of errors: a 92% retention may be fine for drafting emails and unacceptable for medication advice.

## Break-even: when does the cost pay back?

Making the student costs a one-off $C_{\text{build}}$ FLOPs (or its dollar equivalent). Each token served by the student instead of the teacher saves about $2(N_T - N_S)$ FLOPs.

$$
D_{\text{break-even}} = \frac{C_{\text{build}}}{2\,(N_T - N_S)}
$$

```steps
Break-even for the 70B to 8B example
Build cost from the earlier worked example: $C_{\text{build}} \approx 1.9\times10^{20}$ FLOPs (1B-token distillation).
---
Saving per served token: $2 \times (70 - 8)\times10^9 = 1.24\times10^{11}$ FLOPs.
---
Break-even: $1.9\times10^{20} / 1.24\times10^{11} \approx 1.5\times10^{9}$ tokens, about 1.5 billion served tokens.
---
A service handling 200 million tokens a day reaches break-even in about 8 days. After that, every token is a saving, minus the quality you gave up and the cost of evaluation, data work and engineering time, which in practice dominate this FLOP-only estimate.
```

This estimate counts compute only. Real decisions also weigh latency (the student answers faster), the hardware tier you can use (an 8B model fits one cheap GPU; a 70B needs several), and the monthly cost of keeping a team's attention on a second model.

## In practice

Track student quality against the teacher on a fixed evaluation set at every checkpoint, plus a handful of hand-picked hard cases. When the student is close but not close enough, the usual levers are more or better teacher data (especially for the failing categories), a longer distillation run, a larger student, or routing: keep the teacher for the hardest slice.

```quiz
{"q": "A teacher scores 90% and a student 81% on the evaluation set. What fraction of the teacher's quality does the student retain?", "options": ["81%", "90%", "9%", "10%"], "answer": 1, "explain": "$81/90 = 0.90$. The student is 9 points lower in absolute terms, but retains 90% of the teacher's score in relative terms; keep the two framings separate."}
```

```quiz
{"q": "A distilled 8B model replaces a 70B teacher. The build cost is $1.24\\times10^{20}$ FLOPs and each served token saves $1.24\\times10^{11}$ FLOPs. After how many served tokens does it break even on compute?", "options": ["$10^9$", "$10^{11}$", "$10^{20}$", "$10^{31}$"], "answer": 0, "explain": "$1.24\\times10^{20} / 1.24\\times10^{11} = 10^{9}$ tokens. Multiplying instead of dividing gives the absurd $10^{31}$."}
```
