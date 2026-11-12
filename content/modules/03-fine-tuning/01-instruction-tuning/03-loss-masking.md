---
title: Loss masking, training only on the answer
minutes: 7
---

When you train on a prompt-response pair, the model makes a prediction at every position, including inside the prompt. Should it be graded on predicting the user's words? Usually not. We want a model that writes good answers, not one that gets better at guessing what users will type. Grading the prompt also wastes learning signal on text we did not write and often do not endorse (a user's typo-ridden question is not a style to imitate).

So SFT applies a **loss mask**: a 0/1 weight per token that switches the loss off for the prompt and on for the response. The forward pass still reads the whole sequence (the response must be conditioned on the prompt), but only response positions contribute to the gradient.

## The masked loss

For a tokenized example $x_1, \dots, x_T$ with mask $m_t \in \{0, 1\}$:

$$
\mathcal{L}_{\text{masked}} = -\frac{\sum_{t=1}^{T} m_t \log p_\theta(x_t \mid x_{<t})}{\sum_{t=1}^{T} m_t}
$$

$m_t = 1$ for tokens the model should learn to produce (assistant content and its end-of-turn token) and $m_t = 0$ for system, user and tool text and template markers that come from the user side. The denominator counts only the unmasked tokens, so the loss stays an average per trained token.

In code, frameworks implement this with a labels array in which masked positions get a special ignore value (in PyTorch, `-100`), which the cross-entropy function skips:

```python
import numpy as np

def masked_ce(token_probs, mask):
    """token_probs: probability the model gave each true token; mask: 1 = train on it."""
    nll = -np.log(np.asarray(token_probs))
    mask = np.asarray(mask, dtype=float)
    return (nll * mask).sum() / mask.sum()

probs = [0.10, 0.20, 0.05, 0.30, 0.10, 0.40,   # 6 prompt tokens
         0.60, 0.50, 0.90, 0.70]               # 4 response tokens
mask  = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1]
print(masked_ce(probs, mask))       # 0.4165
print(masked_ce(probs, [1] * 10))   # 1.2997
```

```steps
The same example, by hand
The response tokens have probabilities $0.6, 0.5, 0.9, 0.7$. Their negative logs are $0.511, 0.693, 0.105, 0.357$.
---
Masked loss: $(0.511 + 0.693 + 0.105 + 0.357)/4 = 1.666/4 \approx 0.417$ nats.
---
The prompt tokens have low probabilities ($0.10, 0.20, 0.05, 0.30, 0.10, 0.40$): user text is hard to predict. Their negative logs sum to about $11.33$.
---
Unmasked loss: $(11.33 + 1.666)/10 \approx 1.30$ nats. Without the mask, 87% of this example's loss, and therefore most of its gradient, would come from predicting the user's question.
```

## Multi-turn conversations

In a conversation with several assistant turns, every assistant turn is usually unmasked and every user turn masked, so one example trains several answers, each conditioned on the history before it.

| Segment | Mask |
|---|---|
| System prompt | 0 |
| User turn 1 | 0 |
| Assistant turn 1 (content + end token) | 1 |
| User turn 2 | 0 |
| Assistant turn 2 (content + end token) | 1 |

A variation trains only on the final assistant turn, useful when earlier turns came from a weaker model or contain mistakes you do not want imitated.

## A subtle choice: averaging over tokens or sequences

With a batch of examples you can pool all response tokens and divide once (**per-token** averaging), or average each example and then average the examples (**per-sequence**). They weight long answers differently.

Take two examples: a short answer of 10 tokens with mean loss 1.0 and a long one of 100 tokens with mean loss 0.5. Per-token: $(10 \times 1.0 + 100 \times 0.5)/110 = 60/110 \approx 0.545$. Per-sequence: $(1.0 + 0.5)/2 = 0.75$. Per-token averaging gives the long answer 91% of the weight. Neither is wrong, but it shapes behaviour (per-token favours learning from long answers), and with gradient accumulation the normalisation must be done over the whole accumulated batch, not each micro-batch, or the effective weighting changes silently.

## In practice

Masking the prompt is the default in almost every SFT library, usually by passing a flag or a data format that separates prompt and completion. Two checks are worth doing on every new dataset: print the decoded tokens with their mask values for one example, and confirm the end-of-turn token is unmasked. Training on prompts as well is sometimes useful for very small datasets of long, high-quality prompts, but it is the exception.

```quiz
{"q": "A sequence has 30 prompt tokens and 10 response tokens. The response tokens have negative log-probabilities summing to 5.0. What is the masked SFT loss?", "options": ["0.125 nats", "0.5 nats", "5.0 nats", "It depends on the prompt tokens' losses"], "answer": 1, "explain": "Only the 10 response tokens count: $5.0/10 = 0.5$. Dividing by all 40 tokens (0.125) mixes up the denominator; the masked loss does not depend on the prompt's losses at all."}
```

```quiz
{"q": "Why does the model still read the prompt tokens in the forward pass if their loss is masked?", "options": ["It does not; masked tokens are removed from the input", "Because the response predictions must be conditioned on the prompt; masking removes only their contribution to the loss", "To compute a second loss on the prompt", "Because masking only works during inference"], "answer": 1, "explain": "The mask applies to the loss, not to attention. Every response token attends to the prompt; that is how the model learns to answer this particular question. Removing the prompt would train it to answer nothing in particular."}
```
