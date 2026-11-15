---
title: Standard error and confidence intervals
minutes: 8
---

```callout-before
Before you start
You need the idea that an eval score is an average over a sample. If a pass rate of 82% on 50 examples feels solid to you, this topic is where that feeling gets tested.
```

```predict
{"q":"A system passes 82% of a 50-example eval set. Roughly how wide is the 95% confidence interval on its true pass rate?","options":["About ±1 point","About ±3 points","About ±11 points","About ±25 points"],"answer":2,"reveal":"About ±11 points, 71% to 93%. Getting down to about ±3 points takes 800 examples, because the width shrinks with $\\sqrt{n}$. The steps under \"The maths\" compute all three sample sizes."}
```

Flip a fair coin 10 times and you will often see 6 or 7 heads. Nobody concludes the coin is biased, because we know a small sample wobbles. An eval set is a small sample of all the inputs your system could face, and the pass rate you compute from it wobbles in exactly the same way. A different 50 questions would have given a different score.

The **standard error** (SE) measures that wobble: roughly how far a measured pass rate typically lands from the true one. A **confidence interval** (CI) turns it into a range that, over many repeated experiments, would contain the true value a stated fraction of the time (95% for the usual interval).

## In everyday life

Think of a batter who scores 60 in his first innings. Is he a 60-average player? Of course not. One innings is part skill and part luck: the bowler, the pitch, the mood of the day. After five innings you have a rough idea. After a hundred you trust the number. Your eval score works the same way. An eval set is a small handful of "innings" taken from all the inputs your system could ever face, and a different handful would give a different score.

The **standard error** is a plain measure of that wobble: how far a score measured on one sample typically sits from the true score. A **confidence interval** is a range built from it, written like "82% plus or minus 5", constructed so that it catches the true score most of the time. More examples make the range narrower, but slowly. Unlike a batter, whose form changes from season to season, your system's true pass rate stays put, which is why piling up more examples really does pin it down.

**Where you meet it.** A team tests a new support chatbot on a small set of questions, sees a good score and tells management it is ready. With no error bar, nobody knows that a fresh set of questions might give a noticeably different score. With one, the team sees how shaky the number is and adds more questions before deciding.

```scene
title: A batter's average: five innings or a hundred
step: 🏏 A batter scores a big number in one innings and fans call him a star | one score from a small sample
step: 🎲 His next few innings are much lower, so the first number was partly luck | sampling wobble
step: 📏 The scorer notes how far averages usually swing from one spell to another | standard error
step: 🧾 She reports the average as a range, not a single number | confidence interval
step: 📈 After a hundred innings the range is much tighter | more examples narrow the interval
takeaway: A score without an error bar is a guess dressed as a fact, and more examples shrink the bar only slowly.
```

## The maths

Each example is a Bernoulli trial: pass with probability $p$, fail otherwise. The mean of $n$ independent trials is $\hat p$ (the observed pass rate). Each trial has variance $p(1-p)$, and averaging $n$ of them divides the variance by $n$:

$$
\mathrm{SE}(\hat p) = \sqrt{\frac{\hat p(1 - \hat p)}{n}}, \qquad \text{95\% CI: } \hat p \pm 1.96\,\mathrm{SE}
$$

The 1.96 comes from the normal distribution: 95% of its mass lies within 1.96 standard deviations of the mean. The approximation is good when $n\hat p$ and $n(1-\hat p)$ are both at least about 10; near 0% or 100% with small $n$, use a Wilson or exact binomial interval instead.

```steps
Error bars at three sample sizes
Observed pass rate $\hat p = 0.82$.
---
$n = 50$: $\mathrm{SE} = \sqrt{0.82 \times 0.18 / 50} = \sqrt{0.002952} = 0.0543$. Interval: $0.82 \pm 1.96 \times 0.0543 = 0.82 \pm 0.106$, i.e. 71% to 93%.
---
$n = 200$: $\mathrm{SE} = \sqrt{0.1476/200} = 0.0272$. Interval: $0.82 \pm 0.053$, i.e. 77% to 87%.
---
$n = 800$: $\mathrm{SE} = \sqrt{0.1476/800} = 0.0136$. Interval: $0.82 \pm 0.027$, i.e. 79% to 85%.
---
Each 4-fold increase in $n$ halves the interval. Going from 50 to 800 examples (16 times) shrinks it by 4.
```

## See it

```sim
ab-significance
{"pA": 0.78, "pB": 0.82, "n": 500, "alpha": "0.05"}
```

The two bell curves show where each system's true pass rate plausibly lies, and the bars are each system's 95% interval. Drag **Samples per arm n** from 500 down to 100 and watch the curves widen and overlap; drag it up to 5,000 and they pull apart. Change **Significance level** to 0.01 and the intervals widen as we demand more certainty.

## What a confidence interval does and does not say

- It says: if you repeated this whole procedure many times, about 95% of such intervals would contain the true pass rate.
- It does not say that the true value is "probably" inside this specific interval with 95% chance in a strict sense, nor that individual outputs have a 95% chance of being right. A pass rate of 82% is a statement about the average; one given answer is either right or wrong.

Two cautions about reading overlapping intervals. Non-overlapping 95% intervals for two systems do imply a significant difference, but overlapping ones do **not** prove there is none: the interval for the *difference* is narrower than the sum of the two margins would suggest, and for paired data narrower still. Compute the difference interval directly, as the next topics do.

Also, SE assumes independent examples. If your eval set has 50 near-duplicate variants of 5 base questions, the effective sample is closer to 5. Clustered data (several questions per document, several turns per conversation) needs a clustered standard error, or you should resample at the cluster level.

## In practice

Put an interval on every number you report: "82% ± 5 (n = 200)". It is a short habit that prevents most false improvements. Quote the interval half-width when you decide how big an eval you need: if the decision depends on 2-point differences, you need a half-width well below 2 points, which at $p = 0.8$ means over 1,500 examples. Interval width also depends on $p$: it is largest at 50% and shrinks towards the extremes, so high-accuracy systems are easier to pin down than middling ones.

```quiz
{"q": "A system passes 160 of 200 eval items. What is the 95% confidence interval for its true pass rate?", "options": ["0.80 ± 0.03", "0.80 ± 0.055", "0.80 ± 0.11", "0.80 ± 0.25"], "answer": 1, "explain": "$\\mathrm{SE} = \\sqrt{0.8 \\times 0.2/200} = \\sqrt{0.0008} = 0.0283$; $1.96 \\times 0.0283 = 0.055$. Using the SE alone (±0.03) is a 68% interval; 0.11 is what you get for $n = 50$."}
```

```quiz
{"q": "You want to halve the width of a confidence interval on a pass rate. How must the number of eval examples change?", "options": ["Double", "Multiply by 4", "Multiply by 2.5", "Multiply by 8"], "answer": 1, "explain": "Width scales as $1/\\sqrt{n}$, so halving it requires $\\sqrt{n}$ to double, which means $n$ grows 4-fold."}
```
