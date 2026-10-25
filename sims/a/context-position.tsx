// "Lost in the middle": how likely a model is to use a fact depending on where it sits in a long context.
// An illustrative U-shaped curve fitted in spirit to Liu et al. 2023, not a benchmark of any specific model.
// Params: contextTokens 1024–131072 (log), position 0–100 (% of the way into the context), model (older | modern).
// Metrics: recall (chance the fact is used at this position), edgeRecall (best of start/end), worstRecall (minimum over
// positions), middleDip (edgeRecall − worstRecall).
import { LineChart } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { clamp, linspace, round } from "./lib";

export const MODELS_CTX: Record<string, { label: string; a: number; d0: number; d1: number; trained: number }> = {
  older: { label: "Older model (16k trained context)", a: 0.03, d0: 0.08, d1: 0.07, trained: 16384 },
  modern: { label: "Long-context model (128k trained)", a: 0.01, d0: 0.02, d1: 0.025, trained: 131072 },
};
const W = 0.15, PRIMACY = 0.85;

export function recallAt(q: number, L: number, modelKey: string) {
  const m = MODELS_CTX[modelKey] ?? MODELS_CTX.older;
  const lg = Math.log2(L / 1024);
  let base = clamp(0.99 - m.a * lg, 0.05, 0.99);
  if (L > m.trained) base *= clamp(1 - 0.5 * Math.log2(L / m.trained), 0.1, 1); // past the trained length it falls apart
  const D = clamp(m.d0 + m.d1 * lg, 0, 0.7);
  const u = Math.max(PRIMACY * Math.exp(-q / W), Math.exp(-(1 - q) / W));
  return base * (1 - D * (1 - u));
}

const QS = linspace(0, 1, 51);

function compute(p: Params) {
  const L = num(p, "contextTokens"), m = str(p, "model");
  const all = QS.map((q) => recallAt(q, L, m));
  const edge = Math.max(all[0], all[all.length - 1]);
  const worst = Math.min(...all);
  return { recall: recallAt(num(p, "position") / 100, L, m), edgeRecall: edge, worstRecall: worst, middleDip: edge - worst };
}

const k = (v: number) => (v >= 1024 ? `${Math.round(v / 1024)}k` : `${v}`);

function View({ params }: SimViewProps) {
  const L = num(params, "contextTokens"), m = str(params, "model"), pos = num(params, "position");
  const lens = [...new Set([Math.max(1024, L / 4), L, Math.min(131072, L * 4)].map(Math.round))];
  return (
    <>
      <Caption>Where the fact sits in the context (needle at {pos}% of {k(L)} tokens)</Caption>
      <div role="img" aria-label={`fact at ${pos}% of the context`} style={{ position: "relative", height: 22, borderRadius: 6, background: "repeating-linear-gradient(90deg, var(--card-3) 0 10px, var(--card-2) 10px 12px)" }}>
        <span style={{ position: "absolute", left: `calc(${pos}% - 4px)`, top: -3, width: 8, height: 28, borderRadius: 3, background: "var(--accent)" }} />
        <span className="muted" style={{ position: "absolute", left: 6, top: 3, fontSize: "0.72rem" }}>start (system / first docs)</span>
        <span className="muted" style={{ position: "absolute", right: 6, top: 3, fontSize: "0.72rem" }}>end (question)</span>
      </div>
      <LineChart
        x={QS.map((q) => Math.round(q * 100))}
        series={lens.map((len) => ({ name: `${k(len)} tokens`, values: QS.map((q) => recallAt(q, len, m)), dashed: len !== Math.round(L) }))}
        yMax={1}
        yFormat="pct"
        xFormat={(v) => `${v}%`}
        xLabel="position of the fact in the context"
        yLabel="recall"
        marker={Math.round(pos / 2)}
        height={220}
      />
    </>
  );
}

const D = { contextTokens: 4096, position: 50, model: "older" };
const dm = compute(D);
const lg = Math.log2(4096 / 1024);
const u50 = Math.max(PRIMACY * Math.exp(-0.5 / W), Math.exp(-0.5 / W));

export const contextPosition: SimDef = {
  id: "context-position",
  title: "Lost in the middle: position of a fact vs recall",
  summary: "Move a key fact through a long context and see how often a model uses it: strong at the start and end, weakest in the middle, worse as contexts grow.",
  module: "model-foundations",
  tags: ["context window", "long context", "lost in the middle", "retrieval", "prompt ordering"],
  params: [
    { key: "contextTokens", label: "Context length", kind: "range", min: 1024, max: 131072, step: 1, unit: "tokens", log: true },
    { key: "position", label: "Fact position", kind: "range", min: 0, max: 100, step: 2, unit: "%" },
    { key: "model", label: "Model", kind: "select", options: Object.entries(MODELS_CTX).map(([value, m]) => ({ value, label: m.label })) },
  ],
  defaults: D,
  metrics: [
    { key: "recall", label: "Recall at this position", format: "pct" },
    { key: "edgeRecall", label: "Best (start/end)", format: "pct" },
    { key: "worstRecall", label: "Worst position", format: "pct" },
    { key: "middleDip", label: "Middle dip", format: "pct" },
  ],
  compute,
  View,
  math: `Liu et al. (2023, *Lost in the Middle*) put the one relevant document at different positions among 10–30 distractors and found a **U-shaped** curve: accuracy is highest when the answer is at the end (recency), high at the start (primacy), and lowest in the middle; the dip grows with context length. This sim uses a smooth curve with that shape (illustrative, not a measurement of any particular model):

$$\\text{recall}(q, L) = b(L)\\,\\Big(1 - D(L)\\,\\big(1 - u(q)\\big)\\Big), \\qquad u(q) = \\max\\!\\big(0.85\\,e^{-q/0.15},\\; e^{-(1-q)/0.15}\\big)$$

- $q \\in [0,1]$ is the fact's relative position; $u(q)$ is 1 near the end, 0.85 at the start and ≈ 0 in the middle.
- $b(L) = 0.99 - a\\log_2(L/1024)$ is the best-case recall, which also drifts down with length, and collapses past the trained context: $\\times\\big(1 - 0.5\\log_2(L/L_{\\text{train}})\\big)$.
- $D(L) = d_0 + d_1\\log_2(L/1024)$ (capped at 0.7) is the depth of the middle dip.
- Older model: $a$ = 0.03, $d_0$ = 0.08, $d_1$ = 0.07, $L_{train}$ = 16k. Long-context model: $a$ = 0.01, $d_0$ = 0.02, $d_1$ = 0.025, $L_{train}$ = 128k.

**Defaults** (older model, $L$ = 4096, fact at 50%): $\\log_2(4096/1024) = ${lg}$, so $b = 0.99 - 0.03\\cdot ${lg} = ${round(0.99 - 0.03 * lg, 2)}$, $D = 0.08 + 0.07\\cdot ${lg} = ${round(0.08 + 0.07 * lg, 2)}$, $u(0.5) = ${round(u50, 3)}$, giving recall $= ${round(dm.recall, 3)}$ versus ${round(dm.edgeRecall, 3)} at the end: a ${round(dm.middleDip * 100, 1)}-point dip.

**Engineering takeaway**: put instructions and the most relevant retrieved chunks at the start or end of the prompt, keep contexts short, and test with your own model rather than trusting the advertised window.`,
  explain: (p, m) =>
    `At ${num(p, "position")}% of a ${k(num(p, "contextTokens"))}-token context the fact is used ${Math.round(m.recall * 100)}% of the time, versus ${Math.round(m.edgeRecall * 100)}% at the best edge${m.middleDip > 0.1 ? ": move key facts to the start or end" : ""}.`,
};
