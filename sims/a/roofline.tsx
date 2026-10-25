// Roofline model for one forward pass of a transformer's linear layers: arithmetic intensity vs attainable FLOP/s.
// Params: gpu (l4 | a100 | h100 | h200 | b200), model (lib MODELS), tokens 1–16384 (log: tokens processed per pass; = batch size in
// decode, = prompt length in prefill), precision (bf16 | fp8 | int4w: 4-bit weights, bf16 compute).
// Metrics: intensity (FLOPs per byte moved), ridgePoint (GPU peak / bandwidth), attainedTflops (roofline min(peak, I·BW)),
// utilization (attained / peak), computeBound (1 if intensity ≥ ridge), stepMs (ideal time for the pass).
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV, LogLogChart } from "./viz";
import { GPU_OPTIONS, GPUS, MODEL_OPTIONS, MODELS, blockMatrices, logspace, round } from "./lib";

export const PRECISION: Record<string, { label: string; w: number; fp8: boolean }> = {
  bf16: { label: "BF16 weights & math", w: 2, fp8: false },
  fp8: { label: "FP8 weights & math", w: 1, fp8: true },
  int4w: { label: "INT4 weights, BF16 math", w: 0.5, fp8: false },
};

export function roof(p: Params, over: Partial<{ tokens: number; gpu: string }> = {}) {
  const g = GPUS[over.gpu ?? str(p, "gpu")] ?? GPUS.h100;
  const m = MODELS[str(p, "model")] ?? MODELS["llama3-8b"];
  const pr = PRECISION[str(p, "precision")] ?? PRECISION.bf16;
  const T = over.tokens ?? num(p, "tokens");
  const mats: [number, number][] = [...Array.from({ length: m.layers }, () => blockMatrices(m).map(([, a, b]) => [a, b] as [number, number])).flat(), [m.d, m.vocab]];
  let flops = 0, bytes = 0;
  for (const [a, b] of mats) {
    flops += 2 * T * a * b;
    bytes += pr.w * a * b + 2 * T * (a + b); // weights once + bf16 activations in and out
  }
  const peak = pr.fp8 ? g.flopsFp8 : g.flops;
  const I = flops / bytes;
  const ridge = peak / g.bw;
  const attained = Math.min(peak, I * g.bw);
  return { g, m, pr, T, flops, bytes, peak, I, ridge, attained, t: Math.max(flops / peak, bytes / g.bw) };
}

function compute(p: Params) {
  const r = roof(p);
  return { intensity: r.I, ridgePoint: r.ridge, attainedTflops: r.attained / 1e12, utilization: r.attained / r.peak, computeBound: r.I >= r.ridge ? 1 : 0, stepMs: r.t * 1000 };
}

const AIS = logspace(0.25, 20000, 60);

function View({ params }: SimViewProps) {
  const r = roof(params);
  const others = Object.keys(GPUS).filter((k) => k !== r.g.id && ["a100", "h100", "l4"].includes(k)).slice(0, 2);
  const line = (gid: string) => {
    const g = GPUS[gid];
    const pk = r.pr.fp8 ? g.flopsFp8 : g.flops;
    return AIS.map((a): [number, number] => [a, Math.min(pk, a * g.bw) / 1e12]);
  };
  const dec = roof(params, { tokens: 1 }), pre = roof(params, { tokens: 4096 });
  return (
    <>
      <Caption>Roofline (log–log): below the ridge the GPU waits on memory; above it, it is limited by arithmetic</Caption>
      <LogLogChart
        series={[{ name: r.g.label, pts: line(r.g.id), color: "var(--accent)" }, ...others.map((o) => ({ name: GPUS[o].label, pts: line(o), dashed: true }))]}
        points={[
          { x: dec.I, y: dec.attained / 1e12, label: "decode, 1 token", color: "var(--muted)" },
          { x: pre.I, y: pre.attained / 1e12, label: "prefill 4k", color: "var(--muted)" },
          { x: r.I, y: r.attained / 1e12, label: `you (${r.T} tok)`, color: "var(--accent)" },
        ]}
        vlines={[{ x: r.ridge, label: `ridge ${Math.round(r.ridge)}` }]}
        xLabel="arithmetic intensity (FLOPs per byte)"
        yLabel="TFLOP/s"
        height={260}
      />
      <KV rows={[
        ["FLOPs this pass", `${(r.flops / 1e12).toFixed(2)} TFLOP`],
        ["bytes moved", `${(r.bytes / 1e9).toFixed(2)} GB`],
        ["time if compute-bound", `${round((r.flops / r.peak) * 1000, 3)} ms`],
        ["time if memory-bound", `${round((r.bytes / r.g.bw) * 1000, 3)} ms`],
      ]} />
    </>
  );
}

const D = { gpu: "h100", model: "llama3-8b", tokens: 1, precision: "bf16" };
const dr = roof(D);
const dm = compute(D);
const p512 = compute({ ...D, tokens: 512 });

export const roofline: SimDef = {
  id: "roofline",
  title: "The roofline: memory-bound vs compute-bound",
  summary: "Place a transformer forward pass on a GPU's roofline: see why decoding one token is memory-bound, prefill is compute-bound, and how batching and precision move you between them.",
  module: "inference-and-serving",
  tags: ["roofline", "arithmetic intensity", "memory bandwidth", "FLOPs", "GPU", "decode", "prefill"],
  params: [
    { key: "gpu", label: "GPU", kind: "select", options: GPU_OPTIONS },
    { key: "model", label: "Model", kind: "select", options: MODEL_OPTIONS },
    { key: "tokens", label: "Tokens per pass", kind: "range", min: 1, max: 16384, step: 1, log: true, help: "batch size when decoding, prompt length when prefilling" },
    { key: "precision", label: "Precision", kind: "select", options: Object.entries(PRECISION).map(([value, v]) => ({ value, label: v.label })) },
  ],
  defaults: D,
  metrics: [
    { key: "intensity", label: "Arithmetic intensity", format: "num", help: "FLOPs per byte" },
    { key: "ridgePoint", label: "Ridge point", format: "num" },
    { key: "attainedTflops", label: "Attainable TFLOP/s", format: "num" },
    { key: "utilization", label: "Of peak", format: "pct" },
    { key: "computeBound", label: "Compute-bound (1 = yes)", format: "int" },
    { key: "stepMs", label: "Ideal pass time", format: "ms" },
  ],
  compute,
  View,
  math: `**Roofline** (Williams et al. 2009): a kernel doing $F$ FLOPs while moving $Q$ bytes has arithmetic intensity $I = F/Q$. With peak compute $\\pi$ and bandwidth $\\beta$:
$$\\text{attainable} = \\min(\\pi,\\; I\\cdot\\beta), \\qquad \\text{ridge} = \\pi/\\beta, \\qquad t = \\max(F/\\pi,\\; Q/\\beta)$$
Below the ridge you are **memory-bound** (more FLOPs would be free); above it, **compute-bound**.

**A transformer pass over $T$ tokens.** Each linear layer $d_{in}\\times d_{out}$ costs $2T d_{in}d_{out}$ FLOPs and moves its weights once ($w\\,d_{in}d_{out}$ bytes, $w$ = bytes/weight) plus bf16 activations $2T(d_{in}+d_{out})$:
$$I(T) = \\frac{\\sum 2T\\,d_{in}d_{out}}{\\sum \\big(w\\,d_{in}d_{out} + 2T(d_{in}+d_{out})\\big)} \\approx \\frac{2T}{w}\\quad (T \\ll d)$$
So in bf16 ($w = 2$) intensity is ≈ $T$ FLOPs/byte: one decoding sequence reuses each weight byte once. (Attention over the KV cache is not included; in decode it is even more memory-bound.)

**Defaults** (Llama-3-8B, one token, bf16, H100: $\\pi$ = 989 TFLOP/s, $\\beta$ = 3.35 TB/s):
ridge $= 989/3.35 = ${round(dm.ridgePoint, 0)}$ FLOPs/byte; $F = ${(dr.flops / 1e9).toFixed(2)}$ GFLOP, $Q = ${(dr.bytes / 1e9).toFixed(2)}$ GB, $I = ${round(dm.intensity, 3)}$, far below the ridge: attainable ${round(dm.attainedTflops, 2)} TFLOP/s = ${round(dm.utilization * 100, 2)}% of peak, pass time ${round(dm.stepMs, 2)} ms (all spent reading weights).
At $T$ = 512 the same pass has $I = ${round(p512.intensity, 0)}$, ${p512.computeBound ? "past" : "still below"} the ridge, using ${round(p512.utilization * 100, 0)}% of peak in ${round(p512.stepMs, 2)} ms: 512× the work for ${round(p512.stepMs / dm.stepMs, 1)}× the time. That is why batching works.`,
  explain: (_p, m) =>
    m.computeBound
      ? `Compute-bound: ${m.intensity.toFixed(0)} FLOPs per byte is past the ridge (${m.ridgePoint.toFixed(0)}), so the tensor cores are the limit; more tokens per pass now cost proportionally more time.`
      : `Memory-bound: the pass does ${m.intensity.toFixed(1)} FLOPs per byte read, far below the ridge point of ~${m.ridgePoint.toFixed(0)}, so the GPU uses only ${(m.utilization * 100).toFixed(m.utilization < 0.1 ? 2 : 0)}% of its compute. Batch more tokens per pass.`,
};
