---
title: "Saturation and contamination: when a benchmark stops measuring"
minutes: 9
---

Benchmarks age. When a benchmark is new, scores are low and spread out, and a 5-point gain means something. A few years later the top models cluster near the ceiling, and the benchmark may also have leaked into training data. Both effects make the number less informative, and they are easy to confuse with progress.

**Saturation** is the first: the scores of strong models bunch up near the maximum achievable, so the benchmark no longer separates them. **Contamination** is the second: test items (or close paraphrases, or their answers) appeared in the model's training data, so a correct answer may be recall rather than skill. A student who has seen the exam paper in advance gets a high grade that predicts nothing about the next exam.

## In everyday life

Think of a driving test where the examiner always uses the same short route near the office. Word gets around. Learners practise that exact route again and again, memorising every turn and signal. They pass easily, yet some of them still struggle on an unfamiliar road.

Two things have gone wrong, and they have names. **Contamination** means the test's questions, or their answers, leaked into the material the model learned from, so a right answer may be plain recall rather than real skill. **Saturation** means almost everyone now scores near the top, so the test can no longer tell a good driver from a great one.

Another quiet problem is that the answer key itself is never perfect. If a few questions are marked wrongly, even a flawless candidate cannot reach one hundred percent, and small gaps near the top turn into arguments about the key.

Contamination is also something to check, not to assume. Some models show no sign of it at all.

**Where you meet it.** A team sees a model jump sharply on an old, famous test and wants to switch to it. Before doing so, they write a fresh set of similar questions that nobody could have seen. If the score drops a lot on the fresh set, the jump was partly memory.

```scene
title: The driving test with one fixed route
step: 🗺️ The test uses the same route every time, and the route becomes public | benchmark questions become public
step: 📚 Learners memorise the turns instead of learning to drive | test items leak into training data
step: 🏆 Nearly everyone passes with top marks, so the test stops separating drivers | saturation
step: 🛣️ A new, unfamiliar route is set for the same drivers | fresh held-out test set
step: 📉 Some drivers do much worse on it, which shows the earlier pass was partly memory | contamination inflated the score
takeaway: A high score on an old public test may be memory, so check it on fresh questions you control.
```

## Saturation and the label-noise ceiling

The ceiling is rarely 100%. If a fraction $e$ of the answer key is wrong or ambiguous, a model that always gives the truly correct answer scores at most about $1 - e$. A careful re-annotation of MMLU estimated $e \approx 0.065$, which puts the practical ceiling around 93.5%. Once leading models sit in the low 90s, most of the remaining "errors" are disputes with the key, and a one-point gap between two models is within noise.

The pattern repeats: MMLU was followed by MMLU-Pro (harder, ten options), GPQA, and then Humanity's Last Exam, each built because the previous one stopped separating frontier models. In February 2026 OpenAI said it would no longer report SWE-bench Verified, citing an audit in which most of the problems models kept failing had tests that rejected correct solutions, and signs that models had seen the tasks in training. A benchmark at the end of its life measures the benchmark, not the model.

## The maths: how contamination inflates a score

Let $t$ be the model's true accuracy on unseen items of this kind. A fraction $c$ of the benchmark's items leaked into training. On a leaked item the model sometimes recalls the answer even when it could not have solved it: of the items it would have failed, a fraction $m$ (the **memorisation boost**) become correct. Then

$$
\text{reported} = t + c \cdot m \cdot (1 - t), \qquad \text{inflation} = c \cdot m \cdot (1 - t)
$$

```steps
Worked example
True skill $t = 0.60$. A third of the items leaked, $c = 0.30$. Memorisation rescues half the would-be failures, $m = 0.5$.
---
Would-be failures: $1 - t = 0.40$. Rescued share of all items: $c \times m \times 0.40 = 0.30 \times 0.5 \times 0.40 = 0.06$.
---
Reported score: $0.60 + 0.06 = 0.66$. Six points of the score are recall, not skill.
---
Note the $(1 - t)$ factor: a weak model gains more from the same leak than a strong one, so contamination also compresses the gaps between models.
```

```sim
benchmark-contamination
```

Start with no contamination and note that the reported and true scores agree. Raise the contamination rate step by step and watch the inflation grow linearly; then raise the memorisation boost and see the two effects multiply. Finally shrink the benchmark size and notice how the noise band around the reported score widens until the inflation is hard to tell apart from luck.

## How contamination is detected

| Method | Idea | Needs |
|---|---|---|
| **N-gram overlap** | Search the training corpus for long exact matches of test items | Access to training data |
| **Canary strings** | Benchmark files carry a unique marker; if a model can reproduce it, the files were trained on | Benchmark authors who added one |
| **Guided completion** | Give the model the dataset name and the first half of an item; a near-verbatim continuation is a red flag | Only API access |
| **Ordering test** | A model that saw the benchmark assigns higher likelihood to its canonical item order than to shuffled orders | Log-probabilities |
| **Fresh-set comparison** | Build new items of the same style and difficulty; a large drop from old to new signals overfitting | Effort to write new items |
| **Time windows** | Only score items published after the model's training cutoff (LiveCodeBench, MathArena) | A stream of new items |

The fresh-set comparison is the most convincing because it measures the consequence directly. GSM1k, a newly written set in the style of the grade-school maths benchmark GSM8k, found drops of up to 8 points for some model families, and the drop correlated with how likely each model was to reproduce GSM8k items verbatim. Many frontier models showed little drop, which is the other half of the lesson: contamination is a hypothesis to test, not an assumption.

## In practice

For your own evaluations, contamination is controllable: keep a **private held-out set** that never appears in prompts, fine-tuning data or public repositories, and refresh part of it every quarter from new production traffic. For public numbers, prefer benchmarks with time windows or held-out splits, and treat a sudden jump on an old public benchmark with suspicion until it shows up on a fresh one.

```quiz
{"q": "True skill is 0.50, contamination rate 0.20, memorisation boost 0.8. What score is reported?", "options": ["0.58", "0.66", "0.60", "0.54"], "answer": 0, "explain": "Inflation = c × m × (1 − t) = 0.20 × 0.8 × 0.50 = 0.08, so 0.50 + 0.08 = 0.58. 0.66 forgets the (1 − t) factor: memorisation only helps on items the model would have failed."}
```

```quiz
{"q": "Which observation is the strongest evidence that a benchmark score is inflated by contamination?", "options": ["The score is above 90%", "The model scores much lower on a freshly written set of the same style and difficulty", "The benchmark is more than two years old", "The model was trained on a lot of web data"], "answer": 1, "explain": "A drop from old items to new, comparable items measures the effect itself. A high score, an old benchmark or web-scale training make contamination plausible, but none of them shows it happened."}
```
