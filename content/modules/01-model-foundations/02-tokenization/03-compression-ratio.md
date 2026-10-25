---
title: Compression ratio and diminishing returns
minutes: 7
---

A tokenizer is a compressor. Its job is to describe text with as few symbols as possible while keeping the dictionary a manageable size. The number engineers use to judge it is the **compression ratio**: how much text, on average, each token carries. A higher ratio means shorter sequences, so faster and cheaper inference and more text in the same context window.

Compression is not uniform. A tokenizer trained mostly on English prose compresses English prose well and other inputs less well, in the same way a shorthand invented for law lectures is clumsy in a chemistry class. Measuring the ratio on *your* traffic, not on a vendor's headline figure, is the practical skill.

## Measuring it

The most common definitions, for a text with $C$ characters, $W$ words, $Y$ bytes and $T$ tokens:

$$
r_{\text{char}} = \frac{C}{T}\ (\text{characters per token}), \qquad r_{\text{byte}} = \frac{Y}{T}\ (\text{bytes per token}), \qquad f = \frac{T}{W}\ (\text{tokens per word})
$$

The last one, tokens per word, is often called **fertility**. For English with a modern tokenizer, $r_{\text{char}} \approx 4$ and $f \approx 1.3$. For plain ASCII text, characters and bytes are the same; for other scripts they are not (next topic).

Two quick conversions you will use constantly:

- **Tokens from text length**: $T \approx C / r_{\text{char}}$. A 10,000-character English report at 4 characters per token is about $10{,}000 / 4 = 2{,}500$ tokens.
- **Text capacity of a context window**: a 128,000-token window holds about $128{,}000 \times 4 = 512{,}000$ characters, or $128{,}000 \times 0.75 = 96{,}000$ words of English. If your content tokenizes at 2 characters per token instead, the same window holds half as much.

## Why more merges help less and less

Each BPE merge removes as many tokens as the merged pair occurred. The first merges grab the most frequent pairs, so they save the most; later merges glue together rarer and rarer pairs. In the previous topic's corpus:

| Merges $k$ | Pair merged | Saved $c_k$ | Tokens $T_k$ | $r_{\text{char}} = 35 / T_k$ |
|---|---|---|---|---|
| 0 | — | — | 35 | 1.00 |
| 1 | t + e | 9 | 26 | 1.35 |
| 2 | te + n | 5 | 21 | 1.67 |
| 3 | te + a | 4 | 17 | 2.06 |

The savings shrink: 9, then 5, then 4. Since $T_k = T_0 - \sum_{j \le k} c_j$ and the counts $c_j$ tend to fall as $k$ grows, the curve of $r_{\text{char}}$ against vocabulary size climbs steeply and then flattens. On real corpora, going from 50,000 to 100,000 vocabulary entries buys a modest gain in compression, far less than doubling. That flattening is why vocabularies stop at tens or hundreds of thousands rather than millions.

## See it

```sim
bpe-tokenizer
{"merges": 0, "pretokenize": true}
```

Move the merges slider slowly from 0 to 300 and watch the **chars per token** line chart. It rises fast for the first couple of dozen merges, then flattens and finally stops: on a short text, once no pair appears twice there is nothing left worth merging, and training ends early. Then paste in a paragraph of your own (an email, some code, a recipe) and compare its chars-per-token at 100 merges with the default text. Text with lots of repetition compresses better; varied text compresses worse.

## In practice

- **Measure on your own data.** Run the real tokenizer over a sample of a few thousand of your actual prompts and outputs, then compute $T/W$ and $C/T$. Typical surprises: JSON and code often produce noticeably more tokens per word than prose, and numbers with many digits are expensive.
- **Compression ratio is a cost multiplier.** Two models with the same price per token but different tokenizers do not cost the same for your workload. If one tokenizer needs 15% more tokens for your text, it is effectively 15% more expensive and 15% slower to generate.
- **Ratios differ between tokenizers of the same family.** Newer tokenizers with larger vocabularies usually compress English and code somewhat better than older ones, so token counts for the same prompt change when you switch model generations. Re-estimate budgets when you upgrade.
- **Do not compare model losses across tokenizers directly.** Loss is per token; a tokenizer with longer tokens makes each prediction harder but there are fewer of them. Comparisons use per-character or per-byte measures (for example bits per byte) instead.

```quiz
{"q": "A support transcript has 6,000 words. Your tokenizer averages 1.4 tokens per word on this data. How many tokens is it, and does it fit in an 8,192-token window with 1,000 tokens reserved for the answer?", "options": ["8,400 tokens; it does not fit", "4,286 tokens; it fits", "8,400 tokens; it fits", "7,200 tokens; it fits"], "answer": 0, "explain": "$6{,}000 \\times 1.4 = 8{,}400$ tokens, and only $8{,}192 - 1{,}000 = 7{,}192$ are available for input. Dividing by the fertility instead of multiplying gives 4,286; 7,200 uses the English prose estimate of 1.2 rather than the measured 1.4."}
```

```quiz
{"q": "Why does each additional BPE merge usually improve compression less than the one before?", "options": ["Later merges are applied to fewer words because the vocabulary is full", "Merges are chosen in order of pair frequency, so later merges remove fewer tokens", "Each merge makes the earlier merges invalid", "Compression is capped at 4 characters per token"], "answer": 1, "explain": "A merge removes as many tokens as its pair occurred, and BPE always takes the most frequent pair first. So savings $c_k$ shrink as $k$ grows. There is no hard 4-character cap; that is only a typical English average."}
```
