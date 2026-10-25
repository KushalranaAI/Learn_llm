---
title: Choosing a reference metric and validating it
minutes: 7
---

Every metric in this lesson answers a slightly different question. Exact match asks "is it the same string?", token F1 "how many of the same words?", BLEU and ROUGE "how many of the same phrases?", embedding similarity "roughly the same topic and meaning?", and programmatic checks "does it satisfy this rule?". None of them asks "is it correct and useful?" directly. Choosing a metric means choosing which approximation of that question fails least on your task.

A good way to decide is to think about the two errors from lesson 1. A **false pass** credits a wrong answer; a **false fail** rejects a right one. Each metric has a characteristic profile, and the costs of the two errors differ by use case. For a regression gate in CI, false passes are dangerous (you ship a bug). For a leaderboard of prompt variants, systematic false fails that hit all variants equally matter less.

## Metric profiles at a glance

```sim
metric-compare
{"pair": "synonyms", "normalise": true}
```

Step through all six example pairs and fill in, for each metric, whether it got the verdict right. The *Synonyms* pair (where the simulation starts) is correct but shares few words; *Negation* is wrong but shares many. You should find that no column is right on every row, which is the main lesson of this topic.

| Metric | False passes | False fails | Best for |
|---|---|---|---|
| Exact match (normalised) | very rare | many on free text | labels, IDs, short fields |
| Token F1 | some (one wrong key word) | some (paraphrase) | extractive spans |
| BLEU / ROUGE | some | many on paraphrase | tracking a fixed system; templated text |
| Embedding cosine | many (negation, numbers) | few | near-duplicate detection; coarse filter |
| Programmatic check | depends on the check's coverage | rare | format, fields, code, constraints |

## The maths: validating a metric against human labels

The way to know whether a metric works on *your* data is to measure it like a classifier. Take a sample of outputs, have people label each as correct or not, and compare with the metric's pass/fail verdicts (after thresholding, if the metric is continuous). With "correct" as the positive class:

$$
\text{metric precision} = \frac{\#\{\text{metric passes} \wedge \text{human correct}\}}{\#\{\text{metric passes}\}}, \qquad \text{metric recall} = \frac{\#\{\text{metric passes} \wedge \text{human correct}\}}{\#\{\text{human correct}\}}
$$

Low precision means many false passes; low recall means many false fails.

```steps
Validating token F1 ≥ 0.5 as a pass rule
200 outputs, labelled by people: 140 correct, 60 wrong.
---
Token F1 ≥ 0.5 passes 120 outputs. Of those, 105 are correct (true passes) and 15 are wrong (false passes).
---
Metric precision $= 105/120 = 0.875$. Metric recall $= 105/140 = 0.75$.
---
So 12.5% of what the metric calls correct is actually wrong, and it misses a quarter of correct answers. Its estimated pass rate is $120/200 = 60\%$ against a true $140/200 = 70\%$.
---
Decide: if you only use the metric to compare versions on the same set, a stable 10-point underestimate may be acceptable. If you use it as a release gate, the 15 false passes are the number to drive down, perhaps by adding an exact check on numbers.
```

A second, cheaper validation is **rank agreement**: score several past system versions with the metric and with humans, and check the metric orders them the same way (the correlation idea from lesson 1).

## Combining metrics

Real eval suites rarely rely on one metric. A common recipe for a question-answering feature:

1. Programmatic: output parses, cites a document id that exists.
2. Exact or numeric match on the key fact (amount, date, name).
3. Token F1 or embedding similarity as a cheap secondary signal for drift.
4. A judge model (lesson 3) with a rubric for completeness and tone, spot-checked by people.

The first two are gates; the last two are graded criteria, exactly the structure from the rubric topic.

## In practice

Before adopting any automatic metric, label 100 to 200 outputs yourself and compute its precision and recall against your labels. It takes an afternoon and regularly reveals that a metric everyone trusted has a 20% false-pass rate on the cases that matter. Re-validate when the task or model changes: a metric that worked for terse answers may break when a new model starts writing full sentences.

```quiz
{"q": "A metric passes 90 of 200 outputs; 81 of those are correct according to people, who judged 150 of the 200 correct overall. What are the metric's precision and recall?", "options": ["0.90 and 0.54", "0.54 and 0.90", "0.90 and 0.45", "0.81 and 0.60"], "answer": 0, "explain": "Precision $= 81/90 = 0.90$; recall $= 81/150 = 0.54$. Few false passes but many false fails, the typical profile of a strict metric like exact match. Swapping the two is the tempting error."}
```

```quiz
{"q": "Which task is best served by exact match after normalisation?", "options": ["Grading a three-paragraph summary", "Checking a predicted intent label from a fixed set of 12 labels", "Scoring a translated marketing email", "Comparing two chatbot personalities"], "answer": 1, "explain": "With a closed label set there is exactly one right string, so exact match has neither false passes nor false fails. The other tasks have many valid outputs, which exact match would reject."}
```
