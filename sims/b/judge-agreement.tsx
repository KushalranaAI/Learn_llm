// LLM-as-judge vs human labels on 200 synthetic pairwise comparisons, with position and verbosity bias.
// Metric keys: agreement (judge verdict = human), kappa (Cohen's κ), biasRate (verdict flips when the order is
//              swapped), verbosityWinRate (longer answer wins when humans preferred the shorter one).
import { BarChart, Heatmap, C } from "../ui";
import { bool, num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, Columns } from "./viz";
import { gauss, mulberry32, pc, r } from "./lib";

const N = 200;

type Item = { d: number; len: number; e1: number; e2: number; firstA: boolean };

function items(seed: number): Item[] {
  const rnd = mulberry32(seed * 7919 + 13);
  return Array.from({ length: N }, (_, i) => {
    const d = gauss(rnd);
    const len = 0.3 * d + Math.sqrt(1 - 0.09) * gauss(rnd); // longer answers are slightly better on average
    return { d, len, e1: gauss(rnd), e2: gauss(rnd), firstA: i % 2 === 0 };
  });
}

/** σ such that an unbiased judge agrees with humans with probability a, when d ~ N(0,1): a = ½ + arctan(1/σ)/π. */
export const sigmaFor = (a: number) => 1 / Math.tan(Math.PI * (a - 0.5));

type V = "A" | "B" | "tie";

function model(p: Params) {
  const a = num(p, "accuracy"), bp = num(p, "positionBias"), bl = num(p, "verbosityBias"), tau = num(p, "tieBand");
  const swap = bool(p, "swapAverage");
  const sig = sigmaFor(a);
  const verdict = (m: number): V => (m > tau ? "A" : m < -tau ? "B" : "tie");
  const its = items(num(p, "seed"));
  let agree = 0, flips = 0, shortPref = 0, longWins = 0, firstWins = 0, decided = 0;
  const conf = [[0, 0, 0], [0, 0, 0]]; // human A/B × judge A/B/tie
  for (const it of its) {
    // margins in favour of A; position bias favours whichever answer is shown first
    const mAB = it.d + sig * it.e1 + bp + bl * it.len;
    const mBA = it.d + sig * it.e2 - bp + bl * it.len;
    const m = swap ? (mAB + mBA) / 2 : it.firstA ? mAB : mBA;
    const v = verdict(m);
    const h: V = it.d > 0 ? "A" : "B";
    if (v === h) agree++;
    conf[h === "A" ? 0 : 1][v === "A" ? 0 : v === "B" ? 1 : 2]++;
    if (verdict(mAB) !== verdict(mBA)) flips++;
    if (v !== "tie") {
      decided++;
      if ((v === "A") === it.firstA) firstWins++;
    }
    const longerIsA = it.len > 0;
    if ((h === "A") !== longerIsA) {
      shortPref++;
      if (v !== "tie" && (v === "A") === longerIsA) longWins++;
    }
  }
  const po = agree / N;
  const hA = (conf[0][0] + conf[0][1] + conf[0][2]) / N, hB = 1 - hA;
  const jA = (conf[0][0] + conf[1][0]) / N, jB = (conf[0][1] + conf[1][1]) / N;
  const pe = hA * jA + hB * jB;
  const kappa = (po - pe) / (1 - pe);
  return { sig, conf, agreement: po, pe, kappa, biasRate: flips / N, verbosityWinRate: shortPref ? longWins / shortPref : 0, firstWinRate: decided ? firstWins / decided : 0, hA, jA, jB, shortPref };
}

function compute(p: Params) {
  const m = model(p);
  return { agreement: m.agreement, kappa: m.kappa, biasRate: m.biasRate, verbosityWinRate: m.verbosityWinRate };
}

function View({ params }: SimViewProps) {
  const m = model(params);
  return (
    <Columns min={230}>
      <div>
        <Caption>Confusion: human preference × judge verdict (counts of 200)</Caption>
        <Heatmap rows={["human: A", "human: B"]} cols={["judge A", "judge B", "tie"]} values={m.conf} format="int" cell={52} />
      </div>
      <div>
        <Caption>Bias checks (unbiased judge: 50% / low)</Caption>
        <BarChart
          format="pct"
          yMax={1}
          height={190}
          bars={[
            { label: "agree", value: m.agreement, color: C.green },
            { label: "1st slot wins", value: m.firstWinRate, color: C.blue },
            { label: "order flips", value: m.biasRate, color: C.red },
            { label: "longer wins*", value: m.verbosityWinRate, color: C.purple },
          ]}
        />
        <small className="muted">*when humans preferred the shorter answer</small>
      </div>
    </Columns>
  );
}

const defaults = { accuracy: 0.85, positionBias: 0.3, verbosityBias: 0.3, tieBand: 0, swapAverage: false, seed: 11 };
const d = model(defaults);

export const judgeAgreement: SimDef = {
  id: "judge-agreement",
  title: "LLM as a judge: agreement, κ and biases",
  summary: "A judge compares 200 answer pairs that humans already labelled. Add position and verbosity bias, then see agreement, Cohen's kappa and how swapping the order fixes one bias but not the other.",
  module: "evaluation",
  tags: ["LLM-as-judge", "Cohen's kappa", "position bias", "verbosity bias"],
  params: [
    { key: "accuracy", label: "Judge skill (unbiased accuracy)", kind: "range", min: 0.55, max: 0.99, step: 0.01 },
    { key: "positionBias", label: "Position bias β_pos", kind: "range", min: 0, max: 1, step: 0.05, help: "Pull towards the answer shown first" },
    { key: "verbosityBias", label: "Verbosity bias β_len", kind: "range", min: 0, max: 1, step: 0.05, help: "Pull towards the longer answer" },
    { key: "tieBand", label: "Tie band τ", kind: "range", min: 0, max: 1, step: 0.05, help: "Judge says 'tie' when |margin| < τ" },
    { key: "swapAverage", label: "Judge both orders and average", kind: "toggle" },
    { key: "seed", label: "Dataset seed", kind: "range", min: 1, max: 50, step: 1 },
  ],
  defaults,
  metrics: [
    { key: "agreement", label: "Agreement", format: "pct" },
    { key: "kappa", label: "Cohen's κ", format: "num" },
    { key: "biasRate", label: "Flips when order swapped", format: "pct" },
    { key: "verbosityWinRate", label: "Longer wins (humans chose shorter)", format: "pct" },
  ],
  compute,
  View,
  math: `Each of the $N = 200$ pairs has a true quality difference $d_i \\sim \\mathcal N(0,1)$ (A minus B) and a length difference $\\ell_i = 0.3\\,d_i + \\sqrt{0.91}\\,\\epsilon_i$. Humans prefer A iff $d_i > 0$.

The judge sees a noisy margin in favour of A; position bias pushes towards whichever answer is shown **first**, verbosity bias towards the **longer** one:
$$m_i^{AB} = d_i + \\sigma\\varepsilon_i + \\beta_{pos} + \\beta_{len}\\ell_i, \\qquad m_i^{BA} = d_i + \\sigma\\varepsilon'_i - \\beta_{pos} + \\beta_{len}\\ell_i$$
Verdict: A if $m > \\tau$, B if $m < -\\tau$, else tie. Half the pairs are shown A-first, half B-first; *swap and average* uses $(m^{AB} + m^{BA})/2$, which cancels $\\beta_{pos}$ exactly but leaves $\\beta_{len}$.

The noise $\\sigma$ comes from the judge's unbiased accuracy $a$: for $d,\\varepsilon \\sim \\mathcal N(0,1)$, $P(\\operatorname{sign}(d+\\sigma\\varepsilon) = \\operatorname{sign} d) = \\tfrac12 + \\tfrac1\\pi\\arctan(1/\\sigma)$, so
$$\\sigma = \\frac{1}{\\tan(\\pi(a - \\tfrac12))}.$$

**Cohen's κ** corrects agreement $p_o$ for agreement expected by chance $p_e = \\sum_k p_{human}(k)\\,p_{judge}(k)$:
$$\\kappa = \\frac{p_o - p_e}{1 - p_e}$$

**Worked example (defaults)**: $a = 0.85 \\Rightarrow \\sigma = 1/\\tan(0.35\\pi) = ${r(d.sig, 3)}$. With $\\beta_{pos} = \\beta_{len} = 0.3$ the judge agrees on ${Math.round(d.agreement * N)}/200 pairs, $p_o = ${r(d.agreement, 3)}$. Humans pick A ${pc(d.hA)}, the judge ${pc(d.jA)}, so $p_e = ${r(d.pe, 3)}$ and $\\kappa = (${r(d.agreement, 3)} - ${r(d.pe, 3)})/(1 - ${r(d.pe, 3)}) = ${r(d.kappa, 3)}$.
Swapping the order changes the verdict on ${pc(d.biasRate)} of pairs, and when humans preferred the shorter answer the judge still picked the longer one ${pc(d.verbosityWinRate)} of the time.`,
  explain: (_p, m) =>
    `The judge agrees with humans ${(m.agreement * 100).toFixed(0)}% of the time (κ = ${m.kappa.toFixed(2)}; above 0.6 is usually called substantial). ${(m.biasRate * 100).toFixed(0)}% of verdicts change when you only swap the order, a sign the judge is reacting to position, not quality.`,
};
