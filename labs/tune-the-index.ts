// Lab: an internal docs search with 10 million chunks. Flat scan cost and HNSW memory by hand, then tune M, efSearch and nprobe.
import type { Lab } from "./types";

const r = String.raw;

export const tuneTheIndex: Lab = {
  slug: "tune-the-index",
  module: "retrieval-and-rag",
  title: "Tune the index",
  product: "An internal documentation search",
  summary: "An internal docs search over 10 million chunks has to answer in well under a millisecond per query with high recall. Work out why an exact scan is hopeless and what an HNSW graph costs in memory, then tune efSearch, M and IVF's nprobe against recall, latency and RAM.",
  difficulty: "medium",
  minutes: 30,
  tags: ["vector search", "HNSW", "IVF", "recall", "latency", "memory", "efSearch"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A software company is building search over its internal documentation: wikis, runbooks, tickets and design docs, split into **10 million chunks**. Each chunk is embedded as a **768-dimensional** float32 vector. A question becomes a vector too, and the search returns the 10 nearest chunks.

An **exact (flat)** search compares the query with every vector. It has perfect recall and no tuning, and it is far too slow at this size. **Approximate nearest-neighbour** indexes trade a little recall for orders of magnitude of speed:

- **IVF** clusters the vectors; a query visits only the nprobe closest clusters.
- **HNSW** builds a layered graph; a query walks it greedily, keeping a candidate list of size efSearch. $M$ is the number of links per node.

Recall at 10 is the share of the true 10 nearest neighbours that the index actually returns. If the right chunk is not in the candidates, no reranker or LLM downstream can recover it. This lab is about finding the cheapest settings that keep recall high.`,
    },
    {
      type: "math",
      title: "The cost of an exact scan",
      body: r`Assume the distance between two 768-dimensional vectors costs **0.1 ns per dimension** with SIMD, so one comparison costs $768\times 0.1 = 76.8$ ns. A flat search over **1 million** vectors compares the query with all of them, plus about 0.1 ms of fixed overhead.`,
      question: r`How long does one flat query over 1,000,000 vectors take, in milliseconds?`,
      answer: 76.9,
      tolerance: 0.02,
      unit: "ms",
      hint: r`$10^{6}\times 76.8$ ns, converted to ms, plus 0.1 ms.`,
      solution: r`$$10^{6}\times 76.8\text{ ns} = 7.68\times 10^{7}\text{ ns} = 76.8\text{ ms}$$

$$76.8 + 0.1 = 76.9\text{ ms}$$

On one core that is only **13 queries per second**. At 10 million vectors it is 768 ms per query. This is why every production vector database uses an approximate index.`,
    },
    {
      type: "sim",
      title: "Replace the flat index",
      body: r`For a first test the team indexes **1 million** vectors (768 dimensions). The flat index is exact but slow. Switch to an approximate index that still returns at least **97%** of the true neighbours and answers a query in at most **2 ms**.`,
      sim: "hnsw-recall",
      params: { index: "flat", vectors: 1000000, dim: 768, M: 16, efSearch: 64, nprobe: 16 },
      locked: ["vectors", "dim"],
      goals: [
        { metric: "recallAt10", op: ">=", value: 0.97, label: "Recall@10 at least 97%" },
        { metric: "latencyMs", op: "<=", value: 2, label: "Query latency at most 2 ms" },
      ],
      hints: [
        "Flat scans every vector; compare the latency readout with the 2 ms limit.",
        "IVF and HNSW both beat flat on speed. Check which one reaches 97% recall at this size.",
        "HNSW with M = 16 and efSearch = 64 gives about 98% recall in a third of a millisecond.",
      ],
      solution: { index: "hnsw" },
    },
    {
      type: "quiz",
      title: "What do M and efSearch control?",
      body: r`Two knobs shape an HNSW index. $M$ (links per node) is fixed when the index is **built**. efSearch (the size of the candidate list while walking the graph) can be changed **per query**.`,
      question: "The team's recall is a little too low. What is the cheapest first thing to try?",
      options: [
        { text: "Raise efSearch: it needs no rebuild, and trades a bit more latency for better recall", correct: true, why: "Right. A longer candidate list explores more of the graph. Raising $M$ also helps recall but means rebuilding the index and uses more memory." },
        { text: "Rebuild the index with a much larger M first", why: "That works but is the expensive option: it needs hours of rebuild time and more RAM. Try efSearch first." },
        { text: "Switch to a flat index for the top 10 results only", why: "A flat scan over all 10 million vectors takes about 768 ms. You cannot afford it per query." },
        { text: "Lower efSearch so the graph walk is more focused", why: "A shorter candidate list makes the search faster and the recall worse, the opposite of what you need." },
      ],
    },
    {
      type: "sim",
      title: "Tune HNSW at 10 million vectors",
      body: r`At the full **10 million** vectors with $M = 16$, the index is fast but recall is only 81% because efSearch is 16. Tune it so that:

- recall@10 is at least **95%**,
- latency is at most **0.5 ms**,
- memory stays at most **32,500 MiB** (the server's budget).`,
      sim: "hnsw-recall",
      params: { index: "hnsw", vectors: 10000000, dim: 768, M: 16, efSearch: 16, nprobe: 16 },
      locked: ["index", "vectors", "dim"],
      goals: [
        { metric: "recallAt10", op: ">=", value: 0.95, label: "Recall@10 at least 95%" },
        { metric: "latencyMs", op: "<=", value: 0.5, label: "Latency at most 0.5 ms" },
        { metric: "memoryMb", op: "<=", value: 32500, label: "Memory at most 32,500 MiB" },
      ],
      hints: [
        "Raise efSearch and watch recall climb and latency grow.",
        "Keep M as it is: raising it costs memory, and you are close to the limit already.",
        "efSearch = 64 gives about 97.8% recall at about 0.35 ms.",
      ],
      solution: { efSearch: 64 },
    },
    {
      type: "math",
      title: "What the graph costs in RAM",
      body: r`An HNSW index stores each vector (float32, so $4d$ bytes) plus its graph links (about $8M$ bytes per vector), with roughly 5% extra for upper layers and bookkeeping:

$$\text{memory} \approx N\,(4d + 8M)\times 1.05\ \text{bytes}$$

Take $N = 1{,}000{,}000$, $d = 768$, $M = 16$.`,
      question: r`How many MiB does the index need? ($1\text{ MiB} = 2^{20}$ bytes.)`,
      answer: 3204,
      tolerance: 0.02,
      unit: "MiB",
      hint: r`$4d = 3072$ and $8M = 128$ bytes per vector. Multiply by $N$ and by $1.05$, then divide by $1{,}048{,}576$.`,
      solution: r`**Bytes per vector.**

$$4\times 768 + 8\times 16 = 3072 + 128 = 3200$$

**Whole index.**

$$10^{6}\times 3200\times 1.05 = 3.36\times 10^{9}\text{ bytes}$$

$$\frac{3.36\times 10^{9}}{2^{20}} = 3{,}204\text{ MiB} \approx 3.1\text{ GiB}$$

A flat index would need only $10^{6}\times 3072/2^{20} = 2{,}930$ MiB. The graph adds about 9%, so memory is dominated by the vectors themselves. At 10 million vectors the index needs about 31 GiB, which is why the budget in the last step is so tight.`,
    },
    {
      type: "sim",
      title: "Compare with IVF",
      body: r`An alternative is **IVF**: cluster the 10 million vectors and search only the nprobe nearest clusters. With nprobe = 4 it is quick but misses half of the neighbours.

Find an nprobe that reaches at least **90% recall** at **6 ms or less** per query. Then compare it with the HNSW result: same recall, many times the latency.`,
      sim: "hnsw-recall",
      params: { index: "ivf", vectors: 10000000, dim: 768, M: 16, efSearch: 64, nprobe: 4 },
      locked: ["index", "vectors", "dim"],
      goals: [
        { metric: "recallAt10", op: ">=", value: 0.9, label: "Recall@10 at least 90%" },
        { metric: "latencyMs", op: "<=", value: 6, label: "Latency at most 6 ms" },
      ],
      hints: [
        "More probes search more clusters: recall and latency both go up.",
        "At nprobe 32 recall is 84%. At 128 it is 97% but latency is almost 9 ms.",
        "Around 64 probes passes both goals.",
      ],
      solution: { nprobe: 64 },
    },
  ],
};
