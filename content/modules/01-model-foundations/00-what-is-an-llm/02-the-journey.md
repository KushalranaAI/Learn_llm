---
title: "The journey: from n-grams to assistants"
minutes: 4
---

Predicting the next word is an old idea. In the late 1940s Claude Shannon counted which letters and words tend to follow which. Neural networks took over in the 2000s, the **transformer** arrived in 2017, and from then on the models mostly got *bigger*.

Press Play and watch the chart draw itself. Click any dot to jump to it.

```sim
llm-timeline
{"milestone": "shannon"}
```

**Try this:** stop on GPT-1, then on GPT-3, and compare the "Size vs GPT-1" tile.

The **growth factor** is just a division:

$$\frac{175\text{ B}}{117\text{ M}} = \frac{1.75\times10^{11}}{1.17\times10^{8}} \approx 1{,}500\times$$

That is a 1,500-fold jump in two years, which is why the chart needs a log scale: each grid line is $10\times$ the one below.

```callout-note
Bigger is not the whole story
In 2022 people preferred answers from a 1.3B InstructGPT over the 175B GPT-3. The difference was training with human feedback, which topic 4 shows.
```

```quiz
{"q": "GPT-2 had 1.5B parameters and GPT-1 had 117M. Roughly how many times bigger was GPT-2?", "options": ["About 1.3×", "About 13×", "About 130×", "About 1,300×"], "answer": 1, "explain": "$1.5\\times10^9 / 1.17\\times10^8 \\approx 12.8$, so about 13×. 1.3× comes from comparing the leading digits (1.5 vs 1.17) and forgetting that one is billions and the other millions."}
```
