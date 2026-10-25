---
title: How many examples do you need? Power and sample size
minutes: 9
---

Earlier we saw that 500 examples per arm could not confirm a 4-point improvement with the unpaired test. The reverse mistake is also common: running 5,000 examples when 800 would do. Deciding the size before you run is called a **power analysis**, and it needs you to commit to three things in advance.

1. **How small an improvement matters**: the **minimum detectable effect** $\delta$, say 3 percentage points.
2. **How often you accept a false alarm**: the significance level $\alpha$ (usually 0.05), the chance of declaring a difference when none exists.
3. **How often you accept missing a real effect**: $\beta$, so that the **power** $1 - \beta$ (usually 0.8) is the chance of detecting a true effect of size $\delta$.

## The maths

Under the alternative that B is truly $\delta$ better than A, the observed gap is roughly normal, centred on $\delta$ with standard error $\mathrm{SE} = \sqrt{2p(1-p)/n}$ (taking both arms near the same rate $p$ with $n$ items each). We reject the null when the gap exceeds $z_{\alpha/2}\,\mathrm{SE}$, and we want that to happen with probability $1 - \beta$, which requires $\delta$ to sit $z_\beta$ standard errors above the rejection boundary:

$$
\delta = (z_{\alpha/2} + z_{\beta})\sqrt{\frac{2p(1-p)}{n}} \quad\Longrightarrow\quad n \approx \frac{(z_{\alpha/2} + z_{\beta})^2\; 2p(1-p)}{\delta^2}\ \text{ per arm}
$$

Here $z_{\alpha/2} = 1.96$ for $\alpha = 0.05$ two-sided, and $z_\beta = 0.8416$ for 80% power (1.2816 for 90%). So $(z_{\alpha/2} + z_\beta)^2 = (2.8016)^2 = 7.85$.

```steps
Sample size to detect +3 points from a base of 80%
$p = 0.80$, $\delta = 0.03$, $\alpha = 0.05$, power 80%.
---
$2p(1-p) = 2 \times 0.8 \times 0.2 = 0.32$.
---
$n = 7.85 \times 0.32 / 0.03^2 = 2.512/0.0009 = 2791$ per arm.
---
Other targets (same $p$): $\delta = 0.05$ gives $2.512/0.0025 = 1005$; $\delta = 0.04$ gives $1570$; $\delta = 0.02$ gives $6279$.
---
For 90% power replace 7.85 by $(1.96 + 1.2816)^2 = 10.51$: the 3-point case needs $10.51 \times 0.32/0.0009 = 3737$ per arm.
```

Note the $1/\delta^2$: halving the effect you want to detect quadruples the data. Detecting a 1-point gain at 80% needs about 25,000 per arm, which is rarely worth chasing offline.

## See it

```sim
ab-significance
{"pA": 0.8, "pB": 0.83, "n": 2800, "alpha": "0.05"}
```

With a 3-point gap and about 2,800 per arm, the simulation sits right at the threshold: power near 80% and a minimum detectable effect near 3 points. Cut $n$ to 700 and the power collapses and the minimum detectable effect roughly doubles; push $n$ to 10,000 and you can detect about 1.6 points. Try $\alpha = 0.01$ and see how much more data the same power demands.

## Power in practice, and the lever of pairing

| Lever | Effect on required $n$ |
|---|---|
| Larger effect to detect | $n \propto 1/\delta^2$ |
| Higher power (80% → 90%) | about 34% more |
| Stricter $\alpha$ (0.05 → 0.01) | about 49% more at 80% power |
| Base rate near 50% | largest $p(1-p)$, most data |
| Paired design | much less, since only discordant items count |

For paired comparisons the formula changes. If a fraction $\pi_d$ of items is discordant (the systems differ), the gap's standard error is about $\sqrt{\pi_d/n}$ and

$$
n \approx \frac{(z_{\alpha/2} + z_\beta)^2\,\pi_d}{\delta^2}
$$

In the McNemar example $\pi_d = 50/500 = 0.10$. To detect $\delta = 0.04$: $7.85 \times 0.10/0.0016 = 491$ items, versus $1570$ per arm unpaired. Two versions of one prompt usually disagree on 10 to 20% of items, so pairing cuts the data needed by a factor of 3 or more.

## Underpowered studies mislead twice

If power is low, you will often miss real improvements (the "not significant" result is meaningless). Worse, the few experiments that do reach significance tend to have *over*-estimated the effect, because only the lucky large gaps cross the line (the winner's curse). Teams that run many small evals and ship whatever wins therefore see real gains smaller than their eval gains.

## In practice

Run the power calculation when you design the eval, not after. If the eval you can afford cannot detect the effect you care about, either collect more data, use a paired design, reduce noise (temperature 0, fixed seeds), or accept that this experiment is only a smoke test and decide using a larger online test (lesson 6). Write the planned $n$, $\delta$, $\alpha$ and power into the experiment note before looking at results.

```quiz
{"q": "At baseline $p = 0.5$, how many examples per arm (80% power, $\\alpha = 0.05$ two-sided) are needed to detect a +5 point gain? Use $(z_{\\alpha/2}+z_\\beta)^2 = 7.85$.", "options": ["About 310", "About 785", "About 1,570", "About 3,140"], "answer": 2, "explain": "$2p(1-p) = 0.5$, so $n = 7.85 \\times 0.5/0.05^2 = 3.925/0.0025 = 1570$. The tempting 785 forgets the factor 2 in $2p(1-p)$ (it counts one arm's variance instead of the difference's)."}
```

```quiz
{"q": "You halve the improvement you want to be able to detect (from 4 points to 2) and keep $p$, $\\alpha$ and power fixed. How does the required sample size per arm change?", "options": ["It doubles", "It quadruples", "It halves", "It is unchanged"], "answer": 1, "explain": "$n \\propto 1/\\delta^2$, and $(1/0.5)^2 = 4$. For $p = 0.8$ this goes from about 1,570 to about 6,280."}
```
