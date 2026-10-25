// Lab: a new prompt scores 82% against 78%. Is that real? Confidence intervals, required sample size and power by hand and in the sim.
import type { Lab } from "./types";

const r = String.raw;

export const isItReallyBetter: Lab = {
  slug: "is-it-really-better",
  module: "evaluation",
  title: "Is it really better?",
  product: "A prompt change for an insurance claims assistant",
  summary: "A new prompt scores 82% on the eval set against 78% for the old one. Decide whether that gap is real: compute a confidence interval and the sample size you actually need by hand, then use the simulator to see how sample size, effect size and power interact.",
  difficulty: "medium",
  minutes: 30,
  tags: ["A/B testing", "significance", "confidence interval", "sample size", "power", "p-value"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`An insurance company's claims assistant answers policy questions. The prompt engineer has rewritten the system prompt and runs both versions on the same kind of questions, grading each answer pass or fail.

| | Old prompt | New prompt |
|---|---|---|
| Pass rate | 78% | 82% |
| Questions graded | 500 | 500 |

The engineer wants to ship it. The product manager asks one question: **"Is that difference real, or did we get lucky on these 500 questions?"**

If the questions are random draws, each pass rate is itself a random number. With $n$ questions and true pass rate $p$, the observed rate has a standard error

$$SE = \sqrt{\frac{p(1-p)}{n}}$$

and the difference of two independent rates has $SE_\text{diff} = \sqrt{SE_A^2 + SE_B^2}$. This lab turns that into three concrete tools: a confidence interval, a required sample size, and a feel for statistical power.`,
    },
    {
      type: "quiz",
      title: "Four points: signal or noise?",
      body: r`In the simulator's default setup (78% vs 82%, 500 each, 5% significance level) the two-sided **p-value** is about 0.11 and the 95% interval for the difference includes 0.`,
      question: "What can the team conclude from 82% vs 78% on 500 questions each?",
      options: [
        { text: "The data are consistent with no real improvement: the gap is within what chance could produce, so the test is inconclusive, not proof of equality", correct: true, why: "Right. A p-value of 0.11 means that if the prompts were equally good, a gap this big would appear about 11% of the time. That is not enough to rule out luck, and it does not prove the prompts are equal either: the test may simply lack power." },
        { text: "The new prompt is better because 82 is greater than 78", why: "Any two finite samples differ. The question is whether the difference is larger than sampling noise would produce." },
        { text: "The prompts are equally good, because the p-value is above 0.05", why: "Failing to find a significant difference is not evidence of no difference. With only 500 questions the test could not detect a 4-point gap reliably." },
        { text: "The p-value is the probability that the new prompt is better", why: "A p-value is the probability of data this extreme *if there were no real difference*. It is not the probability that either hypothesis is true." },
      ],
    },
    {
      type: "math",
      title: "The confidence interval for the gap",
      body: r`Old prompt $p_A = 0.78$, new prompt $p_B = 0.82$, $n = 500$ each. The difference is $0.04$. Compute the standard error of the difference and the half-width of a 95% interval ($\pm 1.96\,SE_\text{diff}$).`,
      question: r`What is the half-width of the 95% confidence interval for the difference? (Four decimals.)`,
      answer: 0.0495,
      tolerance: 0.02,
      hint: r`$SE_A^2 = 0.78\times 0.22/500$, $SE_B^2 = 0.82\times 0.18/500$. Add them, take the square root, multiply by 1.96.`,
      solution: r`**Variances of each rate.**

$$SE_A^2 = \frac{0.78\times 0.22}{500} = 0.000343, \qquad SE_B^2 = \frac{0.82\times 0.18}{500} = 0.000295$$

**Difference.**

$$SE_\text{diff} = \sqrt{0.000343 + 0.000295} = \sqrt{0.000638} = 0.0253$$

**95% interval.**

$$0.04 \pm 1.96\times 0.0253 = 0.04 \pm 0.0495 = [-0.0095,\; 0.0895]$$

The interval runs from a 1-point *loss* to a 9-point gain. It includes 0, so we cannot say the new prompt is better.`,
    },
    {
      type: "sim",
      title: "Collect enough data",
      body: r`The team can grade more questions. The true rates are assumed to stay at 78% and 82%. Raise the number of questions per prompt until the result is both **significant** (p-value at most 0.05) and the test has **at least 80% power** to detect this gap.`,
      sim: "ab-significance",
      params: { pA: 0.78, pB: 0.82, n: 500, alpha: "0.05" },
      locked: ["pA", "pB", "alpha"],
      goals: [
        { metric: "pValue", op: "<=", value: 0.05, label: "p-value at most 0.05" },
        { metric: "power", op: ">=", value: 0.8, label: "Power at least 80%" },
      ],
      hints: [
        "More questions shrink the standard error: it falls with $1/\\sqrt{n}$.",
        "The 'needed' readout is the sample size per arm for 80% power at this gap.",
        "About 1,600 questions per prompt is enough.",
      ],
      solution: { n: 1600 },
    },
    {
      type: "math",
      title: "How many questions do you need?",
      body: r`For a two-sided test at $\alpha = 0.05$ with **80% power**, the sample size per arm is

$$n = \frac{(z_{1-\alpha/2} + z_{\text{power}})^2\,\bigl[p_A(1-p_A) + p_B(1-p_B)\bigr]}{(p_B - p_A)^2}$$

with $z_{1-\alpha/2} = 1.96$ and $z_\text{power} = 0.84$. Plug in $p_A = 0.78$ and $p_B = 0.82$.`,
      question: r`How many graded questions per prompt are needed?`,
      answer: 1566,
      tolerance: 0.03,
      unit: "questions per arm",
      hint: r`$(1.96+0.84)^2 = 7.84$. The bracket is $0.78\times 0.22 + 0.82\times 0.18$. The denominator is $0.04^2$.`,
      solution: r`**Bracket.**

$$0.78\times 0.22 + 0.82\times 0.18 = 0.1716 + 0.1476 = 0.3192$$

**Sample size.**

$$n = \frac{7.84\times 0.3192}{0.0016} = \frac{2.503}{0.0016} \approx 1{,}564$$

With the exact $z$ for 80% power (0.8416) it is 1,566. The needed sample size grows with the **inverse square of the gap**: detecting a 2-point gap needs four times as many questions as a 4-point gap.`,
    },
    {
      type: "sim",
      title: "When data is the limit",
      body: r`Real labelling budgets are small. Suppose you can afford only **300 graded questions per prompt**, and the old prompt scores 78%. How much better must the new prompt really be before a 300-question comparison reliably (80% power) and significantly shows it?

Move the new prompt's true pass rate until both goals hold. Notice how large the improvement has to be.`,
      sim: "ab-significance",
      params: { pA: 0.78, pB: 0.8, n: 300, alpha: "0.05" },
      locked: ["pA", "n", "alpha"],
      goals: [
        { metric: "pValue", op: "<=", value: 0.05, label: "p-value at most 0.05" },
        { metric: "power", op: ">=", value: 0.8, label: "Power at least 80%" },
      ],
      hints: [
        "The 'minimum detectable effect' readout tells you the smallest gap this sample can reliably find.",
        "At 300 questions that is about 8-9 points.",
        "A pass rate of 87% (a 9-point gain) meets both goals.",
      ],
      solution: { pB: 0.87 },
    },
    {
      type: "quiz",
      title: "Peeking and many comparisons",
      body: r`The engineer re-runs the comparison after every 100 new graded questions and stops the first time the p-value drops below 0.05. Separately, the team tries 20 different prompt variants against the baseline and ships the best-looking one.`,
      question: "What is wrong with both practices?",
      options: [
        { text: "Checking repeatedly, or testing many variants, gives chance many chances to cross the threshold, so the real false-positive rate is far above 5%", correct: true, why: "Right. With 20 independent null comparisons the chance that at least one hits $p<0.05$ is $1-0.95^{20}=64\\%$. Fix the sample size in advance, correct for multiple comparisons, and confirm the winner on fresh data." },
        { text: "Nothing: more checks always give more accurate answers", why: "Each extra look is another chance for noise to look like signal. Sequential testing needs special methods that adjust the threshold." },
        { text: "The p-value becomes undefined when you look more than once", why: "It is still defined; it just no longer means what you think, because the stopping rule depends on the data." },
        { text: "Only the number of variants matters, peeking is harmless", why: "Peeking inflates false positives too: stopping at the first lucky dip is a form of selecting on noise." },
      ],
    },
  ],
};
