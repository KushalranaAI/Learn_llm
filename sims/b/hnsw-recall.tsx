// Vector indexes: exact (flat) vs IVF vs HNSW. A calibrated cost/recall model, not a benchmark.
// Metric keys: recallAt10, latencyMs (one query, one core), memoryMb, qpsPerCore.
import { LineChart, C, fmt } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, HBars, Columns } from "./viz";
import { big, logspace, nearestIndex, r } from "./lib";

const NS_PER_DIM = 0.1; // SIMD distance cost per dimension (ns)
const NS_RANDOM = 60; // extra cost of a random memory access per graph hop (ns)
const OVERHEAD_MS = 0.1;
const MB = 1024 * 1024;

type Idx = "flat" | "ivf" | "hnsw";

export function indexModel(index: Idx, N: number, d: number, M: number, ef: number, nprobe: number) {
  const perVec = d * NS_PER_DIM;
  if (index === "flat") {
    const comps = N;
    return { recall: 1, comps, latency: OVERHEAD_MS + (comps * perVec) / 1e6, memory: (N * 4 * d) / MB, ef0: 0, nlist: 0 };
  }
  if (index === "ivf") {
    const nlist = Math.round(4 * Math.sqrt(N));
    const np = Math.min(nprobe, nlist);
    const comps = nlist + (np * N) / nlist;
    const recall = 1 - Math.exp(-36.4 * Math.sqrt(np / nlist));
    return { recall, comps, latency: OVERHEAD_MS + (comps * perVec + np * NS_RANDOM) / 1e6, memory: (N * (4 * d + 8) + nlist * 4 * d) / MB, ef0: 0, nlist };
  }
  const efE = Math.max(ef, 10);
  const ef0 = 6 * Math.sqrt(16 / M) * (1 + 0.15 * Math.log10(N / 1e6)) * Math.pow(d / 768, 0.1);
  const recall = 1 - Math.exp(-Math.pow(efE / ef0, 0.6));
  const comps = M * (1.5 * efE + Math.log(N));
  return { recall, comps, latency: OVERHEAD_MS + (comps * (perVec + NS_RANDOM)) / 1e6, memory: (N * (4 * d + 8 * M) * 1.05) / MB, ef0, nlist: 0 };
}

function model(p: Params) {
  return indexModel(str(p, "index") as Idx, num(p, "vectors"), num(p, "dim"), num(p, "M"), num(p, "efSearch"), num(p, "nprobe"));
}

function compute(p: Params) {
  const m = model(p);
  return { recallAt10: m.recall, latencyMs: m.latency, memoryMb: m.memory, qpsPerCore: 1000 / m.latency };
}

function View({ params }: SimViewProps) {
  const index = str(params, "index") as Idx;
  const N = num(params, "vectors"), d = num(params, "dim"), M = num(params, "M"), ef = num(params, "efSearch"), np = num(params, "nprobe");
  const knobs = index === "ivf" ? logspace(1, 256, 33) : logspace(10, 512, 33);
  const knobName = index === "ivf" ? "nprobe (clusters searched)" : "efSearch (candidate list size)";
  const cur = index === "ivf" ? np : ef;
  const sweepH = knobs.map((k) => indexModel(index === "flat" ? "hnsw" : index, N, d, M, k, k));
  const all = (["flat", "ivf", "hnsw"] as Idx[]).map((i) => ({ i, m: indexModel(i, N, d, M, ef, np) }));
  const name = { flat: "flat (exact)", ivf: "IVF", hnsw: "HNSW" } as const;
  return (
    <>
      <Caption>{index === "flat" ? "Flat is exact; curves show HNSW for comparison" : `Recall@10 and latency as ${knobName} grows (dashed line = current)`}</Caption>
      <LineChart
        x={knobs}
        logX
        series={[{ name: "recall@10", values: sweepH.map((s) => s.recall), color: C.green }]}
        xFormat={(v) => String(Math.round(v))}
        xLabel={knobName}
        yFormat="pct"
        yMax={1}
        marker={index === "flat" ? undefined : nearestIndex(knobs.map(Math.log), Math.log(cur))}
        height={170}
      />
      <LineChart
        x={knobs}
        logX
        series={[{ name: "latency", values: sweepH.map((s) => s.latency), color: C.accent }]}
        xFormat={(v) => String(Math.round(v))}
        xLabel={knobName}
        yFormat="ms"
        marker={index === "flat" ? undefined : nearestIndex(knobs.map(Math.log), Math.log(cur))}
        height={150}
      />
      <Columns min={200}>
        <div>
          <Caption>Latency per query (log scale)</Caption>
          <HBars labelWidth={80} max={Math.log10(Math.max(...all.map((a) => a.m.latency)) * 10)} rows={all.map((a) => ({ label: name[a.i], value: Math.log10(a.m.latency * 10), display: fmt(a.m.latency, "ms"), bold: a.i === index, color: a.i === index ? C.accent : C.muted }))} />
        </div>
        <div>
          <Caption>Memory and recall</Caption>
          <HBars labelWidth={80} format="pct" max={1} rows={all.map((a) => ({ label: name[a.i], value: a.m.recall, bold: a.i === index, color: a.i === index ? C.green : C.muted, note: `${big(a.m.memory)} MB` }))} />
        </div>
      </Columns>
    </>
  );
}

const defaults = { index: "hnsw", vectors: 1000000, dim: 768, M: 16, efSearch: 64, nprobe: 16 };
const dh = indexModel("hnsw", 1e6, 768, 16, 64, 16), df = indexModel("flat", 1e6, 768, 16, 64, 16), di = indexModel("ivf", 1e6, 768, 16, 64, 16);

export const hnswRecall: SimDef = {
  id: "hnsw-recall",
  title: "Vector indexes: recall vs latency vs memory",
  summary: "Compare exact search, IVF and HNSW on a million vectors. Tune M, efSearch and nprobe and watch recall@10 trade against latency and memory.",
  module: "retrieval-and-rag",
  tags: ["ANN", "HNSW", "IVF", "recall@10", "vector database"],
  params: [
    { key: "index", label: "Index type", kind: "select", options: [{ value: "flat", label: "Flat (exact)" }, { value: "ivf", label: "IVF" }, { value: "hnsw", label: "HNSW" }] },
    { key: "vectors", label: "Vectors N", kind: "range", min: 10000, max: 100000000, step: 10000, log: true },
    { key: "dim", label: "Dimensions d", kind: "range", min: 64, max: 3072, step: 64 },
    { key: "M", label: "HNSW M (links per node)", kind: "range", min: 4, max: 64, step: 2 },
    { key: "efSearch", label: "HNSW efSearch", kind: "range", min: 10, max: 512, step: 1, log: true },
    { key: "nprobe", label: "IVF nprobe", kind: "range", min: 1, max: 256, step: 1, log: true },
  ],
  defaults,
  metrics: [
    { key: "recallAt10", label: "Recall@10", format: "pct" },
    { key: "latencyMs", label: "Latency / query", format: "ms" },
    { key: "memoryMb", label: "Memory (MB)", format: "int" },
    { key: "qpsPerCore", label: "QPS per core", format: "int" },
  ],
  compute,
  View,
  math: `Cost is counted in **distance computations** (each $d\\cdot${NS_PER_DIM}$ ns with SIMD) plus ${NS_RANDOM} ns per random memory hop, plus ${OVERHEAD_MS} ms fixed overhead. Recall@10 = fraction of the true 10 nearest neighbours returned. The recall curves are calibrated to typical published benchmarks (SIFT/GloVe-like data), not derived from first principles.

**Flat** (exact): compare with all $N$ vectors. Recall $=1$, latency $\\propto N d$, memory $= 4Nd$ bytes (float32).

**IVF**: k-means into $n_{list} = 4\\sqrt N$ clusters; search the $n_{probe}$ nearest clusters:
$$\\text{comps} = n_{list} + n_{probe}\\frac{N}{n_{list}}, \\qquad \\text{recall} = 1 - e^{-36.4\\sqrt{n_{probe}/n_{list}}}$$

**HNSW**: a layered proximity graph with $M$ links per node; a greedy search keeps a candidate list of size $ef$:
$$\\text{comps} \\approx M\\,(1.5\\,ef + \\ln N), \\qquad \\text{recall} = 1 - \\exp\\!\\big(-(ef/ef_0)^{0.6}\\big), \\quad ef_0 = 6\\sqrt{16/M}\\,\\big(1 + 0.15\\log_{10}\\tfrac{N}{10^6}\\big)\\big(\\tfrac{d}{768}\\big)^{0.1}$$
$$\\text{memory} \\approx 1.05\\,N\\,(4d + 8M)\\ \\text{bytes}$$
More links ($M$) make the graph easier to navigate (smaller $ef_0$) but cost memory and per-hop work; bigger $ef$ explores more and raises recall with diminishing returns.

**Worked example (defaults: $N = 10^6$, $d = 768$, $M = 16$, $ef = 64$)**: $ef_0 = 6$, so recall $= 1 - e^{-(64/6)^{0.6}} = ${r(dh.recall, 4)}$. Comps $= 16(96 + \\ln 10^6) = ${big(dh.comps)}$, each $76.8 + 60$ ns, so latency $= 0.1 + ${r((dh.comps * 136.8) / 1e6, 3)} = ${r(dh.latency, 3)}$ ms ($\\approx ${big(1000 / dh.latency)}$ QPS per core). Memory $= 1.05\\cdot10^6(3072 + 128)$ B $= ${big(dh.memory)}$ MB.
For comparison, flat needs $10^6$ comps $= ${r(df.latency, 1)}$ ms (${big(df.memory)} MB) and IVF with $n_{list} = ${big(di.nlist)}$, $n_{probe} = 16$ reaches recall ${r(di.recall, 3)} in ${r(di.latency, 2)} ms.`,
  explain: (p, m) =>
    str(p, "index") === "flat"
      ? `Exact search: perfect recall but ${m.latencyMs.toFixed(0)} ms per query, growing linearly with N. Fine for small collections, too slow at scale.`
      : `${(m.recallAt10 * 100).toFixed(1)}% of true neighbours found in ${m.latencyMs.toFixed(2)} ms (~${Math.round(m.qpsPerCore).toLocaleString("en-US")} queries/s/core), using ${Math.round(m.memoryMb).toLocaleString("en-US")} MB. Pushing recall from 95% to 99% costs much more latency than 90% to 95%.`,
};
