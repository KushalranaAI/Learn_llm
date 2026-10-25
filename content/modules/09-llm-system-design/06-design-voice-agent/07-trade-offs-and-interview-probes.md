---
title: Trade-offs and what the interviewer probes
minutes: 8
---

By this point in the interview you have a pipeline, a budget and a failure plan. The last part of a strong answer is saying out loud which choices you made, what you gave up, and what would make you change your mind. Voice has more genuine forks than most LLM designs, because latency, cost, quality and control pull in different directions at every stage.

## The big trade-offs

| Decision | Option A | Option B | How to choose |
|---|---|---|---|
| Pipeline shape | Cascade: ASR, LLM, TTS | Speech-to-speech model | Cascade when you need tools, transcripts, auditing and swappable vendors; speech-to-speech when tone and the last 200 ms matter more than control |
| LLM size | Small, fast model (TTFT ~150 ms) | Large model (TTFT ~350 ms) | Small model for most turns, with routing to the large model for hard turns and a filler to cover the extra time |
| Endpointing | Silence threshold only | Semantic end-of-turn model | Semantic almost always; silence-only is a prototype shortcut |
| Barge-in | Hard stop on any speech | Soft barge-in (duck, then decide) | Soft barge-in if your ASR partials arrive within ~150 ms |
| Hosting voice models | Vendor APIs | Self-hosted ASR and TTS on GPUs | Vendors first; self-host once volume makes the break-even (below) clear and you have the team to run it |
| Context on long calls | Keep full transcript | Rolling summary plus recent turns | Full transcript until about 4,000 tokens, then summarise older turns |

## A worked break-even: self-hosting TTS

TTS was the biggest line in the cost table: \$3,456 per day, or \$103,680 a month, at the hypothetical API price. Should you run your own TTS model?

Agent speech occupies roughly 40% of a call, so at peak about $0.4 \times 500 = 200$ synthesis streams run at once. Suppose one GPU synthesizes 50 real-time streams with acceptable first-audio latency. You need $200 / 50 = 4$ GPUs at peak; double it for headroom and redundancy, giving 8. Monthly cost:

$$
C_{self} = G \cdot H \cdot p_{gpu} = 8 \times 730 \times \$2.50 = \$14{,}600
$$

where $G$ is the GPU count, $H$ hours in a month and $p_{gpu}$ the hypothetical GPU-hour price. Add, say, one engineer's time to run it. The break-even volume, where API cost equals self-hosted cost, is

$$
V^{*} = \frac{C_{self} + C_{ops}}{c_{api}}
$$

with $c_{api}$ the API cost per call (\$3,456 / 60,000 = \$0.0576 of TTS per call) and $C_{ops}$ monthly operating overhead. If $C_{ops} = \$20{,}000$, then $V^{*} = (14{,}600 + 20{,}000) / 0.0576 \approx 600{,}700$ calls a month, about 20,000 a day. At 60,000 calls a day you are well past it. At 5,000 a day you are not, and the API is the right answer. Saying both halves is what makes it a trade-off rather than a preference.

## What interviewers probe

```steps
The questions to expect, and the shape of a good answer
**"Where does the latency go?"** Write the budget equation and fill in numbers. Point to the endpointer and TTFT as the two largest slices and say what you would do about each.
---
**"The caller interrupts. What happens?"** Detect (VAD plus AEC, soft barge-in), stop (cancel TTS and the LLM stream), reconcile (truncate history to played words using TTS timestamps), and keep side effects independent of playback.
---
**"How do you know it is working?"** Stage metrics (WER and entity accuracy, cut-off rate, barge-in errors, tool accuracy, latency percentiles) plus call-level task completion with confidence intervals, and a simulated-caller regression suite in CI.
---
**"What happens on a storm day?"** Little's law for concurrency, vendor concurrency limits, admission control and callbacks, degraded modes that protect latency for accepted calls.
---
**"How do you stop it being abused?"** Authentication beyond caller ID, confirmation for actions, limits on money movement, transcript treated as untrusted input, escalation to humans.
```

Interviewers also listen for things candidates forget: phone audio is narrowband and noisy, so lab WER numbers do not transfer; costs are dominated by telephony and TTS, not tokens; and the agent's memory must match what the caller heard.

```quiz
{"q": "A self-hosted ASR deployment would cost \\$9,000/month in GPUs plus \\$15,000/month in operations. The API charges \\$0.024 of ASR per call. Above roughly what monthly call volume does self-hosting become cheaper?", "options": ["375,000 calls", "1,000,000 calls", "625,000 calls", "24,000 calls"], "answer": 1, "explain": "$V^* = (9{,}000 + 15{,}000) / 0.024 = 1{,}000{,}000$ calls a month. 375,000 ignores the operations cost; 625,000 ignores the GPU cost."}
```

```quiz
{"q": "An interviewer asks why you did not pick a speech-to-speech model, given it is faster. Which answer shows the trade-off best?", "options": ["Speech-to-speech models do not exist yet", "The cascade gives a text transcript for tools, guardrails, logging and vendor swaps; I would evaluate speech-to-speech if latency targets could not be met and the use case needed few tools", "The cascade is always cheaper", "Speech-to-speech models cannot handle interruptions"], "answer": 1, "explain": "It names what the cascade buys (control, auditability, modularity) and the condition under which you would switch. Absolute claims like 'always cheaper' or 'cannot handle interruptions' are not defensible."}
```

## In practice

Most production voice agents today are cascades with aggressive streaming, a small fast LLM for the first sentence, and humans one transfer away. Teams revisit speech-to-speech each year as the models improve, using the same latency budget and call-level metrics to decide.

Ready to wire a voice loop yourself? The sandbox lets you vary the latency budget and interruption handling.

```sandbox
voice-agent
```
