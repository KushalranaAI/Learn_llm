// Training memory per GPU: weights + gradients + optimizer states (sharded by ZeRO) + activations (+ checkpointing).
// Params: model (lib MODELS), precision (mixed | fp32), optimizer (adam | adam8bit | sgd), zero 0–3, gpus 1–1024 (log),
// seqLen 512–32768 (log), microBatch 1–64 (log), checkpointing (toggle), gpu (l4 | a100 | h100 | h200 | b200).
// Metrics: perGpuGB (total per GPU), modelStatesGB (weights + grads + optimizer per GPU), activationsGB, bytesPerParam
// (model-state bytes per parameter on each GPU), fits (1 if perGpuGB ≤ GPU memory).
import { StackBar, BarChart } from "../ui";
import { bool, num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV } from "./viz";
import { GB, GPU_OPTIONS, GPUS, MODEL_OPTIONS, MODELS, paramCount, round } from "./lib";

// bytes per parameter for [weights, grads, optimizer states]
export const BYTES: Record<string, Record<string, [number, number, number]>> = {
  mixed: { adam: [2, 2, 12], adam8bit: [2, 2, 6], sgd: [2, 2, 8] },
  fp32: { adam: [4, 4, 8], adam8bit: [4, 4, 2], sgd: [4, 4, 4] },
};

export function memory(p: Params) {
  const m = MODELS[str(p, "model")] ?? MODELS["llama2-7b"];
  const g = GPUS[str(p, "gpu")] ?? GPUS.h100;
  const N = paramCount(m);
  const prec = str(p, "precision") === "fp32" ? "fp32" : "mixed";
  const [w, gr, opt] = BYTES[prec][str(p, "optimizer")] ?? BYTES[prec].adam;
  const z = Math.round(num(p, "zero")), n = Math.max(1, Math.round(num(p, "gpus")));
  const wB = N * w / (z >= 3 ? n : 1);
  const gB = N * gr / (z >= 2 ? n : 1);
  const oB = N * opt / (z >= 1 ? n : 1);
  const s = num(p, "seqLen"), b = num(p, "microBatch"), h = m.d, L = m.layers;
  const actScale = prec === "fp32" ? 2 : 1;
  const perLayer = 34 * s * b * h * actScale; // Korthikanti et al. 2022, with flash attention (no s² term)
  const act = bool(p, "checkpointing") ? L * 2 * s * b * h * actScale + perLayer : L * perLayer;
  const logits = s * b * m.vocab * 4;
  const states = wB + gB + oB;
  const total = states + act + logits;
  return { m, g, N, w: wB / GB, gr: gB / GB, o: oB / GB, act: act / GB, logits: logits / GB, states: states / GB, total: total / GB, bpp: states / N };
}

function compute(p: Params) {
  const r = memory(p);
  return { perGpuGB: r.total, modelStatesGB: r.states, activationsGB: r.act + r.logits, bytesPerParam: r.bpp, fits: r.total <= r.g.memGB ? 1 : 0 };
}

function View({ params, metrics }: SimViewProps) {
  const r = memory(params);
  return (
    <>
      <Caption>Memory on each GPU: {round(r.total, 1)} GB of {r.g.memGB} GB {metrics.fits ? "(fits)" : "(does NOT fit)"}</Caption>
      <StackBar
        format="gb"
        parts={[
          { label: "weights", value: r.w, color: "var(--blue)" },
          { label: "gradients", value: r.gr, color: "var(--purple)" },
          { label: "optimizer", value: r.o, color: "var(--accent)" },
          { label: "activations", value: r.act, color: "var(--green)" },
          { label: "logits", value: r.logits, color: "var(--yellow)" },
        ]}
      />
      <Caption>Per-GPU total by ZeRO stage (same model, {num(params, "gpus")} GPUs); red line = GPU memory</Caption>
      <BarChart
        format="gb"
        highlight={Math.round(num(params, "zero"))}
        bars={[0, 1, 2, 3].map((z) => {
          const t = memory({ ...params, zero: z }).total;
          return { label: `ZeRO-${z}`, value: t, color: t <= r.g.memGB ? "var(--green)" : "var(--red)" };
        })}
        height={170}
      />
      <KV rows={[
        ["parameters", `${round(r.N / 1e9, 2)} B`],
        ["model-state bytes/param on this GPU", round(r.bpp, 2)],
        ["activations without checkpointing", `${round(memory({ ...params, checkpointing: false }).act, 1)} GB`],
      ]} />
    </>
  );
}

const D = { model: "llama2-7b", precision: "mixed", optimizer: "adam", zero: 0, gpus: 8, seqLen: 4096, microBatch: 1, checkpointing: true, gpu: "h100" };
const dr = memory(D);
const z3 = memory({ ...D, zero: 3 });
const nock = memory({ ...D, checkpointing: false });

export const trainingMemory: SimDef = {
  id: "training-memory",
  title: "Training memory: what fills a GPU",
  summary: "Add up weights, gradients, Adam states and activations per GPU; see how mixed precision, ZeRO sharding and activation checkpointing make a model fit.",
  module: "training-and-adaptation",
  tags: ["training", "memory", "ZeRO", "FSDP", "Adam", "mixed precision", "activation checkpointing"],
  params: [
    { key: "model", label: "Model", kind: "select", options: MODEL_OPTIONS },
    { key: "precision", label: "Precision", kind: "select", options: [{ value: "mixed", label: "BF16 mixed (fp32 master weights)" }, { value: "fp32", label: "Full FP32" }] },
    { key: "optimizer", label: "Optimizer", kind: "select", options: [{ value: "adam", label: "AdamW" }, { value: "adam8bit", label: "8-bit AdamW" }, { value: "sgd", label: "SGD + momentum" }] },
    { key: "zero", label: "ZeRO stage", kind: "range", min: 0, max: 3, step: 1, help: "1 shards optimizer, 2 + gradients, 3 + weights (FSDP)" },
    { key: "gpus", label: "Data-parallel GPUs", kind: "range", min: 1, max: 1024, step: 1, log: true },
    { key: "seqLen", label: "Sequence length", kind: "range", min: 512, max: 32768, step: 1, log: true },
    { key: "microBatch", label: "Micro-batch per GPU", kind: "range", min: 1, max: 64, step: 1, log: true },
    { key: "checkpointing", label: "Activation checkpointing", kind: "toggle" },
    { key: "gpu", label: "GPU", kind: "select", options: GPU_OPTIONS },
  ],
  defaults: D,
  metrics: [
    { key: "perGpuGB", label: "Per GPU", format: "gb" },
    { key: "modelStatesGB", label: "Model states", format: "gb" },
    { key: "activationsGB", label: "Activations + logits", format: "gb" },
    { key: "bytesPerParam", label: "State bytes / param", format: "num" },
    { key: "fits", label: "Fits (1 = yes)", format: "int" },
  ],
  compute,
  View,
  math: `**Model states** (Rajbhandari et al. 2020, ZeRO). With BF16 mixed precision and AdamW, each parameter needs 2 bytes of bf16 weights, 2 of bf16 gradients and $K = 12$ of fp32 optimizer state (master weights, momentum $m$, variance $v$): **16 bytes/param**.

| precision / optimizer | weights | grads | optimizer |
|---|---|---|---|
| mixed AdamW | 2 | 2 | 12 |
| mixed 8-bit AdamW | 2 | 2 | 4 + 1 + 1 = 6 |
| mixed SGD+momentum | 2 | 2 | 4 + 4 = 8 |
| fp32 AdamW | 4 | 4 | 8 |

**ZeRO** shards these across the $n$ data-parallel GPUs: stage 1 divides the optimizer term by $n$, stage 2 also the gradients, stage 3 (≈ FSDP) also the weights:
$$M_{\\text{states}} = N\\Big(\\tfrac{2}{n^{[z\\ge3]}} + \\tfrac{2}{n^{[z\\ge2]}} + \\tfrac{12}{n^{[z\\ge1]}}\\Big)$$

**Activations** (Korthikanti et al. 2022): one block stores ≈ $34\\,sbh$ bytes in 16-bit (sequence $s$, micro-batch $b$, width $h$; the $5as^2b$ attention-score term disappears with FlashAttention). Without checkpointing: $34\\,sbhL$. With full checkpointing only each block's input is kept, $2sbh$ per layer, and one block is recomputed at a time: $2sbhL + 34sbh$. The fp32 logits add $4\\,s\\,b\\,V$ bytes. FP32 training doubles activations.

**Defaults** (Llama-2-7B, $N$ = 6.74 B, mixed AdamW, 8 GPUs, ZeRO-0, $s$ = 4096, $b$ = 1, checkpointing):
states $= 16N = ${round(dr.states, 1)}$ GB per GPU (every GPU holds a full copy), activations $(2\\cdot 32 + 34)\\cdot 4096\\cdot 4096$ bytes $= ${round(dr.act, 2)}$ GB, logits ${round(dr.logits, 2)} GB: total **${round(dr.total, 1)} GB**, more than an 80 GB H100.
ZeRO-3 over 8 GPUs cuts states to $16N/8 = ${round(z3.states, 1)}$ GB, total ${round(z3.total, 1)} GB: fits. Without checkpointing activations would be ${round(nock.act, 1)} GB.`,
  explain: (p, m) => {
    const r = memory(p);
    if (m.fits) return `${m.perGpuGB.toFixed(1)} GB per GPU fits in ${r.g.memGB} GB: ${Math.round((m.modelStatesGB / m.perGpuGB) * 100)}% is model states (weights, gradients, optimizer), the rest activations.`;
    const fix = Math.round(num(p, "zero")) < 3 ? "raise the ZeRO stage to shard states across GPUs" : !bool(p, "checkpointing") ? "turn on activation checkpointing" : "add GPUs, shorten sequences or use a smaller micro-batch";
    return `${m.perGpuGB.toFixed(1)} GB per GPU is over the ${r.g.memGB} GB limit (${m.bytesPerParam.toFixed(1)} bytes of state per parameter). Try to ${fix}.`;
  },
};
