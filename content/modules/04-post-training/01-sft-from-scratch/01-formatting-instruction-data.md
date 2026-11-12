---
title: Formatting instruction data
minutes: 8
---

```callout-before
Before you start
You need the GPTModern model from [Modern architecture](/learn/model-foundations/modern-architecture) and the training loop from [Scaling the training loop](/learn/model-foundations/scaling-the-training-loop). The ideas of this lesson (templates, loss masking, SFT data) are explained in [Instruction tuning](/learn/fine-tuning/instruction-tuning); here you write them by hand in PyTorch, with no library doing the bookkeeping. The code is `llm_from_scratch/part_6/`.
```

```predict
{"q": "With the byte tokenizer, the example 'First prime number' → '2' becomes 60 tokens once the template is applied. How many of those 60 positions will contribute to the SFT loss?", "options": ["60: every token is trained on", "59: every position except the last, which has no next token", "5: the answer and the end marker", "1: only the answer '2'"], "answer": 2, "reveal": "Five. The answer '2' is one byte and the end marker `</s>` is four bytes, and both are things the model must learn to produce. Everything else is the question and the template. Topic 2 builds those five labels line by line."}
```

A pretrained GPT continues text. Show it "What is the first prime number?" and it may well continue with a second question, because quiz pages list questions one after another. To turn it into something that answers, you show it thousands of examples of a question followed by an answer, and train on them with the same next-token loss you already know. That is **supervised fine-tuning** (SFT).

The model never sees "a question" and "an answer" as separate objects. It sees one string of tokens. So the first job is to decide how a (question, answer) pair becomes that string, in a way the model can recognise again at inference time. That fixed layout is the **template**, and the boundary markers inside it are what tell the model "the user's part is over, now you speak" and "you are done".

## The template in the repo

The repo uses an Alpaca-style template with plain-text section headers and two boundary markers:

```python
template = (
    "<s>\n"
    "### Instruction:\n{instruction}\n\n"
    "### Response:\n{response}</s>"
)

def format_example(ex: Example) -> str:          # training: question + answer
    return template.format(instruction=ex.instruction.strip(), response=ex.response.strip())

def format_prompt_only(instruction: str) -> str: # inference: answer left empty
    return template.format(instruction=instruction.strip(), response="")
```

The full file is `llm_from_scratch/part_6/formatters.py`. Three parts do three jobs:

- `<s>` marks the start of an example. It gives the model a fixed first token to attend to.
- `### Instruction:` and `### Response:` are the **role markers**. After training, the text `### Response:\n` is the cue that switches the model from "reading a question" to "writing an answer".
- `</s>` is the **end-of-sequence marker**. The model must learn to produce it, otherwise it never stops: after answering it would happily write another instruction and answer that too.

Note that `format_prompt_only` still ends in `</s>` (the response slot is empty, the closing marker is not). Every caller strips it with `.replace('</s>', '')`. Forget that and the inference prompt ends by telling the model the answer is already over.

## Where the data comes from

`llm_from_scratch/part_6/dataset_sft.py` loads a 24-row slice of `tatsu-lab/alpaca` (schema: `instruction`, `input`, `output`). When a row has an `input`, it is appended to the instruction on a new line, so "Summarise this" plus a paragraph becomes one instruction. If the `datasets` package is missing, it falls back to three baked-in pairs:

```python
seeds = [
    ("First prime number", "2"),
    ("What are the three primary colors?", "red"),
    ("Device name which points to direction?", "compass"),
]
```

Those three pairs are the running example of this lesson. They are tiny on purpose: every number below can be counted by hand.

## Counting the tokens

With the byte tokenizer from part 3 every character is one token (all characters here are ASCII). The template adds a fixed overhead around each pair:

$$
T = \underbrace{21}_{\text{start + instruction header}} + |q| + \underbrace{16}_{\text{response header}} + |r| + \underbrace{4}_{\text{end marker}}
$$

where $|q|$ and $|r|$ are the lengths of the instruction and response in tokens, so the overhead is $21 + 16 + 4 = 41$ tokens per example. The start and instruction header is `<s>\n### Instruction:\n` (3 + 1 + 16 + 1 bytes), the response header is `\n\n### Response:\n` (2 + 13 + 1) and the end marker is `</s>`.

**Worked example.** "First prime number" has $|q| = 18$ and "2" has $|r| = 1$, so $T = 41 + 18 + 1 = 60$. The prompt-only prefix (everything up to and including `### Response:\n`) is $21 + 18 + 16 = 55$ tokens. Running the repo's collator on this pair prints exactly these two lengths: 60 and 55.

| Segment | Text | Bytes | Trained on? |
|---|---|---|---|
| Start + instruction header | `<s>\n### Instruction:\n` | 21 | no |
| Instruction | `First prime number` | 18 | no |
| Response header | `\n\n### Response:\n` | 16 | no |
| Response | `2` | 1 | yes |
| End marker | `</s>` | 4 | yes |

Only the last two rows are what we want the model to learn to write, which is why the predict question's answer was 5. With a 60-token example and 5 trained tokens, 92% of the sequence is context. That is normal for SFT with short answers, and it is the reason the next topic's masking matters so much.

## Bytes versus special tokens

The markers mean different things under the two tokenizers the repo supports:

- **Byte tokenizer (part 3).** `<s>` is three ordinary bytes, `</s>` is four. The model has to learn to spell the end marker, and nothing in the vocabulary is reserved.
- **BPE tokenizer (part 4).** `BPETokenizer` registers `<s>`, `</s>`, `<pad>`, `<unk>`, `<mask>` as special tokens, so `<s>` encodes to id 0, `</s>` to id 1 and `<pad>` to id 2, each a single token. A quick check with a freshly trained BPE confirms it: `encode("</s>")` returns `[1]`.

This matters for stopping. `GPTModern.generate` has `eos_id=1`, so with the BPE tokenizer it stops as soon as `</s>` is sampled. With bytes, id 1 is a control character that never appears, so generation runs until `max_new_tokens`, and you must cut the text at `"</s>"` yourself (topic 6).

## In practice

- **The template is part of the model.** Whatever layout you train with, you must reproduce byte for byte at inference: same headers, same newlines, same stripping. A missing `\n` after `### Response:` puts the model in a state it never saw in training. The library version of this rule (`apply_chat_template`) is covered in [Chat templates](/learn/fine-tuning/instruction-tuning/chat-templates).
- **Strip consistently.** `format_example` calls `.strip()` on both fields. If your inference code does not strip the user's question, a trailing space or newline shifts every token after it.
- **Plain-text headers are a choice, not a requirement.** Production chat templates use dedicated special tokens per role (`<|im_start|>user` and the like) so user text can never forge a role marker. With plain `### Response:` headers, a user who types that string into their question can confuse the model about where the answer begins.

```quiz
{"q": "With the byte tokenizer and the repo's template, how many tokens does the pair ('What are the three primary colors?', 'red') take? The instruction is 34 characters.", "options": ["78", "37", "75", "71"], "answer": 0, "explain": "The template adds 21 + 16 + 4 = 41 tokens, so $41 + 34 + 3 = 78$. 71 is the prompt-only prefix ($21 + 34 + 16$), which leaves out the response and the end marker; 37 forgets the template entirely."}
```

```quiz
{"q": "A learner calls `format_prompt_only(question)` at inference and feeds the result straight to the model, without `.replace('</s>', '')`. What is the most likely effect?", "options": ["Nothing: the model ignores markers it did not train on", "The prompt now ends with the end marker, so the model sees an answer that is already finished and its output is unreliable (often empty or a new example)", "The tokenizer raises an error on `</s>`", "The answer is the same, just one token shorter"], "answer": 1, "explain": "The model was trained on `### Response:\\n` followed by the answer, and on `</s>` meaning 'the answer is over'. Ending the prompt with `</s>` puts it after the end of an answer, a state it learned leads to nothing useful. The tokenizer happily encodes `</s>` (as four bytes, or as id 1 with BPE), so no error warns you."}
```
