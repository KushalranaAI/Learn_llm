---
title: Data minimisation and re-identification
minutes: 8
---

**Data minimisation** is the principle of collecting, sending and keeping only the data a task actually needs. It is cheap to apply at design time and expensive to retrofit. For LLM features it has three practical forms: send less to the model, store less afterwards and choose providers whose terms match your data class.

## Send the model less

A model rarely needs a person's full record to do its job. Compare what a support assistant is often given with what it needs:

| Task | Often sent | Usually enough |
|---|---|---|
| Explain a billing error | the whole customer profile | plan, last invoice lines, error code |
| Summarise a ticket | full thread with names, emails | thread with names replaced by roles |
| Classify intent | the message and account history | the message only |
| Draft a reply | all prior emails | the last two messages and the policy text |

Every field you remove cannot be leaked by the model, logged by the provider or echoed back to the wrong person. It also shortens the prompt, which saves money, so minimisation and cost reduction point the same way.

## Why "non-identifying" fields are not safe

It is tempting to say "we removed names, so the data is anonymous". Often it is not, because combinations of ordinary fields can single out a person. Fields like postal code, birth date and gender are **quasi-identifiers**: none identifies anyone alone, but together they can. Count the combinations:

$$
K = N_{\text{postcode}} \times N_{\text{birthdate}} \times N_{\text{gender}}
$$

where each $N$ is the number of distinct values of that field. With roughly 40,000 postcodes, 29,200 birth dates (80 years of 365 days) and 2 gender values:

$$
K = 40{,}000 \times 29{,}200 \times 2 = 2.336 \times 10^9
$$

A country of $P = 330$ million people has an average of $P/K = 330 \times 10^6 / 2.336 \times 10^9 \approx 0.14$ people per combination. With far fewer people than possible combinations, most combinations are held by **at most one person**, so these three "harmless" fields identify most individuals uniquely. (Real populations cluster, so the exact share differs, but published studies of this kind found the large majority of people were unique on such a triple.) The lesson: stripping names is not anonymisation.

Free text is worse. A support message may name the street, the employer, a rare illness and a date, none of which a regex for names will catch. A model can also memorise rare strings from training data and, under the right prompt, reproduce them, so personal data that reaches a training or fine-tuning set can reappear later.

## Reduce the identifying power

Methods that help, with their limits:

| Method | What it does | Limit |
|---|---|---|
| Remove direct identifiers | drop names, emails, ids | quasi-identifiers remain |
| Generalise | postcode to region, birth date to year | loses detail, may harm the task |
| Pseudonymise | replace ids with consistent tokens | reversible if the mapping leaks; still personal data in many regimes |
| Aggregate | report counts, not rows | cannot support row-level tasks |
| $k$-anonymity | ensure each combination appears in at least $k$ records | weak when the sensitive attribute is uniform within a group |

For example, generalising birth date to year only (80 values) and postcode to the first 3 digits (about 900 values): $K = 900 \times 80 \times 2 = 144{,}000$ combinations, and $330 \times 10^6 / 144{,}000 \approx 2{,}290$ people per combination on average, so anyone is hidden among thousands.

```steps
Minimise a prompt before sending it
List the fields in the prompt and what the task needs from each.
---
Drop every field the task does not need.
---
Replace direct identifiers with typed placeholders and generalise quasi-identifiers (exact age to a band, address to city).
---
Run the redaction detector and a final check for secrets such as keys and tokens.
---
Send, and log only the minimised version.
```

## Third-party providers

Whenever data leaves your boundary, ask a standard set of questions of the vendor, and write the answers down:

| Question | Why it matters |
|---|---|
| Is our data used to train or improve models, and can we opt out in the contract? | prevents your data from reappearing in other users' outputs |
| How long are prompts and outputs retained, and can retention be set to zero? | sets the provider-side exposure |
| Where is data processed and stored (region)? | residency requirements |
| Who at the vendor can access it and under what controls? | insider risk |
| What certifications and audit reports exist? | evidence for your own compliance |
| What happens on termination: is our data deleted, and how is that confirmed? | exit plan |
| Which sub-processors are used? | the chain of custody |

If an answer is unsatisfactory for a data class, use a different vendor, a self-hosted model, or send only data of a lower class.

## In practice

Make minimisation a review question for every new LLM feature: "what is the least data that would work?". Test whether the feature still works with generalised or placeholder data before accepting the broader version. It usually does, and the prompts get cheaper and faster as well.

```quiz
{"q": "A dataset has 365 birth dates (day of year only), 1,000 postcodes and 2 genders. There are 5 million people. About how many people share each combination on average?", "options": ["About 6.8", "About 0.14", "About 730", "About 5 million"], "answer": 0, "explain": "K = 365 × 1,000 × 2 = 730,000 combinations, and 5,000,000/730,000 ≈ 6.8 people per combination. With groups of about seven, individuals are still partly hidden, unlike the earlier example where K far exceeded the population."}
```

```quiz
{"q": "Why does removing names not make a dataset anonymous?", "options": ["Combinations of quasi-identifiers such as postcode and birth date can single out individuals", "Names are never personal data", "Models can always guess names", "Anonymous data cannot be stored"], "answer": 0, "explain": "Several ordinary fields together can be unique to one person, and free text can contain identifying details a name filter never sees. Genuine anonymisation has to consider the combinations."}
```
