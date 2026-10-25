// Speculative decoding (Leviathan et al. 2023): a cheap draft proposes k tokens, the target verifies them in one pass.
// Params: k 1–12 (draft length), alpha 0–0.99 (per-token acceptance rate), draftCost 0.01–0.5 (draft step time / target step
// time), seed 1–50 (for the simulated run).
// Metrics: tokensPerPass (expected tokens per target pass), speedup (vs plain decoding), optimalK (best k for this α and cost),
// bestSpeedup (speedup at optimalK), simTokensPerPass (average over 200 simulated rounds with the seed).
import { LineChart } from "../ui";
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { memo, mulberry32, round } from "./lib";

export const expectedTokens = (a: number, k: number) => (a >= 1 ? k + 1 : (1 - a ** (k + 1)) / (1 - a));
export const speedupOf = (a: number, k: number, c: number) => expectedTokens(a, k) / (k * c + 1);

type Round = { accepted: number; bonus: boolean };

export const simulate = memo((p: Params) => {
  const k = Math.round(num(p, "k")), a = num(p, "alpha");
  const r = mulberry32(Math.round(num(p, "seed")));
  const rounds: Round[] = [];
  for (let i = 0; i < 200; i++) {
    let acc = 0;
    while (acc < k && r() < a) acc++;
    rounds.push({ accepted: acc, bonus: acc === k });
  }
  return rounds;
});

function compute(p: Params) {
  const k = Math.round(num(p, "k")), a = num(p, "alpha"), c = num(p, "draftCost");
  let optimalK = 1;
  for (let j = 1; j <= 12; j++) if (speedupOf(a, j, c) > speedupOf(a, optimalK, c) + 1e-12) optimalK = j;
  const rounds = simulate(p);
  return {
    tokensPerPass: expectedTokens(a, k),
    speedup: speedupOf(a, k, c),
    optimalK,
    bestSpeedup: speedupOf(a, optimalK, c),
    simTokensPerPass: rounds.reduce((s, x) => s + x.accepted + 1, 0) / rounds.length,
  };
}

const KS = Array.from({ length: 12 }, (_, i) => i + 1);

function View({ params }: SimViewProps) {
  const a = num(params, "alpha"), c = num(params, "draftCost"), k = Math.round(num(params, "k"));
  const rounds = simulate(params).slice(0, 12);
  const alphas = [...new Set([0.5, 0.7, 0.9].filter((x) => Math.abs(x - a) > 0.02))].slice(0, 2);
  return (
    <>
      <Caption>First {rounds.length} verification rounds with this seed: green = draft token accepted, red = rejected and replaced by the target&apos;s token, blue = bonus token when all k pass</Caption>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem" }} role="img" aria-label="simulated speculative decoding rounds">
        {rounds.map((rd, i) => (
          <div key={i} style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <span className="muted" style={{ width: 28 }}>#{i + 1}</span>
            {Array.from({ length: rd.accepted }, (_, j) => <span key={j} style={{ width: 14, height: 12, borderRadius: 3, background: "var(--green)" }} />)}
            <span style={{ width: 14, height: 12, borderRadius: 3, background: rd.bonus ? "var(--blue)" : "var(--red)" }} />
            {Array.from({ length: k - rd.accepted - (rd.bonus ? 0 : 1) }, (_, j) => <span key={`w${j}`} style={{ width: 14, height: 12, borderRadius: 3, border: "1px dashed var(--line)" }} />)}
            <span className="muted" style={{ marginLeft: 6 }}>+{rd.accepted + 1}</span>
          </div>
        ))}
      </div>
      <Caption>Speedup vs draft length k (draft cost c = {c}); dotted line at 1× = no gain</Caption>
      <LineChart
        x={KS}
        series={[
          { name: `α = ${a}`, values: KS.map((j) => speedupOf(a, j, c)) },
          ...alphas.map((x) => ({ name: `α = ${x}`, values: KS.map((j) => speedupOf(x, j, c)), dashed: true })),
          { name: "1×", values: KS.map(() => 1), color: "var(--muted)", dashed: true },
        ]}
        yFormat="x"
        xLabel="draft tokens per round k"
        marker={k - 1}
        height={210}
      />
    </>
  );
}

const D = { k: 4, alpha: 0.8, draftCost: 0.1, seed: 1 };
const dm = compute(D);

export const speculativeDecoding: SimDef = {
  id: "speculative-decoding",
  title: "Speculative decoding: guess ahead, verify in one pass",
  summary: "Choose draft length and acceptance rate and see how many tokens each expensive target pass yields, the net speedup, and the best draft length.",
  module: "inference-and-serving",
  tags: ["speculative decoding", "draft model", "acceptance rate", "latency", "decoding"],
  params: [
    { key: "k", label: "Draft length k", kind: "range", min: 1, max: 12, step: 1 },
    { key: "alpha", label: "Acceptance rate α", kind: "range", min: 0, max: 0.99, step: 0.01, help: "chance each draft token matches what the target would accept" },
    { key: "draftCost", label: "Draft cost c", kind: "range", min: 0.01, max: 0.5, step: 0.01, help: "time of one draft step relative to one target step" },
    { key: "seed", label: "Seed (simulation)", kind: "range", min: 1, max: 50, step: 1 },
  ],
  defaults: D,
  metrics: [
    { key: "tokensPerPass", label: "Tokens per target pass", format: "num" },
    { key: "speedup", label: "Speedup", format: "x" },
    { key: "optimalK", label: "Best k", format: "int" },
    { key: "bestSpeedup", label: "Speedup at best k", format: "x" },
    { key: "simTokensPerPass", label: "Simulated tokens/pass", format: "num" },
  ],
  compute,
  View,
  math: `Decoding is memory-bound, so verifying $k$ tokens in one target forward pass costs about the same as generating one. A small **draft model** proposes $x_1..x_k$; the **target** scores all of them at once and accepts each with probability $\\min(1, p(x)/q(x))$; at the first rejection it resamples a corrected token from the residual distribution, so the output distribution is *exactly* the target's. If all $k$ pass, the same pass yields one bonus token.

With i.i.d. acceptance probability $\\alpha$ per token, the number of tokens per target pass is $1 + (\\text{accepted prefix length})$:
$$\\mathbb E[\\text{tokens}] = \\sum_{i=0}^{k}\\alpha^i = \\frac{1-\\alpha^{k+1}}{1-\\alpha}$$
Each round costs $k$ draft steps ($c$ each, relative to a target step) plus one target pass:
$$\\text{speedup} = \\frac{1-\\alpha^{k+1}}{(1-\\alpha)(kc + 1)}$$
Longer drafts help only while the chance of the extra token surviving ($\\alpha^{k}$) outweighs its cost $c$: the best $k$ grows with $\\alpha$ and shrinks with $c$. As $k\\to\\infty$, tokens per pass saturate at $1/(1-\\alpha)$.

**Defaults** ($k$ = 4, $\\alpha$ = 0.8, $c$ = 0.1): $\\mathbb E = (1-0.8^5)/0.2 = ${round(dm.tokensPerPass, 4)}$ tokens per pass, cost $4\\cdot 0.1 + 1 = 1.4$, speedup $= ${round(dm.speedup, 3)}\\times$. The best $k$ here is ${dm.optimalK} (${round(dm.bestSpeedup, 3)}×). Over 200 simulated rounds with seed ${D.seed} the average was ${round(dm.simTokensPerPass, 3)} tokens per pass.`,
  explain: (p, m) =>
    m.speedup < 1
      ? `Slower than plain decoding (${m.speedup.toFixed(2)}×): drafts are rejected too often to pay for themselves. Use a better-matched draft or shorter k (best: k = ${m.optimalK}).`
      : `Each target pass yields ${m.tokensPerPass.toFixed(2)} tokens on average for a ${m.speedup.toFixed(2)}× speedup${m.optimalK !== Math.round(num(p, "k")) ? `; k = ${m.optimalK} would give ${m.bestSpeedup.toFixed(2)}×` : ""}.`,
};
