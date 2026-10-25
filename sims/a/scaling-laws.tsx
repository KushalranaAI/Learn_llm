// Chinchilla-style scaling law L(N, D) = E + A/N^α + B/D^β with compute C ≈ 6ND and the compute-optimal split.
// Constants: Besiroglu et al. 2024 (Epoch AI) refit of Hoffmann et al. 2022, approach 3.
// Params: paramsB 0.1–2000 (billions, log), tokensB 1–100000 (billions of training tokens, log).
// Metrics: loss (predicted pre-training loss, nats/token), log10C (log10 of training FLOPs), tokensPerParam (D/N),
// optimalParamsB and optimalTokensB (compute-optimal N and D for the same C), lossGap (loss − loss at the optimum).
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV, LogLogChart } from "./viz";
import { GPUS, human, logspace, round } from "./lib";

export const FIT = { E: 1.8172, A: 482.01, B: 2085.43, alpha: 0.3478, beta: 0.3658 };
const { E, A, B, alpha, beta } = FIT;
const a = beta / (alpha + beta);
const G = ((alpha * A) / (beta * B)) ** (1 / (alpha + beta));

export const lossOf = (N: number, D: number) => E + A / N ** alpha + B / D ** beta;
export function optimal(C: number) {
  const N = G * (C / 6) ** a;
  return { N, D: C / (6 * N) };
}

function compute(p: Params) {
  const N = num(p, "paramsB") * 1e9, D = num(p, "tokensB") * 1e9;
  const C = 6 * N * D;
  const o = optimal(C);
  const loss = lossOf(N, D);
  return { loss, log10C: Math.log10(C), tokensPerParam: D / N, optimalParamsB: o.N / 1e9, optimalTokensB: o.D / 1e9, lossGap: loss - lossOf(o.N, o.D) };
}

const MFU = 0.4;

function View({ params, metrics }: SimViewProps) {
  const N = num(params, "paramsB") * 1e9, D = num(params, "tokensB") * 1e9;
  const C = 6 * N * D;
  const Ns = logspace(1e8, 2e12, 60);
  const curve = (c: number) => Ns.map((n): [number, number] => [n, lossOf(n, c / (6 * n))]).filter(([n]) => c / (6 * n) >= 1e8);
  const o = optimal(C);
  const h100Hours = C / (GPUS.h100.flops * MFU) / 3600;
  return (
    <>
      <Caption>IsoFLOP curves: loss vs model size when the compute budget is fixed (tokens = C / 6N)</Caption>
      <LogLogChart
        logY={false}
        series={[
          { name: `C/10 = 10^${round(Math.log10(C / 10), 1)}`, pts: curve(C / 10), dashed: true, color: "var(--muted)" },
          { name: `C = 10^${round(Math.log10(C), 1)} FLOPs`, pts: curve(C), color: "var(--accent)" },
          { name: `10C`, pts: curve(C * 10), dashed: true, color: "var(--blue)" },
        ]}
        points={[
          { x: N, y: metrics.loss, label: "you", color: "var(--accent)" },
          { x: o.N, y: lossOf(o.N, o.D), label: "optimal", color: "var(--green)" },
        ]}
        xLabel="parameters N"
        yLabel="loss"
        yFmt={(v) => v.toFixed(2)}
        height={250}
      />
      <KV rows={[
        ["training compute C = 6ND", `${C.toExponential(2)} FLOPs`],
        [`H100-hours at ${MFU * 100}% MFU`, Math.round(h100Hours).toLocaleString("en-US")],
        ["optimal N : D for this C", `${human(o.N)} params : ${human(o.D)} tokens (${round(o.D / o.N, 1)} tok/param)`],
      ]} />
    </>
  );
}

const D0 = { paramsB: 70, tokensB: 1400 };
const dm = compute(D0);

export const scalingLaws: SimDef = {
  id: "scaling-laws",
  title: "Scaling laws: spending a compute budget",
  summary: "Pick model size and training tokens, see the predicted loss and compute, and compare with the compute-optimal (Chinchilla) split for the same budget.",
  module: "training-and-adaptation",
  tags: ["scaling laws", "Chinchilla", "compute", "pretraining", "tokens per parameter"],
  params: [
    { key: "paramsB", label: "Parameters N", kind: "range", min: 0.1, max: 2000, step: 0.1, unit: "B", log: true },
    { key: "tokensB", label: "Training tokens D", kind: "range", min: 1, max: 100000, step: 1, unit: "B", log: true },
  ],
  defaults: D0,
  metrics: [
    { key: "loss", label: "Predicted loss", format: "num", help: "nats per token" },
    { key: "log10C", label: "log₁₀ compute", format: "num", help: "FLOPs" },
    { key: "tokensPerParam", label: "Tokens per param", format: "num" },
    { key: "optimalParamsB", label: "Optimal N (B)", format: "num" },
    { key: "optimalTokensB", label: "Optimal D (B tokens)", format: "num" },
    { key: "lossGap", label: "Loss above optimal", format: "num" },
  ],
  compute,
  View,
  math: `**Loss.** Hoffmann et al. (2022, "Chinchilla") fit the final pre-training loss of hundreds of runs as
$$L(N, D) = E + \\frac{A}{N^{\\alpha}} + \\frac{B}{D^{\\beta}}$$
$E$ is the irreducible entropy of text; the other terms are what a finite model ($N$ parameters) and finite data ($D$ tokens) leave on the table. We use the Epoch AI refit (Besiroglu et al. 2024): $E = ${E}$, $A = ${A}$, $B = ${B}$, $\\alpha = ${alpha}$, $\\beta = ${beta}$.

**Compute.** A forward+backward pass costs ≈ 6 FLOPs per parameter per token (2 forward, 4 backward): $C \\approx 6ND$.

**Optimal split.** Minimise $L$ subject to $6ND = C$ (Lagrange multiplier, or substitute $D = C/6N$ and set $\\partial L/\\partial N = 0$):
$$\\alpha A N^{-\\alpha} = \\beta B D^{-\\beta} \\;\\Rightarrow\\; N_{opt}(C) = G\\left(\\frac{C}{6}\\right)^{\\frac{\\beta}{\\alpha+\\beta}},\\quad D_{opt} = \\frac{C}{6N_{opt}},\\quad G = \\left(\\frac{\\alpha A}{\\beta B}\\right)^{\\frac{1}{\\alpha+\\beta}}$$
With these constants $\\beta/(\\alpha+\\beta) = ${round(a, 3)}$: both $N$ and $D$ should grow roughly as $\\sqrt C$, at about 20 tokens per parameter.

**Defaults** (Chinchilla itself: $N$ = 70 B, $D$ = 1.4 T):
$L = ${E} + ${A}/(7\\times10^{10})^{${alpha}} + ${B}/(1.4\\times10^{12})^{${beta}} = ${round(dm.loss, 4)}$;
$C = 6\\cdot 7\\times10^{10}\\cdot 1.4\\times10^{12} = 5.88\\times10^{23}$ ($\\log_{10} C = ${round(dm.log10C, 2)}$), ${round(dm.tokensPerParam, 1)} tokens/param.
The optimum for that $C$ is $N_{opt} = ${round(dm.optimalParamsB, 1)}$ B, $D_{opt} = ${round(dm.optimalTokensB, 0)}$ B tokens, only ${dm.lossGap.toExponential(1)} nats better: near the optimum the iso-FLOP curve is flat, so being 5% off in N costs almost nothing.

Modern models (e.g. Llama-3-8B on 15 T tokens, ~1900 tokens/param) deliberately *over-train* small models: training costs more, but every later inference is cheaper.`,
  explain: (_p, m) =>
    m.lossGap < 0.005
      ? `Close to compute-optimal: at ${m.tokensPerParam.toFixed(0)} tokens per parameter the budget of 10^${m.log10C.toFixed(1)} FLOPs is well spent (loss ${m.loss.toFixed(3)}).`
      : `${m.tokensPerParam < 20 ? "Too big a model for its data" : "Over-trained (small model, lots of data)"}: for the same compute, ${m.optimalParamsB.toFixed(1)} B params on ${m.optimalTokensB.toFixed(0)} B tokens would reach a loss ${m.lossGap.toFixed(3)} lower${m.tokensPerParam > 20 ? ", though the smaller model is cheaper to serve" : ""}.`,
};
