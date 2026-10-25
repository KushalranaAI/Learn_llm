---
title: Schemas and validating arguments
minutes: 8
---

A tool's **schema** is a machine-readable contract for its arguments. Almost every provider uses **JSON Schema** for this: you declare each argument's type, which ones are required, and what values are allowed. The schema does two jobs. It tells the model what shape of arguments to produce, and it lets your code check that shape before anything runs.

Compare a bank's paper form with a blank sheet. The form has boxes for date, amount and account, so most people fill it in correctly, and the clerk can spot a missing box in a second. A blank sheet might contain everything, or nothing useful. The schema is the form.

## Anatomy of a schema

```json
{
  "type": "object",
  "properties": {
    "city":  {"type": "string", "minLength": 2},
    "units": {"type": "string", "enum": ["metric", "imperial"]},
    "days":  {"type": "integer", "minimum": 1, "maximum": 7}
  },
  "required": ["city"],
  "additionalProperties": false
}
```

`required` lists mandatory fields. `enum` restricts a value to a fixed list. `minimum` and `maximum` bound numbers. `additionalProperties: false` rejects any argument you did not declare, which catches hallucinated fields.

## Why the model sometimes gets it wrong

Models usually produce valid arguments, but not always: wrong types ("3" instead of 3), missing fields, values outside the enum, invented parameters. Say a model produces schema-valid arguments with probability $v$ on any attempt. If invalid arguments are rejected and the model tries again, independently, the number of attempts until a valid one is geometric:

$$
\mathbb{E}[\text{attempts}] = \frac{1}{v}, \qquad P(\text{valid within } r \text{ attempts}) = 1 - (1-v)^r
$$

```steps
Worked example: v = 0.9
Expected attempts: $1/0.9 = 1.11$. Ten percent of calls need a second try.
---
Valid within 2 attempts: $1 - 0.1^2 = 0.99$. Within 3: $1 - 0.1^3 = 0.999$.
---
Over a 6-call run, the chance every call's arguments are valid on the first try is $0.9^6 = 0.531$. Without validation and retry, about half of runs would execute at least one malformed call.
---
With validation and up to 3 attempts per call, the per-call figure is $0.999$ and the run figure is $0.999^6 = 0.994$.
```

That is a large reliability gain for a few lines of code. Validation also changes **what a failure costs**: a rejected call costs one extra model call, whereas an unvalidated malformed call may run a destructive operation with a wrong value.

## Narrow the space

Every constraint you put in the schema shrinks the set of values the model can plausibly produce. A free-text `status` field might be `"done"`, `"Done"`, `"completed"`, `"complete"`; an enum of three values leaves exactly three choices. Some providers can enforce the schema during decoding (constrained decoding, covered in the prompt-and-context module), which pushes $v$ toward 1 for structure, though it cannot make the values sensible: `days: 7` is valid even when the user asked for tomorrow.

## Validate in code

```python
def validate(args: dict, schema: dict) -> list[str]:
    """A tiny validator for the schema subset above. Returns a list of problems."""
    problems = []
    props = schema.get("properties", {})
    for name in schema.get("required", []):
        if name not in args:
            problems.append(f"missing required argument '{name}'")
    for name, value in args.items():
        spec = props.get(name)
        if spec is None:
            if schema.get("additionalProperties") is False:
                problems.append(f"unknown argument '{name}'; allowed: {sorted(props)}")
            continue
        t = spec.get("type")
        if t == "integer" and not (isinstance(value, int) and not isinstance(value, bool)):
            problems.append(f"'{name}' must be an integer, got {value!r}")
        if t == "string" and not isinstance(value, str):
            problems.append(f"'{name}' must be a string, got {value!r}")
        if "enum" in spec and value not in spec["enum"]:
            problems.append(f"'{name}' must be one of {spec['enum']}, got {value!r}")
        if "minimum" in spec and isinstance(value, (int, float)) and value < spec["minimum"]:
            problems.append(f"'{name}' must be >= {spec['minimum']}, got {value}")
        if "maximum" in spec and isinstance(value, (int, float)) and value > spec["maximum"]:
            problems.append(f"'{name}' must be <= {spec['maximum']}, got {value}")
    return problems

schema = {"type": "object",
          "properties": {"city": {"type": "string"}, "units": {"type": "string", "enum": ["metric", "imperial"]},
                         "days": {"type": "integer", "minimum": 1, "maximum": 7}},
          "required": ["city"], "additionalProperties": False}
print(validate({"city": "Oslo", "days": 10, "units": "kelvin"}, schema))
```

This prints two problems, `'days' must be <= 7, got 10` and `'units' must be one of ['metric', 'imperial'], got 'kelvin'`. In production use a real JSON Schema library; the point is that the problems come back as readable sentences, which is exactly what the next topic needs.

## In practice

Validation is not only about types. **Semantic validation** checks that the order ID exists, the user is allowed to touch it, and the amount is below a limit. These checks belong in the tool's code, never in the prompt: a prompt asking the model to "only refund up to 100 dollars" is a request, a line of code is a guarantee.

```quiz
{"q": "A model produces valid arguments with probability 0.8 per attempt. With validation and up to 3 independent attempts, what is the probability a call ends up valid?", "options": ["0.800", "0.992", "0.960", "0.512"], "answer": 1, "explain": "1 − (1 − 0.8)³ = 1 − 0.008 = 0.992. 0.512 is 0.8³, the chance all three attempts are valid, which is not what we want."}
```

```quiz
{"q": "Where should the rule 'refunds above 100 dollars need approval' be enforced?", "options": ["In the system prompt only", "In the tool's code, so it holds whatever the model produces", "In the tool description only", "Nowhere; the model will follow it"], "answer": 1, "explain": "Prompts and descriptions guide the model but do not bind it. A check in code runs on every call regardless of what the model decided."}
```
