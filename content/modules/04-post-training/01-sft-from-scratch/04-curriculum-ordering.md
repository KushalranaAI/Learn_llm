---
title: Curriculum ordering of instruction data
minutes: 7
---

People learn arithmetic before algebra. **Curriculum learning** applies the same idea to training: present easy examples first and harder ones later, on the theory that the model builds the simple skill before it is asked for the complex one. For instruction data, "easy" needs a measurable proxy, and the cheapest one is length. A short instruction with a one-word answer is easier to fit than a paragraph of input followed by a 200-word answer.

There is a second, purely mechanical reason to order by length that has nothing to do with learning: examples of similar length padded together waste far fewer slots. The repo's curriculum is a one-line sort, so it is worth being precise about which of these two effects it actually delivers, and what it costs.

## The repo's curriculum

`llm_from_scratch/part_6/curriculum.py`:

```python
class LengthCurriculum:
    """Iterate examples from short to long prompts (one pass)."""
    def __init__(self, items: List[tuple[str, str]]):
        self.items = sorted(items, key=lambda p: len(p[0]))   # sort by prompt length in characters
        self._i = 0
    def __iter__(self):
        self._i = 0
        return self
    def __next__(self):
        if self._i >= len(self.items):
            raise StopIteration
        it = self.items[self._i]
        self._i += 1
        return it
```

Two details. The key is `len(p[0])`, the **prompt** length in characters, not the response length and not tokens. And `train_sft.py` immediately turns it into a list, `cur = list(LengthCurriculum(tuples))`, then slices that list into consecutive batches. On the fallback data the order comes out as 18, 34 and 38 characters: "First prime number", then "primary colors", then "direction".

## What the loop does with it

The training loop walks the sorted list in steps of `batch_size` and starts again from the top when it runs out:

```python
batch = cur[i:i + args.batch_size]
if not batch:
    i = 0          # restart the same sorted order
    continue
```

With the orchestrator's demo settings (24 Alpaca rows, `batch_size=8`, 300 steps) there are $\lceil 24/8 \rceil = 3$ batches: the 8 shortest prompts, the middle 8, the longest 8. The loop visits them in that order, 100 times. So after the first pass this is not "easy then hard" any more. It is a fixed cycle, short-medium-long, repeated, with no shuffling. Each batch is also the same 8 examples every time.

Number of passes over the data (epochs):

$$
E = \frac{S \cdot B}{N}
$$

with $S$ optimizer steps, $B$ examples per batch and $N$ examples. For the demo, $E = 300 \times 8 / 24 = 100$ epochs. Typical SFT runs use 1 to 3 epochs over thousands of examples; 100 epochs over 24 examples is memorisation, which topic 5 measures.

## Where length grouping pays

The padding benefit only appears when batches are padded to their longest row. The repo pads to `block_size` (topic 3), so here it saves nothing. With dynamic padding it is large.

**Worked example.** Eight examples of lengths $20, 200, 30, 180, 25, 220, 40, 190$ tokens, batch size 4. In arrival order the batches are $\{20, 200, 30, 180\}$, padded to 200, and $\{25, 220, 40, 190\}$, padded to 220. Slots: $4 \times 200 + 4 \times 220 = 1680$. Real tokens: $905$. Useful fraction $905/1680 \approx 54\%$.

Sorted, the batches are $\{20, 25, 30, 40\}$, padded to 40, and $\{180, 190, 200, 220\}$, padded to 220. Slots: $160 + 880 = 1040$. Useful fraction $905/1040 \approx 87\%$. The same data in 38% fewer slots.

```steps
Arrival order versus sorted
Arrival order: batch 1 pads three rows up to the 200-token row; batch 2 pads up to 220. 1680 slots for 905 real tokens.
---
Sorted by length: the four short rows only pad to 40, the four long rows to 220. 1040 slots for the same 905 tokens.
---
The catch: every sorted batch is homogeneous. Batch 1 has only short, easy examples, batch 2 only long ones, so consecutive gradients point in systematically different directions.
---
The usual compromise, **length bucketing**: shuffle, take a large chunk (say 50 batches' worth), sort within the chunk, cut it into batches and shuffle the batches. Most of the padding saving, little of the bias.
```

## Does easy-first help?

The evidence is mixed. Bengio et al. (2009) showed gains on synthetic tasks where "easy" was well defined. For LLM instruction tuning, gains from ordering are usually small next to the effects of data quality and quantity discussed in [SFT data](/learn/fine-tuning/instruction-tuning/sft-data). Prompt length is also a weak proxy for difficulty: "Prove there are infinitely many primes" is short and hard; a long paragraph followed by "summarise in one line" is long and easy. And because the loss is counted only on responses, it is response length that sets how many tokens a batch trains on, which the prompt-length key ignores.

What ordering reliably does is shape the loss curve. With a fixed cycle of short-medium-long batches, the printed loss rises and falls with the batch position rather than with progress, so a single number every 20 steps (as `train_sft.py` prints) can mislead you. Compare losses at the same point in the cycle, or average over a whole pass.

## In practice

- **Shuffle by default.** Most SFT runs shuffle each epoch and use length bucketing only for speed. Treat strict easy-to-hard ordering as an experiment, with a shuffled run as the baseline.
- **Sort on the right key.** If you sort for padding, sort on the tokenized length of the full formatted example. If you sort for difficulty, a better proxy than prompt length is the base model's loss on the response.
- **Watch for curriculum leaks.** If all the long examples come from one source (say, coding), sorting by length also sorts by task, and the end of each pass becomes "train only on code".

```quiz
{"q": "`train_sft.py` is run with 24 examples, `batch_size=8` and `--steps 300`. How many times does the model see each example, and in what order?", "options": ["100 times, always in the same sorted short-to-long cycle", "100 times, reshuffled each pass", "Once, from short to long", "300 times, because every step uses all examples"], "answer": 0, "explain": "There are 3 batches per pass, so 300 steps are $300 \\times 8 / 24 = 100$ passes. The loop restarts the same sorted list (`i = 0`) without reshuffling, so every pass has the identical order. 'Once' is what a curriculum is supposed to mean, which is why this behaviour surprises people."}
```

```quiz
{"q": "In the repo, sorting by length saves no compute at all. Why?", "options": ["Because the collator pads every row to `block_size`, so all batches have the same width regardless of order", "Because the sort is by characters, not tokens", "Because the curriculum is only applied to the first epoch", "Because PyTorch reorders batches internally"], "answer": 0, "explain": "Grouping similar lengths pays only when each batch is padded to its own longest row. With fixed padding to 256 every batch costs $B \\times 256$ positions whatever it contains. Sorting by characters instead of tokens makes the grouping slightly less precise, but that is not why the saving is zero here."}
```
