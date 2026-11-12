---
title: A tokenizer in ten lines
minutes: 7
---

```predict
{"q":"A byte-level tokenizer makes every byte one token. \"hello\" costs 5 tokens. How many does the 6-character Hindi word \"नमस्ते\" cost?","options":["6","12","18","1"],"answer":2,"reveal":"18. Every Devanagari character takes 3 bytes in UTF-8, so the same model sees much less Hindi text than English in one context window. The worked steps below encode it byte by byte."}
```

Every language model needs a way to turn text into integers and back. Production models use byte-pair encoding with vocabularies of 32,000 to 200,000 tokens, which you met in [Tokenization](/learn/model-foundations/tokenization). For a first model that we train ourselves, we want the opposite: something so simple it cannot be the bug.

The simplest tokenizer that can represent any text at all is the **byte-level tokenizer**. A computer already stores text as a sequence of bytes, and a byte is an integer from 0 to 255. So the token IDs are just the bytes. The vocabulary is fixed at $V = 256$, there is nothing to train, nothing to download, and no text can ever be "out of vocabulary": emoji, Hindi, source code and binary junk all encode.

The price is length. A BPE tokenizer packs about four English characters into one token; a byte tokenizer packs exactly one byte. The model has to learn spelling, words and grammar from raw bytes, and every sequence is several times longer. For a tiny model trained for a few minutes, that trade is worth it: we remove a whole component and its failure modes, and keep the vocabulary small enough that the embedding table costs almost nothing.

## Bytes per character

Text files are almost always stored as **UTF-8**, which uses a variable number of bytes per character (a Unicode code point):

| Code point range | Examples | Bytes |
|---|---|---|
| U+0000 to U+007F | English letters, digits, space, newline | 1 |
| U+0080 to U+07FF | é, ö, Greek, Cyrillic, Arabic | 2 |
| U+0800 to U+FFFF | Devanagari (Hindi), Chinese, Japanese | 3 |
| U+10000 and up | most emoji | 4 |

So the number of tokens a byte-level model sees for a string is

$$
n_{\text{tokens}} = \sum_{c \,\in\, \text{text}} \text{bytes}(c)
$$

where $\text{bytes}(c)$ is 1, 2, 3 or 4 from the table.

The repo ships two training files. `tiny.txt` (Milton's poems) is almost pure ASCII: 276,886 bytes for about 270,000 characters, essentially 1.0 byte per character. `tiny_hi.txt` (a Hindi text in Devanagari) holds about 198,000 characters in 516,000 bytes, about **2.6 bytes per character**.

Why 2.6 and not 3? The text is not all Devanagari: spaces between words, newlines, hyphens and the ASCII digits of verse numbers are 1 byte each. (The Devanagari danda "।" that ends a line is in the 3-byte block, like the letters.) If a fraction $f$ of characters are 3-byte Devanagari and the rest are 1-byte ASCII:

$$
3f + 1\cdot(1 - f) = 2.6 \quad\Rightarrow\quad 1 + 2f = 2.6 \quad\Rightarrow\quad f = 0.8
$$

About 80% of the characters are Devanagari and 20% are ASCII, most of them spaces. Counting the file directly agrees: 159,074 three-byte characters and 39,241 one-byte ones, of which 32,897 are spaces. The consequence matters for modelling: a context window of $n = 256$ tokens holds 256 characters of Milton but only $256 / 2.6 \approx 98$ characters of Hindi. Same model, same compute, less than half the text in view. The [bytes and Unicode](/learn/model-foundations/tokenization) topic of the tokenization lesson shows the same effect on API bills.

```steps
Encoding "नमस्ते" byte by byte
The word has 6 code points: न म स ् त े. All are in the Devanagari block U+0900 to U+097F, so each takes 3 bytes in UTF-8.
---
`"नमस्ते".encode("utf-8")` gives 18 bytes: `224 164 168 | 224 164 174 | 224 164 184 | 224 165 141 | 224 164 164 | 224 165 135`.
---
Every character starts with byte 224 (hex E0), the lead byte that says "a 3-byte character follows". The model sees the token 224 six times in one word and must learn it carries almost no information on its own.
---
The English word "hello" is 5 bytes: `104 101 108 108 111`. One byte per letter, and the IDs are the ASCII codes.
---
So "नमस्ते" costs 18 tokens and "hello" 5. Per character, Hindi costs 3 times as much here. BPE tokenizers trained mostly on English text show the same kind of gap, because few Devanagari merges make it into their vocabularies.
```

## The code

The whole tokenizer, adapted from the repo:

```python
import torch

class ByteTokenizer:
    vocab_size = 256

    def encode(self, s: str) -> torch.Tensor:
        return torch.tensor(list(s.encode("utf-8")), dtype=torch.long)  # (N,)

    def decode(self, ids) -> str:
        if isinstance(ids, torch.Tensor):
            ids = ids.tolist()
        return bytes(ids).decode("utf-8", errors="ignore")

tok = ByteTokenizer()
ids = tok.encode("hi नम")       # tensor([104, 105, 32, 224, 164, 168, 224, 164, 174])
print(len("hi नम"), len(ids))   # 5 characters, 9 tokens
print(tok.decode(ids))          # 'hi नम'
```

Two details are worth noticing.

- **`dtype=torch.long`.** `nn.Embedding` and `F.cross_entropy` both expect 64-bit integer indices. Floats here give a type error later, far from the cause.
- **`errors="ignore"`.** A model can generate any byte sequence, including ones that are not valid UTF-8: a lone `224`, or a 3-byte character cut after 2 bytes. A strict decoder would raise an exception mid-sample. Ignoring broken bytes silently drops them. That keeps sampling robust, but it also means a decoded sample can be shorter than the number of generated tokens, and it hides how often the model produces malformed characters.

The full version is `llm_from_scratch/part_2/tokenizer.py`, with a round-trip test in `part_2/tests/test_tokenizer.py`.

## In practice

- **Byte-level is a real technique, not just a toy.** GPT-2's tokenizer is BPE on top of bytes, so its base vocabulary is these same 256 values; merges are built on top. Some research models (ByT5, for example) skip merges entirely and run on raw bytes, paying for it with longer sequences.
- **Round-trip test first.** `decode(encode(s)) == s` for a few strings, including non-ASCII ones, is the cheapest test in the whole project and catches encoding mix-ups (reading a file as Latin-1, for instance) before they waste a training run.
- **Count tokens in bytes, not characters.** When you budget data or context for a byte model, `len(text.encode("utf-8"))` is the number that matters. Using `len(text)` on Hindi underestimates by a factor of 2.6.
- **Read the training file as bytes.** The dataset in the next topic calls `Path(path).read_bytes()` and never decodes at all. That avoids newline translation on Windows (`\r\n` stays two bytes), which is why the byte count of a file can differ slightly from the length of the same text read in Python's text mode.

```quiz
{"q": "A byte-level GPT has a context window of $n = 128$ tokens and is trained on text averaging 2.6 bytes per character. About how many characters of text fit in one window?", "options": ["About 49", "128", "About 333", "About 43"], "answer": 0, "explain": "Each token is one byte, so 128 tokens are 128 bytes, and $128 / 2.6 \\approx 49$ characters. Multiplying instead ($128 \\times 2.6 \\approx 333$) gets the direction backwards: more bytes per character means fewer characters per window. 43 would be the answer only if every character took the full 3 bytes."}
```

```quiz
{"q": "Why does the tokenizer decode with `errors=\"ignore\"` rather than the default strict mode?", "options": ["A sampled byte sequence may not be valid UTF-8, and strict decoding would raise an exception", "Ignoring errors makes decoding faster on GPUs", "Without it, ASCII characters would decode incorrectly", "It converts unknown bytes into a special unknown-token ID"], "answer": 0, "explain": "The model can emit any of the 256 byte values in any order, for example a 3-byte lead byte followed by a space. Strict decoding would crash on that; ignore drops the broken bytes. ASCII always decodes correctly either way, and a byte tokenizer has no unknown token: every byte already has an ID."}
```
