---
title: Exact match and normalisation
minutes: 6
---

```callout-before
Before you start
This lesson assumes each eval example has a **reference**: an answer written by a person that counts as correct. Lesson 3 handles the many tasks where no single reference exists.
```

The simplest way to score an answer against a reference is to ask whether they are the same. For short factual answers ("What year did the Berlin Wall fall?", "Which plan includes SSO?") that is often exactly what you want. **Exact match (EM)** gives 1 if the output equals the reference and 0 otherwise.

The trouble is that "equal" is very strict. "1989", "1989.", " 1989" and "In 1989" are all correct, and a naive string comparison rejects three of them. So exact match is never applied to raw strings. Both sides first go through **normalisation**: a fixed set of transformations that removes differences you have decided not to care about.

## The maths: EM after a normalising function

Let $\nu$ be the normalisation function, applied to both the prediction $\hat y$ and the reference $y$. Then

$$
\mathrm{EM}(\hat y, y) = \mathbb{1}\big[\nu(\hat y) = \nu(y)\big], \qquad \mathrm{EM}_{\text{set}} = \frac{1}{n}\sum_{i=1}^{n} \mathrm{EM}(\hat y_i, y_i)
$$

where $\mathbb{1}[\cdot]$ is 1 when the condition holds and 0 otherwise. When several references are acceptable (say "NYC" and "New York City"), take the best: $\max_j \mathrm{EM}(\hat y, y_j)$.

A common $\nu$ for English question answering: lowercase, strip punctuation, drop the articles *a*, *an*, *the*, and collapse whitespace.

```steps
Normalising one pair
Prediction: "The Treaty of Versailles." Reference: "treaty of versailles".
---
Lowercase: "the treaty of versailles." and "treaty of versailles".
---
Strip punctuation: "the treaty of versailles" and "treaty of versailles".
---
Drop articles and collapse spaces: "treaty of versailles" and "treaty of versailles". Equal, so EM $= 1$. Without normalisation it would have been 0.
```

## Where exact match breaks

```sim
metric-compare
{"pair": "case", "normalise": false}
```

The simulation starts on the pair "Ada Lovelace" vs "ada lovelace." with normalisation switched off: exact match is 0. Switch **Normalise text** on and it becomes 1. Then choose the *Paraphrase* pair: no normaliser can rescue a correct answer worded differently, so EM stays 0. Finally pick *Custom* and type the reference "1989" with the answer "It fell in 1989": still 0, although the answer is right.

| Prediction | Reference | EM after $\nu$ | Actually correct? |
|---|---|---|---|
| 1989 | 1989 | 1 | yes |
| In 1989 | 1989 | 0 | yes |
| nineteen eighty-nine | 1989 | 0 | yes |
| 1,200 dollars | 1200 | 0 (the comma goes, the word stays) | yes |
| 30 days | 30 | 0 | yes |
| 1998 | 1989 | 0 | no |

The pattern: EM has essentially no **false passes** (if it says 1, the answer is right, as long as the reference is right) but many **false fails**. In precision/recall terms from lesson 1, treating EM as a detector of correct answers gives high precision and low recall.

## Making EM useful

Three habits make exact match work much better:

1. **Constrain the output.** Ask the model for just the answer in a fixed format (`{"year": 1989}`), or extract the answer field with a parser before comparing. Structured outputs turn a fuzzy text comparison into a field comparison.
2. **Normalise by type.** For numbers, parse to a number and compare with a tolerance ($|\hat y - y| \le \epsilon$); for dates, parse to ISO format; for names, keep a list of aliases.
3. **Allow several references.** Write all acceptable forms when you build the eval set.

```python
import re, string

def normalise(s: str) -> str:
    s = s.lower()
    s = "".join(ch for ch in s if ch not in string.punctuation)
    s = re.sub(r"\b(a|an|the)\b", " ", s)
    return " ".join(s.split())

def exact_match(pred: str, refs: list[str]) -> int:
    return max(int(normalise(pred) == normalise(r)) for r in refs)

print(exact_match("The Treaty of Versailles.", ["treaty of versailles"]))  # 1
print(exact_match("In 1989", ["1989"]))                                    # 0
```

## In practice

Exact match is the right default for classification labels, multiple-choice letters, extracted IDs, and any field in a structured output. It is the wrong metric for free-form answers, where it will report a correct model as failing. If your EM score is surprisingly low, read 20 failures before changing the model: often half of them are normalisation gaps, and fixing $\nu$ moves the score more than any prompt change.

```quiz
{"q": "With the normaliser above (lowercase, strip punctuation, drop articles), what is EM for the prediction \"An apple.\" against the reference \"apple\"?", "options": ["0, because of the article", "1", "0, because of the full stop", "0.5"], "answer": 1, "explain": "Lowercase gives \"an apple.\", stripping punctuation gives \"an apple\", dropping articles gives \"apple\", which equals the reference. EM is binary, so 0.5 is never possible."}
```

```quiz
{"q": "On a free-form QA set, EM reports 41% while careful human grading reports 83%. What does this most likely indicate?", "options": ["The humans are too lenient", "EM has many false fails on correct but differently worded answers", "EM has many false passes", "The model is overfitting"], "answer": 1, "explain": "EM almost never credits a wrong answer, so the gap is correct answers it rejects. Constrain the output format or use token F1 or a judge for free-form answers."}
```
