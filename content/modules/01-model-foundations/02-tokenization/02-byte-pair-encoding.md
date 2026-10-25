---
title: Byte-pair encoding, merge by merge
minutes: 9
---

**Byte-pair encoding** (BPE) is the algorithm behind the tokenizers of GPT-2, GPT-4, Llama and most other LLMs. It began life in 1994 as a data-compression trick and was adapted for sub-word vocabularies in 2016. The idea is greedy and simple: start with single characters, find the pair of neighbouring symbols that occurs most often, glue it into one new symbol, and repeat until the vocabulary is the size you want.

Think of someone who takes notes in a lecture and notices they keep writing "t", "h", "e" in a row. They invent a shorthand squiggle for "the". Then they notice "ing" and make a squiggle for that. After a while they have a personal shorthand tuned to the lectures they attend. BPE builds exactly that shorthand, tuned to its training text.

## The algorithm

**Training** a BPE tokenizer on a corpus:

1. Split the text into words (pre-tokenization) and count how often each word occurs. Write every word as a sequence of single characters.
2. Count every adjacent pair of symbols, weighting each by its word's frequency.
3. Merge the most frequent pair everywhere into a new symbol and record the merge rule.
4. Repeat steps 2 and 3 for a chosen number of merges $M$.

The final vocabulary is the base symbols plus one new symbol per merge:

$$
V = |\text{base symbols}| + M
$$

Each merge of a pair that occurs $c$ times removes exactly $c$ symbols from the corpus (two symbols become one, $c$ times), as long as the pair does not overlap itself as in *aaa*. So if $T_k$ is the total token count after $k$ merges and $c_k$ the count of the pair merged at step $k$:

$$
T_k = T_{k-1} - c_k
$$

**Encoding** new text replays the learned merge rules in the order they were learned. Training is greedy, and so is encoding.

## A complete worked example

Corpus: the word *tea* appears 4 times, *ten* 3 times, *tent* 2 times and *net* 2 times. Base symbols are $\{t, e, a, n\}$, so the base vocabulary has 4 entries. Total characters: $3 \cdot 4 + 3 \cdot 3 + 4 \cdot 2 + 3 \cdot 2 = 12 + 9 + 8 + 6 = 35$, so $T_0 = 35$ tokens.

```steps
Three BPE merges by hand
**Count pairs.** *tea* (×4) contributes t·e and e·a, 4 each. *ten* (×3): t·e and e·n, 3 each. *tent* (×2): t·e, e·n, n·t, 2 each. *net* (×2): n·e and e·t, 2 each. Totals: t·e $= 4+3+2 = 9$, e·n $= 3+2 = 5$, e·a $= 4$, n·t $= 2$, n·e $= 2$, e·t $= 2$.
---
**Merge 1: t + e → te** (9 occurrences). Words are now te·a, te·n, te·n·t, n·e·t. Tokens: $T_1 = 35 - 9 = 26$.
---
**Recount.** te·a $= 4$, te·n $= 3 + 2 = 5$, n·t $= 2$, n·e $= 2$, e·t $= 2$. **Merge 2: te + n → ten** (5). Words: te·a, ten, ten·t, n·e·t. $T_2 = 26 - 5 = 21$.
---
**Recount.** te·a $= 4$, ten·t $= 2$, n·e $= 2$, e·t $= 2$. **Merge 3: te + a → tea** (4). Words: tea, ten, ten·t, n·e·t. $T_3 = 21 - 4 = 17$.
---
**Result.** Vocabulary $4 + 3 = 7$ symbols: t, e, a, n, te, ten, tea. The 35 characters are now 17 tokens, so the compression is $35/17 \approx 2.06$ characters per token. Frequent words became single tokens; the rarer *net* is still spelled out letter by letter.
```

Notice that the intermediate token *te* stays in the vocabulary even though, after merge 3, no word in this corpus is encoded with it. Real vocabularies contain many such stepping-stone tokens.

Encoding a word the tokenizer has never seen, like *teen*, replays the rules in order: t·e·e·n → (merge 1) te·e·n → merge 2 needs te·n adjacent, which it is not, and merge 3 needs te·a, which is absent. Result: *te*, *e*, *n*, three tokens. Nothing is ever unknown; unfamiliar words just cost more tokens.

## See it

Paste the corpus into the sim exactly as below (one word per line, so the merges match the hand calculation).

```sim
bpe-tokenizer
{"text": "tea\ntea\ntea\ntea\nten\nten\nten\ntent\ntent\nnet\nnet", "merges": 3, "pretokenize": true}
```

The merge list should read t + e (×9), te + n (×5), te + a (×4). The sim also counts the 10 line breaks as characters and tokens, so it reports 45 characters and 27 tokens: the 17 word tokens plus 10. Now set merges to 4. Three pairs tie at 2 occurrences, and the tie is broken by a fixed rule; real tokenizers also need such a rule. Then load the default text, set merges to 50, and turn **Split into words first** off: merges can now cross spaces, producing tokens that span a space, such as *e␣*. That is why real tokenizers pre-split text into words, numbers and punctuation before running BPE.

## In practice

- **GPT-2's vocabulary is 50,257 tokens**: 256 base byte values, 50,000 learned merges, and one special end-of-text token. That arithmetic is the formula $V = |\text{base}| + M$ plus special tokens.
- **Pre-tokenization rules matter as much as the merges.** They decide whether a leading space belongs to a word (*␣cat* and *cat* are different tokens), how digits are grouped, and whether code indentation is compressed.
- **Not every tokenizer is BPE.** The **unigram** method (used through the SentencePiece library by models such as T5) starts with a large vocabulary and prunes it, and WordPiece (BERT) picks merges by a likelihood score instead of raw counts. The outputs look similar: sub-word pieces with IDs.
- **Training a tokenizer is cheap** compared with training a model, but it is done once and frozen. A tokenizer trained mostly on English will split other languages into many more pieces, the subject of the bytes-and-Unicode topic.

```quiz
{"q": "A corpus has 1,000 symbols. The most frequent pair (non-overlapping) occurs 120 times. How many symbols remain after merging it, and how does the vocabulary change?", "options": ["880 symbols, vocabulary +1", "880 symbols, vocabulary +120", "1,120 symbols, vocabulary +1", "940 symbols, vocabulary +2"], "answer": 0, "explain": "Each occurrence turns two symbols into one, removing 120 symbols in total; $1{,}000 - 120 = 880$. The merge adds exactly one new entry to the vocabulary, no matter how many times it is used. Option 4 halves the count by mistake."}
```

```quiz
{"q": "In the worked example's final tokenizer (merges t+e, te+n, te+a), how is the word *tent* followed by *net* encoded, as two separate words?", "options": ["tent, net: 2 tokens", "ten, t, n, e, t: 5 tokens", "te, n, t, n, e, t: 6 tokens", "t, e, n, t, n, e, t: 7 tokens"], "answer": 1, "explain": "*tent*: t·e·n·t → te·n·t → ten·t (te+a does not apply), so 2 tokens. *net*: no rule applies, so n, e, t: 3 tokens. Total 5. *tent* would only be one token if a fourth merge ten+t had been learned."}
```

```lab
token-budget
```
