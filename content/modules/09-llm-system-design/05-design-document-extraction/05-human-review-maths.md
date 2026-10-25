---
title: "Deep dive: the maths of human review"
minutes: 10
---

In this system the model costs under a cent per document and the **people** cost tens of cents. So the central design question is not "which model" but "which documents does a person look at", and that is an economics problem with a clean answer. This topic works through it with numbers you can check.

## Definitions

Let $N$ be documents per month, $r$ the **review rate** (the fraction routed to a person), $a_{\text{auto}}$ the accuracy (record-level) of the auto-accepted path, $a_{\text{rev}}$ the accuracy after human review, $t$ the seconds a reviewer spends per reviewed document, $w$ the loaded cost of a reviewer-hour, $C_{\text{err}}$ the business cost of one wrong record that reaches the database.

$$
\text{accuracy} = (1 - r)\,a_{\text{auto}} + r\,a_{\text{rev}}, \qquad
H = \frac{N\,r\,t}{3600}, \qquad
C_{\text{review}} = H\,w
$$

$H$ is reviewer-hours per month. Reviewers are not perfect, which is why $a_{\text{rev}}$ is below 1; we use 99.5%. The reviewer's work is faster than reading the document cold because the system highlights the doubtful fields and shows the cropped page region: assume $t = 90$ seconds and $w = \$18$ per productive hour (hypothetical).

## Sizing the reviewer team

```steps
Review workload at r = 20%
Documents reviewed: $N r = 1{,}000{,}000 \times 0.20 = 200{,}000$ per month.
---
Reviewer-hours: $H = 200{,}000 \times 90 / 3{,}600 = 5{,}000$ hours.
---
Productive hours per reviewer: 6 hours a day (the rest is breaks, meetings, training) × 21 working days = 126.
---
Headcount: $5{,}000 / 126 = 39.7$, so 40. Add about 15% for absence and rework: **46 reviewers**.
---
Cost: $5{,}000 \times \$18 = \$90{,}000$ per month, or \$0.45 per reviewed document and **\$0.09 per document processed**.
```

Compare with the model side: the OCR-plus-cascade pipeline costs \$7,820 a month, or \$0.0078 per document. Review is more than eleven times the cost of everything automated. This is the figure to say out loud: **every percentage point of review rate costs \$4,500 a month, but a point of model cost is a few dollars**. Spending more on a better model (or two samples for consistency) is justified whenever it lowers $r$ by even a fraction of a point.

## Which documents to review: a decision rule

Sort documents by their estimated error probability $p$ (from calibrated confidence and validators, as in the previous topic). Sending one to review costs $C_{\text{rev,doc}} = t\,w/3600 = \$0.45$ and cuts its error probability from $p$ to $p_{\text{res}} = 1 - a_{\text{rev}} = 0.005$. It is worth it when the expected saving exceeds the cost:

$$
(p - p_{\text{res}})\;C_{\text{err}} \;>\; C_{\text{rev,doc}} \quad\Longleftrightarrow\quad p \;>\; p_{\text{res}} + \frac{C_{\text{rev,doc}}}{C_{\text{err}}}
$$

With $C_{\text{err}} = \$40$: $p^{*} = 0.005 + 0.45/40 = 0.005 + 0.01125 = 0.01625$. So **review any document whose error probability exceeds about 1.6%**, which means a calibrated confidence threshold of $1 - 0.01625 = 0.984$. The threshold is not a taste setting; it follows from three business numbers. If wrong records cost \$400 instead (payments to the wrong account), $p^{*} = 0.005 + 0.001 = 0.6\%$ and the review rate rises sharply.

## Checking it against a sweep

Take a labelled sample of documents, sorted from safest to riskiest, in six bands with these observed error probabilities: the safest 50% average 0.3%; then four bands of 10% each at 0.6%, 0.9%, 1.5% and 3.0%; and the riskiest 10% at 12%. With no review, the error rate is $0.5\times0.003 + 0.1\times(0.006 + 0.009 + 0.015 + 0.03 + 0.12) = 1.95\%$, or 19,500 wrong records a month. Reviewing the riskiest $r$ share first gives:

| Review rate $r$ | Wrong records / month | Accuracy | Review cost | Error cost (\$40 each) | Total |
|---|---|---|---|---|---|
| 0% | 19,500 | 98.05% | \$0 | \$780,000 | \$780,000 |
| 10% | 8,000 | 99.20% | \$45,000 | \$320,000 | \$365,000 |
| **20%** | **5,500** | **99.45%** | **\$90,000** | **\$220,000** | **\$310,000** |
| 30% | 4,500 | 99.55% | \$135,000 | \$180,000 | \$315,000 |
| 40% | 4,100 | 99.59% | \$180,000 | \$164,000 | \$344,000 |

The minimum sits at $r = 20\%$, matching the rule: the band added going from 10% to 20% has error probability 3.0%, above $p^{*} = 1.6\%$, so it pays (it avoids $100{,}000 \times 0.025 = 2{,}500$ errors for \$45,000); the next band, at 1.5%, falls below $p^{*}$ and does not (it avoids only 1,000 errors, worth \$40,000, for \$45,000). The curve is also flat around the optimum: 30% costs only 1.6% more in total, which tells you the threshold need not be exact. Note too that 99.45% meets the "under 1% wrong" requirement at $r = 10\%$ already (99.2%), so the requirement alone would have under-reviewed; the economics asked for more.

## Improving the economics

Three levers, in order of effect:

1. **Move the bands.** A better model or prompt lowers $p$ across documents, shrinking the share above $p^{*}$. Halving error in the 3.0% band to 1.5% would make that band not worth reviewing, avoiding \$45,000 a month of review cost.
2. **Cut review time $t$.** Highlight the failing fields, crop the evidence, pre-fill the correction, keep keyboard shortcuts. Dropping from 90 to 60 seconds lowers $C_{\text{review}}$ by a third (to \$60,000) and lowers $p^{*}$, so more documents become worth reviewing.
3. **Reduce $C_{\text{err}}$** with downstream controls such as payment holds for first-time vendors, so a mistake is cheaper to reverse.

## Capacity and the loop

Documents arrive unevenly, so reviewers are a queue. At 20% review the steady average is $200{,}000/21 \approx 9{,}500$ reviews per working day; a reviewer clears $6 \times 3600/90 = 240$ a day, so 46 reviewers handle about 11,000, only 16% headroom. A 3× peak day would build a backlog; you clear it with flexible capacity, or by temporarily raising the confidence bar for low-value documents, trading a little error for turnaround. Review is also your **learning loop**: every correction is a labelled example. Feed corrections to the evaluation set, to threshold re-calibration and to prompt changes, so $r$ trends down over time.

## In practice

Report four numbers weekly: review rate, reviewer minutes per reviewed document, post-review error rate from a random audit, and backlog age. When review rate creeps up with no change in volume, a new supplier template or a model drift is usually the cause, and it is cheaper to fix than to hire.

```quiz
{"q": "Review costs \\$0.45 per document, wrong records cost \\$40 each, and review leaves a 0.5% residual error. Above what error probability is it worth reviewing a document?", "options": ["About 1.1%", "About 1.6%", "About 0.5%", "About 4%"], "answer": 1, "explain": "The break-even is $p^* = 0.005 + 0.45/40 = 0.01625$. The 1.1% figure forgets that review itself leaves some error; 0.5% is only the residual."}
```

```quiz
{"q": "100,000 documents a month are reviewed, each taking 72 seconds. A reviewer has 126 productive hours a month. How many reviewers are needed (before any buffer)?", "options": ["About 16", "About 57", "About 100", "About 32"], "answer": 0, "explain": "Hours = $100{,}000 \\times 72 / 3{,}600 = 2{,}000$; $2{,}000 / 126 = 15.9$, so about 16. The figure 57 would come from dividing by only 35 hours, a wrong productive-hours assumption."}
```
