---
title: Temperature-softened KL, the distillation loss
minutes: 8
---

A well-trained teacher is usually very confident: it puts $0.99$ on one token and scatters tiny numbers over the rest. Those tiny numbers hold the dark knowledge, but cross-entropy barely notices them. The fix, from Hinton et al. (2015), is to **soften** both distributions with a **temperature** $T > 1$ before comparing them, which inflates the small probabilities.

## In everyday life

Imagine a night photo where one street lamp blazes and everything else looks black. Two such photos can look identical, even though the dim shapes in the shadows, a parked scooter or a tree, are different. To compare them properly, you would first brighten both by the same amount.

A well-trained teacher model is often like that photo. It is so sure of one next word that it gives it nearly all the **probability** (the model's score for how likely a word is), and every other word gets a tiny leftover. Those tiny scores hold the useful hints. **Temperature** is the brightness knob: turning it up spreads the probabilities out so the small ones become visible, without changing which word ranks first. Teacher and student are brightened by the same amount.

Then you need a score for how different the two are. **KL divergence** is that score. It is zero when the student matches the teacher exactly and grows as they drift apart. Brightening makes the differences small, so the score is scaled back up to stay noticeable.

The photo is only a picture of the idea: the model brightens lists of numbers, not images.

**Where you meet it.** A team shrinking a large model to serve it more cheaply trains the small one with this loss. Without the brightening step, the student mostly copies the teacher's top word and misses the near misses that carry the teacher's judgement.

```scene
title: Brighten the shadows, then compare
step: 📸 A night photo shows one bright lamp and an almost black street | confident teacher, one token near certain
step: 🛵 Faint shapes in the shadows hold details but are too dim to compare | tiny probabilities carry dark knowledge
step: 🔆 You brighten both photos by the same amount | temperature softens both distributions
step: 🔍 You compare the two brightened photos spot by spot | KL divergence
step: 🎚️ Brightening shrinks differences, so you scale the score back up | multiplying the loss by T squared
takeaway: Softening both distributions lets the student learn from the teacher's small probabilities, and KL scores the gap.
```

## The ingredients

For logits $z$, the temperature-$T$ softmax is

$$
p_i^{(T)} = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}
$$

$T = 1$ is the ordinary softmax; larger $T$ flattens the distribution. The **KL divergence** from the teacher distribution $p$ to the student $q$ measures how much extra information, in nats, you waste by coding samples from $p$ with a code designed for $q$:

$$
\mathbb{D}_{\text{KL}}(p \,\|\, q) = \sum_i p_i \log \frac{p_i}{q_i} \;\geq\; 0
$$

It is $0$ only when $q = p$. The distillation loss compares softened distributions and multiplies by $T^2$:

$$
\mathcal{L}_{\text{KD}} = T^2 \cdot \mathbb{D}_{\text{KL}}\!\left(p_{\text{teacher}}^{(T)} \,\big\|\, p_{\text{student}}^{(T)}\right)
$$

Why $T^2$? Softening shrinks gradients roughly in proportion to $1/T^2$, so multiplying by $T^2$ keeps the soft-target term at a comparable scale to the hard-label loss as you change $T$. Without it, raising $T$ would silently switch off the distillation term.

## Worked example

Teacher logits $z_t = (4, 2, 0)$ and student logits $z_s = (3, 2, 1)$ over a three-token vocabulary.

```steps
Distillation loss at T = 1 and T = 2
At $T = 1$: teacher $p = (0.867, 0.117, 0.016)$; student $q = (0.665, 0.245, 0.090)$. (For example, $e^4 = 54.6$, $e^2 = 7.39$, $e^0 = 1$; the sum is $63.0$ and $54.6/63.0 = 0.867$.)
---
$\mathbb{D}_{\text{KL}} = 0.867\ln\frac{0.867}{0.665} + 0.117\ln\frac{0.117}{0.245} + 0.016\ln\frac{0.016}{0.090} \approx 0.229 - 0.086 - 0.028 \approx 0.116$ nats. The student is under-confident on the top token and over-weights the tail.
---
At $T = 2$: divide logits by 2 to get $(2, 1, 0)$ and $(1.5, 1, 0.5)$. Teacher $p^{(2)} = (0.665, 0.245, 0.090)$; student $q^{(2)} = (0.506, 0.307, 0.186)$. Now the tail has real mass.
---
$\mathbb{D}_{\text{KL}} \approx 0.0603$ nats; with the scale factor, $T^2 \times 0.0603 = 4 \times 0.0603 = 0.241$. At $T = 4$ the raw KL falls to $0.019$ but the scaled loss is $0.306$, close to $T=2$: the scale keeps the term from vanishing.
```

(Notice that the teacher's softened distribution at $T = 2$ equals the student's ordinary distribution at $T = 1$: a coincidence of the chosen logits.)

## The full training loss

In practice distillation is combined with the ordinary hard-label loss:

$$
\mathcal{L} = \lambda\, \mathcal{L}_{\text{KD}} + (1 - \lambda)\, \mathcal{L}_{\text{CE}}, \qquad \mathcal{L}_{\text{CE}} = -\log q_{y}^{(1)}
$$

with $y$ the true token and the cross-entropy computed at $T = 1$. For this example with $y$ = the first token, $\mathcal{L}_{\text{CE}} = -\ln 0.665 = 0.408$. With $\lambda = 0.5$ and $T = 2$: $0.5 \times 0.241 + 0.5 \times 0.408 = 0.324$. For LLM pretraining-style distillation, $\lambda$ is often 1 or close to it, because the teacher's distribution already reflects the data. At inference the student uses the usual temperature $T = 1$.

## Direction matters

KL is not symmetric. The loss above, $\mathbb{D}_{\text{KL}}(p_{\text{teacher}} \| q_{\text{student}})$ (**forward KL**), punishes the student heavily wherever the teacher has mass and the student does not, so the student spreads its probability to **cover** all the teacher's modes. A small student that cannot represent everything may then put mass on poor in-between continuations. **Reverse KL**, $\mathbb{D}_{\text{KL}}(q \| p)$, instead lets the student concentrate on the teacher's main modes and ignore the rest (**mode-seeking**). Some on-policy methods for LLMs use reverse or blended divergences for this reason.

```quiz
{"q": "At temperature 1 a teacher has probabilities $(0.7, 0.2, 0.1)$ and a student has exactly the same. What are $\\mathbb{D}_{\\text{KL}}$ and the distillation loss?", "options": ["0 and 0", "0.116 and 0.116", "$\\ln 3$ and $\\ln 3$", "Undefined"], "answer": 0, "explain": "KL is zero when the two distributions are identical, whatever $T$ and whatever the scaling factor. The loss only becomes positive when the student differs from the teacher."}
```

```quiz
{"q": "Why is the soft-target loss multiplied by $T^2$?", "options": ["To make the student more confident", "Gradients through a temperature-$T$ softmax scale roughly as $1/T^2$; the factor keeps the soft loss comparable to the hard-label loss as $T$ changes", "To convert nats to bits", "It is required for KL to be non-negative"], "answer": 1, "explain": "Without the factor, increasing $T$ would shrink the distillation term's gradient and effectively turn it off. The $T^2$ compensates, as shown by Hinton et al."}
```
