---
title: Tokenizer quirks that cause real bugs
minutes: 8
---

Because the model sees token IDs, not letters, some things that are trivial for a person are oddly hard for a model, and some inputs that look identical to a person look completely different to the model. Most "the model is weirdly bad at X" reports from users trace back to one of a handful of tokenizer effects. Knowing them saves hours of prompt fiddling.

The mental model to keep: a token is an opaque ID. The model learns what ID 9246 *means* from context, but it is never directly shown that ID 9246 is spelled c-a-t. Any knowledge of spelling, letter counts or digit positions has to be inferred indirectly from training text.

## Quirk 1: spaces and capitals change the token

With GPT-style pre-tokenization a leading space is part of the word, so *cat*, *␣cat*, *Cat*, *␣Cat* and *CAT* are typically five different tokens with five separately learned embeddings. Practical consequences:

- A prompt that ends with a trailing space (`"The answer is "`) forces the model to continue with a token that does *not* start with a space, which is an unusual position in training text and can degrade the next word.
- Exact-match logic on tokens (stop sequences, logit biasing a word) must cover the variants you care about.

## Quirk 2: numbers are chunked

Tokenizers differ in how they split digits. Some split every digit into its own token (the original LLaMA tokenizer did this); others group digits into chunks of up to three (GPT-4's `cl100k_base` does). For a number with $D$ digits, the token count is

$$
T_{\text{digits}} = D \ \ \text{(one per digit)}, \qquad T_{\text{digits}} = \left\lceil D / 3 \right\rceil \ \ \text{(chunks of three)}
$$

where $\lceil \cdot \rceil$ rounds up. The number 1234567 has $D = 7$: 7 tokens one way, $\lceil 7/3 \rceil = 3$ tokens (*123*, *456*, *7*) the other. Chunking left to right means the same digit can land in different chunk positions depending on the length of the number, so the model has to learn place value from inconsistent pieces. This is one reason plain arithmetic on long numbers is unreliable, and why tool calls (a calculator, code execution) are the standard fix.

## Quirk 3: letters are hidden inside tokens

Ask how many times the letter *r* occurs in a word, and the model has to answer about the inside of tokens it has never seen spelled out. A word like *strawberry* is typically two or three tokens. The model often gets such questions wrong not because it cannot count but because the letters are not in its input. Spelling-sensitive tasks (anagrams, rhymes, reversing a string, counting characters) all share this weakness. Asking the model to first spell the word out with separators (*s-t-r-a-w...*) turns letters into separate tokens and usually helps.

## Quirk 4: under-trained "glitch" tokens

A vocabulary built from one corpus and a model trained on another can contain tokens that almost never appear in the model's training data. Their embeddings stay close to their random initial values. The best-known example is the GPT-2 and GPT-3 token *␣SolidGoldMagikarp*, a Reddit username frequent in the tokenizer's training text but rare in the model's: prompts containing it produced bizarre outputs. Recall the averages from the vocabulary topic: $D / V$ is large, but the rarest tokens may appear only a handful of times.

## Quirk 5: special tokens are control signals

Vocabularies include **special tokens** that never appear in normal text, such as GPT-2's end-of-text token (ID 50,256, the last of its 50,257) and the role markers in chat templates that separate system, user and assistant turns. The model treats them as structure. If user-supplied text containing the literal string of a special token is encoded *as* that special token, a user can forge a turn boundary. Tokenizer libraries therefore encode special-token strings in user input as plain text by default. Keep it that way.

| Symptom | Likely tokenizer cause | Fix |
|---|---|---|
| Wrong letter counts, bad anagrams | letters hidden inside tokens | spell out with separators, or use code |
| Arithmetic errors on long numbers | inconsistent digit chunks | call a calculator or code tool |
| Odd word right after the prompt | trailing space in the prompt | end the prompt without a space |
| Gibberish on one rare string | under-trained token | avoid or rephrase it; report it |
| Model "switches roles" mid-message | special tokens parsed from user text | encode user text with special tokens disabled |

## See it

```sim
bpe-tokenizer
{"text": "the cat sat. The cat sat. THE CAT SAT. the cat sat.", "merges": 15, "pretokenize": true}
```

Look at the token strip: the lowercase *␣cat* becomes one token quickly because it repeats, while *The*, *THE* and *CAT* stay split or become separate tokens of their own. The same word in three capitalisations costs different numbers of tokens and, in a real model, has three different embeddings that must each be learned. Now delete the spaces after the full stops and see the merges change.

## In practice

- **Inspect tokens when behaviour is odd.** Print the token split of the failing prompt. Most tokenizer bugs are obvious the moment you see the pieces.
- **Never build prompts by concatenating token IDs from separately encoded strings.** Encoding "Hello" and " world" separately can give a different split from encoding "Hello world" in one go, which subtly shifts model behaviour. Encode the final string once.
- **Route character- and number-precise work to code.** Counting, sorting, exact arithmetic and string manipulation are cheap and exact in a tool and fragile in a model.

```quiz
{"q": "A tokenizer groups digits into chunks of up to three, left to right. How many tokens does the 10-digit number 4000000000 use, and how does it split?", "options": ["4 tokens: 400, 000, 000, 0", "4 tokens: 4, 000, 000, 000", "10 tokens, one per digit", "1 token"], "answer": 0, "explain": "$\\lceil 10/3 \\rceil = 4$, and chunking left to right gives 400 | 000 | 000 | 0. The human-friendly grouping 4 | 000 | 000 | 000 goes from the right, which is not what a left-to-right chunker does; that mismatch is exactly why place value is hard for the model."}
```

```quiz
{"q": "Why does asking a model to spell a word with hyphens before counting its letters usually improve accuracy?", "options": ["Hyphens make the model think harder", "Each letter becomes its own token, so the letters are explicitly present in the input to count", "Hyphenated words are in the vocabulary", "It reduces the number of tokens"], "answer": 1, "explain": "Inside a multi-letter token the letters are not visible to the model. Spelled out with separators, each letter is typically a separate token, so counting becomes a task over the input rather than recall about token spellings. It increases the token count, which is the price."}
```

```lab
token-budget
```
