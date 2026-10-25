---
title: The 800 ms latency budget
minutes: 9
---

The number that decides whether a voice agent feels alive is **mouth-to-ear latency**: the time from the moment the caller stops speaking to the moment they hear the first sound of the reply. Every component takes a slice. The design exercise is to write the slices down, add them up, and make the sum fit.

Think of it like a relay race where each runner may start before the previous one arrives. ASR runs while the caller speaks, the LLM streams, TTS starts on the first phrase. What remains on the clock after the caller stops is only the part of each stage that cannot overlap.

## The budget as an equation

$$
T_{m2e} = t_{end} + t_{asr} + t_{ttft} + k \cdot t_{tpot} + t_{tts} + t_{net}
$$

| Symbol | Meaning | Budget |
|---|---|---|
| $t_{end}$ | Silence the endpointer waits before declaring the turn over | 200 ms |
| $t_{asr}$ | Time for the streaming ASR to finalise after the endpoint | 40 ms |
| $t_{ttft}$ | LLM time to first token, including queueing and prefill of new tokens | 250 ms |
| $k$ | Tokens needed before the first phrase can go to TTS | 6 tokens |
| $t_{tpot}$ | LLM time per output token | 12 ms |
| $t_{tts}$ | TTS time to first audio byte for that phrase | 110 ms |
| $t_{net}$ | Network, codec and jitter buffer, both directions | 100 ms |

Adding them: $200 + 40 + 250 + 6 \times 12 + 110 + 100 = 772$ ms. That fits under 800 ms with 28 ms to spare, which is to say it barely fits. Notice that the endpointer and the LLM's TTFT together are 58% of the total. Those are where the deep dives go.

## Why streaming is not optional

Redo the sum for a design that passes complete results between stages. The ASR runs on the whole utterance after it ends (say 300 ms), the LLM generates the full 60-token reply ($250 + 60 \times 12 = 970$ ms), and TTS renders the full 240 characters before playing (say 400 ms):

$$
200 + 300 + 970 + 400 + 100 = 1{,}970 \text{ ms}
$$

Almost two seconds: two and a half times the streaming design, with identical models. The difference is not faster components; it is overlap.

```sim
latency-breakdown
```

Use the latency breakdown simulation as a stand-in for the LLM part of the budget. Set a short prompt and a short output, then raise the queueing delay and the prompt length and watch time to first token climb. Then shorten the output to a handful of tokens: in a voice agent the full end-to-end time of the LLM matters much less than TTFT plus the first few tokens, because TTS starts on the first phrase.

## Percentiles do not add, but budgets must

The 772 ms figure uses typical (p50) values. Your requirement also says p95 under 1.2 s. A safe rule is that the p95 of a sum is at most the sum of the p95s, so if each component meets a p95 budget, the total will too. Suppose measured p95s are endpoint 350, ASR 80, TTFT 450, first phrase 100, TTS 180, network 160 ms. Their sum is $1{,}320$ ms, over budget. The true p95 of the total is lower than 1,320 because components rarely all spike on the same turn, but you cannot count on that in an interview without data. The two biggest p95 contributors are TTFT (queueing under load) and the endpointer (long pauses): fix those first.

| Lever | Saves | Cost or risk |
|---|---|---|
| Smaller or distilled LLM for the first sentence | 100 to 200 ms of TTFT | Lower answer quality on hard turns |
| Keep LLM replicas at low batch / utilisation | p95 TTFT queueing | More GPUs per call |
| Prefix caching with session affinity | Prefill on long calls | KV memory, sticky routing |
| Smarter endpointing (semantic end-of-turn model) | 100 to 300 ms of silence wait | Occasional cut-offs |
| Speculative first phrase or cached fillers | Hides tool latency | Must not promise things that turn out false |
| Co-locate ASR, LLM, TTS in one region near the telephony edge | 20 to 80 ms of network | Regional capacity planning |
| Shorter first TTS chunk (clause rather than sentence) | 50 to 100 ms | Slightly less natural prosody |

## A worked trade: low batch costs GPUs

Running LLM replicas lightly loaded reduces queueing at p95. Suppose one replica can serve 64 concurrent sequences at full load but you cap it at 16 to keep TTFT p95 under 450 ms. Concurrent LLM generations at peak follow Little's law: $33.3$ requests per second, each busy for about $0.25 + 60 \times 0.012 = 0.97$ s, gives

$$
N_{gen} = 33.3 \times 0.97 \approx 32 \text{ concurrent generations}
$$

At 16 per replica that is 2 replicas busy at peak, so you would deploy at least 3 or 4 for headroom and failover. Voice deliberately trades GPU efficiency for latency: a chat system would run the same replicas at a batch of 64 and need a quarter as many.

```quiz
{"q": "A team's budget is: endpoint 300, ASR 50, TTFT 300, first phrase 8 tokens at 15 ms, TTS 150, network 70 ms. What is the mouth-to-ear latency, and which single change gets it under 800 ms?", "options": ["990 ms; cut the endpoint wait to 100 ms", "990 ms; cut TTFT to 200 ms", "890 ms; halve TTS time", "1,110 ms; cut the endpoint wait to 100 ms"], "answer": 0, "explain": "$300 + 50 + 300 + 8 \\times 15 + 150 + 70 = 990$ ms. Cutting the endpoint wait by 200 ms gives 790 ms. Cutting TTFT by 100 ms only reaches 890 ms, and halving TTS saves 75 ms. The endpointer is the biggest single lever here, which is why it gets its own deep dive."}
```

```quiz
{"q": "Why is the non-streaming design roughly 2.5 times slower even with identical models?", "options": ["Its models run at lower precision", "Each stage waits for the previous one to finish completely, so whole durations add up instead of overlapping", "Batch sizes are larger", "Network latency is counted twice"], "answer": 1, "explain": "Streaming overlaps stages: the caller hears audio after 6 tokens instead of 60, and TTS plays the first phrase while the rest is synthesized. The models' speeds are the same in both sums."}
```

## In practice

Budgets drift. A prompt change that adds a 1,500-token policy section, a new tool that takes 700 ms, or a TTS voice upgrade can each add a couple of hundred milliseconds. Teams that keep voice agents fast put the latency budget in CI: a scripted set of calls runs on every change and fails the build if p95 mouth-to-ear latency rises more than a set margin.
