// KV-cache memory: 2 · layers · kv_heads · head_dim · bytes per token, times tokens in flight; does it fit next to the weights?
// Params: model (llama3-1b | llama2-7b | mistral-7b | llama3-8b | llama2-13b | llama3-70b), attn (native | mha | gqa8 | mqa),
// seqLen 128–131072 (log), batch 1–256 (log), kvBytes ("2" bf16 | "1" fp8 | "0.5" int4), gpu (l4 | a100 | h100 | h200 | b200),
// gpuCount 1–8 (tensor parallel; memory adds up).
// Metrics: kvKBPerToken (KiB per token), kvCacheGB (whole cache), weightsGB (bf16), totalGB, fits (1 if total ≤ 90% of GPU memory),
// maxBatch (sequences of seqLen that fit beside the weights).
import { LineChart, StackBar } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV } from "./viz";
import { GB, GPU_OPTIONS, GPUS, MODEL_OPTIONS, MODELS, kvBytesPerToken, logspace, paramCount, round, type Model } from "./lib";

export const USABLE = 0.9; // fraction of GPU memory available to weights + KV (the rest: activations, CUDA context, fragmentation)

const kvHeadsFor = (m: Model, attn: string) => (attn === "mha" ? m.heads : attn === "gqa8" ? Math.min(8, m.heads) : attn === "mqa" ? 1 : m.kvHeads);

function calc(p: Params, overrides: Partial<{ seq: number; attn: string }> = {}) {
  const m = MODELS[str(p, "model")] ?? MODELS["llama3-8b"];
  const g = GPUS[str(p, "gpu")] ?? GPUS.h100;
  const attn = overrides.attn ?? str(p, "attn");
  const kvh = kvHeadsFor(m, attn);
  const bytes = num(p, "kvBytes");
  const seq = overrides.seq ?? num(p, "seqLen");
  const batch = Math.round(num(p, "batch"));
  const per = kvBytesPerToken(m, bytes, kvh);
  const kvCacheGB = (per * seq * batch) / GB;
  const weightsGB = (paramCount(m) * 2) / GB;
  const cap = g.memGB * Math.round(num(p, "gpuCount")) * USABLE;
  const totalGB = weightsGB + kvCacheGB;
  return { m, g, kvh, per, cap, kvCacheGB, weightsGB, totalGB, fits: totalGB <= cap ? 1 : 0, maxBatch: Math.max(0, Math.floor(((cap - weightsGB) * GB) / (per * seq))) };
}

function compute(p: Params) {
  const c = calc(p);
  return { kvKBPerToken: c.per / 1024, kvCacheGB: c.kvCacheGB, weightsGB: c.weightsGB, totalGB: c.totalGB, fits: c.fits, maxBatch: c.maxBatch };
}

const SEQS = logspace(128, 131072, 41).map((v) => Math.round(v));

function View({ params, metrics }: SimViewProps) {
  const c = calc(params);
  const seq = num(params, "seqLen");
  const marker = SEQS.reduce((bi, v, i) => (Math.abs(Math.log(v / seq)) < Math.abs(Math.log(SEQS[bi] / seq)) ? i : bi), 0);
  const variants = [
    { attn: "mha", name: `MHA (${c.m.heads} KV heads)` },
    { attn: "gqa8", name: `GQA (${Math.min(8, c.m.heads)} KV heads)` },
    { attn: "mqa", name: "MQA (1 KV head)" },
  ];
  const free = Math.max(0, c.cap - c.totalGB);
  return (
    <>
      <Caption>GPU memory ({round(c.cap, 0)} GB usable of {c.g.memGB * num(params, "gpuCount")} GB){metrics.fits ? "" : " · does NOT fit"}</Caption>
      <StackBar
        format="gb"
        parts={[
          { label: "weights", value: c.weightsGB, color: "var(--blue)" },
          { label: "KV cache", value: c.kvCacheGB, color: metrics.fits ? "var(--accent)" : "var(--red)" },
          { label: "free", value: free, color: "var(--card-3)" },
        ]}
      />
      <Caption>Total memory (weights + KV) vs context length at batch {num(params, "batch")}; dashed = usable GPU memory</Caption>
      <LineChart
        x={SEQS}
        logX
        xFormat={(v) => (v >= 1024 ? `${Math.round(v / 1024)}k` : String(v))}
        series={[
          ...variants.map((v) => ({ name: v.name, values: SEQS.map((s) => calc(params, { seq: s, attn: v.attn }).totalGB) })),
          { name: "GPU limit", values: SEQS.map(() => c.cap), color: "var(--red)", dashed: true },
        ]}
        yMax={Math.max(c.cap * 1.6, 1)}
        yFormat="gb"
        xLabel="context length (tokens per sequence)"
        yLabel="memory"
        marker={marker}
        height={210}
      />
      <KV rows={[
        ["per token per layer", `2 × ${c.kvh} × ${c.m.headDim} × ${num(params, "kvBytes")} B = ${(2 * c.kvh * c.m.headDim * num(params, "kvBytes")).toLocaleString("en-US")} B`],
        ["per token (all layers)", `${round(c.per / 1024, 1)} KiB`],
        ["per sequence", `${round((c.per * seq) / GB, 3)} GiB`],
      ]} />
    </>
  );
}

const D = { model: "llama3-8b", attn: "native", seqLen: 8192, batch: 16, kvBytes: "2", gpu: "h100", gpuCount: 1 };
const dc = calc(D);
const dm = compute(D);
const mha = calc(D, { attn: "mha" });

export const kvCacheMemory: SimDef = {
  id: "kv-cache-memory",
  title: "The KV cache: memory that grows with every token",
  summary: "Compute KV-cache size from layers, KV heads, head size, context and batch; compare MHA, GQA and MQA and check what fits on a GPU.",
  module: "model-foundations",
  tags: ["KV cache", "memory", "GQA", "MQA", "context length", "batch"],
  params: [
    { key: "model", label: "Model", kind: "select", options: MODEL_OPTIONS },
    { key: "attn", label: "Attention variant", kind: "select", options: [{ value: "native", label: "As the model ships" }, { value: "mha", label: "MHA (KV heads = query heads)" }, { value: "gqa8", label: "GQA, 8 KV heads" }, { value: "mqa", label: "MQA, 1 KV head" }] },
    { key: "seqLen", label: "Context length", kind: "range", min: 128, max: 131072, step: 1, unit: "tokens", log: true },
    { key: "batch", label: "Concurrent sequences", kind: "range", min: 1, max: 256, step: 1, log: true },
    { key: "kvBytes", label: "KV precision", kind: "select", options: [{ value: "2", label: "BF16 / FP16 (2 bytes)" }, { value: "1", label: "FP8 (1 byte)" }, { value: "0.5", label: "INT4 (0.5 byte)" }] },
    { key: "gpu", label: "GPU", kind: "select", options: GPU_OPTIONS },
    { key: "gpuCount", label: "GPUs (tensor parallel)", kind: "range", min: 1, max: 8, step: 1 },
  ],
  defaults: D,
  metrics: [
    { key: "kvKBPerToken", label: "KV per token (KiB)", format: "num" },
    { key: "kvCacheGB", label: "KV cache", format: "gb" },
    { key: "weightsGB", label: "Weights (bf16)", format: "gb" },
    { key: "totalGB", label: "Total", format: "gb" },
    { key: "fits", label: "Fits (1 = yes)", format: "int" },
    { key: "maxBatch", label: "Max sequences", format: "int" },
  ],
  compute,
  View,
  math: `During generation every layer keeps the **keys and values** of all previous tokens so it doesn't recompute them. Per token that is

$$\\text{KV bytes/token} = 2\\,(K,V)\\times L\\times h_{kv}\\times d_h\\times b$$

with $L$ layers, $h_{kv}$ key/value heads, head dim $d_h$, $b$ bytes per element. For $B$ sequences of $S$ tokens:

$$M_{KV} = 2\\,L\\,h_{kv}\\,d_h\\,b\\cdot S\\cdot B, \\qquad M_{\\text{total}} = 2N + M_{KV} \\le 0.9\\cdot G\\cdot M_{\\text{GPU}}$$

($2N$ = bf16 weights, $G$ GPUs; 10% is held back for activations and runtime overhead.) It is linear in both $S$ and $B$: double the context, double the cache. The largest batch that fits is $\\lfloor (0.9\\,G\\,M_{\\text{GPU}} - 2N)/(\\text{KV/token}\\cdot S)\\rfloor$.

**Grouped-query attention** shares each K/V head among $h/h_{kv}$ query heads, cutting the cache by that factor; MQA uses a single K/V head.

**Defaults** (Llama-3-8B: $L$ = 32, $h_{kv}$ = 8, $d_h$ = 128, bf16): $2\\cdot 32\\cdot 8\\cdot 128\\cdot 2 = ${dc.per.toLocaleString("en-US")}$ bytes = ${round(dm.kvKBPerToken, 1)} KiB per token. For 16 sequences × 8192 tokens: ${round(dm.kvCacheGB, 2)} GiB of KV, plus ${round(dm.weightsGB, 2)} GiB of weights = ${round(dm.totalGB, 2)} GiB on an 80 GB H100 (72 GB usable): fits, with room for up to ${dm.maxBatch} such sequences.
With full MHA (32 KV heads) the same load needs ${round(mha.kvCacheGB, 1)} GiB of KV (4×) and ${mha.fits ? "still fits" : "no longer fits"}.`,
  explain: (p, m) =>
    m.fits
      ? `${m.kvKBPerToken.toFixed(0)} KiB per token × ${num(p, "seqLen").toLocaleString("en-US")} tokens × ${num(p, "batch")} sequences = ${m.kvCacheGB.toFixed(1)} GB of KV cache. It fits; the GPU could hold ${m.maxBatch} sequences of this length.`
      : `Needs ${m.totalGB.toFixed(1)} GB but only ${(calc(p).cap).toFixed(0)} GB is usable. ${m.maxBatch > 0 ? `Cut to ${m.maxBatch} sequences, ` : "The weights alone are too big: add GPUs, "}shorten the context, use fewer KV heads or quantise the cache.`,
};
