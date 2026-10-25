---
title: "Token-level F1: partial credit for overlap"
minutes: 7
---

Exact match is all or nothing. If the reference is "Paris, France" and the model says "Paris", EM gives 0 even though the answer is mostly right. **Token-level F1** gives partial credit by treating each answer as a bag of words and asking how much the two bags overlap.

It reuses the precision and recall idea from lesson 1, now at the level of words. The predicted words are the "claims"; the reference words are the "truth". **Token precision** is the share of predicted words that appear in the reference. **Token recall** is the share of reference words that appear in the prediction. Their harmonic mean is the token F1.

## The maths

Normalise both strings (lowercase, strip punctuation, drop articles), split into tokens, and treat each as a **multiset** (a bag where repeats count). Let $\hat T$ be the prediction's tokens and $T$ the reference's, and let the overlap be the multiset intersection, where each word counts the minimum number of times it appears in either:

$$
\text{overlap} = \sum_{w} \min\big(c_{\hat T}(w),\, c_T(w)\big)
$$

with $c_{\hat T}(w)$ the count of word $w$ in the prediction. Then

$$
P = \frac{\text{overlap}}{|\hat T|}, \qquad R = \frac{\text{overlap}}{|T|}, \qquad F_1 = \frac{2PR}{P+R}
$$

where $|\hat T|$ and $|T|$ are the token counts. If the overlap is 0, $F_1 = 0$.

```steps
Two predictions, one reference
Reference: "Paris, France" → tokens $\{paris, france\}$, $|T| = 2$.
---
Prediction A: "Paris" → $\{paris\}$. Overlap 1. $P = 1/1 = 1.0$, $R = 1/2 = 0.5$, $F_1 = 2(1.0)(0.5)/1.5 = 0.667$.
---
Prediction B: "The Eiffel Tower is in Paris" → after normalising, $\{eiffel, tower, is, in, paris\}$, $|\hat T| = 5$. Overlap 1 (just *paris*).
---
$P = 1/5 = 0.2$, $R = 1/2 = 0.5$, $F_1 = 2(0.2)(0.5)/0.7 = 0.286$.
---
Both answers name the right city. B is penalised for its extra words, which is token F1's built-in preference for concise answers.
```

When several references exist, take the maximum F1 over them, exactly as with exact match.

```python
from collections import Counter

def token_f1(pred: str, ref: str) -> float:
    p, r = normalise(pred).split(), normalise(ref).split()  # normalise() from the exact-match topic
    overlap = sum((Counter(p) & Counter(r)).values())
    if overlap == 0:
        return 0.0
    prec, rec = overlap / len(p), overlap / len(r)
    return 2 * prec * rec / (prec + rec)

print(round(token_f1("The Eiffel Tower is in Paris", "Paris, France"), 3))  # 0.286
```

## See where it helps and where it lies

```sim
metric-compare
{"pair": "wrongday", "normalise": true}
```

The simulation opens on a wrong answer: Tuesday instead of Thursday. Token F1 is high because every other word matches. Switch to *Paraphrase* and *Synonyms* to see the opposite failure: correct answers with low F1. These are the two cases that stop token F1 being a correctness metric:

- **Wrong answer, high F1.** Reference "the meeting moved to Thursday 3 pm"; prediction "the meeting moved to Tuesday 3 pm". After dropping "the", five of six tokens overlap ($P = R = 5/6$, $F_1 = 0.83$), but the one token that matters is wrong.
- **Right answer, low F1.** Reference "No"; prediction "That is not permitted under the policy". Overlap 0, $F_1 = 0$, yet the meaning is identical.

Token F1 measures **lexical overlap**, which correlates with correctness only when answers are short spans copied from a source document, as in extractive question answering. That is the setting it was designed for.

| Situation | EM | Token F1 | Verdict |
|---|---|---|---|
| Short span, same words | 1 | 1.0 | both fine |
| Correct but extra words | 0 | 0.3–0.7 | F1 better |
| One crucial word wrong (date, number, "not") | 0 | high | F1 misleading |
| Paraphrase with different words | 0 | low | both miss it |

## In practice

Use token F1 for extractive tasks (copying a span from a document), for short answers where wording varies slightly, and as a cheap secondary signal. Do not use it alone for generative answers, and never let it judge numbers, dates or negations: check those fields with exact or numeric comparison. Reporting EM and F1 together is informative: a large gap between them tells you answers are roughly right but wordy or differently phrased.

```quiz
{"q": "Reference: \"red and blue\". Prediction: \"blue red green\". After normalising (articles are not involved), what is token F1?", "options": ["0.67", "0.80", "0.50", "0.57"], "answer": 0, "explain": "Reference tokens {red, and, blue} (3), prediction {blue, red, green} (3), overlap 2. $P = R = 2/3$, so $F_1 = 2/3 \\approx 0.67$. Word order does not matter in a bag-of-words metric."}
```

```quiz
{"q": "Which error is token F1 most likely to miss?", "options": ["An answer padded with irrelevant words", "An answer that changes 'is eligible' to 'is not eligible' in an otherwise identical sentence", "An empty answer", "An answer in a different language"], "answer": 1, "explain": "Inserting 'not' into a 10-word sentence leaves all 10 reference words matched: $R = 1$, $P = 10/11$, $F_1 \\approx 0.95$, while the meaning flips. Padding, empty answers and other languages all reduce F1 noticeably."}
```
