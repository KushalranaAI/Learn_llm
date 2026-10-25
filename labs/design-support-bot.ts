// Lab: design a customer-support assistant end to end. Requirements first, then ground it, guard it, and make it survive a provider outage.
import { build } from "@/sandbox/presets";
import type { Graph, NodeConfig } from "@/sandbox/types";
import type { Lab } from "./types";

const r = String.raw;

const users = { rps: 15, groundedShare: 0.7, attackShare: 0.03, hardShare: 0.35, repeatShare: 0.25, promptTokens: 1200, outputTokens: 250 };
const medium = (provider: string): [ "llm-api", NodeConfig, string ] => ["llm-api", { model: "medium", provider, rateLimitRps: 100 }, `Model (provider ${provider.toUpperCase()})`];
const retrieval: Record<string, [ "retriever", NodeConfig ] | [ "reranker", NodeConfig ]> = {
  retriever: ["retriever", { topK: 20, index: "hnsw", docsMillions: 2 }],
  reranker: ["reranker", { depth: 20, keep: 4 }],
};

/** The first design: ground the model in documents. */
const grounded = (): Graph =>
  build({ users: ["users", users], retriever: retrieval.retriever, reranker: retrieval.reranker, llm: medium("a") }, "users > retriever > reranker > llm");

/** Add the edge and safety layers. */
const safe = (): Graph =>
  build(
    {
      users: ["users", users],
      gateway: ["gateway", { auth: true }],
      guardIn: ["input-guardrail", { model: "classifier", threshold: 0.5 }],
      retriever: retrieval.retriever,
      reranker: retrieval.reranker,
      llm: medium("a"),
      guardOut: ["output-guardrail", { model: "classifier", threshold: 0.5 }],
    },
    "users > gateway > guardIn > retriever > reranker > llm > guardOut",
  );

/** The finished design: cache, a fallback on a second provider, and observability. */
const resilient = (): Graph =>
  build(
    {
      users: ["users", users],
      gateway: ["gateway", { auth: true }],
      guardIn: ["input-guardrail", { model: "classifier", threshold: 0.5 }],
      cache: ["semantic-cache", { similarity: 0.95 }],
      retriever: retrieval.retriever,
      reranker: retrieval.reranker,
      fallback: ["fallback", { timeoutMs: 8000 }],
      primary: medium("a"),
      backup: medium("b"),
      guardOut: ["output-guardrail", { model: "classifier", threshold: 0.5 }],
      obs: ["observability"],
    },
    "users > gateway > guardIn > cache > retriever > reranker > fallback > primary > guardOut, fallback > backup > guardOut",
  );

export const designSupportBot: Lab = {
  slug: "design-support-bot",
  module: "llm-system-design",
  title: "Design the support bot",
  product: "A customer-support assistant for a bank",
  summary: "Design a bank's support assistant end to end. Start from requirements, estimate the bill by hand, then build it in three sandbox steps (grounded answers, safety, resilience) while checking the numbers in the simulators.",
  difficulty: "hard",
  minutes: 45,
  tags: ["system design", "RAG", "guardrails", "fallbacks", "caching", "cost", "availability", "sandbox"],
  steps: [
    {
      type: "intro",
      title: "The brief",
      body: r`A retail bank wants an AI assistant in its mobile app and web chat to answer questions about accounts, cards, fees and disputes. You are the engineer asked to design it.

**The requirements** (you will meet these as test checks later):

- **Traffic**: 15 requests/s at peak, about 1,200 prompt tokens and 250 output tokens each.
- **Grounding**: 70% of questions need the bank's policy documents.
- **Safety**: about 3% of traffic is prompt-injection or abuse, and none may reach the model unchecked. Real customers must not be blocked.
- **Experience**: the first token within about 1.8 s (streaming).
- **Quality**: answers judged good at least 80% of the time.
- **Cost**: about one cent per request.
- **Availability**: the model provider will have outages. The assistant must stay up.

A good design follows a framework: **requirements, then numbers, then the request path, then failure modes, then what you measure**. This lab walks the same path, with every step checked by a simulator.`,
    },
    {
      type: "quiz",
      title: "Start with the numbers",
      body: r`A teammate wants to start by choosing a vector database and a frontier model. You think the right first step is different.`,
      question: "Which is the best first step in an LLM system design?",
      options: [
        { text: "Pin down requirements and constraints (traffic, latency, quality bar, safety, budget, availability), then size the system from them", correct: true, why: "Right. Every later choice (model tier, retrieval depth, caching, fallback) is a trade-off against one of these numbers. Without them you cannot tell a good design from a fashionable one." },
        { text: "Pick the largest model available so quality is never a problem", why: "The largest model breaks cost and latency targets for most products. The model is one decision among many, and often the cheapest to change." },
        { text: "Build the whole pipeline first and measure afterwards", why: "Measuring afterwards turns design mistakes (wrong model tier, no fallback) into rework. A back-of-envelope estimate first catches most of them." },
        { text: "Fine-tune a model on past chats", why: "Fine-tuning is a possible later optimisation, not a first step. Most of the problems here (grounding, safety, availability) are solved outside the model." },
      ],
    },
    {
      type: "math",
      title: "The back-of-envelope bill",
      body: r`The bot retrieves **4 chunks of 300 tokens** for every question and passes them to a **medium** model priced at **\$3 per million input tokens** and **\$15 per million output tokens**.

- Input per request: $1200 + 4\times 300$ tokens
- Output per request: $250$ tokens
- Traffic: 15 requests/s for a 30-day month ($2{,}592{,}000$ seconds)

Ignore caching and guardrail costs for this estimate.`,
      question: r`What is the monthly model bill in dollars?`,
      answer: 425736,
      tolerance: 0.02,
      unit: "USD / month",
      hint: r`Cost per request $= (2400\times 3 + 250\times 15)/10^6$. Requests per month $= 15\times 2{,}592{,}000$.`,
      solution: r`**Per request.**

$$\frac{2400\times 3 + 250\times 15}{10^6} = \frac{7200 + 3750}{10^6} = \$0.01095$$

**Per month.**

$$15\times 2{,}592{,}000 = 38{,}880{,}000\text{ requests}$$

$$38{,}880{,}000\times 0.01095 = \$425{,}736$$

About 1.1 cents per request, just over the one-cent target. Two thirds of the input bill is the retrieved context, so the savings come from retrieving less (a reranker), not answering repeated questions twice (a cache), and not paying for requests that guardrails reject. Those are exactly the moves you will make.`,
    },
    {
      type: "design",
      title: "Step 1: ground the answers",
      body: r`The first prototype sends every question straight to a medium model: it hallucinates policy details (quality 0.46) and it has no access to the bank's documents.

Add **retrieval** with a **reranker** so the model sees the right passages, and keep the bill reasonable. Targets: answer quality at least **0.8**, p99 first token within **1.8 s**, at most **\$0.012 per request**, and both a retriever and a reranker in the design.`,
      starter: build({ users: ["users", users], llm: medium("a") }, "users > llm"),
      palette: ["retriever", "reranker", "semantic-cache", "llm-api", "gateway"],
      test: {
        constraints: [
          { type: "requires", kind: "retriever", why: "70% of questions need the bank's own documents, which the model has never seen." },
          { type: "requires", kind: "reranker", why: "Retrieve many candidates cheaply, then keep only the best few: better quality in fewer prompt tokens." },
          { type: "quality", min: 0.8, why: "Without grounding the model guesses on most questions." },
          { type: "ttft", maxMs: 1800, why: "Retrieval adds a little time but a shorter prompt gives it back." },
          { type: "costPerRequest", maxUsd: 0.012, why: "Every retrieved chunk is billed as input tokens." },
        ],
      },
      hints: [
        "Wire Users → Retriever → Reranker → Model.",
        "Retrieve about 20 candidates and keep the best 4 after reranking.",
        "Retriever top-k 20, reranker depth 20 and keep 4.",
      ],
      solution: grounded(),
    },
    {
      type: "design",
      title: "Step 2: keep attackers out, keep customers in",
      body: r`Three percent of traffic is attacks, and today every one of them is answered. Add the safety layers around your grounded design: a **gateway** at the edge (authentication stops scripted attacks) and an **input** and **output guardrail** (defence in depth).

Targets: at most **3% of attacks** get an answer, **99%** of real customers still succeed, first token within **1.8 s**, quality at least **0.8**, at most **\$0.012 per request**.`,
      starter: grounded(),
      palette: ["gateway", "input-guardrail", "output-guardrail", "retriever", "reranker", "semantic-cache", "llm-api"],
      test: {
        constraints: [
          { type: "requires", kind: "gateway", why: "Authentication removes about 30% of attack traffic before it costs anything." },
          { type: "requires", kind: "input-guardrail", why: "Stops obvious attacks before they reach the model." },
          { type: "requires", kind: "output-guardrail", why: "Catches leaks and attacks that slipped past the input check." },
          { type: "attacksLeaked", max: 0.03, why: "Right now every attack reaches the model." },
          { type: "successRate", min: 0.99, why: "Thresholds that are too strict block real customers." },
          { type: "ttft", maxMs: 1800 },
          { type: "quality", min: 0.8 },
          { type: "costPerRequest", maxUsd: 0.012 },
        ],
      },
      hints: [
        "Put the gateway first, then the input guardrail before retrieval, and the output guardrail after the model.",
        "A small classifier at threshold 0.5 is a good starting point for both guardrails.",
        "Users → Gateway → Input guardrail → Retriever → Reranker → Model → Output guardrail.",
      ],
      solution: safe(),
    },
    {
      type: "sim",
      title: "Check the retrieval numbers",
      body: r`Before adding resilience, check the retrieval choice against the budget in the RAG model. The prototype uses dense retrieval with 5 chunks (74% accurate). Meet all three: answer accuracy at least **80%**, latency at most **2,150 ms**, and cost at most **\$0.008 per query**.`,
      sim: "rag-pipeline",
      params: { k: 5, chunkTokens: 300, retriever: "dense", faithfulness: 0.92 },
      locked: ["chunkTokens", "faithfulness"],
      goals: [
        { metric: "answerAccuracy", op: ">=", value: 0.8, label: "Answer accuracy at least 80%" },
        { metric: "latencyMs", op: "<=", value: 2150, label: "Latency at most 2,150 ms" },
        { metric: "costPerQuery", op: "<=", value: 0.008, label: "Cost at most \$0.008 per query" },
      ],
      hints: [
        "Recall rises with k but cost rises too. Is there another way to raise recall?",
        "Hybrid retrieval (keyword plus embeddings) finds more at the same k.",
        "Keep k = 5 and switch the retriever to hybrid.",
      ],
      solution: { retriever: "hybrid" },
    },
    {
      type: "sim",
      title: "How much does a fallback buy?",
      body: r`The primary provider is 99.5% available, the backup 99%, and their outages are slightly correlated (0.1). Without a fallback the assistant is down about 13 hours a month.

Turn on the fallback and meet the SLO: availability at least **99.9%** and at most **45 minutes** of downtime a month.`,
      sim: "fallback-availability",
      params: { primaryAvail: 0.995, fallbackAvail: 0.99, correlation: 0.1, timeoutMs: 3000, primaryP50: 800, fallback: false },
      locked: ["primaryAvail", "fallbackAvail", "correlation", "timeoutMs", "primaryP50"],
      goals: [
        { metric: "availability", op: ">=", value: 0.999, label: "Availability at least 99.9%" },
        { metric: "downtimeMinPerMonth", op: "<=", value: 45, label: "At most 45 minutes of downtime a month" },
      ],
      hints: [
        "With independent failures the combined unavailability is the product of the two unavailabilities.",
        "0.5% × 1% = 0.005% for the pair; correlation raises it a little.",
        "Switch the fallback on.",
      ],
      solution: { fallback: true },
    },
    {
      type: "design",
      title: "Step 3: survive the outage and trim the cost",
      body: r`Provider A has an outage and your assistant answers nothing: the design has a single model and no cache. Finish the design:

- add a **fallback** with a backup model on **provider B** (a backup on the same provider fails with it),
- add a **semantic cache** in front of retrieval for the 25% of repeated questions,
- add **observability**,

so that: at least **99%** of requests succeed on a normal day **and during a provider A outage**, the first token stays within **2 s during the outage**, cost is at most **\$0.0105 per request**, at least **8%** of requests are answered from the cache, and quality stays at least **0.8**.`,
      starter: safe(),
      palette: ["gateway", "input-guardrail", "output-guardrail", "semantic-cache", "retriever", "reranker", "fallback", "llm-api", "observability"],
      test: {
        constraints: [
          { type: "successRate", min: 0.99 },
          { type: "successRate", min: 0.99, under: { type: "providerOutage", provider: "a" }, label: "Success rate ≥ 99% during a provider A outage", why: "With one provider, an outage takes everything down. The backup must be on a different provider." },
          { type: "ttft", maxMs: 2000, under: { type: "providerOutage", provider: "a" }, label: "p99 first token ≤ 2 s during the outage", why: "A long fallback timeout makes every failed-over request slow." },
          { type: "costPerRequest", maxUsd: 0.0105, why: "The cache answers repeated questions without a model call." },
          { type: "cacheHitRate", min: 0.08, why: "A quarter of questions repeat: a cache should catch a good share." },
          { type: "quality", min: 0.8, why: "A similarity threshold that is too loose returns the answer to a different question." },
          { type: "requires", kind: "fallback", why: "Automatic failover is what keeps the bot up." },
          { type: "requires", kind: "observability", why: "Traces and online evals show failover and quality drift." },
        ],
      },
      hints: [
        "The fallback node needs two outputs: the first is the primary model, the second the backup. Put the backup on provider B.",
        "Place the cache before the retriever so a hit skips retrieval and the model entirely. Keep similarity high (0.95).",
        "Gateway → Input guard → Cache → Retriever → Reranker → Fallback → (Model A, Model B) → Output guard, plus an Observability node.",
      ],
      solution: resilient(),
    },
  ],
};
