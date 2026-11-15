---
title: Why models read tokens, not letters or words
minutes: 7
---

```callout-before
Before you start
You need the idea from the last lesson that a language model is a classifier over a fixed vocabulary of $V$ possible next items. This lesson is about what those items are.
```

```predict
{"q":"Why not give every whole word its own token? With a one-million-word vocabulary and 4,096 numbers per token vector, how big would the input table alone be?","options":["About 4 million parameters","About 41 million parameters","About 4.1 billion parameters, more than half of a 7B model"],"answer":2,"reveal":"About 4.1 billion: one million rows of 4,096 numbers each. That cost, plus words the table would still miss, is why models use sub-word tokens. The next section puts the trade-off in numbers."}
```

A network only understands numbers, so text has to be cut into pieces and each piece given an integer ID. The question is how big the pieces should be. Cut too small and every sentence becomes a very long sequence. Cut too big and you need an impossibly large dictionary, and still meet words that are not in it.

Picture writing a telegram where you pay per symbol. Spelling every word letter by letter is always possible but long. Having one code for every word in the language is short but the codebook is enormous, and a new name or a typo breaks it. The practical answer is a codebook of common chunks: whole codes for frequent words like *the*, and pieces like *un*, *believ*, *able* that can be combined to spell anything else. Those chunks are **tokens**, and the codebook is the **vocabulary**. The program that cuts text into tokens is the **tokenizer**.

## In everyday life

Imagine a restaurant kitchen that must cook any dish a customer might ask for. You could chop every ingredient down to dust and build each dish from scratch. That works for anything, but every order takes forever. You could also stock one ready-made frozen meal per dish. Orders are quick, but the freezer must be enormous, and a customer who asks for something new gets nothing.

Real kitchens do neither. They keep a shelf of common prepared bases, such as chopped onion, ginger-garlic paste and boiled rice, plus raw basics for everything else. A language model faces the same choice with text. A **token** is one prepared piece of text: a whole common word, a chunk of a word, or a single letter. The **vocabulary** is the full shelf of pieces the model knows. The **tokenizer** is the cook who cuts any sentence into those pieces and gives each one a number label, its **token ID**, so the order slip stays short.

One difference: the kitchen only cooks, but the tokenizer must also rebuild the exact original sentence from the slip, with nothing lost.

**Where you meet it.** A bank's help chatbot must cope with a customer who types a brand-new product name or a spelling mistake. With one code per whole word, that message would hit an unknown word and break. With sub-word pieces, it is simply cut into smaller known chunks and the chatbot carries on.

```scene
title: The kitchen shelf of prepared bases
step: 🍲 A cook must be ready for any dish a customer asks for | any text must be encodable
step: 🥕 Chopping everything to dust handles any order but takes ages | characters make long sequences
step: 🍱 One frozen meal per dish is quick but cannot cover new orders | whole-word vocabulary
step: 🧅 A shelf of common prepared bases plus raw basics covers everything | sub-word tokens
step: 🏷️ Each item on the shelf gets a number, so the order slip is short | token IDs
step: 🍛 The cook can rebuild the exact dish from the slip | decode gives back the text
takeaway: Tokens are pieces big enough to keep sequences short and small enough to spell anything.
```

## The trade-off in numbers

Three choices of unit, for an English sentence of $w$ words:

| Unit | Vocabulary size $V$ | Sequence length $n$ | Problem |
|---|---|---|---|
| Characters (or bytes) | ~100 (256 for bytes) | about $5.5w$ (letters plus spaces) | sequences are long; each token carries little meaning |
| Whole words | hundreds of thousands, still incomplete | $\approx w$ | unknown words, huge embedding table |
| Sub-word tokens | 30,000 to 200,000 | about $1.3w$ | the compromise used by every modern LLM |

Why does sequence length matter so much? Two reasons you will meet properly later. Attention compares every token with every other, so its cost grows like $n^2$. And the context window is a fixed number of tokens. If characters made sequences about four times longer than sub-word tokens, attention would cost about $4^2 = 16$ times more and a 128,000-token window would hold a quarter of the text.

Why does vocabulary size matter? Each vocabulary entry needs its own learned vector of size $d$ (the **embedding**) and its own row in the output layer. With $d = 4{,}096$, a one-million-word vocabulary would need $10^6 \times 4{,}096 \approx 4.1$ billion parameters for the input table alone, more than half of a 7B model, and most of those rare words would be seen too seldom to learn good vectors.

## What a tokenizer gives you

A tokenizer is a pair of functions. **Encode** turns a string into a list of integer IDs; **decode** turns IDs back into the exact string. Formally, with vocabulary $\mathcal{V}$ of size $V$:

$$
\text{encode}: \text{string} \to (t_1, \dots, t_n),\ t_i \in \{0, \dots, V-1\}, \qquad \text{decode}(\text{encode}(s)) = s
$$

That last property, **lossless round-tripping**, is non-negotiable: the model's output IDs must turn back into exactly the text it meant. Modern tokenizers guarantee it by falling back to raw bytes for anything unusual, so no input is ever "unknown".

A typical sub-word tokenizer might split *the tokenizer was unbelievably fast* into pieces like *the*, *␣token*, *izer*, *␣was*, *␣un*, *belie*, *vably*, *␣fast*, where ␣ marks a space attached to the start of a token. The exact split depends on the tokenizer, which is why you should always count tokens with the tokenizer of the model you are actually using.

## See it

The sim trains a tokenizer on a short text. With zero merges every character is its own token; each merge adds one new token to the vocabulary.

```sim
bpe-tokenizer
{"merges": 0, "pretokenize": true}
```

Read the token count at 0 merges: it equals the character count. Now raise merges to 10, 30 and then 100, and watch two numbers move in opposite directions: the **vocabulary size** goes up by one per merge, and the **token count** goes down. Notice that frequent words such as *the* become single tokens early, while rare words stay split into pieces. That is the whole idea of sub-word tokenization, and the next topic shows exactly how each merge is chosen.

## In practice

- **Rules of thumb for English with GPT-style tokenizers**: about 4 characters per token, or about 0.75 words per token (100 tokens is roughly 75 words). Treat these as estimates; code, numbers and other languages differ a lot.
- **Tokens are what you pay for and what fills the context window**, so all cost and length budgeting is done in tokens. The token-cost topic later in this lesson does that calculation.
- **Tokenizers are fixed per model.** You cannot swap the tokenizer of a trained model, because its embeddings and output layer are tied to specific IDs. A fine-tune inherits its base model's tokenizer.

```quiz
{"q": "Switching a model from sub-word tokens to characters makes a typical sequence about 4 times longer. Roughly how much more does the attention computation cost, which scales with $n^2$?", "options": ["4 times", "8 times", "16 times", "It costs less because the vocabulary is smaller"], "answer": 2, "explain": "$n^2$ scaling means $(4n)^2 = 16n^2$. The smaller vocabulary does shrink the embedding and output layers, but it does not reduce the per-pair attention cost, which is driven by sequence length."}
```

```quiz
{"q": "Why do modern tokenizers never produce an 'unknown word' token?", "options": ["Their vocabulary contains every word in every language", "They fall back to individual bytes, which can spell any input", "They delete characters they do not recognise", "They translate rare words to English first"], "answer": 1, "explain": "Byte-level fallback means the 256 possible byte values are always in the vocabulary, so any string can be encoded and decoded exactly. No vocabulary could list every word, and deleting characters would break lossless round-tripping."}
```
