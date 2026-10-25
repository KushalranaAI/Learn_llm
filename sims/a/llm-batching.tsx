// Batching on one model replica: batch size vs replica throughput vs per-user speed vs cost per 1M output tokens.
// Roofline step times from lib.ts; a batch of B requests is prefilled, then decodes O tokens together (continuous batching steady state).
// Params: model (lib MODELS), gpu, batch 1–512 (log), promptTokens 10–32000 (log), outputTokens 1–4000 (log), gpuPrice 0.3–12 $/GPU-h.
// Metrics: tokensPerSec (replica output tokens/s), perUserTps (each user's decode speed), costPer1M (usd per 1M output tokens),
// kvFits (1 if weights + KV for the batch fit in 90% of replica memory), maxBatch (largest batch that fits).
import { LineChart } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV, LogLogChart } from "./viz";
import { GB, GPU_OPTIONS, GPUS, MODEL_OPTIONS, MODELS, decodeStep, kvBytesPerToken, paramCount, prefill, round, tpSize } from "./lib";

export function serve(p: Params, over: Partial<{ batch: number }> = {}) {
  const m = MODELS[str(p, "model")] ?? MODELS["llama3-8b"];
  const g = GPUS[str(p, "gpu")] ?? GPUS.h100;
  const tp = tpSize(m, g);
  const B = Math.max(1, Math.round(over.batch ?? num(p, "batch")));
  const P = num(p, "promptTokens"), O = Math.round(num(p, "outputTokens"));
  const pf = prefill(m, g, B * P, P, tp).t;
  const step = decodeStep(m, g, B, P + O / 2, tp).t;
  const cycle = pf + O * step;
  const tokensPerSec = (B * O) / cycle;
  const perUserTps = 1 / step;
  const costPer1M = ((num(p, "gpuPrice") * tp) / 3600 / tokensPerSec) * 1e6;
  const cap = 0.9 * tp * g.memGB * GB;
  const weights = paramCount(m) * 2;
  const perSeq = (P + O) * kvBytesPerToken(m);
  const maxBatch = Math.max(0, Math.floor((cap - weights) / perSeq));
  return { m, g, tp, B, pf, step, cycle, tokensPerSec, perUserTps, costPer1M, maxBatch, kvFits: B <= maxBatch ? 1 : 0 };
}

function compute(p: Params) {
  const s = serve(p);
  return { tokensPerSec: s.tokensPerSec, perUserTps: s.perUserTps, costPer1M: s.costPer1M, kvFits: s.kvFits, maxBatch: s.maxBatch };
}

const BATCHES = [1, 2, 4, 8, 16, 32, 48, 64, 96, 128, 192, 256, 384, 512];

function View({ params }: SimViewProps) {
  const s = serve(params);
  const runs = BATCHES.map((b) => serve(params, { batch: b }));
  const marker = BATCHES.reduce((bi, v, i) => (Math.abs(Math.log(v / s.B)) < Math.abs(Math.log(BATCHES[bi] / s.B)) ? i : bi), 0);
  const fitPts = [...new Set([...BATCHES, s.maxBatch].filter((b) => b >= 1 && b <= 512))].sort((a, b) => a - b).map((b): [number, number] => [b, serve(params, { batch: b }).tokensPerSec]);
  return (
    <>
      <Caption>Replica throughput (output tokens/s) vs batch. Solid = fits in memory (max batch {s.maxBatch}); dashed = would need more KV memory.</Caption>
      <LogLogChart
        logY={false}
        series={[
          { name: "fits in memory", pts: fitPts.filter(([b]) => b <= Math.max(1, s.maxBatch)), color: "var(--accent)" },
          { name: "needs more KV memory", pts: fitPts.filter(([b]) => b >= Math.max(1, s.maxBatch)), color: "var(--red)", dashed: true },
        ]}
        points={[{ x: s.B, y: s.tokensPerSec, label: `batch ${s.B}`, color: s.kvFits ? "var(--accent)" : "var(--red)" }]}
        yFmt={(v) => Math.round(v).toLocaleString("en-US")}
        xFmt={(v) => String(Math.round(v))}
        xLabel="batch size (concurrent sequences)"
        yLabel="tok/s"
        height={200}
      />
      <Caption>Each user&apos;s streaming speed falls as the batch grows (dashed: 20 tok/s ≈ comfortable reading speed)</Caption>
      <LineChart
        x={BATCHES}
        logX
        series={[
          { name: "per-user tok/s", values: runs.map((r) => r.perUserTps), color: "var(--blue)" },
          { name: "20 tok/s", values: BATCHES.map(() => 20), color: "var(--muted)", dashed: true },
        ]}
        yFormat="tps"
        xLabel="batch size"
        marker={marker}
        height={170}
      />
      <KV rows={[
        ["replica", `${s.tp} × ${s.g.label}`],
        ["decode step", `${round(s.step * 1000, 2)} ms`],
        ["prefill for the batch", `${round(s.pf * 1000, 0)} ms`],
        ["cost per 1M output tokens at batch 1", `$${round(runs[0].costPer1M, 2)}`],
      ]} />
    </>
  );
}

const D = { model: "llama3-8b", gpu: "h100", batch: 32, promptTokens: 1000, outputTokens: 300, gpuPrice: 2.5 };
const ds = serve(D);
const d1 = serve(D, { batch: 1 });

export const llmBatching: SimDef = {
  id: "llm-batching",
  title: "Batching: throughput, per-user speed and cost",
  summary: "Grow the batch on one model replica and watch total throughput rise, each user's speed fall, cost per token drop, and KV memory run out.",
  module: "inference-and-serving",
  tags: ["batching", "continuous batching", "throughput", "cost", "KV cache", "serving"],
  params: [
    { key: "model", label: "Model", kind: "select", options: MODEL_OPTIONS },
    { key: "gpu", label: "GPU", kind: "select", options: GPU_OPTIONS },
    { key: "batch", label: "Batch size", kind: "range", min: 1, max: 512, step: 1, log: true },
    { key: "promptTokens", label: "Prompt tokens", kind: "range", min: 10, max: 32000, step: 1, log: true },
    { key: "outputTokens", label: "Output tokens", kind: "range", min: 1, max: 4000, step: 1, log: true },
    { key: "gpuPrice", label: "GPU price", kind: "range", min: 0.3, max: 12, step: 0.1, unit: "$/GPU-h" },
  ],
  defaults: D,
  metrics: [
    { key: "tokensPerSec", label: "Replica throughput", format: "tps" },
    { key: "perUserTps", label: "Per-user speed", format: "tps" },
    { key: "costPer1M", label: "Cost / 1M output tok", format: "usd" },
    { key: "kvFits", label: "KV fits (1 = yes)", format: "int" },
    { key: "maxBatch", label: "Max batch", format: "int" },
  ],
  compute,
  View,
  math: `Decoding is memory-bound: each step reads all $2N$ bytes of weights whether it serves 1 sequence or 64. Batching shares that read.

**Step time** for $B$ sequences at average context $S = P + O/2$ ($kv$ = KV bytes per token, $F$ peak FLOP/s, $BW$ bandwidth, $t$ GPUs in the replica):
$$t_{step}(B) = \\max\\Big(\\frac{B(2N + 4LSd_{attn})}{0.6\\,tF},\\; \\frac{2N + B\\,S\\,kv}{0.8\\,t\\,BW}\\Big)$$
**One batch cycle**: prefill all $B$ prompts (compute-bound), then $O$ decode steps:
$$T = t_{prefill}(BP) + O\\,t_{step}(B), \\quad \\text{throughput} = \\frac{BO}{T}, \\quad \\text{per-user} = \\frac{1}{t_{step}}, \\quad \\frac{\\$}{1\\text{M tok}} = \\frac{t\\cdot\\text{price}/3600}{\\text{throughput}}\\times10^6$$
**Memory limit**: $2N + B(P+O)\\,kv \\le 0.9\\,t\\,M_{GPU}$ gives the maximum batch.

While $B\\,S\\,kv \\ll 2N$ the step time barely grows, so throughput rises almost linearly with $B$ at little cost to each user. Eventually KV reads dominate (or compute does) and per-user speed falls.

**Defaults** (Llama-3-8B on one H100 at USD 2.5/h, $P$ = 1000, $O$ = 300, $B$ = 32): $t_{step}$ = ${round(ds.step * 1000, 2)} ms, prefill ${round(ds.pf * 1000, 0)} ms, so throughput $= 32\\cdot 300 / ${round(ds.cycle, 3)}\\text{ s} = ${Math.round(ds.tokensPerSec).toLocaleString("en-US")}$ tok/s, each user sees ${round(ds.perUserTps, 0)} tok/s, cost USD ${round(ds.costPer1M, 3)} per 1M output tokens. At batch 1: ${Math.round(d1.tokensPerSec)} tok/s and USD ${round(d1.costPer1M, 2)} per 1M (${round(d1.costPer1M / ds.costPer1M, 0)}× more). Max batch that fits: ${ds.maxBatch}.`,
  explain: (_p, m) =>
    !m.kvFits
      ? `This batch needs more KV-cache memory than the replica has: at most ${m.maxBatch} sequences fit. Past that a real server queues or preempts requests.`
      : `Batching ${Math.round(m.tokensPerSec).toLocaleString("en-US")} tok/s across users at ${Math.round(m.perUserTps)} tok/s each costs $${m.costPer1M.toFixed(2)} per 1M tokens. ${m.perUserTps < 20 ? "Users now wait on each token: too big a batch for chat." : "Larger batches would cut cost further while each user still streams quickly."}`,
};
