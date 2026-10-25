---
title: Chunk size, overlap and the split-fact probability
minutes: 9
---

A sliding window over a long document can overlap with its neighbour or not. Overlap is insurance: if a boundary cuts a fact in two, the overlapping text appears whole in at least one of the two chunks. Like all insurance it has a premium, which here is extra storage, extra embedding cost and duplicate passages in search results. This topic computes the premium and the payout.

## How many chunks?

Let a document have $L$ tokens, chunks of $s$ tokens, and an overlap of $o$ tokens with $o < s$. Each new chunk starts $t = s - o$ tokens after the previous one (the **stride**). The $j$-th chunk (counting from 0) covers tokens $jt$ to $jt + s$. We need the last chunk to reach the end of the document: $(n-1)\,t + s \ge L$. Solving for $n$:

$$
n = \left\lceil \frac{L - s}{s - o} \right\rceil + 1 = \left\lceil \frac{L - o}{s - o} \right\rceil
$$

and, since each chunk (except possibly the last) holds $s$ tokens, the total tokens stored is about $n \cdot s$, an inflation of about $s/(s-o)$ over the document's own $L$ tokens.

```steps
Worked example: a 10,000-token document
$L = 10{,}000$ and $s = 512$. With no overlap ($o = 0$): $n = \lceil 10000/512 \rceil = \lceil 19.53 \rceil = 20$ chunks.
---
With $o = 64$ (12.5% of $s$): stride $t = 448$, $n = \lceil (10000 - 64)/448 \rceil = \lceil 22.18 \rceil = 23$ chunks.
---
Overhead: $s/(s-o) = 512/448 = 1.143$, so about 14% more text is embedded and stored (23 chunks versus 20 is 15% more).
---
With $o = 256$ (50%): $t = 256$, $n = \lceil 9744/256 \rceil = \lceil 38.06 \rceil = 39$ chunks, almost double. Overhead $512/256 = 2.0\times$.
```

## How likely is a fact to be cut?

Suppose a fact is $f$ tokens long and sits at a uniformly random position. A chunk starting at multiples of the stride $t$ contains the whole fact only if the fact starts no more than $s - f$ tokens after the start of the latest chunk that begins before it. The fact's starting offset within a stride is uniform on $[0, t)$, so:

$$
P(\text{intact}) = \min\!\left(1, \frac{s - f}{s - o}\right), \qquad
P(\text{split}) = \max\!\left(0, \frac{f - o}{s - o}\right)
$$

Read the second formula: a boundary can only hurt facts longer than the overlap, and when $o \ge f$ **no fact of length $f$ can be split**. This is the real purpose of overlap: choose $o$ at least as large as your typical self-contained unit (a fact, a clause, an answer).

```steps
Worked example: chunks of 200 tokens, facts of 40 tokens
No overlap, $o = 0$: $P(\text{split}) = (40 - 0)/(200 - 0) = 0.20$. One fact in five is cut.
---
$o = 20$: $P(\text{split}) = 20/180 = 0.111$. Storage overhead $200/180 = 1.11$.
---
$o = 40$: $P(\text{split}) = 0/160 = 0$. Storage overhead $200/160 = 1.25$.
---
Going past $o = 40$ buys nothing against these facts, but costs more: $o = 100$ gives overhead $200/100 = 2.0$ for the same zero splits.
```

| Overlap $o$ | $P(\text{split})$ for $f=40$ | Storage overhead $s/(s-o)$ |
|---|---|---|
| 0 | 0.200 | 1.00 |
| 20 | 0.111 | 1.11 |
| 40 | 0.000 | 1.25 |
| 100 | 0.000 | 2.00 |

The model assumes facts have a fixed length and arbitrary positions. Real facts vary in length and cluster at paragraph starts, so measure the actual split rate on your labelled questions rather than trusting the formula for a final choice. The sim does exactly that with six facts in a real document.

## See it

```sim
chunking
{"strategy": "fixed", "chunkSize": 120, "overlap": 20}
```

Compare overlap 0, 20 and 40 at size 120. Read off the chunk count, the average chunk size, the index overhead and the number of split facts. Find the smallest overlap that leaves no fact split and the overhead it costs. Then use 60-token chunks with overlap 30 and see how a small chunk with big overlap multiplies the number of chunks.

## The costs of overlap that the formula hides

- **Duplicate results.** Two overlapping chunks that both match the query appear next to each other in the top $k$, wasting prompt tokens. Merge adjacent hits or apply MMR (see [Redundancy and MMR](/learn/retrieval-and-rag/hybrid-and-reranking)).
- **Inflated recall metrics.** A "hit" on either of two near-identical chunks is easy to count twice; label by document span, not chunk ID.
- **Re-embedding on edits.** Changing a few words shifts the stride for everything after it in a fixed-window scheme, so nearly every later chunk changes. Structure-aware chunking (next topic) is more stable.

## In practice

A reasonable default is overlap of 10 to 20% of the chunk size, then check the split-fact rate on your own questions. Overlap is a patch for naive boundaries. If your documents have headings, paragraphs and sentences, splitting on them removes most of the need for it.

```quiz
{"q": "A document has L = 3,000 tokens. Chunks are s = 400 with overlap o = 100. How many chunks?", "options": ["8", "10", "7.5", "9"], "answer": 1, "explain": "$n = \\lceil (L - o)/(s - o) \\rceil = \\lceil 2900/300 \\rceil = \\lceil 9.67 \\rceil = 10$. Without overlap it would be $\\lceil 3000/400 \\rceil = 8$; fractional counts are rounded up because a partial last chunk still has to exist."}
```

```quiz
{"q": "Chunks of s = 300 tokens, facts of f = 60 tokens, overlap o = 60. What is the chance a fact is split, and what is the storage overhead?", "options": ["0.20 and 1.25", "0 and 1.25", "0 and 1.20", "0.20 and 1.20"], "answer": 1, "explain": "$P(\\text{split}) = \\max(0, (60-60)/(300-60)) = 0$ because the overlap is as long as the fact. Overhead $= 300/240 = 1.25$. 0.20 is the no-overlap split probability, $60/300$."}
```
