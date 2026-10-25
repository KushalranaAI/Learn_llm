// Lab: an internal-docs assistant that hallucinates. Diagnose retrieval versus generation, then add retrieval, reranking and a scalable index.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

const users = { rps: 20, groundedShare: 0.8, hardShare: 0.3, repeatShare: 0.1 };
const model = { model: "medium", rateLimitRps: 100 };

/** users > [retriever] > [reranker] > model. */
const bot = (retriever?: NodeConfig, reranker?: NodeConfig): Graph => {
  const nodes: Parameters<typeof build>[0] = { users: ["users", users] };
  const chain = ["users"];
  if (retriever) {
    nodes.retriever = ["retriever", retriever];
    chain.push("retriever");
  }
  if (reranker) {
    nodes.reranker = ["reranker", reranker];
    chain.push("reranker");
  }
  nodes.llm = ["llm-api", model, "Assistant model"];
  chain.push("llm");
  return build(nodes, chain.join(" > "));
};

export const fixTheRagBot: Lab = {
  slug: "fix-the-rag-bot",
  module: "retrieval-and-rag",
  title: "Fix the RAG bot",
  product: "An internal-docs assistant that makes things up",
  summary: "Employees say the company's docs assistant invents policies. Work out whether retrieval or generation is at fault, then fix it step by step in the sandbox: add retrieval, trim the noise with a reranker, and make the index survive a slow vector database.",
  difficulty: "hard",
  minutes: 45,
  tags: ["RAG", "retrieval", "recall@k", "reranking", "vector index", "hallucination", "sandbox"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A company has launched an assistant for its employees: *"How many vacation days do new hires get?"*, *"What is the process for a vendor security review?"*. Most questions (about 80%) can only be answered from internal documents the model has never seen.

The first version sends each question straight to a general model. Employees report confident, wrong answers about policy. Your job is to fix it in four moves:

1. **Diagnose**: is the failure in retrieval (the right passage never reached the model) or in generation (the model had it and ignored it)?
2. **Add retrieval**: embed the question, find the top-$k$ chunks, put them in the prompt.
3. **Rerank**: retrieve many candidates cheaply, then let a stronger model keep the best few.
4. **Harden**: keep the system fast and correct when the vector database slows down.

A RAG answer needs two things to go right:

$$P(\text{correct}) \approx P(\text{relevant chunk retrieved})\times P(\text{model uses it faithfully}) + P(\text{no chunk})\times P(\text{lucky guess})$$

so you must measure both factors separately before changing anything.`,
    },
    {
      type: "quiz",
      title: "Diagnose first",
      body: r`You log 100 failed questions. For each, you check whether the passage containing the answer was in the prompt the model received.

- In **64** cases the right passage was **not** in the prompt.
- In **36** cases it was there and the model still answered wrongly.`,
      question: "Where should the team start?",
      options: [
        { text: "Retrieval: in 64% of failures the model never saw the answer, so no prompt or model change could have fixed those cases", correct: true, why: "Right. Fix the larger, upstream failure first. Retrieval recall is the ceiling on RAG accuracy. Then look at the 36 faithfulness failures (better prompts, citations, a stronger model)." },
        { text: "Switch to a bigger model: it will know more", why: "A bigger model still has never seen your internal documents. It would hallucinate more fluently, not more accurately." },
        { text: "Fine-tune the model on the whole document set", why: "Fine-tuning teaches style and skills, not reliable facts, and it cannot cite sources or track document updates. Retrieval is the right tool for this." },
        { text: "Both are equally important, so split the effort evenly", why: "The numbers say otherwise. Spend effort where the failures are, and note the faithfulness errors only matter once retrieval stops dropping the answer." },
      ],
    },
    {
      type: "math",
      title: "Recall at k",
      body: r`Suppose each retrieved chunk independently has a probability $\rho = 0.28$ of being a relevant one for a typical question (a rough model of a dense retriever). Retrieving $k$ chunks gives

$$\text{recall@}k = 1 - (1-\rho)^k$$

the chance that at least one relevant chunk is among them.`,
      question: r`What is recall@8 for $\rho = 0.28$? (Four decimals.)`,
      answer: 0.9278,
      tolerance: 0.005,
      hint: r`$(1-0.28)^8 = 0.72^8$.`,
      solution: r`$$0.72^8 = 0.0722$$

$$\text{recall@}8 = 1 - 0.0722 = 0.9278$$

For comparison, $k=3$ gives $1-0.72^3 = 0.627$ and $k=5$ gives $0.807$. Each extra chunk helps less than the last, but each also costs prompt tokens (about 300 per chunk) and dilutes the context. That tension is the whole design problem.`,
    },
    {
      type: "design",
      title: "Step 1: let the model see the documents",
      body: r`The current design sends every question straight to the model. Add a **retriever** (vector database) in between so the model receives relevant chunks.

Targets: answer quality of at least **0.75** (it is 0.41 now), at most **\$0.015 per request**, and the design must contain a retriever. Start with a modest number of chunks.`,
      starter: bot(),
      palette: ["retriever", "reranker", "semantic-cache", "llm-api"],
      test: {
        constraints: [
          { type: "requires", kind: "retriever", why: "Without retrieval the model guesses on the 80% of questions that need private documents." },
          { type: "quality", min: 0.75, why: "Quality is low because the model is hallucinating about documents it never saw." },
          { type: "costPerRequest", maxUsd: 0.015, why: "Every retrieved chunk adds about 300 prompt tokens. Do not retrieve more than you need." },
        ],
      },
      hints: [
        "Wire Users → Retriever → Model, and remove the direct Users → Model edge.",
        "A top-k of 3 is too few, 40 is far too many. Look at how quality changes when you move it.",
        "Retriever with top-k = 5, then the model.",
      ],
      solution: bot({ topK: 5, index: "hnsw", docsMillions: 5 }),
    },
    {
      type: "design",
      title: "Step 2: fewer, better chunks",
      body: r`Someone "improved" recall by raising top-k to **40**. Quality fell to 0.68, the first token takes 2.5 s and a request costs four cents: 40 chunks is 12,000 tokens of mostly irrelevant text, and noise in the context makes the model worse.

Fix it with a **reranker**: keep retrieving many candidates (cheap), then let a cross-encoder rescore them and pass only the best few. Targets: quality at least **0.82**, p99 first token within **1.5 s**, at most **\$0.012 per request**, and a reranker in the design.`,
      starter: bot({ topK: 40, index: "hnsw", docsMillions: 5 }),
      palette: ["retriever", "reranker", "semantic-cache", "llm-api"],
      test: {
        constraints: [
          { type: "requires", kind: "reranker", why: "A reranker reads the question and each chunk together, which is much more accurate than vector similarity alone." },
          { type: "quality", min: 0.82, why: "Forty raw chunks bury the answer in noise." },
          { type: "ttft", maxMs: 1500, why: "Long prompts take longer to prefill: first-token time grows with every chunk." },
          { type: "costPerRequest", maxUsd: 0.012, why: "You pay for every prompt token. Keep only the best few chunks." },
        ],
      },
      hints: [
        "Place the reranker after the retriever and before the model.",
        "The reranker has two settings: how many candidates to score (depth) and how many to keep.",
        "Retrieve 20 (top-k 20), rerank all 20, and keep 4.",
      ],
      solution: bot({ topK: 20, index: "hnsw", docsMillions: 5 }, { depth: 20, keep: 4 }),
    },
    {
      type: "sim",
      title: "How deep should the reranker go?",
      body: r`Reranking more candidates raises the chance the right chunk is among them, but each candidate costs about 2 ms of cross-encoder time, and a deeper list also gives distractors more chances to outrank the right chunk.

With dense first-stage retrieval and 5 chunks kept, the default depth of 50 reaches 94% recall at 130 ms. The SLO is **120 ms**. Find a depth that keeps recall@5 at or above **93%** within the latency limit.`,
      sim: "rerank-depth",
      params: { candidates: 50, k: 5, firstStage: "dense", rerankerAuc: 0.97, msPerDoc: 2 },
      locked: ["k", "firstStage", "rerankerAuc", "msPerDoc"],
      goals: [
        { metric: "recallAtK", op: ">=", value: 0.93, label: "Recall@5 after reranking at least 93%" },
        { metric: "latencyMs", op: "<=", value: 120, label: "Latency at most 120 ms" },
      ],
      hints: [
        "Latency is 30 ms plus 2 ms per candidate, so there is a ceiling on depth.",
        "Recall of the candidate pool grows with depth but with diminishing returns.",
        "Depth 40 gives 93.5% recall at 110 ms.",
      ],
      solution: { candidates: 40 },
    },
    {
      type: "design",
      title: "Step 3: the vector database slows down",
      body: r`The corpus has grown to **20 million chunks**. The design below uses a **flat (exact) index**, which scans every vector: on a normal day it answers only 66% of requests, and during a slow-vector-database incident (the database 10x slower) it collapses.

Rebuild it so that it answers at least **99% of requests on a normal day and during the incident**, keeps quality at least **0.82**, and keeps the p99 first token within **2 s even during the incident**.

Consider the index type, and the replicas that share the load.`,
      starter: bot({ topK: 20, index: "flat", docsMillions: 20, replicas: 1 }, { depth: 20, keep: 4 }),
      palette: ["retriever", "reranker", "semantic-cache", "llm-api"],
      test: {
        constraints: [
          { type: "successRate", min: 0.99, why: "An exact scan over 20M vectors cannot keep up with 20 queries per second." },
          { type: "successRate", min: 0.99, under: { type: "slowVectorDb", factor: 10 }, label: "Success rate ≥ 99% when the vector DB is 10x slower", why: "A single replica saturates when search is slow." },
          { type: "ttft", maxMs: 2000, under: { type: "slowVectorDb", factor: 10 }, label: "p99 first token ≤ 2 s when the vector DB is 10x slower", why: "A saturated retriever adds queueing delay to every request." },
          { type: "quality", min: 0.82, why: "A heavily compressed index (IVF-PQ) loses too much recall for this bar." },
        ],
      },
      hints: [
        "A flat index compares the query with all 20 million vectors. Pick an approximate index.",
        "IVF-PQ is cheap but its recall is lower and quality drops under 0.82.",
        "Use HNSW, and add replicas so the load is shared when search gets slow.",
      ],
      solution: bot({ topK: 20, index: "hnsw", docsMillions: 20, replicas: 2 }, { depth: 20, keep: 4 }),
    },
    {
      type: "sim",
      title: "Retriever, k and cost together",
      body: r`The RAG pipeline model ties it all together: **retriever type**, **top-k** and chunk size set recall; context length sets cost and latency and slightly lowers faithfulness (long contexts are noisier).

Starting from dense retrieval with $k = 5$ (74% answer accuracy), reach at least **82% answer accuracy** while spending at most **\$0.0095 per query**. Do not touch the chunk size or the model's faithfulness.`,
      sim: "rag-pipeline",
      params: { k: 5, chunkTokens: 300, retriever: "dense", faithfulness: 0.92 },
      locked: ["chunkTokens", "faithfulness"],
      goals: [
        { metric: "answerAccuracy", op: ">=", value: 0.82, label: "Answer accuracy at least 82%" },
        { metric: "costPerQuery", op: "<=", value: 0.0095, label: "Cost at most \$0.0095 per query" },
      ],
      hints: [
        "Hybrid retrieval (keyword + embeddings) finds more of the relevant chunks at the same k.",
        "Each extra chunk raises cost linearly; the cost limit allows about 6 chunks of 300 tokens.",
        "Hybrid retriever with k = 6.",
      ],
      solution: { retriever: "hybrid", k: 6 },
    },
  ],
};
