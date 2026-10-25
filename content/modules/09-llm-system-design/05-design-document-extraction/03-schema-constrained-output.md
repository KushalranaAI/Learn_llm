---
title: "Deep dive: schema-constrained output"
minutes: 9
---

The extraction stage's contract with the rest of the pipeline is simple: given a document, return a JSON object that matches the schema. A downstream system that expects `total` to be a number cannot cope with `"total": "about 211"`, or with a friendly sentence before the opening brace. There are three ways to get valid structure: ask nicely in the prompt, validate and retry, or **constrain the decoder** so invalid output cannot be produced. In a pipeline processing a million documents a month, the first two leave a steady trickle of failures; the third removes the whole class.

## How the mask works

At each step the model produces a score (logit) $z_i$ for every token $i$ in the vocabulary, and sampling uses the softmax $p_i = e^{z_i/T} / \sum_j e^{z_j/T}$ at temperature $T$. A **constrained decoder** tracks the schema as a state machine (after `"age":` only digits are legal; after the last field only `}` is legal). Let $A$ be the set of tokens the schema allows next. The decoder sets the probability of all other tokens to zero and renormalises:

$$
p'_i = \begin{cases} \dfrac{p_i}{\sum_{j \in A} p_j} & i \in A \\[4pt] 0 & i \notin A \end{cases}
$$

where $p_i$ is the original probability, $A$ the allowed set and $p'_i$ the probability actually sampled from. The **masked mass** $m = 1 - \sum_{j\in A} p_j$ is the probability that an unconstrained sampler would have produced an illegal token at that step.

```steps
One decision: the value of "age" (integer required), temperature 1
Candidate logits: `36` is 6.0, `"36"` (a string) 1.3, `36.5` is -0.1, `null` is -0.3, `thirty` is -1.1.
---
Exponentiate: $e^{6.0} = 403.4$, $e^{1.3} = 3.67$, $e^{-0.1} = 0.905$, $e^{-0.3} = 0.741$, $e^{-1.1} = 0.333$. The sum is 409.0.
---
Unconstrained probabilities: `36` has $403.4/409.0 = 98.6\%$. The four illegal candidates share the remaining $m = 1.38\%$.
---
Only `36` is legal for an integer. After the mask its probability renormalises to 100%.
---
The model was "98.6% sure" and still slips on one call in 72. Over many decisions and many documents, small slips are not small.
```

## Small slips add up

A document has several decisions, each with its own masked mass $m_i$. The chance that an unconstrained call is entirely valid is the product of the per-decision survival probabilities, so the per-call failure rate is

$$
e = 1 - \prod_{i=1}^{n} (1 - m_i), \qquad P(\ge 1\text{ failure in } N \text{ calls}) = 1 - (1 - e)^N
$$

Suppose the extraction has $n = 6$ structural decisions each with $m_i = 0.5\%$. Then $e = 1 - 0.995^6 = 2.96\%$: about 29,600 malformed outputs per million documents, and over a batch of $N = 1{,}000$ calls the probability of at least one is $1 - 0.9704^{1000} \approx 1$. A real invoice schema with line items has far more than six decisions, so the true figure is higher. Constrained decoding makes the failure rate exactly zero by construction.

The simulation below steps through a small three-field schema. It starts unconstrained, so you can see the failure rates first.

```sim
constrained-decoding
{"step": "age", "temperature": 1, "constrained": false, "calls": 1000}
```

Try three things. First, read the masked mass at the age step; it should match the 1.4% computed above. Second, raise the temperature to 1.5 and watch the masked mass grow: hotter sampling flattens the distribution, so more probability falls on illegal tokens. Third, switch the schema mask on and watch the invalid rate over a thousand calls drop to zero.

## What constraining does not do

It guarantees that the output is **well-formed**, not that it is **right**. If the invoice total is 211.41 and the model writes 211.14, both are valid numbers and the mask passes both. Constrained decoding converts format failures (loud, easy to detect) into the remaining failures (quiet, wrong value) that validation and review must catch. That is a good trade, because quiet errors can only be handled once everything else is deterministic.

It can also hurt quality if the schema forces the model to answer when it should not. If `date` is required, a document with no date makes the model invent one. The fixes are schema design choices.

| Schema choice | Why |
|---|---|
| Make fields **nullable** and instruct "use null if absent" | Gives the model a legal way to say "not there" instead of hallucinating |
| Use **enums** for categories (`currency`: USD, EUR, GBP) | Mask can enforce the closed set; no spelling variants |
| Store money as **integer minor units** or a decimal string | Avoids floating-point and locale confusion (1.234,56 versus 1,234.56) |
| Dates as ISO 8601 strings with a pattern | Removes ambiguity between 03/04/2026 readings; you validate the locale separately |
| Add an **evidence** object per field: page number and a short quote | Lets a reviewer verify in seconds; lets you check the quote appears in the OCR text |
| Put a short `reasoning` or `notes` string **before** hard fields when helpful | Gives a little room to think without breaking structure |
| Keep schemas small per document type | Fewer decisions, smaller mask state, easier evals |

An **evidence quote** is a cheap but powerful check: after extraction, test that the quoted string is actually a substring of the OCR text (after whitespace normalisation) and that the value appears inside it. A value with no supporting quote is flagged. It catches many hallucinated fields that the schema would have happily accepted.

## In practice

Use the provider's structured-output mode or a grammar-constrained decoder in your own serving stack; do not write a regex parser plus a "please reply in JSON" prompt and hope. Still keep a parse-and-validate step, because API behaviour changes, a refusal can arrive as plain text, and a truncated response (the output limit was hit mid-object) is not valid JSON however well it was constrained. Always set the maximum output tokens comfortably above the longest expected object, and treat "stopped because of length" as a failure to retry with a larger limit or a split document.

```quiz
{"q": "At one decision, an unconstrained model puts 97% of its probability on legal tokens. Constrained decoding is switched on. What probability does the best legal token (originally 90%) get after the mask?", "options": ["90%", "87%", "97%", "About 92.8%"], "answer": 3, "explain": "Renormalise over the legal set: $0.90 / 0.97 = 0.928$, about 92.8%. The mask redistributes the 3% illegal mass proportionally; 90% ignores the renormalisation, and 97% is the legal mass, not one token's probability."}
```

```quiz
{"q": "A model returns {\"total\": 211.14} for an invoice whose printed total is 211.41, with the schema mask on. Which statement is correct?", "options": ["Impossible: the mask guarantees correct values", "Possible: the mask guarantees valid structure and type, not the correct number", "Possible only at high temperature", "Impossible: 211.14 is not a valid number"], "answer": 1, "explain": "Both numbers satisfy the schema. The mask restricts form; correctness needs validators (line items must sum to the total), evidence checks and review."}
```
