---
title: Structured outputs and JSON Schema
minutes: 8
---

Most LLM features are not chat. They are a step in a program: classify this ticket, extract these fields from an invoice, decide which tool to call. The next line of code expects a dictionary with known keys, not a friendly paragraph. **Structured output** means asking the model for data in a fixed, machine-readable shape, usually JSON, and checking it against a **schema** before using it.

**JSON Schema** is the common way to describe that shape: which fields exist, their types, which are required, which values are allowed. Here is a schema for triaging support tickets:

```text
{
  "type": "object",
  "properties": {
    "category":  { "type": "string", "enum": ["billing", "bug", "account", "other"] },
    "urgency":   { "type": "integer", "minimum": 1, "maximum": 5 },
    "summary":   { "type": "string", "maxLength": 200 },
    "order_id":  { "type": ["string", "null"], "pattern": "^ORD-[0-9]{6}$" }
  },
  "required": ["category", "urgency", "summary", "order_id"],
  "additionalProperties": false
}
```

A few choices in this schema are deliberate. `enum` turns a free-text label into a closed set your code can switch on. `order_id` may be `null`, which gives the model an honest way to say "not present" instead of inventing one. `additionalProperties: false` stops surprise keys.

There are three levels of enforcement, from weakest to strongest:

1. **Prompt only.** Describe the format (or paste the schema) and hope. Good models comply most of the time, not all of the time.
2. **Validate and retry.** Parse the output, validate it against the schema, and on failure call again, often with the error message included.
3. **Constrained decoding.** Make invalid output impossible by restricting which tokens the model may emit (next topic). Many APIs expose this as a "structured output" or "JSON mode" option.

## The maths: rare failures at scale

Let $\varepsilon$ be the probability that one call returns output that fails validation. Over $N$ independent calls, the expected number of failures is $N\varepsilon$, and the probability that at least one call fails is

$$
P(\text{at least one failure}) = 1 - (1 - \varepsilon)^N \approx 1 - e^{-N\varepsilon}
$$

The approximation uses $\ln(1-\varepsilon) \approx -\varepsilon$ for small $\varepsilon$. With $\varepsilon = 0.005$ (99.5% compliance, which sounds excellent) and $N = 10{,}000$ calls a day, you expect $N\varepsilon = 50$ failures a day, and $P(\text{at least one}) \approx 1 - e^{-50}$, which is 1 to more decimal places than any calculator shows. "Usually works" means "breaks every day".

Field-level errors compound too. If each of $f$ fields is independently correct in format with probability $q$, a whole object is valid with probability $q^f$. With $q = 0.999$ and $f = 12$ fields, $0.999^{12} \approx 0.988$: a 1.2% object failure rate from fields that each fail one time in a thousand.

**Retry.** If a failed call is retried up to $r$ times in total and failures are independent, the residual failure rate is $\varepsilon^r$. With $\varepsilon = 0.005$ and $r = 2$ attempts, $\varepsilon^2 = 2.5 \times 10^{-5}$, so about $10{,}000 \times 2.5\times10^{-5} = 0.25$ hard failures a day. The extra cost is small: the expected number of attempts is $1 + \varepsilon = 1.005$.

```callout-warn
Failures are not independent
The $\varepsilon^r$ formula assumes each retry is a fresh coin flip. In reality, the inputs that break the format once (a document full of quotation marks, an unusual language) tend to break it again. At temperature 0, a retry with the identical prompt may reproduce the identical broken output. Measure the retry success rate rather than assuming it, and include the validation error in the retry prompt so the second attempt is a different request.
```

```steps
Validate-and-retry, step by step
Call the model with the schema in the prompt (or via the API's structured-output option).
---
Parse with a strict JSON parser. On a parse error, go to the retry step.
---
Validate against the schema: types, required fields, enums, patterns. On failure, go to the retry step.
---
Retry once with the original request plus: "Your previous output failed validation: <error>. Return only valid JSON matching the schema."
---
If it still fails, return a typed error to the caller (or a safe default) rather than passing bad data on. Log the input for the golden set.
```

## In practice

- **Validate even with constrained decoding.** Constraints guarantee syntax; they do not guarantee that `urgency: 5` is the right urgency, or that a string has a sensible value. Business rules belong in code.
- **Keep schemas small and flat.** Deeply nested optional structures are harder for models to fill correctly and harder for constraint engines to compile.
- **Give every field an escape hatch.** `null`, `"unknown"` or an `"other"` enum value prevents the model from being forced into a confident wrong answer.
- **Track $\varepsilon$ as a metric.** A sudden rise after a model or prompt change is one of the clearest regression signals you will get.

```sim
constrained-decoding
{"step": "age", "temperature": 1, "constrained": false, "calls": 10000}
```

The sim starts with the mask off and 10,000 calls. Read the invalid rate per call and check it against $1-(1-\varepsilon)^N$: the probability of at least one invalid output is effectively 100%. Raise the temperature to 1.5 and watch the rate climb. Then switch the schema mask on and both numbers drop to zero.

```quiz
{"q": "A model returns invalid JSON 0.2% of the time. At 50,000 calls per day, how many invalid outputs do you expect per day?", "options": ["100", "10", "1,000", "0.2"], "answer": 0, "explain": "Expected failures are N × ε = 50,000 × 0.002 = 100. Using 0.02% instead of 0.2% gives 10; using 2% gives 1,000."}
```

```quiz
{"q": "Each attempt fails validation with probability 0.01. You allow up to 3 attempts. If failures were independent, what fraction of requests would end in a hard failure, and why might the real figure be higher?", "options": ["10⁻⁶; the inputs that fail once tend to fail again, so retries are correlated", "0.03; failures add across attempts", "10⁻⁶; retries never fail in practice", "0.0001; only two retries count"], "answer": 0, "explain": "Independent failures give 0.01³ = 10⁻⁶. Real failures cluster on hard inputs, and identical retries at temperature 0 can repeat the same error, so the true rate is usually higher. Adding 0.01 three times confuses 'at least one failure' with 'all attempts fail'."}
```
