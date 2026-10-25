---
title: Audio, tokens per second
minutes: 7
---

Sound is a pressure wave sampled thousands of times per second, far too many numbers to feed to a transformer one by one. At 16 kHz, a single minute of speech is $16{,}000 \times 60 = 960{,}000$ samples. A model needs a much shorter sequence. There are two main strategies, and they produce very different token rates.

## Strategy 1: spectrogram frames (continuous features)

Slice the waveform into short overlapping windows (typically 25 ms long, shifted by 10 ms), and compute the energy in each frequency band using a mel-scaled filter bank. Each window becomes one column of a **log-mel spectrogram**: a vector of, say, 80 numbers. That is a picture with time on one axis and frequency on the other, and an encoder (convolutions followed by a transformer) turns it into a shorter sequence of embeddings.

Whisper, the speech-recognition model, is the standard example. Its pipeline, with 16 kHz audio and a 10 ms hop:

$$
\text{frames per second} = \frac{1}{0.010\ \text{s}} = 100, \qquad \text{after a stride-2 convolution: } 50 \text{ positions per second}
$$

```steps
Whisper's audio window in numbers
Whisper processes audio in $30$-second windows: $30 \times 16{,}000 = 480{,}000$ raw samples.
---
Spectrogram frames at a 10 ms hop: $30 \times 100 = 3{,}000$ frames of 80 mel values each: $3{,}000 \times 80 = 240{,}000$ numbers, half the raw sample count.
---
The encoder's stride-2 convolution halves the sequence: $3{,}000 / 2 = 1{,}500$ positions, so $50$ embeddings per second of speech.
---
A decoder then writes the transcript as ordinary text tokens: about $150$ words per minute of speech is roughly $200$ tokens per minute. The audio side is $50 \times 60 = 3{,}000$ positions per minute, about $15\times$ more than the text it produces.
```

Systems that feed audio features straight into a language model (so it can listen, not just transcribe) use encoders like this and often pool further to roughly 12 to 25 embeddings per second.

## Strategy 2: neural codec tokens (discrete)

A **neural audio codec** (EnCodec, SoundStream and their relatives) compresses audio into discrete tokens that a language model can generate as well as read. It encodes each short frame into a vector and then quantises it with **residual vector quantisation** (RVQ): a stack of $K$ codebooks, each of size $M$, where each codebook encodes the error left by the previous ones. Each frame therefore becomes $K$ integer tokens.

$$
\text{tokens per second} = f \cdot K, \qquad \text{bitrate} = f \cdot K \cdot \log_2 M \ \text{bits/s}
$$

where $f$ is the frame rate in Hz, $K$ the number of codebooks and $M$ the codebook size.

```steps
A 24 kHz codec at 6 kbps
EnCodec at 24 kHz has frame rate $f = 75$ Hz. With $K = 8$ codebooks of size $M = 1024$ ($\log_2 1024 = 10$ bits):
---
Tokens per second: $75 \times 8 = 600$. Bitrate: $75 \times 8 \times 10 = 6{,}000$ bits/s, which is the "6 kbps" setting.
---
One minute of audio: $600 \times 60 = 36{,}000$ tokens. The transcript of the same minute is about $200$ text tokens, so the audio is $180\times$ longer than the text.
---
Using only the first 2 codebooks gives $150$ tokens/s and $1.5$ kbps: lower quality, a quarter of the tokens. Models trade off fidelity against sequence length by choosing $K$, and many generate the codebooks of one frame in parallel or in a short hierarchical step, rather than all as separate autoregressive steps.
```

| Representation | Tokens or positions per second | One minute | Used for |
|---|---|---|---|
| Raw 16 kHz samples | 16,000 | 960,000 | Rarely fed to transformers directly |
| Whisper encoder positions | 50 | 3,000 | Speech recognition, audio understanding |
| Pooled audio embeddings | about 12 to 25 | 700 to 1,500 | Audio input to LLMs |
| Codec tokens (75 Hz x 8) | 600 | 36,000 | Generating and reading speech and music |
| Text of the same speech | about 3 to 4 | about 200 | The transcript |

## In practice

Audio is token-hungry, so voice systems are designed around that. A **cascaded** pipeline (speech recognition, then a text LLM, then speech synthesis) keeps the LLM on cheap text tokens but adds latency at each hop and loses tone and emotion. A **native speech** model consumes and emits audio tokens directly, reducing latency and preserving prosody, at a much higher token rate and with less mature tooling. The voice-agent design case study later in this course compares the two. When estimating cost for any audio feature, compute tokens per second first, then multiply by duration.

```quiz
{"q": "A codec runs at 50 Hz with 4 codebooks of size 2048. How many tokens per second and what bitrate?", "options": ["200 tokens/s, 2.2 kbps", "200 tokens/s, 0.4 kbps", "50 tokens/s, 2.2 kbps", "8,192 tokens/s, 2.2 kbps"], "answer": 0, "explain": "Tokens per second $= 50 \\times 4 = 200$. Bitrate $= 50 \\times 4 \\times \\log_2 2048 = 50 \\times 4 \\times 11 = 2{,}200$ bits/s. The codebook size sets bits per token, not tokens per second."}
```

```quiz
{"q": "A 90-second clip is encoded at 50 positions per second. How many positions does the model read?", "options": ["1,500", "4,500", "9,000", "90"], "answer": 1, "explain": "$90 \\times 50 = 4{,}500$. 1,500 is the count for a 30-second window."}
```
