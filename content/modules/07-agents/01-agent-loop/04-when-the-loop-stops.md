---
title: When the loop stops, and how many steps to expect
minutes: 8
---

Every agent loop needs an answer to "how many times will this go round?" The model decides when it is done, but you decide the worst case. Leave the worst case open and one confused run can burn through hundreds of calls overnight. Set it too tight and good runs are cut off just before the answer.

A useful mental model is a search party. Each hour there is some chance they find what they are looking for. You do not know in advance which hour, but you can reason about the average and you can decide in advance when to call off the search. Agent runs are the same: each step has some chance of being the last one, and you choose a **step cap** $N$.

## Stopping conditions

A well-built loop stops on the first of these:

- **Final answer**: the model returns text with no tool call (the normal, good exit).
- **Step cap**: $t = N$ model calls have been made.
- **Budget cap**: tokens or money spent exceeds a limit.
- **Deadline**: wall-clock time is up (users will not wait ten minutes for a chat reply).
- **No progress**: the same action is repeated, or nothing new has been learned in several steps (lesson 5 covers detection).
- **Cancellation**: the user or an operator aborts.

Only the first is a success. All the others should end with an honest message ("I could not finish; here is what I found") rather than silence.

## Expected steps: a geometric model

Suppose that at each step, if the run has not finished yet, the model produces its final answer with probability $q$, independently of earlier steps. Then the number of model calls $T$ follows a **geometric distribution**:

$$
P(T = k) = (1-q)^{k-1} q, \qquad \mathbb{E}[T] = \frac{1}{q}
$$

With a cap the loop makes $\min(T, N)$ calls. Its expectation has a neat derivation: a run reaches call number $k$ exactly when the first $k-1$ calls did not finish, which has probability $(1-q)^{k-1}$, so

$$
\mathbb{E}[\min(T,N)] = \sum_{k=1}^{N} P(T \ge k) = \sum_{k=1}^{N} (1-q)^{k-1} = \frac{1-(1-q)^N}{q}
$$

and the fraction of runs that finish before hitting the cap is

$$
P(T \le N) = 1-(1-q)^N
$$

```steps
Worked example: q = 0.25
With no cap, a run averages $1/0.25 = 4$ model calls.
---
With $N = 5$: $P(\text{finish}) = 1 - 0.75^5 = 1 - 0.2373 = 0.763$. Nearly a quarter of runs are cut off, and the mean is $(1-0.2373)/0.25 = 3.05$ calls.
---
With $N = 10$: $0.75^{10} = 0.0563$, so $P(\text{finish}) = 0.944$ and the mean is $0.9437/0.25 = 3.77$ calls.
---
To have 99% of runs finish we need $0.75^N \le 0.01$, so $N \ge \ln 0.01 / \ln 0.75 = 16.01$. Round up: $N = 17$ gives $0.75^{17} = 0.0075$, a 99.25% finish rate, at a mean cost of 3.97 calls.
```

The lesson in those numbers: raising the cap from 10 to 17 barely moves the **average** cost (3.77 to 3.97 calls) but rescues most of the runs that were being cut off. Caps mainly protect the **tail**. The real expense of a generous cap comes from runs that are stuck, not from runs that are working.

| Cap $N$ | Finish rate ($q=0.25$) | Mean calls |
|---|---|---|
| 5 | 76.3% | 3.05 |
| 10 | 94.4% | 3.77 |
| 17 | 99.2% | 3.97 |
| none | 100% | 4.00 |

## Where the model breaks

Real runs are not perfectly geometric. Easy tasks finish in two steps; hard ones meander. And a stuck agent usually has a much lower chance of finishing than a healthy one, because it is repeating itself. So treat $q$ as a starting estimate, then measure the actual distribution of steps from your traces and set $N$ near a high percentile (say the 99th) of successful runs.

```sim
agent-loop
```

Lower the maximum steps in the simulation one at a time and note the smallest cap at which the sample run still reaches a final answer. That number is one sample of $T$; a real cap needs the distribution over many runs.

## In practice

Teams typically log the step count of every run and look at its histogram weekly. A sudden shift to the right (runs taking more steps) is an early warning that a tool has started failing, a prompt change confused the model, or the task mix changed. A spike of runs at exactly $N$ means the cap is cutting off work, or that many runs are stuck in loops; the trace of a few of them tells you which.

```quiz
{"q": "A model finishes with probability q = 0.4 at each step. With a cap of N = 6 calls, what fraction of runs finish before the cap?", "options": ["About 95%", "About 60%", "About 40%", "100%"], "answer": 0, "explain": "P(finish) = 1 − 0.6⁶ = 1 − 0.0467 ≈ 0.953. Answering 40% confuses the per-step probability with the cumulative one."}
```

```quiz
{"q": "Raising the cap from 10 to 17 steps (with q = 0.25) changes the mean number of calls from 3.77 to 3.97. Why so little?", "options": ["Because most runs finish well before step 10, so the extra steps are only used by the few runs that were being cut off", "Because the model gets faster with more steps", "Because the cap does not affect cost at all", "Because q increases when the cap increases"], "answer": 0, "explain": "Only the 5.6% of runs still going at step 10 can use steps 11 to 17, so the mean moves a little while the finish rate rises from 94.4% to 99.2%. The cap does affect cost, but mainly in the tail."}
```
