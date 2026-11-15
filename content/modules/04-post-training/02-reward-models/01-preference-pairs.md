---
title: Preference data as (prompt, chosen, rejected) triples
minutes: 7
---

```callout-before
Before you start
The theory of why we collect comparisons, and the Bradley-Terry model behind them, is in [Preference tuning](/learn/fine-tuning/preference-tuning/why-preferences). This lesson builds and trains the reward model by hand, file by file, from `llm_from_scratch/part_7/`. You need the SFT prompt template from [SFT from scratch](/learn/post-training/sft-from-scratch).
```

```predict
{"q": "A preference example has one prompt and two answers. When the collator turns a batch of $B = 8$ examples into tensors with block size 256, what comes out?", "options": ["One tensor of shape (8, 256) and a label vector of 0s and 1s saying which answer won", "Two tensors, each of shape (8, 256): one for prompt + chosen, one for prompt + rejected", "One tensor of shape (16, 256) with the chosen answers in the first half and a target reward for each row", "Three tensors: prompts, chosen answers and rejected answers, each tokenised separately"], "answer": 1, "reveal": "Two aligned tensors. Row $i$ of the first and row $i$ of the second are the same prompt with different answers, and the label is implicit: the first tensor always holds the winner. No target reward exists anywhere."}
```

A labeller is shown one prompt and two answers and asked which is better. They do not write a score; they pick one. That single bit of information, recorded thousands of times, is all a reward model ever learns from. There are no target numbers to regress onto. The model has to invent its own scale of "goodness" such that the picked answer tends to score higher than the other one.

So the unit of data is a **preference pair**, stored as a triple: the prompt $x$, the **chosen** answer $y_c$ and the **rejected** answer $y_r$. The label is not a separate field. It is the position: whatever sits in the `chosen` slot won.

## In everyday life

A chai stall owner wants to know which of two cups is better. Asking each customer for marks out of ten gives messy numbers, because one person's 7 is another person's 9. It is easier and more honest to ask, "Which cup do you prefer?" A tap on one cup is all the answer needed.

A **preference pair** is the AI version of that tap. A person sees one prompt, the question or request, and two answers, and picks the better one. The winner is the **chosen** answer and the other is the **rejected** answer. Together with the prompt they form a triple. There is no separate score to record: whatever sits in the chosen slot is the label. Thousands of such picks are all a **reward model**, a model that learns to give a score to an answer, ever learns from. It has to invent its own scale of goodness, so that picked answers tend to score higher than rejected ones.

One caution: both cups must come from the same order. Both answers must respond to the same prompt, or the pick says nothing useful.

**Where you meet it.** A team that wants a chatbot to sound helpful asks reviewers to compare two candidate replies to the same message and pick the better one. Picking is quick and consistent, while asking reviewers to write perfect replies, or to score each one, is slow and noisy.

```scene
title: Two cups, one tap
step: ☕ A customer orders chai and the stall serves two different cups | one prompt, two answers
step: 👅 The customer tastes both and taps the one they prefer | human picks the better answer
step: 🏷 The winning cup goes in the preferred slot, the other in the second slot | chosen and rejected slots
step: 📒 The owner records only who won, never a mark out of ten | no target reward numbers
step: 🔁 Thousands of taps reveal a pattern of what people like | preference dataset
takeaway: A preference pair records only which of two answers won, and that single choice is all a reward model learns from.
```

## The dataset as a set of triples

Formally, the training set is

$$
\mathcal{D} = \{(x^{(i)},\, y_c^{(i)},\, y_r^{(i)})\}_{i=1}^{N}
$$

and the reward model $r_\phi(x, y)$ will be asked for one thing only: $r_\phi(x^{(i)}, y_c^{(i)}) > r_\phi(x^{(i)}, y_r^{(i)})$ for as many $i$ as possible. With $N$ pairs and $B$ pairs per batch, one pass over the data is $\lceil N / B \rceil$ steps, and each step runs the model on $2B$ sequences, because both answers need a score.

The repo keeps the triple in a dataclass and loads it with a fallback:

```python
@dataclass
class PrefExample:
    prompt: str
    chosen: str
    rejected: str

def load_preferences(split: str = "train[:200]") -> List[PrefExample]:
    # tries Anthropic/hh-rlhf via `datasets`; on any failure, two toy pairs
    ...
    items.append(PrefExample(prompt="", chosen=ch, rejected=rj))
```

The full file is `llm_from_scratch/part_7/data_prefs.py`. Two details matter. First, the Anthropic HH-RLHF rows hold the whole conversation in both `chosen` and `rejected`, so the loader sets `prompt=""`: the shared conversation is duplicated inside both answers, and only the final assistant turn differs. Second, if `datasets` is not installed or the download fails, you get two hand-written pairs (a good and a nonsense summary of scaling laws, a good and a wrong description of attention). Two pairs are enough to check the plumbing, not to learn anything.

## From triples to two tensors

The collator reuses the SFT template from part 6, so the reward model reads text in exactly the format the policy will produce:

```python
def collate(self, batch):                 # batch: list of (prompt, chosen, rejected)
    pos_ids, neg_ids = [], []
    for prompt, chosen, rejected in batch:
        pos_text = format_example(Example(prompt, chosen))    # "<s>\n### Instruction:\n...### Response:\n...</s>"
        neg_text = format_example(Example(prompt, rejected))
        pos_ids.append(self._encode(pos_text)[:self.block_size])
        neg_ids.append(self._encode(neg_text)[:self.block_size])
    def pad_to(x, pad=2):
        return x + [pad] * (self.block_size - len(x)) if len(x) < self.block_size else x[:self.block_size]
    pos = torch.tensor([pad_to(x) for x in pos_ids], dtype=torch.long)   # (B, T)
    neg = torch.tensor([pad_to(x) for x in neg_ids], dtype=torch.long)   # (B, T)
    return pos, neg
```

That is `llm_from_scratch/part_7/collator_rm.py`. Every sequence is right-padded with id `2` to exactly `block_size`. Id 2 is `<pad>` in the part 4 BPE tokenizer (its special tokens are `<s>`, `</s>`, `<pad>`, ... in that order), and with the byte-level fallback it is the control byte `0x02`, which never appears in normal text. The model will use the same number to build its padding mask, so the two must agree.

```steps
One toy pair becomes two rows
Prompt: "Summarize: Scaling laws for neural language models." Chosen: the correct one-line summary. Rejected: "Scaling laws are when you scale pictures to look bigger."
---
Both answers are dropped into the SFT template. With the byte tokenizer the chosen text is 193 bytes and the rejected text is 148 bytes (measured by running the collator).
---
Each is cut to at most 256 ids and padded with id 2: the chosen row gets $256 - 193 = 63$ pads, the rejected row $256 - 148 = 108$ pads, so 42% of the rejected row is padding.
---
The two toy pairs together give `pos` and `neg`, each of shape $(2, 256)$. Row 0 of `pos` and row 0 of `neg` share the same prompt bytes up to "### Response:\n"; they differ only after it.
```

## In practice

- **Truncation can erase the label.** The collator keeps the first `block_size` ids. In HH-RLHF the two texts are identical until the last assistant turn, which sits at the end. If a conversation is longer than the block, both rows are cut to the same prefix, the model sees two identical inputs, and the pair teaches nothing. Production code truncates from the left, or truncates the shared prompt and keeps the answers whole. Count how many pairs have `pos[i] == neg[i]` after collation before you train.
- **Ties and duplicates.** Real preference exports contain pairs where both answers are the same string, and pairs labelled "tie". Drop them: a tie has no winner, and the loss in topic 3 cannot represent it.
- **The slot is the label.** Never "augment" by also adding $(x, y_r, y_c)$. In this format that asserts the opposite preference, and the two copies together pull the reward gap of that pair back toward zero.

```quiz
{"q": "A preference export has 10,000 triples. You train with $B = 16$ pairs per batch. How many reward-model forward passes over individual sequences does one epoch take?", "options": ["10,000", "20,000", "625", "1,250"], "answer": 1, "explain": "Every pair needs a score for the chosen and the rejected sequence, so one epoch scores $2 \\times 10{,}000 = 20{,}000$ sequences (in $10{,}000 / 16 = 625$ steps of $2 \\times 16$). 625 is the number of optimiser steps, not forward passes over sequences; 10,000 forgets that each pair has two answers."}
```

```quiz
{"q": "In HH-RLHF, `chosen` and `rejected` are full conversations that differ only in the final assistant turn. The collator keeps the first 256 ids of each. What happens to a pair whose conversations are 900 ids long?", "options": ["The model sees the end of the conversation, where the answers differ", "Both rows become the same 256 ids, so the model gives them the same reward and the pair carries no signal", "The collator raises an error because the sequence is too long", "The pads at the end make the two rows different enough to learn from"], "answer": 1, "explain": "`[:self.block_size]` keeps the start, and the start is the shared conversation. Identical inputs give identical rewards (in eval mode), so the loss sits at $\\ln 2$ with zero gradient for that pair. There are no pads because the text already fills the block; nothing raises an error, the pair is just silently wasted."}
```
