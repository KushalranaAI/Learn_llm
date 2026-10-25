// Capacity planning: requests per second × tokens -> replicas and GPUs needed at a target utilisation, and what it costs.
// Replica capacity comes from the llm-batching model (roofline step times, batch capped by KV memory).
// Params: qps 0.1–1000 (log), promptTokens 10–32000 (log), outputTokens 1–4000 (log), model (lib MODELS), gpu,
// batch 1–256 (log, operating batch per replica), targetUtil 0.3–0.95, gpuPrice 0.3–12 $/GPU-h.
// Metrics: gpusNeeded, replicas, monthlyCost (usd, 730 h), costPer1kReq (usd per 1000 requests), actualUtil (load / capacity).
import { LineChart } from "../ui";
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV } from "./viz";
import { GPU_OPTIONS, MODEL_OPTIONS, logspace, round } from "./lib";
import { serve } from "./llm-batching";

export const HOURS_PER_MONTH = 730;

export function capacity(p: Params, over: Partial<{ qps: number }> = {}) {
  const want = Math.round(num(p, "batch"));
  const probe = serve(p, { batch: want });
  const B = Math.max(1, Math.min(want, probe.maxBatch));
  const s = B === want ? probe : serve(p, { batch: B });
  const rps = B / s.cycle; // requests completed per second per replica
  const qps = over.qps ?? num(p, "qps");
  const util = num(p, "targetUtil");
  const replicas = Math.max(1, Math.ceil(qps / (rps * util)));
  const gpusNeeded = replicas * s.tp;
  const price = num(p, "gpuPrice");
  return { s, B, rps, replicas, gpusNeeded, monthlyCost: gpusNeeded * price * HOURS_PER_MONTH, costPer1kReq: ((gpusNeeded * price) / 3600 / qps) * 1000, actualUtil: qps / (replicas * rps) };
}

function compute(p: Params) {
  const c = capacity(p);
  return { gpusNeeded: c.gpusNeeded, replicas: c.replicas, monthlyCost: c.monthlyCost, costPer1kReq: c.costPer1kReq, actualUtil: c.actualUtil };
}

const QPS = logspace(0.1, 1000, 49);

function View({ params }: SimViewProps) {
  const c = capacity(params);
  const q = num(params, "qps");
  const marker = QPS.reduce((bi, v, i) => (Math.abs(Math.log(v / q)) < Math.abs(Math.log(QPS[bi] / q)) ? i : bi), 0);
  return (
    <>
      <Caption>GPUs needed as traffic grows (steps = adding a whole replica of {c.s.tp} GPU{c.s.tp > 1 ? "s" : ""})</Caption>
      <LineChart
        x={QPS.map((v) => +v.toPrecision(2))}
        logX
        series={[{ name: "GPUs", values: QPS.map((v) => capacity(params, { qps: v }).gpusNeeded) }]}
        xFormat={(v) => (v >= 1 ? String(Math.round(v)) : String(v))}
        xLabel="requests per second"
        yLabel="GPUs"
        yFormat="int"
        marker={marker}
        height={200}
      />
      <Caption>Load vs capacity: {round(c.actualUtil * 100, 0)}% busy (target {round(num(params, "targetUtil") * 100, 0)}%)</Caption>
      <div role="img" aria-label="utilisation" style={{ height: 14, borderRadius: 999, background: "var(--card-3)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, c.actualUtil * 100)}%`, height: "100%", background: c.actualUtil > 0.85 ? "var(--red)" : "var(--green)" }} />
      </div>
      <KV rows={[
        ["replica", `${c.s.tp} × ${c.s.g.label}, batch ${c.B}${c.B < num(params, "batch") ? " (capped by KV memory)" : ""}`],
        ["one replica serves", `${round(c.rps, 2)} req/s (${Math.round(c.s.tokensPerSec).toLocaleString("en-US")} output tok/s)`],
        ["each user streams at", `${Math.round(c.s.perUserTps)} tok/s, ~${round(c.s.cycle, 1)} s per request`],
        ["traffic", `${(q * 3600 * 24).toLocaleString("en-US", { maximumFractionDigits: 0 })} requests/day`],
      ]} />
    </>
  );
}

const D = { qps: 20, promptTokens: 1000, outputTokens: 300, model: "llama3-8b", gpu: "h100", batch: 32, targetUtil: 0.7, gpuPrice: 2.5 };
const dc = capacity(D);
const dm = compute(D);

export const gpuCapacity: SimDef = {
  id: "gpu-capacity",
  title: "Capacity planning: how many GPUs?",
  summary: "Turn traffic (requests per second and tokens per request) into replicas, GPUs, utilisation and monthly cost for a model and GPU type.",
  module: "inference-and-serving",
  tags: ["capacity planning", "GPUs", "cost", "utilization", "QPS", "serving"],
  params: [
    { key: "qps", label: "Requests per second", kind: "range", min: 0.1, max: 1000, step: 0.1, log: true },
    { key: "promptTokens", label: "Prompt tokens", kind: "range", min: 10, max: 32000, step: 1, log: true },
    { key: "outputTokens", label: "Output tokens", kind: "range", min: 1, max: 4000, step: 1, log: true },
    { key: "model", label: "Model", kind: "select", options: MODEL_OPTIONS },
    { key: "gpu", label: "GPU", kind: "select", options: GPU_OPTIONS },
    { key: "batch", label: "Batch per replica", kind: "range", min: 1, max: 256, step: 1, log: true },
    { key: "targetUtil", label: "Target utilisation", kind: "range", min: 0.3, max: 0.95, step: 0.05, help: "headroom for bursts and latency" },
    { key: "gpuPrice", label: "GPU price", kind: "range", min: 0.3, max: 12, step: 0.1, unit: "$/GPU-h" },
  ],
  defaults: D,
  metrics: [
    { key: "gpusNeeded", label: "GPUs needed", format: "int" },
    { key: "replicas", label: "Replicas", format: "int" },
    { key: "monthlyCost", label: "Monthly cost", format: "usd" },
    { key: "costPer1kReq", label: "Cost / 1k requests", format: "usd" },
    { key: "actualUtil", label: "Actual utilisation", format: "pct" },
  ],
  compute,
  View,
  math: `**Replica capacity.** A replica ($t$ GPUs, tensor-parallel if the model needs it) running batch $B$ (capped by KV-cache memory) completes a batch cycle of prefill plus $O$ decode steps in $T$ seconds (see the batching sim):
$$\\mu = \\frac{B}{T}\\ \\text{requests/s per replica}, \\qquad T = t_{prefill}(BP) + O\\,t_{step}(B)$$
**Replicas** at target utilisation $u$ (headroom for bursts; queueing delay explodes as $u \\to 1$):
$$R = \\Big\\lceil \\frac{\\lambda}{u\\,\\mu} \\Big\\rceil, \\qquad \\text{GPUs} = R\\,t, \\qquad \\text{actual utilisation} = \\frac{\\lambda}{R\\,\\mu}$$
**Cost** at price $p$ per GPU-hour: monthly $= \\text{GPUs}\\cdot p\\cdot 730$; per 1000 requests $= \\dfrac{\\text{GPUs}\\cdot p/3600}{\\lambda}\\times 1000$.

**Defaults** ($\\lambda$ = 20 req/s, $P$ = 1000, $O$ = 300, Llama-3-8B on H100s, $B$ = 32, $u$ = 0.7, USD 2.5/GPU-h): one cycle takes ${round(dc.s.cycle, 3)} s, so $\\mu = 32/${round(dc.s.cycle, 3)} = ${round(dc.rps, 3)}$ req/s. $R = \\lceil 20 / (0.7\\cdot ${round(dc.rps, 3)}) \\rceil = ${dm.replicas}$ replicas = ${dm.gpusNeeded} GPUs at ${round(dm.actualUtil * 100, 1)}% actual utilisation. Monthly: ${dm.gpusNeeded} × 2.5 × 730 = USD ${Math.round(dm.monthlyCost).toLocaleString("en-US")}; per 1000 requests USD ${round(dm.costPer1kReq, 4)}.

This is a first-order plan: real traffic is bursty and spread across prompt/output lengths, so validate with a load test.`,
  explain: (_p, m) =>
    `${m.replicas} replica${m.replicas > 1 ? "s" : ""} (${m.gpusNeeded} GPU${m.gpusNeeded > 1 ? "s" : ""}) at ${Math.round(m.actualUtil * 100)}% utilisation: $${Math.round(m.monthlyCost).toLocaleString("en-US")} per month, $${m.costPer1kReq.toFixed(3)} per 1000 requests.${m.actualUtil < 0.4 ? " Most capacity sits idle: a smaller GPU or a shared deployment would be cheaper." : ""}`,
};
