// End-to-end latency of one LLM request: network + queue + prefill (TTFT) + decode (TPOT × output tokens).
// Step times come from a roofline model (lib.ts): max(FLOPs / (peak·0.6), bytes / (bandwidth·0.8)), tensor-parallel when needed.
// Params: model (lib MODELS), gpu, promptTokens 10–100000 (log), outputTokens 1–4000 (log), batch 1–128 (log, sequences decoding
// together on the replica), networkMs 0–300, queueMs 0–2000.
// Metrics: ttftMs (time to first token), tpotMs (time per output token), e2eMs (whole response), tokensPerSec (one user's
// streaming speed = 1000 / tpotMs), prefillMs.
import { LineChart, StackBar } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV } from "./viz";
import { GPU_OPTIONS, GPUS, MODEL_OPTIONS, MODELS, decodeStep, logspace, paramCount, prefill, round, tpSize } from "./lib";

export function latency(p: Params, over: Partial<{ prompt: number }> = {}) {
  const m = MODELS[str(p, "model")] ?? MODELS["llama3-8b"];
  const g = GPUS[str(p, "gpu")] ?? GPUS.h100;
  const tp = tpSize(m, g);
  const P = over.prompt ?? num(p, "promptTokens"), O = Math.round(num(p, "outputTokens")), B = Math.round(num(p, "batch"));
  const pf = prefill(m, g, P, P, tp);
  const dc = decodeStep(m, g, B, P + O / 2, tp);
  const prefillMs = pf.t * 1000, tpotMs = dc.t * 1000;
  const ttftMs = num(p, "networkMs") + num(p, "queueMs") + prefillMs;
  const decodeMs = Math.max(0, O - 1) * tpotMs;
  return { m, g, tp, pf, dc, prefillMs, tpotMs, ttftMs, decodeMs, e2eMs: ttftMs + decodeMs };
}

function compute(p: Params) {
  const l = latency(p);
  return { ttftMs: l.ttftMs, tpotMs: l.tpotMs, e2eMs: l.e2eMs, tokensPerSec: 1000 / l.tpotMs, prefillMs: l.prefillMs };
}

const PROMPTS = logspace(10, 100000, 41);

function View({ params }: SimViewProps) {
  const l = latency(params);
  const P = num(params, "promptTokens");
  const marker = PROMPTS.reduce((bi, v, i) => (Math.abs(Math.log(v / P)) < Math.abs(Math.log(PROMPTS[bi] / P)) ? i : bi), 0);
  return (
    <>
      <Caption>Where the {round(l.e2eMs / 1000, 2)} s go (one request)</Caption>
      <StackBar
        format="ms"
        parts={[
          { label: "network", value: num(params, "networkMs"), color: "var(--muted)" },
          { label: "queue", value: num(params, "queueMs"), color: "var(--purple)" },
          { label: "prefill", value: l.prefillMs, color: "var(--blue)" },
          { label: "decode", value: l.decodeMs, color: "var(--accent)" },
        ]}
      />
      <Caption>Time to first token vs prompt length (prefill grows linearly, then quadratically from attention)</Caption>
      <LineChart
        x={PROMPTS.map(Math.round)}
        logX
        xFormat={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
        series={[{ name: "TTFT", values: PROMPTS.map((pp) => latency(params, { prompt: pp }).ttftMs) }]}
        yFormat="ms"
        xLabel="prompt tokens"
        yLabel="TTFT"
        marker={marker}
        height={190}
      />
      <KV rows={[
        ["replica", `${l.tp} × ${l.g.label}${l.tp > 1 ? " (tensor parallel)" : ""}`],
        ["prefill bound by", l.pf.tc >= l.pf.tm ? `compute (${round(l.pf.tc * 1000, 1)} ms vs ${round(l.pf.tm * 1000, 1)} ms memory)` : `memory (${round(l.pf.tm * 1000, 1)} ms vs ${round(l.pf.tc * 1000, 1)} ms compute)`],
        ["decode step bound by", l.dc.tm >= l.dc.tc ? `memory (${round(l.dc.tm * 1000, 2)} ms vs ${round(l.dc.tc * 1000, 2)} ms compute)` : `compute (${round(l.dc.tc * 1000, 2)} ms vs ${round(l.dc.tm * 1000, 2)} ms memory)`],
        ["params", `${round(paramCount(l.m) / 1e9, 2)} B`],
      ]} />
    </>
  );
}

const D = { model: "llama3-8b", gpu: "h100", promptTokens: 2000, outputTokens: 300, batch: 8, networkMs: 50, queueMs: 20 };
const dl = latency(D);
const dm = compute(D);
const N = paramCount(MODELS["llama3-8b"]);

export const latencyBreakdown: SimDef = {
  id: "latency-breakdown",
  title: "Latency breakdown: TTFT, TPOT and end-to-end",
  summary: "Split one request's latency into network, queueing, prefill and decode, and see how prompt length, answer length, batch and hardware move TTFT and tokens per second.",
  module: "inference-and-serving",
  tags: ["latency", "TTFT", "TPOT", "prefill", "decode", "inference"],
  params: [
    { key: "model", label: "Model", kind: "select", options: MODEL_OPTIONS },
    { key: "gpu", label: "GPU", kind: "select", options: GPU_OPTIONS },
    { key: "promptTokens", label: "Prompt tokens", kind: "range", min: 10, max: 100000, step: 1, log: true },
    { key: "outputTokens", label: "Output tokens", kind: "range", min: 1, max: 4000, step: 1, log: true },
    { key: "batch", label: "Concurrent sequences", kind: "range", min: 1, max: 128, step: 1, log: true },
    { key: "networkMs", label: "Network round trip", kind: "range", min: 0, max: 300, step: 5, unit: "ms" },
    { key: "queueMs", label: "Queue wait", kind: "range", min: 0, max: 2000, step: 10, unit: "ms" },
  ],
  defaults: D,
  metrics: [
    { key: "ttftMs", label: "TTFT", format: "ms" },
    { key: "tpotMs", label: "TPOT", format: "ms" },
    { key: "e2eMs", label: "End-to-end", format: "ms" },
    { key: "tokensPerSec", label: "Decode speed (per user)", format: "tps" },
    { key: "prefillMs", label: "Prefill", format: "ms" },
  ],
  compute,
  View,
  math: `A streamed response has two very different phases.

**Prefill** processes all $P$ prompt tokens in one parallel pass. It is **compute-bound**: ≈ $2N$ FLOPs per token for the matmuls ($N$ parameters) plus causal attention $2L\\,P^2 d_{attn}$:
$$t_{prefill} = \\max\\Big(\\frac{2NP + 2LP^2 d_{attn}}{0.6\\,F},\\; \\frac{2N + P\\cdot kv}{0.8\\,BW}\\Big)$$
**Decode** emits one token per step for all $B$ running sequences. Every step re-reads all weights ($2N$ bytes in bf16) and each sequence's KV cache at context $S$, so it is **memory-bound**:
$$t_{step} = \\max\\Big(\\frac{B(2N + 4LSd_{attn})}{0.6\\,F},\\; \\frac{2N + B\\,S\\cdot kv}{0.8\\,BW}\\Big)$$
($F$ = peak bf16 FLOP/s, $BW$ = memory bandwidth, 0.6 and 0.8 are typical achieved fractions, $kv$ = KV bytes per token, $S$ = average context $P + O/2$; with tensor parallelism over $t$ GPUs both $F$ and $BW$ scale by $t$; communication is ignored.)

$$\\text{TTFT} = t_{net} + t_{queue} + t_{prefill}, \\qquad \\text{TPOT} = t_{step}, \\qquad \\text{E2E} = \\text{TTFT} + (O-1)\\,\\text{TPOT}$$

**Defaults** (Llama-3-8B, $N$ = ${round(N / 1e9, 2)} B, one H100: 989 TFLOPS, 3.35 TB/s):
prefill of 2000 tokens ≈ $2\\cdot${round(N / 1e9, 2)}\\times10^9\\cdot 2000 / (0.6\\cdot 989\\times10^{12})$ plus attention = ${round(dm.prefillMs, 1)} ms, so TTFT = 50 + 20 + ${round(dm.prefillMs, 1)} = ${round(dm.ttftMs, 1)} ms.
A decode step reads ${round((2 * N) / 1e9, 1)} GB of weights + $8\\times 2150\\times 131072$ B of KV ≈ ${round((2 * N + 8 * 2150 * 131072) / 1e9, 2)} GB at $0.8\\times 3.35$ TB/s = ${round(dm.tpotMs, 2)} ms → ${round(dm.tokensPerSec, 0)} tokens/s per user. 299 more tokens take ${round(dl.decodeMs, 0)} ms; end-to-end ${round(dm.e2eMs / 1000, 2)} s.`,
  explain: (_p, m) =>
    m.e2eMs - m.ttftMs > m.ttftMs
      ? `Decode dominates: ${Math.round(((m.e2eMs - m.ttftMs) / m.e2eMs) * 100)}% of the ${(m.e2eMs / 1000).toFixed(2)} s is generating tokens at ${m.tpotMs.toFixed(1)} ms each (${Math.round(m.tokensPerSec)} tok/s, memory-bandwidth bound). Shorter answers help most.`
      : `Time to first token (${Math.round(m.ttftMs)} ms) dominates: the prompt is long relative to the answer, so prefill compute, queueing or network is the thing to cut.`,
};
