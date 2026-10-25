---
title: Ingestion, freshness and permission-aware retrieval
minutes: 10
---

Search quality is capped by what is in the index and how current it is. Permission safety is capped by how the access rules get into the index. Both are decided on the write path, so this is where the interviewer will push first when you say "ACL-aware retrieval".

## Connectors and incremental sync

Each source (wiki, drive, ticketing system) gets a connector that does two jobs: a **full crawl** to build the index the first time, and **incremental sync** afterwards. Prefer push (webhooks or change feeds) where a source offers it, and fall back to polling a "modified since" cursor where it does not. Every change flows through the same pipeline: fetch, extract text, hash it, skip if unchanged, chunk, embed, upsert with the new `doc_version`, and delete the chunks of removed documents.

Freshness depends on how often you look. If a connector polls every $T$ minutes and the pipeline takes $d$ minutes to process a change, a document that changes at a random moment waits on average $T/2 + d$ and at worst $T + d$. With $T = 10$ and $d = 3$: mean 8 minutes, worst case 13, inside the 15-minute target. Polling every 30 minutes would break it (worst case 33).

The load is small. A 1% daily churn of 20 million documents is $200{,}000$ changes a day, $200{,}000 / 86{,}400 \approx 2.3$ per second, and embedding them is $200{,}000 \times 1{,}500 = 300$ million tokens, about **\$6 a day** at the hypothetical embedding price. Ingestion is cheap in money and expensive in engineering: retries, ordering, deletes and rate limits are the work.

## Where permissions come from

Every source has its own model: document-level lists, folder inheritance, groups of groups, link-sharing. The connector's job is to flatten these into one field on each chunk: the set of **principals** (users and groups) that may read the parent document. Two rules keep this honest:

1. **Permissions sync on a faster, separate path than content.** The revocation target is 5 minutes against 15 for content, so ACL changes are polled or pushed more often and update only the `allowed_principals` field, without re-embedding.
2. **Deny by default.** A chunk with a missing or unparseable ACL is not searchable until the connector says otherwise.

At query time the service expands the asker into their principal set $P_u$ (the user plus all groups, including nested ones, cached for a few minutes). A chunk is visible when $A_c \cap P_u \neq \emptyset$, where $A_c$ is the chunk's allowed principals.

## Pre-filter or post-filter?

You can apply the permission test *after* the nearest-neighbour search (post-filter) or *inside* it (pre-filter). Post-filtering is simple, but it silently loses results. Let $f$ be the fraction of chunks the user may see, suppose you retrieve $k'$ candidates and you want $k$ visible ones. If visibility were independent of relevance, the number visible would be binomial with mean

$$
\mathbb{E}[\text{visible}] = k' f
$$

so you must over-fetch by a factor $k'/k \approx 1/f$ to expect $k$ survivors, and more to be confident.

```steps
Post-filtering by hand, wanting k = 8 visible chunks
Employee A can see $f = 50\%$ of the corpus: fetching $k' = 16$ gives an expected 8 visible. That is only a coin flip (the probability of at least 8 visible is 0.60); $k' = 23$ gives 95%.
---
Employee B can see $f = 20\%$. Fetching 40 gives exactly 8 on average, but only a 56% chance of reaching 8; for 95% confidence you need $k' = 63$.
---
Contractor C can see $f = 5\%$: you would need $k' = 260$ candidates for 95% confidence. Fetching 50 gives an expected 2.5 visible chunks, and the answer is built from almost nothing.
---
Worse, relevance and permission are *not* independent: the best documents for an HR question may be exactly the ones this user cannot see, so the visible ones are lower quality than average. Over-fetching fixes the count but not the quality.
```

Pre-filtering fixes the count, because the index only ever returns allowed chunks, but it has its own cost. In a graph index such as HNSW, a restrictive filter breaks the graph's navigation (most neighbours are disallowed), so the search either explores far more nodes (latency grows roughly like $1/f$) or loses recall. Real systems use a mix:

| Strategy | Works well when | Weakness |
|---|---|---|
| Post-filter, over-fetch $1/f$ | Most users see most documents ($f > 0.3$) | Fails for low-visibility users; wasted work |
| Pre-filter inside the index | Filters are moderately selective | Graph traversal slows or loses recall at small $f$ |
| Partition by ACL group (one index per large audience) | A few big audiences (all-staff, engineering, HR) | Many small groups make too many partitions; duplication |
| Hybrid: partition public content, filter the rest | Typical company: 70% broadly visible, 30% restricted | More moving parts |

A practical answer: keep a large "visible to everyone" partition searched without a filter, a filtered index for restricted content, and merge the two result lists. Most queries then hit the fast partition, and low-$f$ users still get a proper pre-filtered search of what they can see.

## In practice

Two bugs account for most real leaks. The first is **group expansion lag**: someone leaves a group, the source updates, but the cached principal set lives another hour. Keep principal caches short (minutes), and on any security-sensitive source do the live check from the previous topic. The second is **derived content**: a summary, a cached answer or a "related documents" widget that was built from restricted text and shown to people without access. Anything computed from a document inherits that document's ACL, or the intersection of the ACLs if it combines several.

```quiz
{"q": "A user can see 20% of chunks and you need 8 visible results. Roughly how many candidates should a post-filter fetch to expect 8 visible, ignoring confidence margins?", "options": ["8", "16", "40", "160"], "answer": 2, "explain": "Expected visible = k'f, so k' = 8 / 0.2 = 40. Fetching 8 would leave about 1.6 visible. And 40 only reaches 8 about half the time; for high confidence you need about 63."}
```

```quiz
{"q": "A connector polls every 10 minutes and processing takes 3 minutes. What is the worst-case delay before a changed document is searchable?", "options": ["3 minutes", "5 minutes", "10 minutes", "13 minutes"], "answer": 3, "explain": "Worst case the change happens just after a poll: wait T = 10 minutes, then d = 3 minutes of processing, so 13. The mean is T/2 + d = 8 minutes; quoting the mean as the SLO would be wrong because the target applies to the worst case."}
```
