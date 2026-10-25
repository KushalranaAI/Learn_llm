// Retrieve N candidates cheaply, rerank them with a cross-encoder, keep k. How deep should you rerank?
// Metric keys: recallAtK (with reranking), recallNoRerank (first stage top-k), candidateRecall (first stage recall@N),
//              latencyMs, costPer1k (USD per 1,000 queries).
import { LineChart, C } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { binomCdf, r } from "./lib";

const N0: Record<string, number> = { bm25: 6, dense: 4, hybrid: 3 };
const FIRST_MS = 30;
const USD_PER_DOC = 0.00002;

/** First-stage recall@n: 1 − exp(−(n/n₀)^0.45). */
export const firstRecall = (n: number, n0: number) => 1 - Math.exp(-Math.pow(n / n0, 0.45));

export function rerankModel(N: number, k: number, n0: number, auc: number, msPerDoc: number) {
  const noRerank = firstRecall(k, n0);
  const cand = firstRecall(N, n0);
  const inTopK = k >= N ? 1 : binomCdf(k - 1, N - 1, 1 - auc);
  return { noRerank, cand, inTopK, recall: cand * inTopK, latency: FIRST_MS + N * msPerDoc, cost: N * USD_PER_DOC * 1000 };
}

function model(p: Params, nOverride?: number) {
  return rerankModel(nOverride ?? num(p, "candidates"), num(p, "k"), N0[str(p, "firstStage")], num(p, "rerankerAuc"), num(p, "msPerDoc"));
}

function compute(p: Params) {
  const m = model(p);
  return { recallAtK: m.recall, recallNoRerank: m.noRerank, candidateRecall: m.cand, latencyMs: m.latency, costPer1k: m.cost };
}

function View({ params }: SimViewProps) {
  const ns = Array.from({ length: 40 }, (_, i) => 5 * (i + 1));
  const sw = ns.map((n) => model(params, n));
  const N = num(params, "candidates");
  const marker = ns.reduce((b, n, i) => (Math.abs(n - N) < Math.abs(ns[b] - N) ? i : b), 0);
  const best = sw.reduce((b, s, i) => (s.recall > sw[b].recall ? i : b), 0);
  return (
    <>
      <Caption>Recall@{num(params, "k")} vs rerank depth N (best N ≈ {ns[best]})</Caption>
      <LineChart
        x={ns}
        series={[
          { name: "first stage recall@N (ceiling)", values: sw.map((s) => s.cand), color: C.muted, dashed: true },
          { name: "rerank N → keep k", values: sw.map((s) => s.recall), color: C.green },
          { name: "no rerank, top k", values: sw.map((s) => s.noRerank), color: C.red },
        ]}
        xLabel="candidates reranked N"
        yFormat="pct"
        yMax={1}
        marker={marker}
        height={210}
      />
      <Caption>Added latency grows linearly with N</Caption>
      <LineChart x={ns} series={[{ name: "latency", values: sw.map((s) => s.latency), color: C.accent }]} xLabel="N" yFormat="ms" marker={marker} height={150} />
    </>
  );
}

const defaults = { candidates: 50, k: 5, firstStage: "dense", rerankerAuc: 0.97, msPerDoc: 2 };
const d = rerankModel(50, 5, 4, 0.97, 2);

export const rerankDepth: SimDef = {
  id: "rerank-depth",
  title: "Rerank depth: retrieve N, keep k",
  summary: "A cheap retriever fetches N candidates and a slower, sharper reranker picks the best k. Find the N where recall stops improving and latency keeps growing.",
  module: "retrieval-and-rag",
  tags: ["reranking", "cross-encoder", "recall@k", "latency"],
  params: [
    { key: "candidates", label: "Candidates N", kind: "range", min: 5, max: 200, step: 5 },
    { key: "k", label: "Kept after rerank k", kind: "range", min: 1, max: 20, step: 1 },
    { key: "firstStage", label: "First stage", kind: "select", options: [{ value: "bm25", label: "BM25" }, { value: "dense", label: "Dense" }, { value: "hybrid", label: "Hybrid" }] },
    { key: "rerankerAuc", label: "Reranker quality (AUC)", kind: "range", min: 0.8, max: 0.995, step: 0.005, help: "P(reranker scores the relevant doc above a given irrelevant one)" },
    { key: "msPerDoc", label: "Rerank time per doc", kind: "range", min: 0.5, max: 20, step: 0.5, unit: "ms" },
  ],
  defaults,
  metrics: [
    { key: "recallAtK", label: "Recall@k (reranked)", format: "pct" },
    { key: "recallNoRerank", label: "Recall@k (no rerank)", format: "pct" },
    { key: "candidateRecall", label: "Recall@N (ceiling)", format: "pct" },
    { key: "latencyMs", label: "Retrieval latency", format: "ms" },
    { key: "costPer1k", label: "Rerank cost / 1k queries", format: "usd" },
  ],
  compute,
  View,
  math: `**First stage.** The chance the relevant document is in the top $n$ grows with diminishing returns ($n_0$ = 6 BM25, 4 dense, 3 hybrid):
$$R_1(n) = 1 - e^{-(n/n_0)^{0.45}}$$
Without reranking you keep the top $k$: recall $= R_1(k)$.

**Reranker.** A cross-encoder rescores the $N$ candidates. Model its quality by AUC $a$: each of the $N-1$ other candidates independently outranks the relevant one with probability $1-a$, so the number above it is $X \\sim \\text{Binomial}(N-1, 1-a)$ and
$$P(\\text{relevant in top } k \\mid \\text{in } N) = P(X \\le k-1) = \\sum_{j=0}^{k-1} \\binom{N-1}{j}(1-a)^j a^{N-1-j}$$
$$\\text{recall@}k = R_1(N)\\cdot P(X \\le k-1)$$
Deeper $N$ raises the ceiling $R_1(N)$ but gives the reranker more chances to be fooled, so recall peaks and then falls; latency $= ${FIRST_MS} + N\\,t_{doc}$ ms keeps rising, and cost is $\\$${USD_PER_DOC}$ per document.

**Worked example (defaults: dense, $N=50$, $k=5$, $a=0.97$, 2 ms/doc)**: no rerank $R_1(5) = 1 - e^{-1.25^{0.45}} = ${r(d.noRerank, 4)}$. Ceiling $R_1(50) = 1 - e^{-12.5^{0.45}} = ${r(d.cand, 4)}$. $X \\sim \\text{Bin}(49, 0.03)$, mean $1.47$, $P(X \\le 4) = ${r(d.inTopK, 4)}$, so recall@5 $= ${r(d.cand, 4)}\\times${r(d.inTopK, 4)} = ${r(d.recall, 4)}$ (${r((d.recall - d.noRerank) * 100, 1)} points better) for $30 + 50\\cdot2 = ${d.latency}$ ms and \\$${r(d.cost, 2)} per 1,000 queries.`,
  explain: (_p, m) =>
    m.recallAtK > m.recallNoRerank
      ? `Reranking lifts recall@k from ${(m.recallNoRerank * 100).toFixed(0)}% to ${(m.recallAtK * 100).toFixed(0)}% (ceiling ${(m.candidateRecall * 100).toFixed(0)}%) for ${Math.round(m.latencyMs)} ms. Past the peak, extra candidates only add latency and distractors.`
      : `This reranker is not good enough for this depth: it does worse than just keeping the first-stage top k. Rerank fewer candidates or use a better reranker.`,
};
