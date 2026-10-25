---
title: What constraints cannot do
minutes: 8
---

Constrained decoding guarantees that output parses. It does not guarantee that output is right, and used carelessly it can make output *worse*. The reason is that the mask is applied one token at a time, greedily, without looking ahead. When the model wanted to say something the format does not allow, the mask forces it down whichever valid path happens to share a prefix with what it wanted, even if a different valid answer was the model's real preference.

An analogy: you ask someone to answer only "yes" or "no", but cut them off after the first letter. They start to say "nope", you hear "n", and you force the rest to be "no". Fine. But if they started to say "not sure, probably yes" you have still recorded "no".

## The maths: local masking versus the global constraint

Let the valid outputs be the strings "yes" and "no", and suppose the model's first-token probabilities are $P(\texttt{n}) = 0.6$ and $P(\texttt{y}) = 0.4$. After `n`, the model would continue with `ope` (making "nope", not allowed) with probability 0.9 and `o` with probability 0.1. After `y`, it continues with `es` with probability 1.

What the model actually believes about the two valid strings is the **global** (sequence-level) probability, renormalised over valid strings:

$$
P(\text{no}) = 0.6 \times 0.1 = 0.06, \quad P(\text{yes}) = 0.4 \times 1.0 = 0.40
$$

$$
P(\text{yes} \mid \text{valid}) = \frac{0.40}{0.40 + 0.06} = 0.870, \qquad P(\text{no} \mid \text{valid}) = 0.130
$$

Token-level masking does something different. At step 1, both `n` and `y` are prefixes of valid strings, so nothing is masked and `n` is chosen 60% of the time. At step 2 after `n`, `ope` is masked and `o` is renormalised to probability 1. So the constrained decoder outputs

$$
P_{\text{mask}}(\text{no}) = 0.6 \times \frac{0.1}{0.1} = 0.60, \qquad P_{\text{mask}}(\text{yes}) = 0.40
$$

The model prefers "yes" by 87% to 13% among valid answers, yet the constrained decoder says "no" 60% of the time. The probability mass that wanted "nope" was rerouted to "no" because they share a first token. In general, token-level masking samples from

$$
P_{\text{mask}}(y) = \prod_{t} \frac{P(y_t \mid y_{<t})}{Z_A(y_{<t})}
$$

where $Z_A(y_{<t})$ is the allowed mass at step $t$. Dividing by a different $Z_A$ at each step is what distorts the result compared with the global $P(y \mid \text{valid}) \propto \prod_t P(y_t \mid y_{<t})$.

```steps
Reading the warning sign: small allowed mass
At each step, the allowed mass $Z_A$ is how much of the model's probability the format permits.
---
If $Z_A$ is near 1 at every step, the model was already heading for valid output. Masking changes almost nothing, and local equals global.
---
If $Z_A$ is small at some step (say 0.05), the model wanted something else 95% of the time there. The mask is overriding it, and the result may not reflect its judgement.
---
Log $Z_A$ per step if your stack exposes logits. A low minimum $Z_A$ on a request is a cheap flag for "this answer was forced".
```

## How to keep constraints honest

The cure is to make the model *want* to produce valid output before you force it to:

1. **Describe the format in the prompt too.** Constraints plus instructions plus an example keep $Z_A$ high, so masking only trims rare slips.
2. **Order fields so reasoning comes first.** If the schema is `{"answer": ..., "reasoning": ...}`, the model commits to an answer before thinking. Put a `reasoning` (or `evidence`) field before the `answer` field so the decision is conditioned on the explanation.
3. **Offer an honest escape.** Without an `"unknown"` or `null` option, a model that does not know is forced to pick a confident value. Escape hatches keep the forced choice from looking like knowledge.
4. **Check semantics in code.** Constraints cannot know that `end_date` must follow `start_date`, or that an `order_id` must exist in your database.

```text
# Schema field order that lets the model think before it commits
{
  "evidence": "Quote the sentence from the ticket that shows the category.",
  "category": "billing | bug | account | other",
  "confidence": "high | medium | low"
}
```

| Guarantee | Prompt only | Validate + retry | Constrained decoding |
|---|---|---|---|
| Parses as JSON | Usually | Almost always | Always |
| Matches schema types and enums | Usually | Almost always | Always (within supported features) |
| Values are correct | No | No | No |
| Model's preference preserved | Yes | Yes | Only if allowed mass stays high |
| Extra latency | None | One more call on failure | Small per-token cost, schema compile |

```sim
constrained-decoding
{"step": "age", "temperature": 1, "constrained": true, "calls": 1000}
```

The sim starts at the age field with the mask on. Read the masked mass: it is the probability the model put on invalid continuations, the $1 - Z_A$ of this topic. Step through each field and note which step has the largest masked mass; that is the step where the output was most "forced". Raise the temperature to 2 and watch that mass grow.

```quiz
{"q": "At one step the allowed tokens carry only 4% of the model's probability (Z_A = 0.04). What does this tell you?", "options": ["The model wanted to write something the format forbids 96% of the time here, so the forced choice may not reflect its judgement", "The output is invalid", "The model is very confident in the allowed token", "Constrained decoding has failed and will raise an error"], "answer": 0, "explain": "The output is still valid; masking guarantees that. But 96% of the mass was overridden, which is a warning that the answer was forced. A high renormalised probability after masking says nothing about confidence before it."}
```

```quiz
{"q": "Valid outputs are \"cat\" and \"car\". The model puts P(\"ca\") = 1, then after \"ca\": P(\"t\") = 0.2, P(\"r\") = 0.1, P(\"ke\") = 0.7 (\"cake\" is invalid). What does token-level masking output for \"cat\"?", "options": ["2/3 ≈ 0.67", "0.2", "0.7", "0.5"], "answer": 0, "explain": "After \"ca\", mask \"ke\" and renormalise over t and r: 0.2 / 0.3 ≈ 0.67. Here local masking matches the global answer because the strings diverge at the same step; distortion appears when an invalid string shares an earlier prefix with only one of the valid ones."}
```
