---
title: Evaluating against gold responses, and sampling
minutes: 8
---

A falling loss says the model is getting better at predicting the reference answers token by token. It does not say the model answers questions. For that you have to let it generate, the way a user would see it, and compare what it writes with a **gold response**, the reference answer in your data. This is the last step of the loop: format a prompt, sample, cut the answer out, score it.

Scoring free text automatically is hard in general (the [Evaluation](/learn/evaluation/reference-scoring) module covers the options). For short factual answers like ours, two cheap metrics do most of the work: **exact match**, which asks whether the answer is the gold answer, and **token F1**, which gives partial credit for overlapping words.

## The metrics in the repo

`llm_from_scratch/part_6/evaluate.py` normalises both strings, then compares them:

```python
def _normalize(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9\s]", " ", s)      # punctuation becomes a space
    s = re.sub(r"\s+", " ", s).strip()
    return s

def exact_match(pred: str, gold: str) -> float:
    return float(_normalize(pred) == _normalize(gold))

def token_f1(pred: str, gold: str) -> float:
    p, g = _normalize(pred).split(), _normalize(gold).split()
    ...                                       # count overlap, each gold word used at most once
    prec = common / len(p)
    rec  = common / len(g)
    return 2 * prec * rec / (prec + rec)
```

With $c$ the number of overlapping words (a multiset intersection: a gold word can be matched only once), $|p|$ the predicted word count and $|g|$ the gold word count:

$$
P = \frac{c}{|p|}, \qquad R = \frac{c}{|g|}, \qquad F_1 = \frac{2PR}{P + R}
$$

**Worked examples**, each checked by running `evaluate.py`:

| Prediction | Gold | $c$ | $P$ | $R$ | F1 | EM |
|---|---|---|---|---|---|---|
| `Red.` | `red` | 1 | 1 | 1 | 1.0 | 1.0 |
| `The capital is Paris` | `Paris` | 1 | 1/4 | 1 | 0.4 | 0 |
| `the cat sat` | `a cat sat down` | 2 | 2/3 | 2/4 | 0.571 | 0 |
| `red blue and yellow` | `red, yellow and blue` | 4 | 1 | 1 | 1.0 | 0 |

For the second row: $F_1 = 2 \cdot 0.25 \cdot 1 / 1.25 = 0.4$. Normalisation makes `Red.` an exact match for `red`; F1 ignores word order, so the last row scores 1.0 without being an exact match. Both metrics are blind to meaning: "not red" against "red" scores F1 $= 0.67$.

## Sampling an answer

`llm_from_scratch/part_6/sample_sft.py` rebuilds the inference prompt with the training template and generates:

```python
prompt_text = format_prompt_only(args.prompt).replace('</s>', '')   # ends with '### Response:\n'
ids = col.encode(prompt_text)
idx = torch.tensor([ids], dtype=torch.long, device=device)           # (1, P)
with torch.no_grad():
    out = model.generate(idx, max_new_tokens=args.tokens,
                         temperature=args.temperature, top_k=3)      # (1, P + new)
```

Low temperature (0.2) and top-k of 3 keep it close to greedy: for a factual answer you want the single most likely continuation, not variety. Two things then need care before scoring.

**Stopping.** `generate` stops when it samples `eos_id=1`. With the BPE tokenizer `</s>` is id 1, so it stops on time. With the byte tokenizer `</s>` is four bytes, id 1 never appears, and generation runs to `max_new_tokens`. On the run from topic 5 the output for "First prime number" was `2</s>s>s>s>s>s>s>s>s`.

**Cutting.** `sample_sft.py` prints the decoded full sequence, prompt included. To score, keep only the new tokens and cut at the first `</s>`. Skip that and the metrics see garbage: normalised, the line above becomes `2 s s s s s s s s s`, which scores EM 0 and F1 0.18 against the gold "2" even though the answer is right.

The evaluation loop the repo leaves for you to write is short:

```python
def answer(q, max_new=40):
    ids = tok.encode(format_prompt_only(q).replace('</s>', '')).unsqueeze(0)  # (1, P)
    out = model.generate(ids, max_new_tokens=max_new, temperature=0.0, top_k=None)
    text = tok.decode(out[0, ids.size(1):])          # new tokens only
    return text.split('</s>')[0].strip()             # cut at the end marker

em = sum(exact_match(answer(q), g) for q, g in held_out) / len(held_out)
```

Run on the topic 5 checkpoint, it scores the three training questions 3 out of 3 on exact match, and three new questions 0 out of 3: "What does DNA stand for?" and "Which device shows north?" both get `compas>s>s...`, and "Name the first prime number" gets "red". A perfect training score next to a zero held-out score is the clearest possible picture of memorisation, and the reason you never report metrics on training examples.

## See it

```sim
sampling
{"temperature": 0.2, "topK": 3, "topP": 1}
```

This is the decoding setting `sample_sft.py` uses. Resample a few times and notice that the first token barely changes. Now raise the temperature to 1.2 and turn top-k off (0): the low-probability tail opens up. For scoring against a gold answer, that variance is noise. Keep evaluation decoding greedy or near-greedy and fixed across runs, or two checkpoints will differ by sampling luck rather than by quality.

## In practice

- **Score held-out data only**, ideally a set fixed before training starts, so a change in score means a change in the model.
- **Pick the metric for the answer type.** Exact match suits short factual answers and labels. Token F1 suits short spans. For open-ended responses (most of Alpaca), neither works well; teams use an LLM judge or human preference, which is where the [reward models](/learn/post-training/reward-models) of the next lesson start.
- **Report loss and metrics together.** Held-out masked loss is smooth and cheap to compute every few steps; generation metrics are noisy and slow but are what users experience. When they disagree, read the samples.
- **Rebuild the model from the saved config.** `sample_sft.py` builds the model from its own flags (default `--n_embd 256`), so loading the topic 5 checkpoint without repeating `--n_layer 2 --n_head 2 --n_embd 128` fails with a size mismatch. Reading `ckpt['config']` instead avoids that class of error.

```quiz
{"q": "Gold answer: `compass`. The model outputs `A compass.` What are exact match and token F1 under the repo's `evaluate.py`?", "options": ["EM 0, F1 0.67", "EM 1, F1 1.0", "EM 0, F1 0.5", "EM 0, F1 0"], "answer": 0, "explain": "Normalised, the prediction is `a compass` (2 words) and the gold is `compass` (1 word). Overlap $c = 1$, so $P = 1/2$, $R = 1$, $F_1 = 2 \\cdot 0.5 \\cdot 1 / 1.5 \\approx 0.67$. Normalisation removes the full stop and the capital but not the extra word 'a', so exact match is 0. 0.5 is the precision, not the F1."}
```

```quiz
{"q": "A byte-tokenizer SFT model answers 'First prime number' correctly, but your evaluation reports EM 0 for it. Which is the most likely cause?", "options": ["The model needs more training", "The scored text was not cut at the first `</s>`, so trailing generated bytes were included", "`exact_match` is case sensitive", "Top-k sampling changed the answer"], "answer": 1, "explain": "With bytes, `</s>` is not a single token, so `generate` never hits `eos_id` and keeps writing until `max_new_tokens`. The text after the end marker becomes extra words after normalisation. `exact_match` lowercases both strings, so case is not the problem, and the model's actual answer was right."}
```
