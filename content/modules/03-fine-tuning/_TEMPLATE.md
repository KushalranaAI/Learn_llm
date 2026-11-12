<!--
Template for a new fine-tuning lesson. The site ignores this file: only folders and files named NN-slug are loaded.

To add a lesson:
1. Create a folder content/modules/04-fine-tuning/NN-<lesson-slug>/ (NN = next number, e.g. 02).
2. Add lesson.json (copy 01-start-here/lesson.json and edit: title, summary, objectives, prerequisites, sims, labs, sources).
3. Add one file per topic: NN-<topic-slug>.md, starting from the skeleton below.
4. Add interview questions to content/interview/04-fine-tuning.json and terms to content/glossary/04-fine-tuning.json
   (formats in CONTENT_GUIDE.md). Run `npm run verify`.

Suggested lessons: preparing fine-tuning data · full fine-tuning vs LoRA in code · hyperparameters that matter ·
evaluating a fine-tuned model against the prompted baseline · serving and merging adapters · notes from my own runs.
-->
---
title: <Topic title>
minutes: 7
---

<Intuition: 2–4 short paragraphs. What problem this solves, in plain words. Bold each new term once.>

## The maths

<At least one equation in $...$ or $$...$$, every symbol defined, and a worked example with real numbers.>

## What I did

<Your run: model, data, settings, code (```python), and what happened. Real numbers from your logs are the best part.>

<A visual: a ```sim block, a ```mermaid diagram, a ```steps walkthrough or a table.>

## In practice

<What you would do again, what went wrong, the number to watch.>

```quiz
{"q": "<A question that tests understanding or a calculation>", "options": ["<right>", "<tempting wrong>", "<wrong>", "<wrong>"], "answer": 0, "explain": "<Why the right one is right and why the tempting one is wrong.>"}
```
