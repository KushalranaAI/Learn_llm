---
title: Audits, user requests and compliance evidence
minutes: 7
---

```callout-warn
Principles, not legal advice
Which laws, standards and contract terms apply to you depends on your country, sector, customers and data. This topic describes the engineering side that most of them have in common. Ask your legal, privacy and security teams which obligations apply, and what evidence they need.
```

Compliance, at its core, is the ability to **show** what you do with data and that you do what you say. Customers, auditors and regulators ask for evidence: who accessed this data, where is it stored, when was it deleted, who approved this model, what did the system do on that day. The engineering work is to make those questions answerable quickly, from records rather than recollection.

## Common themes

Frameworks differ in detail but cluster around a few ideas. Examples include general privacy laws, security standards and audit reports such as SOC 2 and ISO 27001, sector rules for health and finance, and AI-specific rules that ask for documentation and human oversight. Check which apply to you.

| Theme | The question | Engineering evidence |
|---|---|---|
| Lawful and limited use | why do you have this data, and do you use it only for that? | data-flow map, purpose per store, vendor terms |
| Minimisation and retention | do you keep only what you need, only as long as needed? | retention policy, TTL configs, deletion tests |
| Access control | who can see it? | role definitions, access reviews, access logs |
| Security | is it protected? | encryption, secret management, isolation tests |
| User rights | can people see, correct and delete their data? | request workflow, deletion across every store |
| Vendor management | do suppliers meet our standard? | contracts, assessments, sub-processor list |
| Transparency and oversight | can you explain and supervise the system? | model and prompt documentation, human review process |
| Incident response | do you detect, report and learn? | runbooks, postmortems, notification process |

## The audit trail

An **audit log** records security-relevant events: who accessed or changed what, when, from where, and with what result. For LLM systems add events specific to them: which model and prompt version served a request, which tools were called with what arguments, which documents were retrieved, which guardrail fired, who approved a high-risk action, who viewed raw prompt logs and why.

Good audit logs are **append-only** (nobody can edit history), **time-stamped** from a reliable clock, **separate** from application logs, and retained for the period your obligations require. Do not put raw personal text in them; reference ids instead.

Completeness matters because an investigation needs several records at once. If an incident reconstruction needs four independent logs and each is present with probability 0.99, the chance you can reconstruct the full picture is

$$
0.99^{4} = 0.961
$$

so about one investigation in 26 hits a gap. Raising each log to 0.999 gives $0.999^4 = 0.996$. Gaps are usually discovered during the audit; test completeness yourself by tracing a sample request end to end every quarter.

## User requests: access and deletion

Individuals may ask what data you hold about them, and to correct or delete it. For an LLM product, the data lives in many places: the account database, request logs, the cache, vector indexes built from their documents, traces, evaluation sets, backups and a vendor's systems. The effort of handling one request scales with the number of places:

$$
\text{effort per month} = R \times S \times m
$$

where $R$ is requests per month, $S$ the number of stores to search and $m$ the minutes per store. With $R = 40$, $S = 6$ stores and $m = 15$ minutes manually:

$$
40 \times 6 \times 15 = 3{,}600 \text{ minutes} = 60 \text{ hours per month}
$$

If each store has an automated deletion hook by user id taking about 2 minutes of supervision, effort falls to $40 \times 6 \times 2 = 480$ minutes, 8 hours. The bigger win is design: **tag every record with the user and tenant id** from the start, because a store you cannot query by user cannot honour a deletion request. Vector chunks and cache entries need these tags too, and so do evaluation sets and fine-tuning data.

```steps
Handle a deletion request
Verify the requester's identity and record the request in the audit log.
---
Look up every store from the data-flow map where that user's data can live: databases, logs, cache, vector index, traces, evaluation sets, vendor systems.
---
Delete or anonymise in each, and instruct vendors where they hold copies. Record the completion time.
---
Note what cannot be deleted immediately (backups that expire on schedule) and when they will expire.
---
Confirm to the requester within the time your obligations require, and keep the evidence.
```

## Model and system documentation

Many regimes and enterprise customers ask for documentation of the AI system itself. A short, maintained **system card** answers most questions: purpose and intended users, model and version, data it uses, known limits and failure modes, evaluation results, guardrails, human oversight and a contact for issues. Keep it in version control beside the prompts and update it at each release; an out-of-date card is worse than none.

## In practice

Prepare evidence as part of normal work, not a scramble before an audit. A useful habit is an **evidence folder** per quarter with the retention policy, an access review, the latest isolation test results, the vendor list, a sample audit trail, the incident postmortems and the system card. A review that takes an afternoon beats a fire drill. Finally, when a customer security questionnaire arrives, answer from this record; if an answer is "we think so", that is a gap to close.

```quiz
{"q": "An incident investigation needs 3 independent logs, each available with probability 0.98. What is the chance all three are available?", "options": ["About 94%", "98%", "About 6%", "About 99.9%"], "answer": 0, "explain": "0.98³ = 0.941. All logs must be present, so the probabilities multiply; 98% would be the figure for a single log, and 6% is the chance that at least one is missing."}
```

```quiz
{"q": "Why should every record, including vector chunks and cache entries, carry a user or tenant id?", "options": ["So that access control and deletion requests can be carried out by query", "Because models need ids to run", "To make embeddings more accurate", "Because ids are required in every prompt"], "answer": 0, "explain": "A store you cannot filter by user cannot enforce per-user access or delete one person's data on request. The id is metadata for control, not for the model."}
```
