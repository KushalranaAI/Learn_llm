---
title: Requirements and estimation for a batch pipeline
minutes: 9
---

"Design a system that reads invoices and contracts and fills in a database." This is the least glamorous LLM case and one of the most common in industry, because every company has a pile of PDFs that a person currently retypes. The first thing to notice, and to say out loud, is that it is **not an interactive system**. Nobody waits with a spinner; documents arrive, get processed within hours, and land in a finance or legal system. That one fact changes the estimation: throughput is measured in documents per second, latency targets are hours, and the expensive resource is not a GPU but a **person who reviews the doubtful cases**.

## Clarify

| Question | Assumed answer | Why it matters |
|---|---|---|
| Volume? | 1,000,000 documents per month, mostly invoices, some contracts | Sizing |
| Pages? | 4 per document on average | Tokens and OCR cost |
| Quality of scans? | 60% digital PDFs, 40% scans or phone photos | OCR and vision choice |
| Fields? | 12 header fields per invoice (vendor, number, date, total...) plus line items | Schema, error maths |
| Turnaround? | 95% processed within 4 hours; hard limit 24 hours | Batch, not real time |
| Accuracy? | Under 1% of records with a wrong field after review | Review design |
| Cost of a wrong field? | About \$40 on average (a mis-paid invoice, a rework) | Review threshold |
| Sensitivity? | Contains bank details and personal data | Safety, data handling |

## Tokens per document

A page enters the model in one of two ways. A **vision** route sends the page image and the model reads it directly; an image costs a fixed number of tokens, which we take as 1,500 per page. An **OCR** route first converts the page to text with a separate engine (about 700 tokens of text per page) and sends the text. Add a fixed instruction-and-schema prompt of $t_{\text{p}} = 800$ tokens and an output JSON of $T_{\text{out}} = 400$ tokens.

$$
T_{\text{in}} = P \cdot t_{\text{page}} + t_{\text{p}}, \qquad c_{\text{doc}} = \frac{T_{\text{in}} \, p_{\text{in}} + T_{\text{out}} \, p_{\text{out}}}{10^6}
$$

$P$ is pages per document, $t_{\text{page}}$ tokens per page (1,500 for an image, 700 for OCR text), $p_{\text{in}}$ and $p_{\text{out}}$ the hypothetical prices per million tokens.

```steps
Cost per document, vision route on the large model
Input tokens: $T_{in} = 4 \times 1{,}500 + 800 = 6{,}800$.
---
Input cost: $6{,}800 \times \$1.00 / 10^6 = \$0.0068$.
---
Output cost: $400 \times \$4.00 / 10^6 = \$0.0016$.
---
Total $c_{doc} = \$0.0084$, so a million documents cost **\$8,400 per month**.
```

## Four candidate pipelines

OCR engines are priced per page; assume a hypothetical \$0.0015 per page, so $4{,}000{,}000 \times 0.0015 = \$6{,}000$ per month for a million four-page documents.

| Pipeline | Tokens in (per doc) | Model cost / doc | Model cost / month | Plus OCR | Total / month |
|---|---|---|---|---|---|
| A. Vision, large model | 6,800 | \$0.00840 | \$8,400 | none | **\$8,400** |
| B. OCR + large model | 3,600 | \$0.00520 | \$5,200 | \$6,000 | **\$11,200** |
| C. OCR + small model | 3,600 | \$0.00052 | \$520 | \$6,000 | **\$6,520** |
| D. OCR + cascade (small, 25% escalate to large) | 3,600 | \$0.00182 | \$1,820 | \$6,000 | **\$7,820** |
| E. Vision, small model | 6,800 | \$0.00084 | \$840 | none | **\$840** |

Cascade cost in row D is $c_{\text{small}} + 0.25\,c_{\text{large}} = 0.00052 + 0.25 \times 0.0052 = \$0.00182$. Every option costs under \$12,000 a month. Hold that thought: model cost is going to be a rounding error next to review labour, so **accuracy per dollar of model matters far less than errors per reviewed document**. Pipeline E is attractive only if its accuracy holds up, which is an evaluation question for a later topic.

## Throughput is a batch number

Documents do not arrive uniformly: month-end closes and weekly supplier runs concentrate volume. Take an average of $10^6 / 30 = 33{,}333$ documents per day and a peak day of $3\times$ that, 100,000.

$$
\lambda_{\text{peak}} = \frac{100{,}000}{86{,}400} \approx 1.16 \text{ docs/s}, \qquad L = \lambda W
$$

Little's law $L = \lambda W$ gives documents in flight: if one document spends about 15 seconds across preprocessing, OCR and the model call ($W = 15$ s), then $L = 1.16 \times 15 \approx 17$ documents are in flight at peak. That is a small worker pool, not a cluster.

The model load is just as gentle. At peak the OCR+text route sends $100{,}000 \times 3{,}600 / 86{,}400 \approx 4{,}170$ input tokens per second and receives 460 output tokens per second. Prefill for an 8B-class model costs about $2N$ FLOPs per token with $N = 8\times10^9$ parameters: $4{,}170 \times 1.6\times10^{10} \approx 6.7 \times 10^{13}$ FLOP/s, about 67 TFLOP/s, a fraction of one GPU's effective 400 TFLOP/s. **Self-hosting needs less than one GPU of compute, so it is chosen (if at all) for data-residency reasons, not cost or capacity.**

| Quantity | Value |
|---|---|
| Documents / month, / average day, / peak day | 1 M, 33,333, 100,000 |
| Pages / month | 4 M |
| Peak throughput | 1.16 docs/s |
| Documents in flight at peak ($W$ = 15 s) | about 17 |
| Peak input tokens/s (OCR route) | about 4,170 |
| Model + OCR cost / month | \$840 to \$11,200 depending on pipeline |

## In practice

Batch APIs, where a provider returns results within 24 hours at a discount (assume a hypothetical 50%), fit this workload exactly and halve the model line. But the first decision is usually the unglamorous one: how many pages per document really occur. A tail of 200-page contracts can carry more tokens than the other 900,000 invoices together, so estimate with the distribution, and plan chunking for long documents.

```quiz
{"q": "A document has 5 pages, each costing 1,500 image tokens, plus an 800-token prompt, and returns 400 tokens. Prices are \\$1.00 input and \\$4.00 output per million tokens. What is the cost per document?", "options": ["\\$0.0084", "\\$0.0099", "\\$0.0093", "\\$0.0024"], "answer": 1, "explain": "Input is 5 × 1,500 + 800 = 8,300 tokens = \\$0.0083; output 400 tokens = \\$0.0016; total \\$0.0099. \\$0.0084 is the 4-page cost."}
```

```quiz
{"q": "Peak load is 100,000 documents a day and each document takes about 15 seconds end to end. About how many documents are in flight at once?", "options": ["About 1", "About 17", "About 1,500", "About 100,000"], "answer": 1, "explain": "Little's law: $L = \\lambda W = (100{,}000/86{,}400) \\times 15 \\approx 17$. The 1,500 figure would be total seconds per day divided by something unrelated; this is a small-pool system."}
```
