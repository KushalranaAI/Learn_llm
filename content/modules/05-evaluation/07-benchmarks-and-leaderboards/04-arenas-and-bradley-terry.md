---
title: Pairwise arenas: Bradley-Terry and Elo by hand
minutes: 10
---

Static benchmarks need a right answer. Much of what people want from a chat model (a helpful explanation, a good email, working code with a clear walkthrough) has no single right answer, but people can usually say which of two answers they prefer. **Pairwise arenas** turn that into a ranking: show a user two anonymous responses to their own prompt, record which one they pick, and repeat millions of times. Chatbot Arena (now LMArena) is the best-known example.

Chess solved the same problem decades ago. You cannot give a chess player an exam, but you can watch who beats whom, and the **Elo** system turns wins and losses into ratings that predict future results. Arenas borrow the idea.

## The model behind the ratings

The **Bradley-Terry** model gives each model $i$ a strength $R_i$ and says the probability that $i$ is preferred over $j$ depends only on the difference. On the familiar Elo scale,

$$
P(i \succ j) = \frac{1}{1 + 10^{-(R_i - R_j)/400}}
$$

so a 400-point gap means 10:1 odds. Inverting it, an observed preference rate $w$ for $i$ over $j$ implies a gap of

$$
R_i - R_j = 400 \log_{10}\frac{w}{1-w}
$$

```steps
Ratings from win counts, by hand
Model A was preferred over B in 60 of 100 votes (ties counted as half a win each). $w = 0.60$.
---
Gap: $400 \log_{10}(0.60 / 0.40) = 400 \log_{10} 1.5 = 400 \times 0.1761 = 70.4$ points.
---
B was preferred over C in 60 of 100 votes, so B is also 70.4 points above C. The model predicts A vs C with a gap of 140.8: $P = 1/(1 + 10^{-0.352}) = 1/(1 + 0.445) = 0.69$.
---
Ratings are relative. Anchor one model (say C at 1000) and the others follow: B = 1070, A = 1141. Only differences mean anything.
---
With many models and uneven match-ups, the ratings are fitted together by maximum likelihood: logistic regression of "did i win" on the difference of strengths. That is what arena leaderboards compute.
```

Two reference points worth memorising: a 100-point gap is about a 64% preference rate, a 200-point gap about 76%.

## Online Elo versus a central fit

Classic Elo updates after every game: $R_i \leftarrow R_i + K\,(S - E)$ where $S$ is 1 for a win and $E$ the predicted win probability. With $K = 32$, a model expected to win with $E = 0.64$ that does win gains $32 \times 0.36 = 11.5$ points. This is designed for players whose skill drifts, so recent games count more, and the result depends on the order of games. A frozen model's skill does not drift, so the Chatbot Arena team moved in 2023 to fitting Bradley-Terry on all votes at once and getting confidence intervals by **bootstrapping**: resample the votes, refit, and read the spread of each rating.

## How many votes?

Near $w = 0.5$, the standard error of a preference rate from $n$ votes is $\sqrt{0.25/n}$, and a small change in $w$ maps to a rating change of about $400/(\ln 10 \cdot w(1-w)) \approx 695$ points per unit of $w$. With 1,000 head-to-head votes, $\text{SE}_w = 0.0158$, so the rating gap has an SE of about $695 \times 0.0158 = 11$ points, a 95% interval of roughly $\pm 22$. Models within 20 or so points of each other are often statistically tied.

```sim
arena-elo
```

Start with a large true gap and few votes: the fitted ratings are noisy but the order is right. Shrink the true gap to near zero and watch the order flip between reruns while the confidence intervals overlap. Then add votes and see the intervals tighten roughly with $1/\sqrt{n}$.

## What arena ratings do not tell you

- **Style can beat substance.** Longer, well-formatted answers win votes. LMArena's **style control** adds answer length and markdown counts as extra variables in the regression so the model coefficient measures preference *after* accounting for style; length was by far the largest style effect.
- **Selective disclosure inflates the top.** "The Leaderboard Illusion" (2025) documented providers privately testing many variants (27 for one model family before a release) and publishing the best. Picking the maximum of $N$ noisy estimates is biased upwards: with an SE of 10 points and $N = 10$ equally good variants, the best one is expected to read about 15 points high.
- **Unequal sampling.** The same paper estimated that two large providers each received around a fifth of all arena data, while 83 open-weight models together received under a third. More data on the arena distribution helps a model fit that distribution.
- **Whose prompts?** Voters' prompts are not your users' prompts. A model can lead overall and trail on your domain.

## In practice

Use arena ratings as a broad signal of conversational preference, look at category and style-controlled views, and treat gaps under a few tens of points as ties. For your own product, run a small private arena: the same pairwise idea with your prompts, your raters or a calibrated judge ([pairwise vs pointwise](/learn/evaluation/llm-as-judge/pairwise-vs-pointwise)), and both orderings of each pair to cancel position bias.

```quiz
{"q": "Model X is preferred over Model Y in 75% of votes. What Bradley-Terry rating gap does that imply on the Elo scale?", "options": ["About 191 points", "About 75 points", "About 400 points", "About 120 points"], "answer": 0, "explain": "400 × log₁₀(0.75/0.25) = 400 × log₁₀ 3 = 400 × 0.477 = 191. A 400-point gap would mean 10:1 odds, about 91%."}
```

```quiz
{"q": "A provider privately tests 10 variants of the same quality and publishes only the best arena score. What happens?", "options": ["Nothing, the scores are unbiased", "The published score is biased upwards, because the maximum of several noisy estimates exceeds the true value on average", "The published score is biased downwards", "The confidence interval becomes narrower, which fixes the bias"], "answer": 1, "explain": "Each variant's rating is true value plus noise; the maximum of 10 noise draws averages about 1.5 standard errors above zero. A narrower interval on the winner does not remove the selection effect."}
```
