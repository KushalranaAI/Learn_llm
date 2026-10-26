---
title: CI eval gates and the maths of regression risk
minutes: 10
---

Once you have a golden set and graders, the natural next step is to run them automatically on every change (prompt edit, model upgrade, retrieval tweak, tool change) and block the change if quality drops. That automatic check is an **eval gate**. It turns evaluation from a report someone reads into a rule the pipeline enforces.

A gate is a smoke detector. Too sensitive and it goes off every time you make toast, so people pull the battery out. Too insensitive and it stays quiet during a real fire. Designing a gate means choosing where to sit between those two failures, with numbers.

## Two kinds of gate

| Gate | Runs on | Rule | Typical size |
|---|---|---|---|
| **Regression gate** | Regression suite (cases that must always pass) | Every case passes, allowing for confirmed flakes | 30 to 300 cases |
| **Statistical gate** | Golden or capability suite | New score not worse than baseline by more than a threshold $\tau$ | Hundreds of items, several trials each |

The regression gate catches "we broke something we had fixed". The statistical gate catches "everything got a bit worse". Both are needed.

## The maths: false alarms and misses

Let $D$ be the observed change in pass rate (new minus baseline) and $\text{SE}_D$ its standard error. Block if $D < -\tau$. If the true change is $-\Delta$ (a regression of size $\Delta$, or $\Delta = 0$ for no change), then $D$ is roughly normal with mean $-\Delta$, and

$$
\text{false alarm} = P(D < -\tau \mid \Delta = 0) = \Phi\!\left(\frac{-\tau}{\text{SE}_D}\right)
$$

$$
\text{miss} = P(D \ge -\tau \mid \Delta) = 1 - \Phi\!\left(\frac{\Delta - \tau}{\text{SE}_D}\right)
$$

where $\Phi$ is the standard normal CDF. Running baseline and candidate on the same items (paired) shrinks $\text{SE}_D$ by a factor $\sqrt{1-\rho}$ when their per-item results correlate at $\rho$.

```steps
Designing a statistical gate
300 items, pass rate around $p = 0.85$. Unpaired: $\text{SE}_D = \sqrt{2 \times 0.85 \times 0.15 / 300} = \sqrt{0.00085} = 0.0292$.
---
Paired with $\rho = 0.6$: $\text{SE}_D = 0.0292 \times \sqrt{0.4} = 0.0184$.
---
Threshold $\tau = 0.03$. False alarm: $\Phi(-0.03/0.0184) = \Phi(-1.63) = 0.052$. About one harmless change in 20 gets blocked.
---
True regression of 5 points ($\Delta = 0.05$): miss $= 1 - \Phi(0.02/0.0184) = 1 - \Phi(1.09) = 0.14$. The gate catches 86% of such regressions.
---
Unpaired, the same gate would raise false alarms 15% of the time and miss 25% of 5-point regressions. Pairing is the cheapest improvement you can make.
```

```sim
eval-gate
```

Set a small eval set and a tight threshold and watch the false-alarm rate climb: the gate cries wolf. Loosen the threshold and the miss rate climbs instead. Then increase the eval set size and see both fall together; size and pairing are the only ways to improve both at once. Finally raise the noise and notice how quickly a gate tuned for a deterministic system stops working.

## Flaky cases in the regression gate

LLM outputs vary between runs, so even a regression case the system "always" passes occasionally fails. With 50 cases that each flake independently 1% of the time, a perfectly good build fails at least one case with probability $1 - 0.99^{50} = 0.39$. Nobody trusts a gate that blocks 39% of good builds.

The fix is a rerun policy: a case only counts as failed if it fails on 2 of 3 runs. Per case, that happens by chance with probability about $3 \times 0.01^2 = 0.0003$, and across 50 cases about $1 - (1 - 0.0003)^{50} = 1.5\%$. Real regressions, which fail every time, are still caught.

```python
def gate(candidate, baseline, tau=0.03):
    """Paired statistical gate: candidate and baseline are per-item pass rates (same items)."""
    diffs = [c - b for c, b in zip(candidate, baseline)]
    n = len(diffs)
    mean = sum(diffs) / n
    var = sum((d - mean) ** 2 for d in diffs) / (n - 1)
    se = (var / n) ** 0.5
    return {"delta": mean, "se": se, "block": mean < -tau}
```

## Tooling

Most eval frameworks can run in CI and fail a build on a threshold: promptfoo (CLI with a GitHub Action), DeepEval (pytest-style test cases), Inspect (UK AI Security Institute's framework, with sandboxes for agents), OpenAI Evals, and hosted platforms such as LangSmith and Braintrust that store experiments for side-by-side comparison. Pick one that records the dataset version, grader version and per-item results; aggregate-only output makes failed gates impossible to debug.

## In practice

Gate on the paired difference, not on an absolute score, so a harder dataset version does not block everything. Cache baseline results per dataset version. Show the items that flipped from pass to fail in the CI output: engineers fix what they can see. Allow a documented override for intentional trade-offs, and review overrides weekly.

```sandbox
eval-gated-release
```

```quiz
{"q": "A gate has SE_D = 0.02 and blocks when D < −0.04. If the change truly has no effect, roughly how often is it blocked?", "options": ["About 2.3%", "About 16%", "About 5%", "About 0.1%"], "answer": 0, "explain": "False alarm = Φ(−0.04/0.02) = Φ(−2) ≈ 0.023. A 16% rate would correspond to a threshold of one standard error (−0.02)."}
```

```quiz
{"q": "A regression suite has 100 cases that each flake 0.5% of the time on a good build. With a single run per case, what is the chance a good build fails the gate?", "options": ["About 0.5%", "About 5%", "About 39%", "About 99%"], "answer": 2, "explain": "1 − 0.995¹⁰⁰ = 1 − 0.606 = 0.39. Small per-case flake rates compound across many cases, which is why reruns (e.g. fail only on 2 of 3) are needed."}
```
