// Lab: build an evaluation suite for a tax-help assistant: size the golden set, choose graders, keep it clean of
// contamination, set a CI gate threshold with the eval-gate sim, then gate a bad model rollout in the sandbox.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

const release = (gate?: NodeConfig): Graph =>
  build(
    {
      users: ["users", { rps: 1, hardShare: 0.3 }],
      gateway: ["gateway"],
      ...(gate ? { gate: ["eval-gate", gate] as ["eval-gate", NodeConfig] } : {}),
      llm: ["llm-api", { model: "medium" }],
      obs: ["observability"],
    },
    gate ? "users > gateway > gate > llm" : "users > gateway > llm",
  );

export const buildAnEvalSuite: Lab = {
  slug: "build-an-eval-suite",
  module: "evaluation",
  title: "Build an eval suite",
  product: "A tax-help assistant that ships a new prompt or model every week",
  summary: "Turn \"it looks fine to me\" into a release process: size a golden set for the precision you need, pick assertions or an LLM judge for each check, keep the set uncontaminated, set a CI gate threshold that catches regressions without crying wolf, and stop a bad model rollout in the sandbox.",
  difficulty: "medium",
  minutes: 40,
  tags: ["evaluation", "golden set", "LLM judge", "assertions", "CI", "regression gate", "contamination", "sandbox"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A fintech runs a tax-help assistant. Every week someone changes something: a new system prompt, a cheaper model, a provider's silent model update. Last month a "minor" prompt tweak made the assistant forget to add the legal disclaimer and give wrong deadlines for self-employed users. Nobody noticed for nine days.

Error rates and latency looked normal the whole time: **a quality regression throws no exception**. The team decides that no version ships without passing an **eval suite**:

1. a **golden set** of real questions with reference answers or rubrics,
2. **graders**: cheap code assertions where they work, an LLM judge where they don't,
3. a **CI gate** that runs the set on every candidate and blocks the release when the score drops more than a threshold.

Each piece is a statistics problem in disguise. A score on $n$ items with accuracy $p$ has standard error $\sqrt{p(1-p)/n}$, so the size of the set decides which regressions you can even see.`,
    },
    {
      type: "math",
      title: "How big must the golden set be?",
      body: r`The assistant currently answers about $p = 0.85$ of questions correctly. The team wants the eval score to be within **±2 percentage points** of the true accuracy, 95% of the time. For a proportion, the margin of error is

$$E = z\sqrt{\frac{p(1-p)}{n}} \quad\Longrightarrow\quad n = \frac{z^2\,p(1-p)}{E^2}$$

with $z = 1.96$ for 95%.`,
      question: r`How many golden examples are needed? (Round up.)`,
      answer: 1225,
      tolerance: 0.02,
      unit: "examples",
      hint: r`$z^2 = 3.8416$, $p(1-p) = 0.85 \times 0.15$, $E^2 = 0.02^2 = 0.0004$.`,
      solution: r`$$n = \frac{1.96^2 \times 0.85 \times 0.15}{0.02^2} = \frac{3.8416 \times 0.1275}{0.0004} = \frac{0.4898}{0.0004} = 1224.5 \;\to\; 1{,}225$$

Halving the margin to ±1 point needs **four times** as many examples (4,900): precision costs the square. Two practical consequences:

- 50 hand-picked examples (a common starting point) give a margin of $1.96\sqrt{0.1275/50} = \pm 9.9$ points. Fine for smoke tests, useless for detecting a 3-point regression.
- Slicing matters: if self-employed users are 10% of the set, their slice has only ~120 items and a ±6.4-point margin.`,
    },
    {
      type: "quiz",
      title: "Assertions or an LLM judge?",
      body: r`The suite checks four things on every answer: (a) the reply includes the legal disclaimer, (b) any deadline quoted matches the official calendar, (c) the JSON sent to the filing widget is valid, (d) the explanation is clear and appropriately cautious for a non-expert.`,
      question: "Which grading plan is best?",
      options: [
        { text: "Code assertions for (a), (b) and (c); an LLM judge with a rubric for (d), calibrated against a small human-labelled sample", correct: true, why: "Right. Deterministic checks are free, fast and perfectly repeatable, so use them wherever the property is checkable in code. Subjective qualities need a judge, and a judge needs calibration: measure its agreement with humans (e.g. Cohen's kappa) before trusting it, and re-check when you change the judge model or prompt." },
        { text: "An LLM judge for everything, so there is one consistent grader", why: "A judge is noisier, slower and costs money per item, and it can be wrong about things a regex or a JSON parser gets right every time. Reserve it for what code cannot check." },
        { text: "Human review of every answer, because humans are the gold standard", why: "Humans are the reference for calibration, but grading thousands of items on every candidate build is slow and expensive. Use them to label a calibration set and for spot checks." },
        { text: "Exact string match against the reference answers for all four", why: "Exact match fails correct answers that are phrased differently (and clarity cannot be string-matched). It is only right for closed-form outputs such as a deadline date or a JSON field." },
      ],
    },
    {
      type: "sim",
      title: "Is your eval set contaminated?",
      body: r`To save time, someone proposes using a **public tax-QA benchmark** as the golden set. The candidate model scores well on it, suspiciously well. About 30% of that benchmark has been circulating on the web for years and was very likely in the model's training data.

Find out what the model really scores. Your result must be **at most 61%** (the honest number, not the memorised one), measured on enough items that the 95% **sampling margin is at most 2 points**.`,
      sim: "benchmark-contamination",
      params: { benchmarkSize: 500, contaminationRate: 0.3, memorisationBoost: 0.95, trueAccuracy: 0.6, retest: false, seed: 1 },
      locked: ["contaminationRate", "memorisationBoost", "trueAccuracy"],
      goals: [
        { metric: "measuredScore", op: "<=", value: 0.61, label: "Measured score reflects true ability (≤ 61%)" },
        { metric: "noiseMargin", op: "<=", value: 0.02, label: "Sampling margin at most ±2 points" },
      ],
      hints: [
        "Memorised items only help when the wording matches what the model saw. Rephrasing (or writing new, held-out items) breaks that.",
        "The margin is $1.96\\sqrt{a(1-a)/n}$ with $a = 0.6$; solve for $n$.",
        "Turn on the rephrased re-test and use at least about 2,300 items.",
      ],
      solution: { retest: true, benchmarkSize: 2400 },
    },
    {
      type: "math",
      title: "The noise in a regression test",
      body: r`In CI each candidate is scored on the golden set and compared with the current version's score. The measured drop $\hat D$ has two sources of noise: sampling (both scores come from $n$ items) and run-to-run variation $\sigma$ (temperature, judge variance):

$$\text{SE}(\hat D) = \sqrt{\frac{2p(1-p)}{n} + \sigma^2}$$

Take $p = 0.85$, $n = 1{,}500$ items and $\sigma = 1$ percentage point ($0.01$).`,
      question: r`What is the standard error of the measured drop, in percentage points? (Two decimals.)`,
      answer: 1.64,
      tolerance: 0.02,
      unit: "pp",
      hint: r`$2 \times 0.85 \times 0.15 / 1500 = 0.00017$; add $0.01^2 = 0.0001$, take the square root and multiply by 100.`,
      solution: r`$$\text{SE} = \sqrt{0.00017 + 0.0001} = \sqrt{0.00027} = 0.01643 \;\to\; 1.64 \text{ pp}$$

A threshold must sit well above this noise or good builds get blocked by chance: blocking at $T$ gives a false-alarm rate of $1 - \Phi(T/\text{SE})$. At $T = 2.5$ pp that is $1 - \Phi(1.52) \approx 6\%$. To catch a real 4-point regression 80% of the time you also need $4 - T \ge 0.84 \times \text{SE}$, so $T \le 2.6$ pp. Both fit only because the set is large enough: at $n = 300$ the SE is 3.1 pp and no threshold satisfies both.`,
    },
    {
      type: "sim",
      title: "Set the gate",
      body: r`The team cares about regressions of **4 points** or more (true regression is locked at 4 pp). Engineers will start ignoring the gate if it blocks more than **1 good build in 10**, and the product owner will not accept missing more than **1 real regression in 5**.

Choose the eval set size and the threshold. Watch the two shaded error areas as you move them, and press Play to see a few CI runs land.`,
      sim: "eval-gate",
      params: { evalSetSize: 300, trueRegression: 4, threshold: 2, baselineAccuracy: 0.85, noise: 1, seed: 1 },
      locked: ["trueRegression", "baselineAccuracy", "noise"],
      goals: [
        { metric: "falseAlarmRate", op: "<=", value: 0.1, label: "False alarm rate at most 10%" },
        { metric: "missRate", op: "<=", value: 0.2, label: "Miss rate at most 20%" },
      ],
      hints: [
        "With 300 items the two distributions overlap heavily: no threshold can meet both goals. Grow the set first.",
        "A higher threshold trades false alarms for misses. You need roughly $T \\ge 1.28\\,\\text{SE}$ and $4 - T \\ge 0.84\\,\\text{SE}$.",
        "1,500 items with a 2.5 pp threshold meets both.",
      ],
      solution: { evalSetSize: 1500, threshold: 2.5 },
    },
    {
      type: "design",
      title: "Stop the bad rollout",
      body: r`Here is the production assistant in the sandbox. The test runs it under a **bad model rollout**: the provider ships a worse model version. Success stays at 99.9% and nothing errors, but answer quality collapses.

Add an **Eval gate** in front of the model (palette, group *Ops*) and tune it so that:

- quality stays at least **0.83** under the bad rollout (so the gate must stop most bad versions),
- the gate wrongly blocks at most **20%** of good releases,
- the whole system still costs at most **\$19,500 a month** (eval runs are paid on every candidate, and human review is expensive).

The gate's card shows its catch rate, false alarms and eval spend.`,
      starter: release(),
      palette: ["gateway", "llm-api", "eval-gate", "observability"],
      test: {
        incident: { type: "badRollout" },
        constraints: [
          { type: "quality", min: 0.83, why: "A bad version reaches users unless the gate blocks it. Grow the eval set or lower the threshold." },
          { type: "gateFalseAlarms", max: 0.2, why: "A threshold inside the noise blocks good releases. Raise it, or grow the set to shrink the noise." },
          { type: "costPerMonth", maxUsd: 19500, why: "Human review of every item on every candidate is too expensive here; an LLM judge is enough." },
          { type: "requires", kind: "eval-gate", why: "Online monitoring only notices after users were affected." },
        ],
      },
      hints: [
        "Use the guide's \"Add an eval gate\" fix or drag an Eval gate between the gateway and the model.",
        "At the default 500 items the gate stops about 87% of bad versions: not enough. More items cut the noise, so real drops stand out.",
        "2,000 items, block at > 2 pp, graded by an LLM judge passes every check.",
      ],
      solution: release({ evalSetSize: 2000, threshold: 2, judge: "llm-judge" }),
    },
    {
      type: "quiz",
      title: "Keeping the suite honest",
      body: r`Six months later every release passes the gate easily. The golden set has not changed since launch, and engineers routinely tweak prompts until the failing golden examples pass.`,
      question: "What is the biggest risk now?",
      options: [
        { text: "The prompts have been tuned to the golden set, so its score overstates real quality (Goodhart's law); keep a held-out set nobody tunes on and refresh both from recent production traffic", correct: true, why: "Right. Any set you optimise against stops measuring generalisation, exactly like training on the test set. A frozen set also drifts away from what users ask today. Sample new items from production (with failures found by online evals) and keep part of the suite hidden from day-to-day tuning." },
        { text: "None: a stable, passing suite means quality is stable", why: "A suite that always passes may simply have been overfitted, or no longer reflect current traffic." },
        { text: "The LLM judge gets bored of the same examples", why: "Judges have no memory between calls. The problem is the people and prompts optimising against a fixed target." },
        { text: "The set is too large and slows CI", why: "Size is not the issue here; representativeness and overfitting are." },
      ],
    },
  ],
};
