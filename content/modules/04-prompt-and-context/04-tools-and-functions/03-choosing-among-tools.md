---
title: Choosing among many tools
minutes: 8
---

With three tools, a model rarely picks the wrong one. With thirty, it sometimes does, and the failures are sneaky: it calls `search_tickets` when it should have called `search_docs`, and the answer looks plausible. Two effects work together as the tool list grows. The definitions get longer, so each call costs more and the relevant tool is surrounded by more distractors. And similar tools blur together, so the model has to separate them from descriptions alone.

Think of a shop assistant who has to choose the right drawer. Five labelled drawers: no problem. Fifty drawers with labels like "misc", "other" and "stuff": slow, error-prone, and sometimes the wrong item gets handed over with total confidence.

## The maths: selection accuracy compounds

Let $q$ be the probability that the model picks the right tool for one step, and $a$ the probability that it then fills the arguments correctly. A step succeeds with probability $q\,a$. A task of $m$ independent steps succeeds end to end with probability

$$
P(\text{task}) = (q\,a)^m
$$

Suppose a 3-step task, and two designs for the same job. With all 20 tools offered at once, measured $q = 0.97$ and $a = 0.95$. With a narrower set of 6 relevant tools, measured $q = 0.99$ and $a = 0.96$ (fewer distractors, clearer choice).

| Design | $q$ | $a$ | Step success $q\,a$ | 3-step task $(q\,a)^3$ |
|---|---|---|---|---|
| 20 tools offered | 0.97 | 0.95 | 0.9215 | 0.7825 |
| 6 tools offered | 0.99 | 0.96 | 0.9504 | 0.8585 |

Two or three percentage points per step become 7.6 points per task. At 100,000 tasks a day, the narrower design gives about 7,600 more successful tasks. Add the token savings from the previous topics ($20 \to 6$ tools at 150 tokens each is 2,100 fewer tokens per call) and the narrower set is better on quality and cost at once.

```callout-math
Where these numbers come from
The values of $q$ and $a$ above are illustrative. The point is the structure: reliability is a product, so every step multiplies in. Measure $q$ (right tool chosen) and $a$ (arguments valid and correct) separately on a golden set. They fail for different reasons and have different fixes.
```

```steps
Reducing the tool set per request
Group tools by domain: orders, billing, account, knowledge base.
---
Pick the group with a cheap step before the main call: a small classifier, keyword rules, or a first model call that only chooses a domain.
---
Offer only that group's tools to the main call. Keep a general "ask a human" tool available in every group as an escape.
---
Measure $q$ on a golden set with and without the narrowing, and compare end-to-end task success, not just step accuracy.
```

## Making similar tools distinguishable

When two tools overlap, the model needs a rule. Put the rule in the descriptions:

```text
search_docs: Search the public help-centre articles. Use for "how do I" and policy questions.
  Returns up to 5 article titles with snippets. Do NOT use for a customer's own orders or tickets.

search_tickets: Search this customer's past support tickets. Use only when the customer refers
  to a previous conversation. Requires the customer ID from the session. Do NOT use for general how-to questions.
```

Each description names what the tool searches, when to use it and where it does not apply. This is lower-cost and often more effective than adding few-shot examples of tool selection.

Alternatives when the list is long:

- **Retrieve tools like documents.** Embed the tool descriptions, embed the request, and offer the nearest 5 to 8 tools. This scales to hundreds of tools. The risk is the same as in retrieval: a needed tool that is not retrieved cannot be called, so measure recall@k on tools too.
- **Merge near-duplicates.** One `search` tool with a `source` enum (`docs | tickets | orders`) replaces three tools, and the choice becomes an argument the schema constrains.
- **Delegate.** A sub-agent that owns one domain and its tools, called by a router, keeps each context small. Module 7 compares this with a single big agent.

## In practice

When a tool call is wrong, label *which* kind of wrong it is: wrong tool, right tool with wrong arguments, right call at the wrong time, or no call when one was needed. Each has a different fix (descriptions, schemas, instructions, examples). A confusion matrix of "expected tool versus called tool" over a few hundred golden cases shows immediately which pairs are being confused.

```quiz
{"q": "Per step, the model picks the right tool with probability 0.98 and fills arguments correctly with probability 0.96. What is the success rate of a 4-step task?", "options": ["About 78%", "About 94%", "About 88%", "About 96%"], "answer": 0, "explain": "Step success = 0.98 × 0.96 = 0.9408. Over 4 steps: 0.9408⁴ ≈ 0.783. Quoting 94% reports a single step."}
```

```quiz
{"q": "Two tools with overlapping descriptions are often confused. Which fix usually helps first?", "options": ["Rewrite each description to say what it covers, when to use it and when not to", "Increase the temperature", "Add five more tools to give the model more choice", "Remove all descriptions to save tokens"], "answer": 0, "explain": "The description is the model's only basis for choosing. Explicit use and do-not-use clauses separate overlapping tools. Higher temperature adds randomness, and more tools add more distractors."}
```
