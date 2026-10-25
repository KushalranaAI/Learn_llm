// Weight quantization: bytes per weight -> model memory, and a real round-to-nearest experiment on seeded Gaussian weights.
// Params: paramsB 0.5–405 (billions, log), format (fp32 | bf16 | fp8 | int8 | int4 | nf4 | int3 | int2), groupSize ("32" | "64" |
// "128" | "256" | "4096" = per-channel), outliers (toggle: 0.5% of weights 20× larger, as in real LLM layers), seed 1–50.
// Metrics: memoryGB (weights only), bitsPerWeight (incl. one fp16 scale per group), relError (‖w−ŵ‖/‖w‖), sqnrDb (signal-to-
// quantisation-noise ratio, capped at 150), pplIncrease (illustrative perplexity-increase proxy, exp(2.6·relError²) − 1).
import { LineChart } from "../ui";
import { bool, num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, HBars } from "./viz";
import { GB, gaussian, memo, mulberry32, round } from "./lib";

export const FORMATS: Record<string, { label: string; bits: number; kind: "float" | "int" | "nf4"; mant?: number; grouped: boolean }> = {
  fp32: { label: "FP32", bits: 32, kind: "float", grouped: false },
  bf16: { label: "BF16", bits: 16, kind: "float", mant: 7, grouped: false },
  fp8: { label: "FP8 (E4M3)", bits: 8, kind: "float", mant: 3, grouped: false },
  int8: { label: "INT8", bits: 8, kind: "int", grouped: true },
  int4: { label: "INT4", bits: 4, kind: "int", grouped: true },
  nf4: { label: "NF4 (QLoRA)", bits: 4, kind: "nf4", grouped: true },
  int3: { label: "INT3", bits: 3, kind: "int", grouped: true },
  int2: { label: "INT2", bits: 2, kind: "int", grouped: true },
};

export const NF4 = [-1, -0.6961928009986877, -0.5250730514526367, -0.39491748809814453, -0.28444138169288635, -0.18477343022823334, -0.09105003625154495, 0,
  0.07958029955625534, 0.16093020141124725, 0.24611230194568634, 0.33791524171829224, 0.44070982933044434, 0.5626170039176941, 0.7229568362236023, 1];

export const KAPPA = 2.6;
const N_W = 4096;

/** Round to a float with `mant` stored mantissa bits (no range limit except E4M3's, handled by scaling to 448). */
function roundFloat(x: number, mant: number, minExp = -126) {
  if (x === 0) return 0;
  const e = Math.max(Math.floor(Math.log2(Math.abs(x))), minExp);
  const step = 2 ** (e - mant);
  return Math.round(x / step) * step;
}

export function quantize(w: number[], fmt: string, group: number): number[] {
  const f = FORMATS[fmt] ?? FORMATS.int4;
  if (f.kind === "float") {
    if (fmt === "fp32") return [...w];
    if (fmt === "fp8") {
      const s = Math.max(...w.map(Math.abs)) / 448; // per-tensor scale into E4M3 range
      return w.map((x) => roundFloat(x / s, 3, -6) * s);
    }
    return w.map((x) => roundFloat(x, f.mant ?? 7));
  }
  const out = new Array<number>(w.length);
  for (let g0 = 0; g0 < w.length; g0 += group) {
    const blk = w.slice(g0, g0 + group);
    const amax = Math.max(...blk.map(Math.abs)) || 1;
    if (f.kind === "nf4") {
      blk.forEach((x, i) => {
        const v = x / amax;
        let best = NF4[0];
        for (const l of NF4) if (Math.abs(l - v) < Math.abs(best - v)) best = l;
        out[g0 + i] = best * amax;
      });
    } else {
      const qmax = 2 ** (f.bits - 1) - 1;
      const s = amax / qmax;
      blk.forEach((x, i) => (out[g0 + i] = Math.max(-qmax, Math.min(qmax, Math.round(x / s))) * s));
    }
  }
  return out;
}

export function weights(seed: number, outliers: boolean) {
  const r = mulberry32(seed), g = gaussian(r);
  const w = Array.from({ length: N_W }, () => 0.02 * g());
  if (outliers) for (let i = 0; i < N_W; i += 200) w[(i + Math.floor(r() * 200)) % N_W] *= 20;
  return w;
}

export const runQuant = memo((p: Params) => {
  const fmt = str(p, "format");
  const f = FORMATS[fmt] ?? FORMATS.int4;
  const group = Math.round(num(p, "groupSize"));
  const w = weights(Math.round(num(p, "seed")), bool(p, "outliers"));
  const q = quantize(w, fmt, group);
  let se = 0, ss = 0;
  for (let i = 0; i < w.length; i++) { se += (w[i] - q[i]) ** 2; ss += w[i] ** 2; }
  const relError = Math.sqrt(se / ss);
  const bitsPerWeight = f.bits + (f.grouped ? 16 / group : 0);
  return {
    w, q,
    metrics: {
      memoryGB: (num(p, "paramsB") * 1e9 * bitsPerWeight) / 8 / GB,
      bitsPerWeight,
      relError,
      sqnrDb: relError > 0 ? Math.min(150, -20 * Math.log10(relError)) : 150,
      pplIncrease: Math.exp(KAPPA * relError * relError) - 1,
    },
  };
});

const compute = (p: Params) => runQuant(p).metrics;

function View({ params }: SimViewProps) {
  const r = runQuant(params);
  const n = 40;
  const keys = Object.keys(FORMATS);
  const cur = keys.indexOf(str(params, "format"));
  const all = keys.map((k) => runQuant({ ...params, format: k }).metrics);
  return (
    <>
      <Caption>First {n} weights: original (thin) vs quantised and de-quantised (thick). Coarser grids snap more values together.</Caption>
      <LineChart
        x={Array.from({ length: n }, (_, i) => i)}
        series={[
          { name: "original", values: r.w.slice(0, n).map((v) => v * 100 + 10), color: "var(--muted)" },
          { name: `${FORMATS[str(params, "format")]?.label ?? ""} reconstructed`, values: r.q.slice(0, n).map((v) => v * 100 + 10), color: "var(--accent)" },
        ]}
        xLabel="weight index (values ×100, shifted +10)"
        height={180}
      />
      <Caption>Memory for {num(params, "paramsB")} B parameters, and relative error, per format (group {num(params, "groupSize") >= 4096 ? "per-channel" : num(params, "groupSize")})</Caption>
      <HBars highlight={cur} bars={keys.map((k, i) => ({ label: FORMATS[k].label, value: all[i].memoryGB, note: `${round(all[i].memoryGB, 1)} GB · err ${(all[i].relError * 100).toFixed(1)}%` }))} />
    </>
  );
}

const D = { paramsB: 8, format: "int4", groupSize: "128", outliers: false, seed: 1 };
const dm = compute(D);
const pc = compute({ ...D, groupSize: "4096", outliers: true });
const g128o = compute({ ...D, outliers: true });

export const quantization: SimDef = {
  id: "quantization",
  title: "Quantization: fewer bits per weight",
  summary: "Store weights in fewer bits: see the memory saved, run a real round-to-nearest quantiser on sample weights, and watch error grow at low bit-widths and with outliers.",
  module: "inference-and-serving",
  tags: ["quantization", "INT4", "INT8", "FP8", "NF4", "memory", "precision"],
  params: [
    { key: "paramsB", label: "Model size", kind: "range", min: 0.5, max: 405, step: 0.5, unit: "B params", log: true },
    { key: "format", label: "Format", kind: "select", options: Object.entries(FORMATS).map(([value, f]) => ({ value, label: `${f.label} (${f.bits} bit)` })) },
    { key: "groupSize", label: "Group size (int / NF4)", kind: "select", options: [{ value: "32", label: "32" }, { value: "64", label: "64" }, { value: "128", label: "128" }, { value: "256", label: "256" }, { value: "4096", label: "per-channel (4096)" }], help: "weights sharing one scale" },
    { key: "outliers", label: "Outlier weights", kind: "toggle", help: "0.5% of weights 20× larger, like real LLM layers" },
    { key: "seed", label: "Seed", kind: "range", min: 1, max: 50, step: 1 },
  ],
  defaults: D,
  metrics: [
    { key: "memoryGB", label: "Weight memory", format: "gb" },
    { key: "bitsPerWeight", label: "Bits / weight", format: "num" },
    { key: "relError", label: "Relative error", format: "pct" },
    { key: "sqnrDb", label: "SQNR (dB)", format: "num" },
    { key: "pplIncrease", label: "Perplexity increase (proxy)", format: "pct" },
  ],
  compute,
  View,
  math: `**Memory.** A model with $N$ parameters at $b$ bits per weight needs $Nb/8$ bytes. Grouped integer formats store one fp16 scale per $g$ weights, adding $16/g$ bits: INT4 with $g$ = 128 is $4.125$ bits.

**Symmetric round-to-nearest (absmax).** For each group, with $q_{max} = 2^{b-1}-1$:
$$s = \\frac{\\max_i |w_i|}{q_{max}}, \\qquad \\hat w_i = s\\cdot\\mathrm{clamp}\\big(\\mathrm{round}(w_i/s), -q_{max}, q_{max}\\big)$$
The rounding error is roughly uniform on $[-s/2, s/2]$, so its RMS is $s/\\sqrt{12}$. One large outlier in a group inflates $s$ and wrecks precision for every other weight in it, which is why smaller groups (and outlier-aware methods like GPTQ, AWQ, SmoothQuant) matter.

**NF4** (QLoRA) replaces the evenly spaced grid with 16 levels at quantiles of a normal distribution, a better fit for bell-shaped weights. **FP8/BF16** are floats: relative precision $2^{-(m+1)}$ for $m$ mantissa bits (E4M3: $m$ = 3; BF16: $m$ = 7).

**Error metrics** on ${N_W} seeded Gaussian weights ($\\sigma$ = 0.02):
$$\\varepsilon = \\frac{\\lVert w - \\hat w\\rVert}{\\lVert w\\rVert}, \\qquad \\text{SQNR} = -20\\log_{10}\\varepsilon\\ \\text{dB}, \\qquad \\Delta\\text{ppl} \\approx e^{${KAPPA}\\,\\varepsilon^2} - 1$$
The perplexity proxy is illustrative, calibrated so round-to-nearest INT4/g128 lands near the few-percent increase reported for 7–8 B models; real impact depends on the model and method.

**Defaults** (8 B params, INT4, $g$ = 128, no outliers): $4 + 16/128 = ${dm.bitsPerWeight}$ bits, $8\\times10^9\\cdot ${dm.bitsPerWeight}/8$ bytes = ${round(dm.memoryGB, 2)} GiB (vs ${round((8e9 * 2) / GB, 1)} GiB in BF16). A Gaussian group's absmax is ≈ 2.7σ, so $s ≈ 2.7σ/7$ and $\\varepsilon ≈ (s/\\sqrt{12})/σ ≈ 0.11$; measured $\\varepsilon$ = ${round(dm.relError, 4)}, SQNR ${round(dm.sqnrDb, 1)} dB, proxy perplexity +${round(dm.pplIncrease * 100, 1)}%.
With outliers: $g$ = 128 gives $\\varepsilon$ = ${round(g128o.relError, 3)}, per-channel gives ${round(pc.relError, 3)}.`,
  explain: (_p, m) =>
    m.pplIncrease < 0.01
      ? `${m.bitsPerWeight.toFixed(2)} bits per weight (${m.memoryGB.toFixed(1)} GB) with ${(m.relError * 100).toFixed(2)}% error: practically lossless.`
      : `${m.bitsPerWeight.toFixed(2)} bits per weight cuts memory to ${m.memoryGB.toFixed(1)} GB, but the ${(m.relError * 100).toFixed(1)}% weight error suggests roughly +${(m.pplIncrease * 100).toFixed(0)}% perplexity${m.pplIncrease > 0.1 ? ": too lossy without smarter methods (smaller groups, GPTQ/AWQ)" : ""}.`,
};
