---
title: Video, and budgeting multimodal tokens
minutes: 7
---

Video is images with a time axis: dozens of frames per second, each frame hundreds of tokens. Taken naively it is hopeless; taken with care it is a budgeting problem you can solve with arithmetic.

## Frames times tokens per frame

If you sample $f$ frames per second for $T$ seconds and each frame becomes $n$ tokens, the video costs

$$
N_{\text{video}} = f \cdot T \cdot n
$$

Native video is 24 to 60 frames per second, but consecutive frames are nearly identical, so models sample sparsely: often 1 or 2 frames per second, sometimes adaptively around scene changes.

```steps
How big is a one-minute video?
Sample $f = 1$ frame per second for $T = 60$ s at $n = 256$ tokens per frame (a 16 x 16 grid after pooling): $1 \times 60 \times 256 = 15{,}360$ tokens.
---
At full 576 tokens per frame: $60 \times 576 = 34{,}560$ tokens, more than a 32K context window's worth for a single minute.
---
A two-hour film at 1 frame per second and 256 tokens per frame: $7{,}200 \times 256 = 1{,}843{,}200$ tokens, past even million-token contexts. Long video needs selection (keyframes, retrieval of relevant segments) or heavy compression.
---
Cost view: at an illustrative price of 1 unit per million input tokens, the one-minute clip costs about $0.015$ units, and the two-hour film about $1.8$ units, for input alone, per question asked.
```

## Ways to cut the token bill

| Technique | Idea | Saving |
|---|---|---|
| Fewer frames | Sample 0.5 to 1 fps; adaptive around motion | Linear in $f$ |
| Pooling | Average neighbouring patch vectors (for example 2 x 2) | 4x per frame |
| Resampler | Learned queries compress each frame to a fixed small number of tokens | Large, tunable |
| Temporal merging | Merge near-identical consecutive frames or patches | Large for static scenes |
| Retrieve, then look | Search captions or embeddings, send only relevant clips | Orders of magnitude |
| Transcript first | For talks and meetings, the audio transcript carries most of the content at a few tokens per second | 100x |

## Putting a request together

A single multimodal request has a context made of text, image tokens, audio tokens and video tokens, all of which compete for the same window and all of which are billed as input. The total prefill compute follows the same $2N$ per token rule as text:

$$
\text{prefill FLOPs} \approx 2\, N_{\text{LLM}} \cdot \left(n_{\text{text}} + n_{\text{image}} + n_{\text{audio}} + n_{\text{video}}\right)
$$

plus the cost of the encoders. And because the KV cache stores every token's keys and values, image-heavy requests hold more memory per request, which limits batch size at serving time.

```steps
A product-support request with a screenshot, a voice note and text
Text: 300 tokens. One screenshot at 1,008 x 1,008 with 14 x 14 patches: $72 \times 72 = 5{,}184$ patch tokens, pooled 2 x 2 to $1{,}296$.
---
A 20-second voice note at 25 pooled embeddings per second: $500$ tokens.
---
Total context: $300 + 1{,}296 + 500 = 2{,}096$ tokens. The screenshot is 62% of the request, so image handling decides the cost.
---
For a 7B LLM: $2 \times 7\times10^9 \times 2{,}096 = 2.9\times10^{13}$ FLOPs of prefill, a fraction of a second on one modern GPU. Without pooling the screenshot would have been $5{,}184$ tokens and the total $5{,}984$: nearly three times the cost.
```

## Evaluating multimodal systems

Evaluate on your own inputs. Measure answer accuracy against labelled examples, and probe the known failure modes separately: counting, reading small text, spatial relations, and hallucinated content. For audio, measure **word error rate** (WER) for transcription: $\text{WER} = (S + D + I)/N_{\text{ref}}$, the substitutions, deletions and insertions divided by the number of reference words. With 100 reference words and 5 substitutions, 2 deletions and 1 insertion, $\text{WER} = 8/100 = 8\%$. For images, check both whether the answer is right and whether it is *grounded* in something actually visible.

## In practice

The cheapest multimodal input is the one you convert to text first when the information allows it: OCR a clean document instead of sending pixels, transcribe a meeting instead of sending audio. Send pixels when layout, diagrams or handwriting carry meaning. Track tokens per request by modality in your observability, so a change that doubles the average image resolution shows up as a cost line, not a surprise.

```quiz
{"q": "Video sampled at 2 frames per second for 45 seconds, 144 tokens per frame. How many tokens?", "options": ["6,480", "12,960", "3,240", "90"], "answer": 1, "explain": "$2 \\times 45 \\times 144 = 12{,}960$. 6,480 uses 1 frame per second."}
```

```quiz
{"q": "A transcript of a 60-minute meeting runs about 9,000 words. Sending the audio instead would use encoder positions at 50 per second. Roughly how do the token counts compare?", "options": ["About the same", "Audio is about 15 times larger (180,000 vs about 12,000 text tokens)", "Text is larger", "Audio is 2 times larger"], "answer": 1, "explain": "Audio: $3{,}600 \\times 50 = 180{,}000$ positions. Text: about $9{,}000 / 0.75 = 12{,}000$ tokens. The ratio is 15. For information that lives in the words, transcribe first."}
```
