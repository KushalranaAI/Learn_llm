---
title: Masked labels, the loss only on the answer
minutes: 9
---

In pretraining every position is graded: the model predicts each next token of the text and pays for every miss. In SFT we still run the model over the whole formatted example, because the answer must be conditioned on the question. But we only want to grade the answer. Training the model to predict the user's question would spend most of the gradient on text we did not write and do not want imitated.

PyTorch gives a cheap way to switch grading off per position. `F.cross_entropy` has an argument `ignore_index`, whose default value is **-100**. Any position whose label is -100 contributes nothing to the loss and is left out of the average. So masking needs no special loss function at all: build a label tensor, write -100 wherever you do not want a gradient, and pass it to the same `cross_entropy` call the pretraining loop used. The theory, including per-token versus per-sequence averaging, is in [Loss masking](/learn/fine-tuning/instruction-tuning/loss-masking). This topic is about getting the indices right by hand, which is where real bugs live.

## Shift first, then mask

`GPTModern.forward` does not shift anything. It compares `logits[:, t]` with `targets[:, t]` directly:

```python
loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1))  # ignore_index=-100 by default
```

So the label at position $t$ must already be the *next* token, exactly as in the pretraining batches of [Train a tiny GPT](/learn/model-foundations/train-a-tiny-gpt/batches-for-next-token-prediction), where `y` was `x` shifted left by one. In SFT the collator does that shift itself, then overwrites the prompt part with -100. With $x_0, \dots, x_{T-1}$ the token ids of the formatted example and $P$ the length of the prompt-only prefix:

$$
y_t =
\begin{cases}
-100 & t < P - 1 \quad\text{(the next token is still prompt)}\\
x_{t+1} & P - 1 \le t < T - 1 \quad\text{(the next token is answer or end marker)}\\
-100 & t = T - 1 \quad\text{(no next token exists)}
\end{cases}
$$

The loss is the mean negative log-probability over the set $S = \{t : y_t \neq -100\}$:

$$
\mathcal{L} = -\frac{1}{|S|} \sum_{t \in S} \log p_\theta(y_t \mid x_0, \dots, x_t)
$$

The boundary is the part people get wrong. Position $P-1$ holds the last prompt token (the `\n` after `### Response:`), and the thing it predicts is the first answer token. That position must be **unmasked**: it is the single most important prediction in the example.

## The worked example

For ('First prime number', '2') we counted $T = 60$ and $P = 55$ in topic 1. Then:

```steps
Labels for 'First prime number' → '2'
Shift: $y_t = x_{t+1}$ for $t = 0, \dots, 58$. Position 59 has no next token, so $y_{59} = -100$.
---
Mask the prompt: $y_t = -100$ for $t = 0, \dots, 53$, that is `range(P - 1)` = 54 positions.
---
What survives: $y_{54} = $ `'2'` (byte 50), then $y_{55..58} = $ `'<'`, `'/'`, `'s'`, `'>'` (bytes 60, 47, 115, 62). So $|S| = 5$.
---
Pad to `block_size`: positions 60 onwards get label -100 too. With `block_size=128` the row has $128 - 5 = 123$ entries equal to -100.
---
Running the repo's collator on this pair prints exactly that: unmasked label positions 54 to 58 with bytes 50, 60, 47, 115, 62, and 123 ignored labels.
```

Now suppose the model assigns these probabilities to the five correct labels: $0.20$ for `'2'`, then $0.90, 0.95, 0.98, 0.90$ for the four bytes of `</s>`. The negative logs are $1.609, 0.105, 0.051, 0.020, 0.105$, summing to $1.892$, so

$$
\mathcal{L} = \frac{1.892}{5} \approx 0.378 \text{ nats}.
$$

The single answer byte supplies $1.609 / 1.892 = 85\%$ of the loss. Masking it by mistake (the off-by-one that topic 3 asks you to find) would drop the loss to $0.281 / 4 \approx 0.07$ and look like great progress while teaching the model nothing about prime numbers.

## The code

The relevant lines of `llm_from_scratch/part_6/collator_sft.py`:

```python
prefix_text = format_prompt_only(prompt).replace('</s>', '')   # up to '### Response:\n'
text = format_example(Example(prompt, response))
ids = self.encode(text)[:self.block_size]                       # T tokens
prompt_ids = self.encode(prefix_text)[:self.block_size]         # P tokens
n_prompt = min(len(prompt_ids), len(ids))
x = ids
y = ids.copy()
for t in range(len(y) - 1):
    y[t] = ids[t + 1]          # shift left by one
y[-1] = -100                   # last position: nothing to predict
for i in range(n_prompt - 1):
    y[i] = -100                # targets that are still prompt
```

The shift loop is the same thing as `y = ids[1:] + [-100]`. The order is forced: mask after shifting, or the shift overwrites the -100 values.

One assumption hides in `prompt_ids`. The prefix is tokenized separately from the full text, and the code assumes the first $P$ tokens of the full text are the prefix tokens. With bytes that is always true. With BPE it holds here because the prefix ends in `\n`, which the byte-level pre-tokenizer splits off on its own (a check with a trained BPE confirms the prefix ids match the start of the full ids). If a template ended in a space, BPE could merge it with the first answer word and $P$ would be off by one.

```parsons
{"title": "Build the shifted, masked labels for one example", "lines": ["for prompt, response in batch:", "    ids = col.encode(format_example(Example(prompt, response)))[:block_size]", "    y = ids[1:] + [-100]                # shift left; the last position has no target", "    n_prompt = min(len(col.encode(format_prompt_only(prompt).replace('</s>', ''))), len(y))", "    for i in range(n_prompt - 1):", "        y[i] = -100                     # the target is still prompt text", "    labels.append(y)"], "explain": "Encode the full example, shift it to get next-token labels, measure the prompt prefix, then overwrite the first `n_prompt - 1` labels with -100. Masking must come after the shift: done the other way round, the shift copies real token ids back over the -100 values. The loop stops at `n_prompt - 1` so that the last prompt position, whose target is the first answer token, is still trained."}
```

## In practice

- **Always print one row.** Decode the tokens whose label is not -100 and read them. For our pair you should see exactly `2</s>`. If you see `</s>` alone, the boundary is off by one; if you see the question, the mask is missing.
- **Check the denominator.** `cross_entropy` averages over unmasked positions in the whole batch, so a batch with 23 supervised tokens and one with 230 produce losses on the same scale but gradients built from very different amounts of evidence.
- **The end marker is trained on purpose.** It is the only way the model learns to stop. Some codebases mask it by accident because it is "template"; their models then ramble.

```quiz
{"q": "An example has $T = 78$ tokens and a prompt prefix of $P = 71$ tokens. After the repo's shift and mask, how many labels are not -100 (before padding)?", "options": ["7", "6", "8", "71"], "answer": 0, "explain": "Unmasked positions run from $P - 1 = 70$ to $T - 2 = 76$, which is $76 - 70 + 1 = 7$ labels: the three bytes of 'red' plus the four bytes of `</s>`. 6 is what you get if you also mask position $P-1$ (the off-by-one bug), which loses the first answer token."}
```

```quiz
{"q": "Why does the collator set `y[-1] = -100` even though the last token of the example is part of the answer?", "options": ["The last token is the end marker, which should not be trained", "The label at position $t$ is the token at $t+1$, and after the last token there is nothing to predict", "It saves memory", "To stop the model from attending to padding"], "answer": 1, "explain": "After the shift, position $T-1$ would need token $T$, which does not exist. The end marker itself is still trained: it is the label at position $T-2$. Thinking the end marker is being masked is the tempting misreading."}
```
