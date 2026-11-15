---
title: From bytes to a trained BPE tokenizer
minutes: 9
---

```predict
{"q":"Part 4's model has width 512 and 6 layers. Switch it from 256 byte tokens to a 32,000-token BPE vocabulary. What share of its 57.9M parameters sits in the embedding table and output head?","options":["About 5%","About 25%","About 57%","About 90%"],"answer":2,"reveal":"About 57%: the two vocabulary matrices hold 32.8M parameters against 25.2M in all six blocks. For a small model the vocabulary dominates; the worked steps below count it."}
```

The tiny GPT from [Train a Tiny GPT](/learn/model-foundations/train-a-tiny-gpt) read raw bytes: a vocabulary of exactly 256 symbols, nothing to train, nothing to save. That was the right choice for a first model, and the wrong one for a model you want to scale. Every character costs a position, so a 256-position context window sees about 256 characters of text, roughly two sentences.

Part 4 swaps the byte tokenizer for a **byte-level BPE** tokenizer trained on your own corpus. The algorithm itself (count adjacent pairs, merge the most frequent, repeat) is covered in [Tokenization](/learn/model-foundations/tokenization), so here the questions are engineering ones. What does the switch change in the model's shapes? What does it cost? And what new pieces of state does the training script now have to carry around?

The short answer: the tokenizer becomes an **artefact of the run**, as important as the weights. The model's first and last layers are indexed by token ID, so a model is only meaningful together with the exact tokenizer that produced its IDs.

## In everyday life

Think of a student taking lecture notes by hand. At first she writes every single letter. Soon she notices that "the", "ing" and "tion" keep coming back, so she invents a short mark for each. Later she sees that her new marks often appear together, and she joins those into one still shorter mark. Her notes shrink, but the key explaining her marks grows longer, and she must keep that key to read the notes later.

A **tokenizer** does this job for a language model. It cuts text into **tokens**, the small pieces the model reads, one per position. **Byte-pair encoding (BPE)** builds those pieces by starting from single **bytes** (the raw units a computer uses to store text) and repeatedly joining the pair that sits side by side most often. The full list of pieces is the **vocabulary**. A bigger vocabulary gives shorter sequences, but the model needs a bigger table of numbers to know every piece.

Unlike the student, a model cannot guess a lost key: its weights only make sense with the exact tokenizer that produced its IDs.

**Where you meet it.** A team building a chatbot for a small language trains its own tokenizer on its own text. With too few pieces, every sentence becomes a long line of positions, and the model sees little of a conversation at once. Learning common pieces from the team's own text fixes that, and saving the tokenizer next to the model keeps the two from ever being separated.

```scene
title: Shorthand notes that shrink the page
step: 📝 She writes every single letter of the lecture | starting from byte tokens
step: 🔍 She notices which two marks sit side by side most often | counting adjacent pairs
step: 🔗 She invents one short mark for that pair and uses it everywhere | merging the most frequent pair
step: 🔁 She repeats this until her key reaches a size she can manage | growing the vocabulary
step: 📉 Her notes now fill far fewer lines, but her key is longer | shorter sequences, bigger tables
step: 🔑 She keeps the key with the notes, or they cannot be read | saving the tokenizer with the model
takeaway: A trained tokenizer shortens text by merging common pairs, and it must always travel with the model it was used for.
```

## The trade: shorter sequences, bigger ends

Two numbers move in opposite directions when $V$ grows. Sequences get shorter, which helps everything that scales with $n$. The embedding table and the output head get taller, which costs parameters, memory and compute on every token.

The parameters that depend on the vocabulary are the input embedding and the untied output head (`tok_emb` and `head` in `GPTModern`):

$$
P_{\text{vocab}} = 2Vd, \qquad P_{\text{blocks}} \approx L\,(4d^2 + 12d^2) = 16Ld^2
$$

Here $4d^2$ is the four attention projections $W_Q, W_K, W_V, W_O$ and $12d^2$ is the SwiGLU feed-forward with three $d \times 4d$ matrices from [The Modern Architecture](/learn/model-foundations/modern-architecture). The norms add a negligible $2d$ per block.

```steps
What the default part 4 config costs ($d = 512$, $L = 6$)
**Byte vocabulary, $V = 256$.** $2 \times 256 \times 512 = 262{,}144$ vocabulary parameters. Almost nothing.
---
**BPE vocabulary, $V = 32{,}000$.** $2 \times 32{,}000 \times 512 = 32{,}768{,}000$ parameters, about 32.8M.
---
**The transformer blocks.** $16 \times 6 \times 512^2 = 25{,}165{,}824$, plus $6 \times 1{,}024$ norm weights, so about 25.2M. The whole model is about $25.2 + 32.8 = 57.9$M, and **57% of it is the two vocabulary matrices**.
---
**The logits tensor.** One micro-batch of $B = 32$, $n = 256$ produces logits of shape $(B, n, V)$: $32 \times 256 \times 32{,}000 = 262{,}144{,}000$ numbers, 1.05 GB in FP32. The byte model's logits were $32 \times 256 \times 256 \times 4$ bytes $= 8.4$ MB, 125 times smaller.
---
**What you bought.** If the tokenizer averages about 4 bytes per token on your text, $n = 256$ now covers about 1,024 bytes. A byte model would need $n = 1{,}024$ for the same text, and its attention score matrix would have $1{,}024^2 / 256^2 = 16$ times as many entries per head.
```

For a small model this is a lopsided deal: the vocabulary dominates the parameter count, and the logits tensor is often the single biggest activation in memory. That is why the part 4 demo run uses `--vocab_size 8000` with $d = 128$, and why many small research models use vocabularies of 8k to 16k rather than the 32k to 128k of large models.

## The code

The tokenizer wrapper trains, saves and reloads a Hugging Face `ByteLevelBPETokenizer`. The dataset tokenizes the whole file once into a flat tensor of IDs, then serves overlapping windows:

```python
tok = BPETokenizer(vocab_size=8000)
tok.train("tiny.txt")                       # learns merges, min_frequency=2
tok.save("runs/part4/tokenizer")            # vocab.json, merges.txt, tokenizer.json

ids = torch.tensor(tok.encode(text), dtype=torch.long)   # (N,) all tokens in the corpus

def window(i, n):                           # one training example
    x = ids[i : i + n]                      # (n,)
    y = ids[i + 1 : i + n + 1]              # (n,) shifted by one
    return x, y

model = GPTModern(vocab_size=tok.vocab_size, block_size=256,
                  n_layer=6, n_head=8, n_embd=512)   # tok_emb: (V, d), head: (d, V)
```

What changes in the part 2 loop: the vocabulary size is no longer the constant 256 but comes from the tokenizer, and the training script must write the tokenizer directory next to the checkpoint. `train.py` stores its path in `tokenizer_dir.txt` and, on resume, refuses to continue if the tokenizer's vocabulary size differs from the one in the saved config. The full versions are `llm_from_scratch/part_4/tokenizer_bpe.py` and `llm_from_scratch/part_4/dataset_bpe.py`.

## See it

```sim
bpe-tokenizer
{"merges": 40, "pretokenize": true}
```

Drag the merges slider from 0 up to 40 and then to 150. The token count falls fast at first and then flattens: the first merges capture common pairs like "th" and " the", later ones buy only a token or two each. Every merge you add is one more row in both `tok_emb` and `head`. That flattening curve is the vocabulary trade in miniature.

## Your loss number changes meaning

A byte model and a BPE model report cross-entropy in nats **per token**, and their tokens are different sizes, so the two numbers cannot be compared directly. Two checks keep you honest:

- **Loss at initialisation** should be close to $\ln V$, because a random model spreads probability evenly. That is $\ln 256 \approx 5.55$ for bytes and $\ln 32{,}000 \approx 10.37$ for the BPE model. A first logged loss far from this points to a bug.
- **Bits per byte** puts both on one scale: $\text{bpb} = \dfrac{\mathcal{L}}{\ln 2 \cdot \bar{b}}$, where $\mathcal{L}$ is loss per token and $\bar{b}$ the average bytes per token. A BPE model at 3.2 nats per token with 4 bytes per token scores $3.2 / (0.693 \times 4) \approx 1.15$ bpb. A byte model at 1.0 nats per byte scores $1.0 / 0.693 \approx 1.44$ bpb, so the BPE model is better, even though its raw loss looks three times worse.

## In practice

- **Train the tokenizer on data that looks like the training corpus**, but you rarely need all of it. A few hundred megabytes of representative text is a typical sample for a real run.
- **Do not ask for more vocabulary than the data supports.** `tiny.txt` is about 277 KB. With `min_frequency=2`, BPE may stop before reaching 32,000 tokens, and tokens it does learn may appear only a handful of times, leaving their embedding rows barely trained. The wrapper reports the vocab size you requested; check `tok._tok.get_vocab_size()` to see what you actually got.
- **Round $V$ up to a multiple of 64 or 128.** Matmuls on tensor cores run faster when dimensions divide evenly, and the extra unused rows cost almost nothing.
- **Never retrain the tokenizer on resume.** Even the same data can give different merge orders after a library upgrade, and every learned embedding would then point to the wrong token.

```quiz
{"q": "A model has $d = 256$, $L = 4$ and an untied embedding and head. Using $16Ld^2$ for the blocks, roughly what share of parameters is the vocabulary at $V = 16{,}000$?", "options": ["About 66%", "About 50%", "About 33%", "About 4%"], "answer": 0, "explain": "Vocabulary: $2 \\times 16{,}000 \\times 256 = 8.19$M. Blocks: $16 \\times 4 \\times 256^2 = 4.19$M. Share $= 8.19 / 12.38 \\approx 66\\%$. Counting the embedding only once ($Vd = 4.1$M) gives about 50%, but this model has a separate output head too."}
```

```quiz
{"q": "You switch from a byte tokenizer to BPE with $V = 32{,}000$. Your first logged loss is 5.6 and falls from there. What should you suspect?", "options": ["Nothing; 5.6 is a normal starting loss", "The model is still being built with vocab_size=256, or the targets are byte IDs, since a fresh 32k-vocabulary model should start near $\\ln 32{,}000 \\approx 10.4$", "The learning rate is too high", "BPE models always start lower because tokens carry more information"], "answer": 1, "explain": "A random model gives each token probability about $1/V$, so the starting loss is about $\\ln V$. A value of 5.6 matches $\\ln 256 \\approx 5.55$, which says the output layer still has 256 classes. Tokens carrying more information makes the final loss per token higher, not the starting one lower."}
```
