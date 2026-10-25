// Prompt caching: a long shared prefix (system prompt, tools, documents) is processed once and re-read cheaply.
// Metric keys: costPerRequest (USD), costSaving (fraction vs no cache), ttftMs, ttftSavedMs, breakEvenHitRate.
import { LineChart, StackBar, C } from "../ui";
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { big, linspace, nearestIndex, pc, r } from "./lib";

const OVERHEAD_MS = 200; // network + queue before prefill starts
const PREFILL_TPS = 5000; // prompt tokens processed per second
const OUT_MULT = 5; // output price = 5 × input price

function model(p: Params, hOverride?: number) {
  const P = num(p, "prefixTokens"), S = num(p, "suffixTokens"), O = num(p, "outputTokens");
  const h = hOverride ?? num(p, "hitRate"), d = num(p, "readDiscount"), w = num(p, "writePremium");
  const pin = num(p, "priceIn") / 1e6, pout = pin * OUT_MULT;
  const noCache = (P + S) * pin + O * pout;
  const reads = h * P * d * pin;
  const writes = (1 - h) * P * (1 + w) * pin;
  const suffix = S * pin;
  const output = O * pout;
  const cached = reads + writes + suffix + output;
  const ttft0 = OVERHEAD_MS + ((P + S) / PREFILL_TPS) * 1000;
  const ttft = OVERHEAD_MS + (((1 - h) * P + S) / PREFILL_TPS) * 1000;
  return { noCache, cached, reads, writes, suffix, output, ttft0, ttft, breakEven: w / (w + 1 - d) };
}

function compute(p: Params) {
  const m = model(p);
  return {
    costPerRequest: m.cached,
    costSaving: 1 - m.cached / m.noCache,
    ttftMs: m.ttft,
    ttftSavedMs: m.ttft0 - m.ttft,
    breakEvenHitRate: m.breakEven,
  };
}

function View({ params }: SimViewProps) {
  const m = model(params);
  const hs = linspace(0, 1, 51);
  const sweep = hs.map((h) => model(params, h));
  return (
    <>
      <Caption>Where the money goes per request (with caching)</Caption>
      <StackBar
        format="usd"
        parts={[
          { label: "cache reads", value: m.reads, color: C.green },
          { label: "cache writes", value: m.writes, color: C.red },
          { label: "uncached suffix", value: m.suffix, color: C.blue },
          { label: "output", value: m.output, color: C.purple },
        ]}
      />
      <Caption>Cost per request as the cache hit rate changes (dashed line = current hit rate)</Caption>
      <LineChart
        x={hs}
        series={[
          { name: "no cache", values: sweep.map((s) => s.noCache), color: C.muted, dashed: true },
          { name: "with cache", values: sweep.map((s) => s.cached), color: C.accent },
        ]}
        xFormat={(v) => `${Math.round(v * 100)}%`}
        xLabel="cache hit rate"
        yFormat="usd"
        marker={nearestIndex(hs, num(params, "hitRate"))}
        height={190}
      />
      <Caption>Time to first token (ms)</Caption>
      <LineChart
        x={hs}
        series={[
          { name: "no cache", values: sweep.map((s) => s.ttft0), color: C.muted, dashed: true },
          { name: "with cache", values: sweep.map((s) => s.ttft), color: C.green },
        ]}
        xFormat={(v) => `${Math.round(v * 100)}%`}
        xLabel="cache hit rate"
        yFormat="ms"
        marker={nearestIndex(hs, num(params, "hitRate"))}
        height={170}
      />
    </>
  );
}

const defaults = { prefixTokens: 8000, suffixTokens: 500, outputTokens: 300, hitRate: 0.8, readDiscount: 0.1, writePremium: 0.25, priceIn: 3 };
const d = model(defaults);
const dm = compute(defaults);

export const promptCache: SimDef = {
  id: "prompt-cache",
  title: "Prompt caching: pay once for the shared prefix",
  summary: "Put the stable part of the prompt first, cache it, and see how hit rate, read discount and write premium change cost and time to first token.",
  module: "prompt-and-context",
  tags: ["prompt caching", "cost", "TTFT", "prefix"],
  params: [
    { key: "prefixTokens", label: "Shared prefix", kind: "range", min: 500, max: 100000, step: 500, log: true, unit: "tok", help: "System prompt, tool definitions, documents: identical across requests" },
    { key: "suffixTokens", label: "Unique part (user turn)", kind: "range", min: 50, max: 5000, step: 50, log: true, unit: "tok" },
    { key: "outputTokens", label: "Output", kind: "range", min: 50, max: 2000, step: 50, unit: "tok" },
    { key: "hitRate", label: "Cache hit rate h", kind: "range", min: 0, max: 1, step: 0.01, help: "Share of requests that find the prefix already cached" },
    { key: "readDiscount", label: "Cached read price d", kind: "range", min: 0.05, max: 1, step: 0.05, help: "Fraction of the normal input price paid for cached tokens" },
    { key: "writePremium", label: "Cache write premium w", kind: "range", min: 0, max: 1, step: 0.05, help: "Extra paid when a miss writes the prefix into the cache" },
    { key: "priceIn", label: "Input price", kind: "range", min: 0.1, max: 15, step: 0.1, unit: "$/M", help: "Output is priced at 5× input" },
  ],
  defaults,
  metrics: [
    { key: "costPerRequest", label: "Cost / request", format: "usd" },
    { key: "costSaving", label: "Saved vs no cache", format: "pct" },
    { key: "ttftMs", label: "Time to first token", format: "ms" },
    { key: "ttftSavedMs", label: "TTFT saved", format: "ms" },
    { key: "breakEvenHitRate", label: "Break-even hit rate", format: "pct" },
  ],
  compute,
  View,
  math: `Let $P$ be the shared prefix tokens, $S$ the unique suffix, $O$ the output, $\\pi_{in}$ the input price per token ($\\pi_{out} = 5\\pi_{in}$), $h$ the hit rate, $d$ the cached-read price fraction and $w$ the write premium.

**Without caching** every request pays for the whole prompt:
$$c_0 = (P+S)\\,\\pi_{in} + O\\,\\pi_{out}$$

**With caching** a hit reads the prefix at $d\\,\\pi_{in}$, a miss writes it at $(1+w)\\,\\pi_{in}$:
$$c = P\\,\\pi_{in}\\big(h\\,d + (1-h)(1+w)\\big) + S\\,\\pi_{in} + O\\,\\pi_{out}$$

Caching pays off when $h\\,d + (1-h)(1+w) < 1$, i.e. above the **break-even hit rate**
$$h^* = \\frac{w}{w + 1 - d}$$

**Time to first token** is dominated by prefill; cached tokens are not recomputed:
$$\\text{TTFT} = t_0 + \\frac{(1-h)P + S}{R_{prefill}}, \\quad t_0 = ${OVERHEAD_MS}\\text{ ms},\\ R_{prefill} = ${big(PREFILL_TPS)}\\text{ tok/s}$$

**Worked example (defaults)**: $P=${big(defaults.prefixTokens)}$, $S=${defaults.suffixTokens}$, $O=${defaults.outputTokens}$, $\\pi_{in}=\\$3/\\text{M}$, $h=${defaults.hitRate}$, $d=${defaults.readDiscount}$, $w=${defaults.writePremium}$.

- $c_0 = 8{,}500 \\times 3\\text{e-}6 + 300 \\times 15\\text{e-}6 = \\$${r(d.noCache, 4)}$
- prefix factor $= 0.8\\cdot0.1 + 0.2\\cdot1.25 = ${r(0.8 * 0.1 + 0.2 * 1.25, 2)}$, so $c = 8{,}000\\cdot3\\text{e-}6\\cdot0.33 + 0.0015 + 0.0045 = \\$${r(d.cached, 5)}$, saving ${pc(dm.costSaving)}
- TTFT: $200 + 8{,}500/5 = ${r(d.ttft0, 0)}$ ms without cache, $200 + (1{,}600+500)/5 = ${r(d.ttft, 0)}$ ms with it
- $h^* = 0.25/1.15 = ${r(d.breakEven, 3)}$: below about ${pc(d.breakEven, 0)} hits, the write premium makes caching cost more than it saves.`,
  explain: (p, m) =>
    num(p, "hitRate") < m.breakEvenHitRate
      ? `The hit rate is below the break-even ${(m.breakEvenHitRate * 100).toFixed(0)}%: cache writes cost more than the cheap reads save. Raise reuse (keep the prefix byte-identical) or turn caching off.`
      : `Caching saves ${(m.costSaving * 100).toFixed(0)}% of the cost and ${Math.round(m.ttftSavedMs)} ms of time to first token, because most of the prefix is read from cache instead of recomputed.`,
};
