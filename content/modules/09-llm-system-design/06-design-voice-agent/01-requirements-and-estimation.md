---
title: Requirements and the numbers behind a phone agent
minutes: 9
---

```callout-before
Before you start
This case walks the framework from [A Framework for LLM System Design](/learn/llm-system-design/design-framework). You should be comfortable turning daily volume into requests per second and tokens per day.
```

The prompt in the interview is short: "Design a voice agent that answers the phone for an airline: rebooking, baggage questions, flight status." Everything that makes this hard is hidden in one word, **real-time**. A chat user tolerates a two-second pause while text streams in. A caller hears two seconds of silence as a dropped line, says "hello?", and talks over the answer that finally arrives.

So the first job is to pin down what "fast enough" means, and the second is to find out how many calls you are carrying at once. Voice systems are sized by **concurrent sessions**, not by requests per second, because each call holds a live audio stream, a speech recognizer, a synthesizer and a conversation context for its whole duration.

## Clarifying questions worth asking

| Question | Assumption we will use | Why it changes the design |
|---|---|---|
| Channel: phone line or app (WebRTC)? | Phone (PSTN via a telephony provider) | Phone audio is 8 kHz narrowband and adds a jitter buffer; ASR accuracy drops |
| Calls per day, average length | 60,000 calls, 4 minutes | Sets concurrency, which sets GPU, ASR and TTS capacity |
| What can the agent do? | Look up bookings, rebook, open a baggage claim | Tool calls add latency inside a turn and need confirmation |
| Latency target | Reply audio starts < 800 ms after the caller stops (p50), < 1.2 s at p95 | Drives every component choice |
| Languages | English and Spanish | Two ASR/TTS voices; language detection at call start |
| Handoff to humans? | Yes, warm transfer with a summary | Need a summary step and a queue integration |
| Recording and consent | Calls recorded with notice | Retention policy and PII redaction in transcripts |

The latency target is the requirement that matters most. People take turns in conversation with gaps of a few hundred milliseconds; around a second starts to feel slow, and beyond about two seconds callers assume something broke. The rest of this lesson treats 800 ms as a budget to be spent.

## From calls to concurrency

**Little's law** says the average number of items inside a system equals the arrival rate times the time each item stays:

$$
N = \lambda \cdot W
$$

where $N$ is the number of concurrent calls, $\lambda$ the call arrival rate (calls per second) and $W$ the average call duration (seconds).

```steps
Concurrent calls, by hand
Average arrival rate: $\lambda_{avg} = 60{,}000 / 86{,}400 = 0.694$ calls per second.
---
Peak arrival rate with the module's 3x peak factor: $\lambda_{peak} = 3 \times 0.694 = 2.08$ calls per second. (Airlines get sharper spikes during storms; we will revisit that under failure modes.)
---
Call duration $W = 4 \times 60 = 240$ s.
---
Concurrency: $N_{avg} = 0.694 \times 240 = 167$ calls, and $N_{peak} = 2.08 \times 240 = 500$ calls. Every component is sized for about 500 simultaneous live streams.
```

## Tokens, turns and cost

A 4-minute call has roughly 16 caller turns (one every 15 seconds). Each turn is one LLM request. The prompt holds an 800-token system prompt with tool definitions plus the growing transcript; averaged over the call that is about $2{,}000$ input tokens. Spoken replies are short: about 60 output tokens, roughly 240 characters, or two sentences.

$$
R_{day} = C \cdot T = 60{,}000 \times 16 = 960{,}000 \text{ LLM requests per day}
$$

with $C$ calls per day and $T$ turns per call. That is $11.1$ requests per second on average and $33.3$ at peak: tiny by chat standards. Voice is not a throughput problem for the LLM. It is a latency problem.

Each audio component is priced differently. The prices below are **hypothetical**, chosen to be round; the shape of the answer matters, not the exact figures.

| Line item | Daily quantity | Hypothetical price | Cost per day | Cost per month (30 days) |
|---|---|---|---|---|
| LLM input (large model, 85% of input served from prompt cache at 90% off) | 1.92 B tokens | \$1.00 / 1M, cached \$0.10 / 1M | \$451.20 | \$13,536 |
| LLM output | 57.6 M tokens | \$4.00 / 1M | \$230.40 | \$6,912 |
| Streaming ASR | 240,000 audio minutes | \$0.006 / min | \$1,440 | \$43,200 |
| TTS | 230.4 M characters | \$15 / 1M chars | \$3,456 | \$103,680 |
| Telephony | 240,000 minutes | \$0.01 / min | \$2,400 | \$72,000 |
| **Total** | | | **\$7,977.60** | **\$239,328** |

The cached LLM input line is $0.15 \times 1.92\text{B} \times \$1/\text{M} + 0.85 \times 1.92\text{B} \times \$0.10/\text{M} = \$288 + \$163.20 = \$451.20$. Without caching it would be \$1,920 a day.

Two things fall out. First, cost per call is $\$7{,}977.60 / 60{,}000 = \$0.133$, or about \$0.033 per minute: compare that with what a human agent minute costs and you have the business case. Second, the LLM is about 8.5% of the bill. Speech synthesis and telephony dominate, so an interviewer who hears you spend ten minutes shaving LLM tokens will steer you to TTS caching (cache common phrases like greetings and hold messages) instead.

## Memory for 500 live conversations

To keep TTFT low you want each caller's conversation prefix to stay in the KV cache between turns, so a new turn only prefills the new words. With the module's reference 8B-class model at 131,072 bytes per token:

$$
M_{KV} = N_{peak} \cdot n \cdot b = 500 \times 2{,}000 \times 131{,}072 \text{ B} \approx 131 \text{ GB}
$$

where $n$ is tokens held per conversation and $b$ bytes per token. That is more than one 80 GB GPU can hold next to its weights, so a self-hosted deployment needs at least two GPUs just for warm contexts, and in practice four for redundancy: about $4 \times 730 \times \$2.50 = \$7{,}300$ per month (hypothetical), against \$20,448 for the cached large-model API. The saving is real but small next to TTS, which is why many teams self-host the voice pieces before the LLM.

```quiz
{"q": "Calls arrive at 1.5 per second at peak and last 6 minutes on average. How many concurrent calls must the system hold?", "options": ["9", "90", "540", "360"], "answer": 2, "explain": "Little's law: $N = \\lambda W = 1.5 \\times 360 = 540$. Answering 9 multiplies by minutes instead of seconds; 90 divides by 4 for no reason."}
```

```quiz
{"q": "In the cost table, which change saves the most money per month?", "options": ["Halving LLM output tokens", "Moving the LLM to the small model", "Caching synthesized audio for the 30% of agent speech that is stock phrases", "Turning off prompt caching"], "answer": 2, "explain": "30% of the \\$103,680 TTS bill is about \\$31,000 a month. Halving output saves \\$3,456 and switching to the small model saves well under \\$20,000. Turning off caching increases cost."}
```

## In practice

Teams usually discover the concurrency number the hard way: a provider's streaming ASR limit is expressed in concurrent streams, and the first storm-day spike hits it. Ask for concurrency limits from every vendor in the chain (telephony, ASR, TTS, LLM) and design for the smallest one.
