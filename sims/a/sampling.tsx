// Next-token sampling: logits -> temperature -> top-k -> top-p -> renormalise -> draw with a seed.
// Params: prompt (capital | story | code | colour), temperature 0–2 (0 = greedy), topK 0–10 (0 = off), topP 0.05–1, seed 1–100.
// Metrics: entropyBits (of the final distribution), topProb (largest final probability), keptTokens (candidates left after
// filtering), sampledRank (1 = the model's most likely token was drawn), uniqueIn20 (distinct tokens in 20 draws with this seed).
import { BarChart, TokenStrip } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { entropyBits, memo, mulberry32, round, softmax } from "./lib";

export const PROMPTS: Record<string, { label: string; text: string; cands: [string, number][] }> = {
  capital: {
    label: "Factual: capital of France",
    text: "The capital of France is",
    cands: [[" Paris", 9.0], [" a", 5.5], [" the", 5.2], [" located", 4.8], [" known", 4.3], [" also", 3.9], [" Lyon", 3.0], [" not", 2.8], [" one", 2.6], [" famous", 2.4]],
  },
  story: {
    label: "Creative: once upon a time",
    text: "Once upon a time, there was a",
    cands: [[" little", 4.0], [" young", 3.6], [" king", 3.3], [" girl", 3.2], [" man", 3.0], [" princess", 2.9], [" small", 2.7], [" boy", 2.6], [" dragon", 2.3], [" beautiful", 2.1]],
  },
  code: {
    label: "Code: function body",
    text: "def fibonacci(n):\n   ",
    cands: [[" if", 6.5], [" return", 5.6], [' """', 5.0], [" a", 4.0], [" #", 3.8], [" memo", 2.9], [" n", 2.6], [" fib", 2.2], [" result", 2.0], [" pass", 1.5]],
  },
  colour: {
    label: "Open: favourite colour",
    text: "My favourite colour is",
    cands: [[" blue", 4.2], [" red", 3.5], [" green", 3.4], [" purple", 3.0], [" black", 2.6], [" yellow", 2.5], [" pink", 2.3], [" orange", 2.1], [" white", 2.0], [" grey", 1.6]],
  },
};

/** Final distribution after temperature, top-k and top-p. Candidates are pre-sorted by logit. */
export function filtered(logits: number[], T: number, k: number, topP: number) {
  const n = logits.length;
  let p: number[];
  if (T <= 1e-6) p = logits.map((_, i) => (i === logits.indexOf(Math.max(...logits)) ? 1 : 0));
  else p = softmax(logits.map((z) => z / T));
  const order = p.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const keep = new Set<number>();
  const kk = k > 0 ? Math.min(k, n) : n;
  let cum = 0;
  for (let r = 0; r < kk; r++) {
    const i = order[r];
    if (p[i] <= 0) break;
    keep.add(i);
    cum += p[i];
    if (cum >= topP - 1e-12) break;
  }
  const s = [...keep].reduce((a, i) => a + p[i], 0) || 1;
  return p.map((v, i) => (keep.has(i) ? v / s : 0));
}

function draw(p: number[], u: number) {
  let c = 0;
  for (let i = 0; i < p.length; i++) { c += p[i]; if (u < c) return i; }
  return p.findLastIndex((v) => v > 0);
}

export const runSampler = memo((pr: Params) => {
  const P = PROMPTS[str(pr, "prompt")] ?? PROMPTS.capital;
  const logits = P.cands.map((c) => c[1]);
  const base = softmax(logits);
  const fin = filtered(logits, num(pr, "temperature"), Math.round(num(pr, "topK")), num(pr, "topP"));
  const r = mulberry32(Math.round(num(pr, "seed")));
  const draws = Array.from({ length: 20 }, () => draw(fin, r()));
  return {
    P, base, fin, draws,
    metrics: {
      entropyBits: entropyBits(fin),
      topProb: Math.max(...fin),
      keptTokens: fin.filter((v) => v > 0).length,
      sampledRank: draws[0] + 1,
      uniqueIn20: new Set(draws).size,
    },
  };
});

const compute = (p: Params) => runSampler(p).metrics;

function View({ params }: SimViewProps) {
  const r = runSampler(params);
  const lab = (s: string) => s.trim() || s;
  return (
    <>
      <Caption>Prompt and the token drawn with this seed (highlighted)</Caption>
      <TokenStrip tokens={[{ text: r.P.text, tone: 5 }, { text: r.P.cands[r.draws[0]][0], tone: 0 }]} highlight={1} />
      <Caption>Model&apos;s softmax at T = 1 (no filtering)</Caption>
      <BarChart bars={r.P.cands.map((c, i) => ({ label: lab(c[0]), value: r.base[i], color: "var(--muted)" }))} format="pct" yMax={1} height={170} />
      <Caption>After temperature, top-k and top-p (renormalised). Grey = removed.</Caption>
      <BarChart bars={r.P.cands.map((c, i) => ({ label: lab(c[0]), value: r.fin[i], color: r.fin[i] > 0 ? (i === r.draws[0] ? "var(--accent)" : "var(--blue)") : "var(--muted)" }))} format="pct" yMax={1} height={170} />
      <Caption>20 independent draws from this distribution (seed {num(params, "seed")})</Caption>
      <TokenStrip tokens={r.draws.map((i) => ({ text: r.P.cands[i][0], tone: i }))} />
    </>
  );
}

const D = { prompt: "capital", temperature: 1, topK: 0, topP: 0.95, seed: 7 };
const dr = runSampler(D);
const dm = dr.metrics;
const L = PROMPTS.capital.cands;
const Z = L.reduce((s, c) => s + Math.exp(c[1] - L[0][1]), 0);

export const sampling: SimDef = {
  id: "sampling",
  title: "Sampling the next token: temperature, top-k, top-p",
  summary: "Reshape a model's next-token distribution with temperature, top-k and nucleus (top-p) and watch confidence, diversity and the sampled token change.",
  module: "model-foundations",
  tags: ["sampling", "temperature", "top-k", "top-p", "entropy", "softmax"],
  params: [
    { key: "prompt", label: "Prompt", kind: "select", options: Object.entries(PROMPTS).map(([value, p]) => ({ value, label: p.label })) },
    { key: "temperature", label: "Temperature T", kind: "range", min: 0, max: 2, step: 0.05, help: "0 = greedy (always the top token)" },
    { key: "topK", label: "Top-k", kind: "range", min: 0, max: 10, step: 1, help: "0 = off" },
    { key: "topP", label: "Top-p (nucleus)", kind: "range", min: 0.05, max: 1, step: 0.05 },
    { key: "seed", label: "Seed", kind: "range", min: 1, max: 100, step: 1 },
  ],
  defaults: D,
  metrics: [
    { key: "entropyBits", label: "Entropy", format: "num", help: "bits" },
    { key: "topProb", label: "Top probability", format: "pct" },
    { key: "keptTokens", label: "Candidates kept", format: "int" },
    { key: "sampledRank", label: "Rank of sampled token", format: "int" },
    { key: "uniqueIn20", label: "Distinct in 20 draws", format: "int" },
  ],
  compute,
  View,
  math: `The model outputs a **logit** $z_i$ for every token in the vocabulary (here the 10 most likely candidates). Decoding turns them into a distribution and draws one:

1. **Temperature**: $p_i = \\dfrac{e^{z_i/T}}{\\sum_j e^{z_j/T}}$. $T<1$ sharpens (gaps between logits grow), $T>1$ flattens, $T\\to 0$ is greedy argmax.
2. **Top-k**: keep only the $k$ most probable tokens.
3. **Top-p (nucleus)**: sort by probability and keep the smallest prefix whose cumulative mass reaches $p$ (the first token is always kept).
4. **Renormalise** the survivors to sum to 1, then draw $u\\sim U(0,1)$ from the seeded generator and pick the first token whose cumulative probability exceeds $u$.

**Entropy** $H = -\\sum_i p_i\\log_2 p_i$ measures the remaining uncertainty: 0 bits = deterministic, $\\log_2 n$ bits = uniform over $n$ tokens.

**Defaults** ("The capital of France is", $T = 1$, top-p 0.95): the top logit is 9.0 for " Paris". Its probability is $1/\\sum_j e^{z_j - 9.0} = 1/${round(Z, 4)} = ${round(dr.base[0], 4)}$. That is below 0.95, so the nucleus adds " a" (${round(dr.base[1], 4)}) and then " the" (${round(dr.base[2], 4)}) until the mass reaches 0.95: ${dm.keptTokens} tokens kept. Renormalised, " Paris" has ${round(dm.topProb, 4)} and the entropy is ${round(dm.entropyBits, 3)} bits. Seed ${D.seed} draws "${dr.P.cands[dr.draws[0]][0].trim()}"; ${dm.uniqueIn20} distinct tokens appear in 20 draws. Raise top-p to 1 and $T$ to 1.5 and " located", " known", even " Lyon" appear: the more you flatten, the more often the model says something less likely (on a factual prompt, more often wrong).`,
  explain: (p, m) => {
    const r = runSampler(p);
    const tok = r.P.cands[r.draws[0]][0].trim();
    if (m.keptTokens === 1) return `Only one candidate survives ("${tok}"), so sampling is deterministic: entropy 0 bits. Raise temperature or top-p for variety.`;
    return `${m.keptTokens} candidates survive with ${m.entropyBits.toFixed(2)} bits of entropy; this seed drew "${tok}" (rank ${m.sampledRank}), and 20 draws give ${m.uniqueIn20} different tokens.`;
  },
};
