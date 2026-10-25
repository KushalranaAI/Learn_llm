// RAG end to end: retrieval recall@k × generator faithfulness → answer accuracy, and what the context costs.
// Metric keys: recallAtK, faithfulness, answerAccuracy, contextTokens, costPerQuery (USD), latencyMs.
import { LineChart, StackBar, C } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { big, clamp, r } from "./lib";

const RHO: Record<string, number> = { bm25: 0.22, dense: 0.28, hybrid: 0.36 };
const RETRIEVE_MS: Record<string, number> = { bm25: 15, dense: 35, hybrid: 50 };
const PROMPT_OVERHEAD = 400; // instructions + question
const OUT_TOKENS = 150;
const G0 = 0.15; // chance of a right answer without the evidence (model already knows it / lucky guess)
const PRICE_IN = 3e-6, PRICE_OUT = 15e-6;
const PREFILL_TPS = 5000, DECODE_TPS = 100, BASE_MS = 200;

function model(p: Params, kOverride?: number) {
  const k = kOverride ?? num(p, "k"), c = num(p, "chunkTokens"), ret = str(p, "retriever"), f0 = num(p, "faithfulness");
  const rho = clamp(RHO[ret] * Math.min(1.5, Math.pow(c / 300, 0.35)), 0.01, 0.9);
  const recall = 1 - Math.pow(1 - rho, k);
  const ctx = k * c;
  const prompt = ctx + PROMPT_OVERHEAD;
  const faith = f0 * (1 - 0.05 * Math.log2(1 + ctx / 2000));
  const acc = recall * faith + (1 - recall) * G0;
  const cost = prompt * PRICE_IN + OUT_TOKENS * PRICE_OUT;
  const retrieveMs = RETRIEVE_MS[ret];
  const prefillMs = (prompt / PREFILL_TPS) * 1000;
  const decodeMs = (OUT_TOKENS / DECODE_TPS) * 1000;
  return { k, c, rho, recall, ctx, prompt, faith, acc, cost, retrieveMs, prefillMs, decodeMs, latency: retrieveMs + BASE_MS + prefillMs + decodeMs };
}

function compute(p: Params) {
  const m = model(p);
  return { recallAtK: m.recall, faithfulness: m.faith, answerAccuracy: m.acc, contextTokens: m.ctx, costPerQuery: m.cost, latencyMs: m.latency };
}

function View({ params }: SimViewProps) {
  const ks = Array.from({ length: 20 }, (_, i) => i + 1);
  const sw = ks.map((k) => model(params, k));
  const m = model(params);
  return (
    <>
      <Caption>As you retrieve more chunks: recall rises, faithfulness slowly falls (dashed line = current k)</Caption>
      <LineChart
        x={ks}
        series={[
          { name: "recall@k", values: sw.map((s) => s.recall), color: C.blue },
          { name: "faithfulness", values: sw.map((s) => s.faith), color: C.purple, dashed: true },
          { name: "answer accuracy", values: sw.map((s) => s.acc), color: C.green },
        ]}
        xLabel="chunks in the prompt (k)"
        yFormat="pct"
        yMax={1}
        marker={m.k - 1}
        height={210}
      />
      <Caption>Latency per query ({big(m.prompt)} prompt tokens)</Caption>
      <StackBar
        format="ms"
        parts={[
          { label: "retrieve", value: m.retrieveMs, color: C.blue },
          { label: "network/queue", value: BASE_MS, color: C.muted },
          { label: "prefill context", value: m.prefillMs, color: C.accent },
          { label: "generate answer", value: m.decodeMs, color: C.purple },
        ]}
      />
      <Caption>Cost per query as k grows</Caption>
      <LineChart x={ks} series={[{ name: "cost / 1k queries", values: sw.map((s) => s.cost * 1000), color: C.accent }]} xLabel="k" yFormat="usd" marker={m.k - 1} height={150} />
    </>
  );
}

const defaults = { k: 5, chunkTokens: 300, retriever: "dense", faithfulness: 0.92 };
const d = model(defaults);

export const ragPipeline: SimDef = {
  id: "rag-pipeline",
  title: "RAG pipeline: recall × faithfulness = accuracy",
  summary: "Retrieve k chunks, then generate. See how retrieval recall and the generator's faithfulness multiply into answer accuracy, and what extra context costs in tokens, money and latency.",
  module: "retrieval-and-rag",
  tags: ["RAG", "recall@k", "faithfulness", "context window", "cost"],
  params: [
    { key: "k", label: "Chunks retrieved k", kind: "range", min: 1, max: 20, step: 1 },
    { key: "chunkTokens", label: "Chunk size", kind: "range", min: 100, max: 1000, step: 50, unit: "tok" },
    { key: "retriever", label: "Retriever", kind: "select", options: [{ value: "bm25", label: "BM25 (keywords)" }, { value: "dense", label: "Dense embeddings" }, { value: "hybrid", label: "Hybrid + RRF" }] },
    { key: "faithfulness", label: "Generator faithfulness f₀", kind: "range", min: 0.6, max: 1, step: 0.01, help: "P(answer is correct and grounded | the evidence is in context), at small context" },
  ],
  defaults,
  metrics: [
    { key: "recallAtK", label: "Recall@k", format: "pct" },
    { key: "faithfulness", label: "Faithfulness", format: "pct" },
    { key: "answerAccuracy", label: "Answer accuracy", format: "pct" },
    { key: "contextTokens", label: "Context tokens", format: "int" },
    { key: "costPerQuery", label: "Cost / query", format: "usd" },
    { key: "latencyMs", label: "Latency", format: "ms" },
  ],
  compute,
  View,
  math: `**Retrieval.** Model each retrieved slot as an independent chance $\\rho$ of containing the evidence. $\\rho$ depends on the retriever ($\\rho_0$ = 0.22 BM25, 0.28 dense, 0.36 hybrid) and grows a little with chunk size $c$ (more text per chunk):
$$\\rho = \\rho_0 \\min\\!\\big(1.5,\\ (c/300)^{0.35}\\big), \\qquad \\text{recall@}k = 1 - (1-\\rho)^k$$

**Generation.** With the evidence in context, the model answers faithfully with probability $F$, which drops slowly as the context $T_{ctx} = k\\,c$ fills with distractors; without the evidence it is right only by luck or prior knowledge, $g_0 = ${G0}$:
$$F = f_0\\big(1 - 0.05\\log_2(1 + T_{ctx}/2000)\\big), \\qquad \\text{accuracy} = \\text{recall@}k\\cdot F + (1-\\text{recall@}k)\\,g_0$$

**Cost and latency** (input \\$3/M, output \\$15/M, ${OUT_TOKENS} output tokens, prefill ${big(PREFILL_TPS)} tok/s, decode ${DECODE_TPS} tok/s):
$$\\text{cost} = (T_{ctx} + ${PROMPT_OVERHEAD})\\pi_{in} + ${OUT_TOKENS}\\,\\pi_{out}, \\quad \\text{latency} = t_{retrieve} + ${BASE_MS} + \\frac{T_{ctx}+${PROMPT_OVERHEAD}}{${PREFILL_TPS}} + \\frac{${OUT_TOKENS}}{${DECODE_TPS}}\\ (\\text{s})$$

**Worked example (defaults: dense, $k=5$, $c=300$, $f_0=0.92$)**: $\\rho = 0.28$, recall@5 $= 1 - 0.72^5 = ${r(d.recall, 4)}$.
$T_{ctx} = 1{,}500$, $F = 0.92(1 - 0.05\\log_2 1.75) = ${r(d.faith, 4)}$, accuracy $= ${r(d.recall, 4)}\\cdot${r(d.faith, 4)} + ${r(1 - d.recall, 4)}\\cdot0.15 = ${r(d.acc, 4)}$.
Cost $= 1{,}900\\cdot3\\text{e-}6 + 150\\cdot15\\text{e-}6 = \\$${r(d.cost, 5)}$; latency $= 35 + 200 + ${r(d.prefillMs, 0)} + ${r(d.decodeMs, 0)} = ${r(d.latency, 0)}$ ms.
A wrong answer can come from either stage: debug retrieval (recall) and generation (faithfulness) separately.`,
  explain: (_p, m) =>
    m.recallAtK < 0.8
      ? `Only ${(m.recallAtK * 100).toFixed(0)}% of questions get the evidence into context, so accuracy is capped by retrieval: no generator can fix a missing document.`
      : `Recall is ${(m.recallAtK * 100).toFixed(0)}%; accuracy ${(m.answerAccuracy * 100).toFixed(0)}% is now limited by faithfulness. More chunks add ${m.contextTokens.toLocaleString("en-US")} tokens of cost and distraction for little recall gain.`,
};
