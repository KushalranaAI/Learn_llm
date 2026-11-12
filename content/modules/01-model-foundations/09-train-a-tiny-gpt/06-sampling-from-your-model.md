---
title: Sampling from your model
minutes: 8
---

A trained model does not write text. It outputs, for the last position of whatever you feed it, a distribution over the next byte. Writing is a loop around that: pick one byte from the distribution, append it to the input, run the model again, repeat. This is **autoregressive generation**, and it is the only way a GPT produces more than one token.

The choice of how to pick is the sampler. [Sampling](/learn/model-foundations/sampling) covered the theory: temperature reshapes the distribution, top-k and top-p cut off its tail. Here we implement those ideas in about thirty lines of PyTorch, and look closely at one off-by-one in top-p that an earlier version of the repo got wrong.

## The generation loop

Adapted from `GPT.generate` in `model_gpt.py`:

```python
@torch.no_grad()
def generate(self, idx, max_new_tokens=200, temperature=1.0, top_k=50, top_p=None):
    self.eval()
    for _ in range(max_new_tokens):
        idx_cond = idx[:, -self.block_size:]           # (B, <=n_max): crop to the window
        logits, _ = self(idx_cond)                     # (B, t, V)
        logits = logits[:, -1, :]                      # (B, V): only the last position
        logits = logits / max(temperature, 1e-6)       # temperature
        logits = top_k_top_p_filtering(logits, top_k, top_p)   # -inf outside the kept set
        probs = torch.softmax(logits, dim=-1)          # (B, V)
        next_id = torch.multinomial(probs, num_samples=1)      # (B, 1)
        idx = torch.cat([idx, next_id], dim=1)         # (B, t+1)
    return idx
```

Four details carry the weight:

- **Crop to `block_size`.** The learned position table has $n_{\max}$ rows, so the model only ever sees the last $n_{\max}$ tokens. Older text simply falls out of view.
- **Only the last row matters.** The forward pass computes logits for every position, but positions before the last already have their next token. The repo throws away $(t-1)/t$ of the head's work every step.
- **No KV cache.** Each new byte reruns the whole window through every layer, so generating 200 bytes with a 256-byte window costs about 200 full forward passes. Caching keys and values, in [the modern architecture lesson](/learn/model-foundations/modern-architecture), turns each step into a one-token pass.
- **`max(temperature, 1e-6)` is how greedy decoding works.** Dividing logits by $10^{-6}$ makes the gap between the top logit and the rest enormous, softmax becomes one-hot, and `multinomial` always picks the argmax.

## Temperature and top-k

Temperature $T$ divides the logits before the softmax:

$$
p_i = \frac{e^{z_i / T}}{\sum_j e^{z_j / T}}
$$

Take four logits $z = (2.0, 1.0, 0.5, -1.0)$. At $T = 1$ the exponentials are $7.389, 2.718, 1.649, 0.368$, summing to $12.124$, so $p = (0.609, 0.224, 0.136, 0.030)$. At $T = 0.5$ the scaled logits are $(4, 2, 1, -2)$, with exponentials $54.60, 7.39, 2.72, 0.14$ summing to $64.84$, so $p = (0.842, 0.114, 0.042, 0.002)$. Lower temperature, sharper distribution.

Top-k is a one-liner on the logits: find the $k$-th largest value and set everything smaller to $-\infty$, so its probability after softmax is exactly zero.

```python
def top_k_filter(logits, k):                       # logits: (B, V)
    kth = torch.topk(logits, k, dim=-1).values[:, -1:]   # (B, 1): k-th largest
    return logits.masked_fill(logits < kth, float("-inf"))
```

The repo's `generate` defaults to $k = 50$. With only 256 possible bytes, that already removes about 80% of the vocabulary, mostly control characters and bytes that cannot start a valid character at this point.

## Top-p, and an off-by-one

Top-p sorts the probabilities, takes running totals, and keeps tokens until the total reaches $p$. The natural first attempt, and what an earlier version of the repo did, masks wherever the running total exceeds $p$:

```python
sorted_logits, sorted_idx = torch.sort(logits, descending=True, dim=-1)
probs = torch.softmax(sorted_logits, dim=-1)
cumsum = torch.cumsum(probs, dim=-1)               # running totals
mask = cumsum > top_p                              # first attempt: drop where total exceeds p
mask[..., 0] = False                               # always keep the top token
sorted_logits[mask] = float("-inf")
```

Run it on $p = (0.609, 0.224, 0.136, 0.030)$ with `top_p = 0.9`:

| Token | $p_i$ | Running total | `cumsum > 0.9` | Kept by first attempt | Kept by textbook definition |
|---|---|---|---|---|---|
| A | 0.609 | 0.609 | no | yes | yes |
| B | 0.224 | 0.833 | no | yes | yes |
| C | 0.136 | 0.969 | **yes** | no | yes |
| D | 0.030 | 1.000 | yes | no | no |

The textbook nucleus is the smallest set whose total is **at least** $p$, which needs A, B and C (0.969). The first attempt removes the token that crosses the threshold, so it keeps only A and B (0.833), less than $p$. The fix, which the repo now uses, shifts the test by one token: drop token $i$ only if the total of the tokens **before** it already exceeds $p$.

```python
# drop a token only if the tokens before it already reach top_p, so the token that crosses p is kept
mask = (cumsum - probs) > top_p
```

On the example, `cumsum - probs` is $(0, 0.609, 0.833, 0.969)$, so only D is dropped. Neither version crashes, and the first attempt is only slightly more conservative, which is why the bug survived: it never shows up as an error, only as samples a little less varied than the setting suggests. The full version is `llm_from_scratch/part_2/utils.py`.

```parsons
{"title":"Order the body of `GPT.generate`","lines":["for _ in range(max_new_tokens):","    idx_cond = idx[:, -self.block_size:]","    logits, _ = self(idx_cond)","    logits = logits[:, -1, :] / max(temperature, 1e-6)","    logits = top_k_top_p_filtering(logits, top_k, top_p)","    probs = torch.softmax(logits, dim=-1)","    next_id = torch.multinomial(probs, num_samples=1)","    idx = torch.cat([idx, next_id], dim=1)"],"explain":"Crop to the window first, because the position table has only `block_size` rows. Keep only the last position's logits and apply temperature, then filter: top-p reads probabilities, so it must see the distribution **after** temperature has reshaped it. Filtering sets the dropped logits to $-\\infty$, so the softmax that follows gives them exactly zero probability. Sample, append, and the next iteration feeds the longer sequence back in."}
```

## See it

```sim
sampling
{"prompt": "story", "temperature": 1, "topK": 0, "topP": 0.9}
```

Look at how many candidates survive at top-p 0.9, then drop the temperature to 0.5: the distribution sharpens, so fewer tokens are needed to reach 0.9 and the kept set shrinks. Set temperature to 0 to see greedy decoding, the same thing `max(temperature, 1e-6)` produces in the repo.

## Running it

After training, `sample.py` rebuilds the model from the config stored in the checkpoint and generates from a prompt:

```python
ckpt = torch.load("runs/min-gpt/model_best.pt", map_location=device)
model = GPT(**ckpt["config"]).to(device)
model.load_state_dict(ckpt["model"])
ids = tok.encode("Sweet Echo, ").unsqueeze(0).to(device)   # (1, t)
out = model.generate(ids, max_new_tokens=200, temperature=0.8, top_k=50)  # (1, t+200)
print(tok.decode(out[0].cpu()))
```

An empty prompt is replaced by a single newline byte (ID 10), because the model needs at least one position to produce logits. The full version is `llm_from_scratch/part_2/sample.py`.

## In practice

- **Expect English-shaped nonsense first.** After a few hundred steps a byte model writes plausible line lengths, capitalised line starts and real short words, with invented long ones: "Butond besoricee or whir". That is normal progress, not a bug.
- **Prompt in the training language.** The repo's orchestrator trains on Hindi and then prompts with "Once upon a time". A Hindi-trained byte model has seen almost no English letters in sequence, so it is predicting from an input unlike anything in its training data. It works as a smoke test that the pipeline runs end to end; to judge quality, prompt with a line in the training language.
- **Temperature 0.7 to 0.9 for demos.** At $T = 1$ a small model's tail is noisy; at low temperatures small models tend to fall into loops, repeating one phrase or line.

```quiz
{"q": "With sorted probabilities $(0.50, 0.30, 0.15, 0.05)$ and `top_p = 0.75`, how many tokens does a sampler using the mask `cumsum > top_p` keep?", "options": ["1", "2", "3", "4"], "answer": 0, "explain": "Running totals are 0.50, 0.80, 0.95, 1.00. The mask is true where the total exceeds 0.75, which is from the second token on, so only the first survives. The tempting answer, 2, is the textbook nucleus (the smallest set reaching 0.75), which the corrected mask `(cumsum - probs) > top_p` keeps; `cumsum > top_p` drops the token that crosses the threshold."}
```

```quiz
{"q": "Why does `generate` divide by `max(temperature, 1e-6)` rather than by `temperature`?", "options": ["So that temperature 0 gives greedy decoding instead of a division by zero", "To make sampling faster on GPUs", "To stop the logits from becoming negative", "Because softmax is undefined for temperatures above 1"], "answer": 0, "explain": "Dividing by 0 gives infinities and NaNs. Dividing by $10^{-6}$ blows up the gaps between logits, softmax becomes effectively one-hot on the largest, and `multinomial` always returns the argmax, which is greedy decoding. Temperature only scales logits; it never changes their sign, and temperatures above 1 are valid."}
```
