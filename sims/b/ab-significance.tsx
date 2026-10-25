// A/B significance for pass rates: confidence intervals, two-proportion z-test, power and minimum detectable effect.
// Metric keys: diff (pB − pA), zScore, pValue (two-sided), power (to detect the observed diff at alpha),
//              mde (minimum detectable effect at 80% power), nNeeded (per arm, for the observed diff at 80% power).
import { LineChart, C } from "../ui";
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, SvgBox } from "./viz";
import { big, linspace, normCdf, normInv, normPdf, r } from "./lib";

const Z_POWER = normInv(0.8);

function model(p: Params) {
  const pA = num(p, "pA"), pB = num(p, "pB"), n = num(p, "n"), alpha = Number(p.alpha);
  const za = normInv(1 - alpha / 2);
  const seA = Math.sqrt((pA * (1 - pA)) / n), seB = Math.sqrt((pB * (1 - pB)) / n);
  const seDiff = Math.sqrt(seA * seA + seB * seB);
  const pbar = (pA + pB) / 2;
  const sePool = Math.sqrt((pbar * (1 - pbar) * 2) / n);
  const diff = pB - pA;
  const z = sePool > 0 ? diff / sePool : 0;
  const pValue = 2 * (1 - normCdf(Math.abs(z)));
  const power = seDiff > 0 ? normCdf(Math.abs(diff) / seDiff - za) + normCdf(-Math.abs(diff) / seDiff - za) : 0;
  const mde = (za + Z_POWER) * sePool;
  const varSum = pA * (1 - pA) + pB * (1 - pB);
  const nNeeded = diff === 0 ? Infinity : Math.ceil(((za + Z_POWER) ** 2 * varSum) / (diff * diff));
  return { pA, pB, n, alpha, za, seA, seB, seDiff, sePool, pbar, diff, z, pValue, power, mde, nNeeded };
}

function compute(p: Params) {
  const m = model(p);
  return { diff: m.diff, zScore: m.z, pValue: m.pValue, power: m.power, mde: m.mde, nNeeded: Math.min(m.nNeeded, 1e9) };
}

function View({ params }: SimViewProps) {
  const m = model(params);
  const lo = Math.max(0, Math.min(m.pA - 4.5 * m.seA, m.pB - 4.5 * m.seB));
  const hi = Math.min(1, Math.max(m.pA + 4.5 * m.seA, m.pB + 4.5 * m.seB));
  const xs = linspace(lo, hi, 121);
  const dens = (mu: number, se: number) => xs.map((x) => normPdf((x - mu) / se) / se);
  const rows = [
    { label: "A", mu: m.pA, h: m.za * m.seA, color: C.blue },
    { label: "B", mu: m.pB, h: m.za * m.seB, color: C.accent },
  ];
  const dLo = m.diff - m.za * m.seDiff, dHi = m.diff + m.za * m.seDiff;
  const conf = `${Math.round((1 - m.alpha) * 100)}%`;
  return (
    <>
      <Caption>Sampling distribution of each measured pass rate (n = {big(m.n)} per arm)</Caption>
      <LineChart
        x={xs}
        series={[
          { name: "variant A", values: dens(m.pA, m.seA), color: C.blue },
          { name: "variant B", values: dens(m.pB, m.seB), color: C.accent },
        ]}
        xFormat={(v) => `${(v * 100).toFixed(1)}%`}
        xLabel="pass rate"
        height={180}
      />
      <Caption>{conf} confidence intervals; the difference is significant only if its interval misses 0</Caption>
      <SvgBox height={118} label="confidence intervals">
        {(w) => {
          const pad = 46;
          const span = Math.max(Math.abs(dLo), Math.abs(dHi), 0.01) * 1.15;
          const sx = (v: number) => pad + ((v - lo) / (hi - lo || 1)) * (w - pad - 12);
          const sd = (v: number) => pad + ((v + span) / (2 * span)) * (w - pad - 12);
          const sig = dLo > 0 || dHi < 0;
          return (
            <>
              {rows.map((row, i) => (
                <g key={row.label}>
                  <text x={8} y={20 + i * 26} className="axis strong">{row.label}</text>
                  <line x1={sx(row.mu - row.h)} x2={sx(row.mu + row.h)} y1={16 + i * 26} y2={16 + i * 26} stroke={row.color} strokeWidth={4} strokeLinecap="round" />
                  <circle cx={sx(row.mu)} cy={16 + i * 26} r={5} fill={row.color} />
                  <text x={Math.min(w - 90, sx(row.mu + row.h) + 6)} y={20 + i * 26} className="axis">{`${(row.mu * 100).toFixed(1)}% ± ${(row.h * 100).toFixed(1)}`}</text>
                </g>
              ))}
              <text x={8} y={88} className="axis strong">B−A</text>
              <line x1={sd(0)} x2={sd(0)} y1={66} y2={104} stroke={C.muted} strokeDasharray="3 3" />
              <text x={sd(0)} y={116} textAnchor="middle" className="axis">0</text>
              <line x1={sd(dLo)} x2={sd(dHi)} y1={84} y2={84} stroke={sig ? C.green : C.red} strokeWidth={4} strokeLinecap="round" />
              <circle cx={sd(m.diff)} cy={84} r={5} fill={sig ? C.green : C.red} />
              <text x={sd(dLo)} y={78} textAnchor="middle" className="axis">{`${(dLo * 100).toFixed(1)}`}</text>
              <text x={sd(dHi)} y={78} textAnchor="middle" className="axis">{`${(dHi * 100).toFixed(1)} pts`}</text>
            </>
          );
        }}
      </SvgBox>
    </>
  );
}

const defaults = { pA: 0.78, pB: 0.82, n: 500, alpha: "0.05" };
const d = model(defaults);

export const abSignificance: SimDef = {
  id: "ab-significance",
  title: "Is B really better? Confidence intervals and significance",
  summary: "Two prompt or model variants with measured pass rates: see when a difference is real, how much power you have, and how many samples you need.",
  module: "evaluation",
  tags: ["A/B test", "p-value", "confidence interval", "power", "sample size"],
  params: [
    { key: "pA", label: "Pass rate A", kind: "range", min: 0.5, max: 0.99, step: 0.005 },
    { key: "pB", label: "Pass rate B", kind: "range", min: 0.5, max: 0.99, step: 0.005 },
    { key: "n", label: "Samples per arm n", kind: "range", min: 50, max: 20000, step: 10, log: true },
    { key: "alpha", label: "Significance level α", kind: "select", options: [{ value: "0.01", label: "0.01 (99%)" }, { value: "0.05", label: "0.05 (95%)" }, { value: "0.1", label: "0.10 (90%)" }] },
  ],
  defaults,
  metrics: [
    { key: "diff", label: "Difference B − A", format: "pct" },
    { key: "zScore", label: "z", format: "num" },
    { key: "pValue", label: "p-value", format: "num" },
    { key: "power", label: "Power", format: "pct" },
    { key: "mde", label: "Min. detectable effect", format: "pct" },
    { key: "nNeeded", label: "n needed / arm", format: "int" },
  ],
  compute,
  View,
  math: `Each arm is $n$ independent pass/fail trials, so a measured rate $\\hat p$ has standard error $\\text{SE} = \\sqrt{\\hat p(1-\\hat p)/n}$ and a $(1-\\alpha)$ confidence interval
$$\\hat p \\pm z_{1-\\alpha/2}\\,\\text{SE}.$$

**Two-proportion z-test.** Under $H_0$ (no difference) both arms share $\\bar p = (\\hat p_A + \\hat p_B)/2$:
$$z = \\frac{\\hat p_B - \\hat p_A}{\\sqrt{2\\bar p(1-\\bar p)/n}}, \\qquad p\\text{-value} = 2\\big(1 - \\Phi(|z|)\\big)$$

**Power** (chance a true difference $\\Delta$ shows up as significant), with $\\text{SE}_\\Delta = \\sqrt{\\text{SE}_A^2 + \\text{SE}_B^2}$:
$$1-\\beta \\approx \\Phi\\!\\left(\\frac{|\\Delta|}{\\text{SE}_\\Delta} - z_{1-\\alpha/2}\\right)$$

**Minimum detectable effect** at 80% power ($z_{0.8} = 0.8416$) and **samples needed** for an effect $\\Delta$:
$$\\text{MDE} = (z_{1-\\alpha/2} + z_{0.8})\\sqrt{2\\bar p(1-\\bar p)/n}, \\qquad n = \\frac{(z_{1-\\alpha/2}+z_{0.8})^2\\,[p_A(1-p_A)+p_B(1-p_B)]}{\\Delta^2}$$

**Worked example (defaults)**: $p_A = 0.78$, $p_B = 0.82$, $n = 500$, $\\alpha = 0.05$ ($z = 1.96$).
- $\\bar p = ${r(d.pbar, 2)}$, pooled SE $= \\sqrt{2\\cdot0.8\\cdot0.2/500} = ${r(d.sePool, 4)}$, so $z = 0.04/${r(d.sePool, 4)} = ${r(d.z, 3)}$ and $p = ${r(d.pValue, 3)}$: **not significant**.
- $\\text{SE}_\\Delta = ${r(d.seDiff, 4)}$, power $= \\Phi(0.04/${r(d.seDiff, 4)} - 1.96) = ${r(d.power, 3)}$: a real 4-point gain would be missed about ${Math.round((1 - d.power) * 100)}% of the time.
- MDE $= 2.8016 \\times ${r(d.sePool, 4)} = ${r(d.mde, 4)}$ (≈ ${r(d.mde * 100, 1)} points); to detect 4 points you need $n = 7.849 \\times ${r(0.78 * 0.22 + 0.82 * 0.18, 4)} / 0.0016 \\approx ${big(d.nNeeded)}$ per arm.`,
  explain: (_p, m) =>
    m.pValue < Number(_p.alpha)
      ? `p = ${m.pValue.toFixed(3)} is below α, so the ${(m.diff * 100).toFixed(1)}-point difference is unlikely to be noise.`
      : `p = ${m.pValue.toFixed(3)}: a ${(m.diff * 100).toFixed(1)}-point difference is within noise at this sample size. You can only reliably detect about ${(m.mde * 100).toFixed(1)} points; you'd need ~${Number.isFinite(m.nNeeded) ? Math.round(m.nNeeded).toLocaleString("en-US") : "∞"} samples per arm.`,
};
