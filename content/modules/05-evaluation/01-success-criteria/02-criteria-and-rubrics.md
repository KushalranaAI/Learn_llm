---
title: From a vague goal to measurable criteria
minutes: 8
---

"The assistant should give good answers" is a wish, not a criterion. Two reviewers reading the same reply will disagree about whether it is good, and the same reviewer will disagree with themselves next week. To measure anything you have to break "good" into pieces that a person, a script or a model can check the same way every time.

A useful test for a **success criterion** is whether a stranger could apply it to an output and reach the same verdict as you. "Helpful" fails that test. "States the refund window in days, matching the policy document" passes. Good criteria are specific (one property each), observable in the output, and tied to something a user or the business actually needs.

Criteria come in two kinds. **Gates** (hard constraints) are pass/fail requirements that no amount of quality elsewhere can make up for: the output must be valid JSON, must not reveal another customer's data, must answer in the user's language. **Graded criteria** are qualities that can be partly present: correctness, completeness, tone. A **rubric** lists the graded criteria, says what each score level means, and assigns weights.

## In everyday life

Picture a school science exhibition. If the judges are told to "pick the best project", each will pick a different one, and the same judge may change her mind after lunch. So the organisers hand out a scoring sheet. It lists a few things to check, such as an original idea, a model that works and a clear explanation, and says how many marks each is worth. It also has a few hard rules. The project must be the student's own work, and it must be safe. Break one and the project is out, however clever it is.

That sheet is what this chapter builds for an AI system. A **success criterion** is one specific thing a stranger could check and get the same answer as you. A **gate** is a hard rule that must pass, like valid JSON or no leaked private data. A **graded criterion** is a quality that can be partly present, like correctness or tone. A **rubric** lists the graded criteria, what each score level means, and the weight of each. The final score is the weighted marks, and a failed gate turns it into zero.

Unlike a school sheet, an AI rubric also names who checks each line: a script, a person or another model.

**Where you meet it.** A company's refund assistant must state the refund window correctly, cite the policy and sound polite. Without a rubric, reviewers argue about what "good" means. With one, correctness counts most, tone counts less, and a reply that leaks another customer's phone number scores zero however well it reads.

```scene
title: A scoring sheet for the science fair
step: 🏫 Judges disagree about which project is the best | vague goal like good answers
step: 📋 The organisers write a sheet of specific things to check | success criteria
step: 🚫 Rules like own work and safety can disqualify a project | gates
step: ⚖️ Originality and clarity earn marks, some worth more than others | graded criteria with weights
step: 🧮 The marks are added up using those weights | weighted rubric score
step: 🔴 A disqualified project scores zero, however good it looks | a failed gate zeroes the score
takeaway: Break a vague goal into specific checks, weight the graded ones, and let hard rules veto everything.
```

## The maths: weighted rubric scores with gates

Score each graded criterion $k$ on a scale and normalise it to $s_k \in [0, 1]$ (a 4 on a 1-to-5 scale becomes $s_k = 4/5 = 0.8$ if you divide by the maximum). Give each criterion a weight $w_k \ge 0$ with $\sum_k w_k = 1$. Each gate $j$ gives $g_j \in \{0, 1\}$. The example's score is

$$
S = \Big(\prod_{j} g_j\Big)\cdot \sum_{k} w_k\, s_k
$$

The product means a single failed gate sends the score to zero, which is exactly the behaviour you want for "leaked personal data" or "invalid JSON". The weighted sum lets strong correctness partly offset slightly stiff tone.

```steps
Scoring one support reply
Rubric: correctness $w_1 = 0.5$, grounded in the policy $w_2 = 0.3$, tone $w_3 = 0.2$. Gates: valid JSON, no personal data.
---
A reviewer gives correctness 4/5, grounding 5/5, tone 3/5, so $s = (0.8,\ 1.0,\ 0.6)$.
---
Weighted sum: $0.5 \times 0.8 + 0.3 \times 1.0 + 0.2 \times 0.6 = 0.40 + 0.30 + 0.12 = 0.82$.
---
Both gates pass, $g_1 = g_2 = 1$, so $S = 1 \times 0.82 = 0.82$.
---
If the reply had included the customer's phone number, $g_2 = 0$ and $S = 0$ regardless of the 0.82.
```

## Thresholds turn scores into decisions

A score is not a decision until you say what number is good enough. Thresholds exist at two levels:

- **Per example**: an output "passes" if $S \ge \tau$, for instance $\tau = 0.7$. This converts graded scores into a pass rate.
- **Per system**: the feature ships if the pass rate is at least, say, 90% on the eval set *and* every gate holds on 100% of the safety slice.

Set thresholds from the product, not from where the current system happens to land. Ask what failure rate users will tolerate, what a human agent achieves today, or what the cheapest acceptable alternative scores. A threshold chosen after looking at the results tends to be set just below whatever you got.

| Criterion | Type | How it is checked | Ship threshold |
|---|---|---|---|
| Output parses against schema | gate | code | 100% |
| No personal data of other users | gate | regex + classifier | 100% on safety slice |
| Refund amount matches policy | graded (0/1) | compare with reference | ≥ 95% |
| Cites the policy section used | graded (0/1) | string check | ≥ 90% |
| Tone matches brand guide | graded (1–5) | judge model, spot-checked | mean ≥ 4.0 |
| Latency p95 | gate | logs | ≤ 3 s |

Notice that each row names its checker. Choosing how a criterion is checked is part of defining it: a criterion nobody can check cheaply will quietly stop being checked.

## Binary beats fine-grained, usually

It is tempting to score everything on a 1-to-10 scale. In practice, reviewers (human or model) are far more consistent on yes/no questions than on fine scales: two people asked "is the refund amount right?" agree almost always, while two people asked to rate helpfulness 1 to 10 often differ by 2 or 3 points. A common pattern is to split one vague graded criterion into several binary checks ("mentions the deadline", "gives the right amount", "offers the next step") and let the rubric score be the share of checks passed.

## In practice

Write criteria with examples of a pass and a fail for each one; those examples become the instructions for human reviewers and, later, the prompt for a judge model. Revisit weights when you see the failure data: if users complain mostly about wrong amounts and never about tone, the tone weight is too high. And keep the number of criteria small, typically 3 to 7; a 20-item rubric is rarely applied carefully.

```quiz
{"q": "With weights correctness 0.6, completeness 0.3, tone 0.1 and normalised scores 0.5, 1.0, 1.0, and all gates passing, what is the rubric score?", "options": ["0.83", "0.70", "0.65", "0.50"], "answer": 1, "explain": "$0.6 \\times 0.5 + 0.3 \\times 1.0 + 0.1 \\times 1.0 = 0.30 + 0.30 + 0.10 = 0.70$. Taking a plain average of the three scores gives 0.83, which ignores that correctness carries most of the weight."}
```

```quiz
{"q": "Why multiply by gates rather than add a 'safety' criterion with a large weight?", "options": ["Multiplication is cheaper to compute", "A failed gate must zero the score; with any finite weight, strong scores elsewhere can still lift an unsafe output above the pass threshold", "Adding criteria makes weights sum to more than 1", "Gates are only used for latency"], "answer": 1, "explain": "With an additive safety weight of, say, 0.4, an output that leaks data but is otherwise perfect still scores 0.6 and may pass a 0.5 threshold. The product makes the failure non-negotiable."}
```
