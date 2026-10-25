---
title: "Deep dive: confidence and validation"
minutes: 9
---

Extraction accuracy is never 100%, so the system needs to know **which** outputs to distrust. That is the job of confidence and validation. Confidence is a score attached to each extracted field; validation is a set of deterministic checks that catch errors a score cannot see. Together they decide which documents go to a person, which, as the next topic shows, is where most of the money goes.

## Why per-field accuracy hides the real problem

An invoice has 12 header fields. If each is right 97% of the time, independently, the chance the whole document is right is

$$
P(\text{document correct}) = a^{F} = 0.97^{12} \approx 0.694
$$

where $a$ is per-field accuracy and $F$ the number of fields. Almost one document in three (30.6%) has at least one wrong field, although each individual field "looks" 97% accurate. The business cares about records, not fields, so quote both numbers and know which one a requirement means. This is also why the target "under 1% of records wrong" is demanding: it needs far better than 97% per field, or a filter in front of the database.

## Sources of field confidence

| Signal | How computed | Strength | Weakness |
|---|---|---|---|
| Token probabilities | Geometric mean or minimum of the probabilities of the tokens in the field's value | Cheap, one call | Models are over-confident; some APIs do not expose it |
| Self-consistency | Extract 2 to 3 times (different prompts or temperature) and compare | Catches unstable fields | Multiplies cost by 2 to 3 |
| OCR confidence | The engine's per-word score | Flags unreadable regions | Says nothing about the model's reading |
| Evidence check | Quoted text is found in the OCR text | Catches hallucination | Passes if the OCR itself misread |
| Cross-model agreement | A second model reads the same field | Independent errors | Cost, latency |
| Validators | Rules (next section) | Deterministic | Only checks what has a rule |

The token-probability route is easy to compute. Take the value `211.41`, tokenised as five pieces with probabilities 0.99, 0.98, 0.60, 0.97, 0.99. The **geometric mean** is $\exp\big(\tfrac15 \sum \ln p_k\big) \approx 0.890$, while the **minimum** is 0.60. The minimum is the more sensitive choice: one uncertain digit (here, the third token) is exactly the failure that matters, and an average dilutes it. Many teams use the minimum or a low percentile for numeric fields and the mean for free text.

## Calibration: does 0.9 mean 90%?

A score is only useful for routing if it is **calibrated**: among fields scored around 0.9, about 90% should actually be correct. Check by binning the scores on a labelled set and comparing mean confidence with observed accuracy. The **expected calibration error** is

$$
\text{ECE} = \sum_{b} \frac{n_b}{N}\,\big|\,\text{acc}_b - \text{conf}_b\,\big|
$$

with $n_b$ the number of fields in bin $b$, $N$ the total, $\text{acc}_b$ the observed accuracy in the bin and $\text{conf}_b$ its mean confidence.

| Confidence bin | Fields $n_b$ | Mean confidence | Observed accuracy | Absolute gap |
|---|---|---|---|---|
| 0.50 to 0.70 | 100 | 0.62 | 0.55 | 0.07 |
| 0.70 to 0.85 | 200 | 0.78 | 0.72 | 0.06 |
| 0.85 to 0.95 | 300 | 0.91 | 0.90 | 0.01 |
| 0.95 to 1.00 | 400 | 0.98 | 0.985 | 0.005 |

$\text{ECE} = (100 \times 0.07 + 200 \times 0.06 + 300 \times 0.01 + 400 \times 0.005)/1000 = 0.024$. The lower bins are over-confident (accuracy below confidence), the usual pattern. If you route on the raw score, the threshold means less than it says. Fix it by fitting a small mapping from raw score to observed accuracy (Platt scaling or isotonic regression) on a held-out labelled set, and **re-fit it whenever the model, prompt or document mix changes**.

## Validators: the deterministic safety net

Rules catch errors that a model is confident about. Arithmetic is the best because it uses the document against itself.

```steps
Cross-field validation on an invoice
Line items: 120.00 + 45.50 + 30.25 = 195.75. Check it equals the extracted `subtotal`.
---
Tax: $195.75 \times 0.08 = 15.66$ (rounded to cents). Check it equals the extracted `tax`.
---
Total: $195.75 + 15.66 = 211.41$. Check it equals the extracted `total`. A swapped-digit value, 211.14, fails here.
---
Format rules: date parses and is not in the future; currency is in the enum; invoice number matches the supplier's known pattern; vendor exists in the master data.
---
Business rules: total under the supplier's usual range; invoice number not already booked (duplicate detection).
```

How strong is the arithmetic check? Suppose each of the 5 numeric fields (3 items, tax, total) is wrong independently with probability 3%. Then the chance at least one is wrong is $1 - 0.97^5 = 14.1\%$. The check fails whenever errors do not cancel exactly, and a single wrong field can never cancel. So almost every such error is caught, a large gain from a few lines of code. The check cannot catch consistent errors, such as all three items and the total misread by the same OCR defect, or a wrong vendor name that happens to exist.

## Combining the signals into a routing decision

A document is auto-accepted only if all of these hold: classification confidence is high, every validator passes, every field's calibrated confidence exceeds its threshold, and any evidence quote was found. Otherwise it goes to review, **with the failing fields highlighted**, so the reviewer's work is proportional to the doubt. Set thresholds per field, not globally: an invoice total deserves a stricter bar than a free-text note.

## In practice

Teams often start with a single confidence threshold of 0.9 chosen by feel. A better habit: label 1,000 documents, plot accuracy against calibrated confidence per field, and choose the threshold from the cost rule derived in the next topic. Also watch for **confidently wrong clusters**: a new supplier template where the model is 0.99 sure and consistently wrong. Validators and periodic random audits of auto-accepted documents (say 1% sampled) are the only defence, since confidence cannot see what it has never seen.

```quiz
{"q": "A field's value spans four tokens with probabilities 0.99, 0.99, 0.50, 0.99. Which summary is better for routing a numeric field, and why?", "options": ["The mean (about 0.87), because it uses all tokens", "The minimum (0.50), because one uncertain token is what produces a wrong digit", "The product, because it is always above 0.9", "Neither: token probabilities carry no information"], "answer": 1, "explain": "A wrong field usually comes from one uncertain token, which the minimum preserves and the mean dilutes. The product is 0.48 here, not above 0.9; token probabilities are informative, though they need calibration."}
```

```quiz
{"q": "Per-field accuracy is 98% with 15 independent fields per document. What is the approximate probability that a whole document is entirely correct?", "options": ["98%", "74%", "86%", "30%"], "answer": 1, "explain": "$0.98^{15} \\approx 0.739$. Quoting 98% describes fields, not records; 86% would correspond to 99% per field."}
```
