---
title: "Deep dive: fill-in-the-middle"
minutes: 8
---

A plain language model continues text left to right. That is fine at the end of a file, but developers rarely type at the end of a file. They type in the middle of a function, with a closing bracket, a return statement and three more functions below the cursor. A left-to-right model cannot see any of that, so it happily writes a second `return` or closes a bracket that is already closed.

**Fill-in-the-middle (FIM)** fixes this by teaching the model a rearranged format. Cut a file into a **prefix** (before the cursor), a **middle** (the missing piece) and a **suffix** (after the cursor). Present prefix and suffix first, marked with special sentinel tokens, then ask the model to generate the middle. Because the middle is now at the end, ordinary next-token prediction produces it, but conditioned on both sides.

## The format

With sentinel tokens written here as `<PRE>`, `<SUF>`, `<MID>` and `<EOM>` (real models use their own spellings, so always check the model card):

```text
<PRE>def parse_header(line):
    <SUF>
    return Header(name.strip(), value.strip())
<MID>
```

The model's expected output is the middle followed by an end-of-middle token:

```text
name, _, value = line.partition(":")<EOM>
```

The serving code then splices the middle between prefix and suffix. This ordering is called **PSM** (prefix, suffix, middle). Some models also train on **SPM** (suffix, prefix, middle), which places the prefix right before the generated text and can make prefix caching across keystrokes friendlier, since the suffix changes less often than the prefix while typing at the end of a line.

## How the model learns it

FIM is a cheap data transformation applied during pretraining. For a fraction $f$ of training documents, pick two cut points uniformly at random, rearrange into PSM, and train as usual; the rest stay left to right. The training paper on this found that rates around $f = 0.5$ teach infilling without measurably hurting ordinary left-to-right ability.

How long is the middle on average? If a document has $n$ tokens and the cut points are $U, V \sim \text{Uniform}(0, n)$ independently, the middle is $|U - V|$ tokens long. For two independent uniforms on $[0,1]$,

$$
\mathbb{E}\,|U - V| = \int_0^1\!\!\int_0^1 |u - v|\,du\,dv = 2\int_0^1\!\!\int_0^u (u - v)\,dv\,du = 2\int_0^1 \frac{u^2}{2}\,du = \frac{1}{3}
$$

so a 900-token document yields a middle of $900/3 = 300$ tokens on average. That is far longer than a typical inline completion (one line to one block, 10 to 60 tokens), which is why code assistants often fine-tune further on short, realistic middles cut at line and block boundaries.

## Knowing when to stop

An inline completion that runs on is worse than none: the developer must delete it. Stop when the first of these happens:

| Stop signal | Why |
|---|---|
| Model emits `<EOM>` | It believes the middle is done; the best signal |
| Token cap reached (e.g. 64) | Bounds latency and cost |
| End of the current block (indentation returns to the cursor's level or below) | Single-block suggestions are accepted more often |
| Generated line equals the first suffix line | The model is re-writing code that already exists below |

Each request has a hard cap $t_{\max}$ and decode time $t_{\text{out}} \cdot \tau$ where $\tau$ is time per output token. With $\tau = 6$ ms, a 64-token cap bounds decode at 384 ms; a 12-token single line takes 72 ms. Stopping at the block boundary is therefore also a latency feature.

## Token healing: the cursor is often mid-token

Suppose the developer has typed `respon` and paused. A tokenizer might encode `response` as one token, but `respon` as two odd pieces. If the prompt ends with those pieces, the model has rarely seen that split during training and may complete with something strange. The fix, **token healing**, backs the prompt up to the last clean token boundary (drop `respon`), then constrains the first generated token to start with the characters removed. The model can then pick the natural single token `response`.

```steps
Token healing on `x = respon`
The prompt ends in `x = respon`. Its last two tokens are an unusual split of a common word.
---
Remove the partial word from the prompt so it ends at a clean boundary: `x = `.
---
Decode the first token with a mask: only tokens whose text starts with `respon` are allowed (for example `response`, `responses`).
---
After that token, decode normally. The ghost text shown is the part after what the user already typed: `se.json()`.
```

## In practice

Use a model trained for FIM for inline completion. Chat-tuned models asked to "fill the gap" in natural language are slower (longer prompts, more output), less precise about whitespace, and often wrap code in markdown. Keep chat models for chat. And test the sentinel spelling end to end: a single wrong sentinel string silently degrades a FIM model into a left-to-right one, and acceptance rate drops without any error being raised.

```quiz
{"q": "A FIM training document has 1,200 tokens and the two cut points are drawn independently and uniformly. What is the expected length of the middle?", "options": ["600 tokens", "400 tokens", "300 tokens", "1,200 tokens"], "answer": 1, "explain": "$\\mathbb{E}|U-V| = n/3$ for independent uniforms, so $1{,}200/3 = 400$. 600 is the expected position of a single cut point, not the gap between two."}
```

```quiz
{"q": "Inline completions often duplicate the line just below the cursor. Which fix addresses the cause rather than the symptom?", "options": ["Raise the temperature", "Use a FIM prompt so the model conditions on the suffix, and stop if a generated line equals the first suffix line", "Increase the token cap to 128", "Remove the suffix from the prompt to save tokens"], "answer": 1, "explain": "Duplication happens when the model cannot see, or ignores, the code below the cursor. FIM gives it the suffix and the stop rule catches what slips through. Removing the suffix makes the problem worse; a higher cap or temperature does nothing for it."}
```
