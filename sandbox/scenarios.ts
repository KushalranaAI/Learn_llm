// Sandbox starting points, opened from lessons and labs with /sandbox?s=<id>. Pure data (no React):
// server components import SCENARIOS for titles and summaries.
import { build } from "./presets";
import type { Graph, Incident } from "./types";

export type ScenarioGroup = "Basics" | "Retrieval" | "Agents" | "Production" | "Evaluation" | "Case studies";

export interface Scenario {
  id: string;
  title: string;
  summary: string;
  group: ScenarioGroup;
  graph: Graph;
  /** things to try, shown in the guide */
  tryThis: string[];
  /** incident pre-selected in the sandbox */
  incident?: Incident;
}

export const SCENARIO_GROUPS: ScenarioGroup[] = ["Basics", "Retrieval", "Agents", "Production", "Evaluation", "Case studies"];

export const SCENARIOS: Scenario[] = [
  // ---------------------------------------------------------------- Basics
  {
    id: "llm-serving-basic",
    title: "Serve an open model on your own GPU",
    summary: "One 8B model on one A10G, with more traffic than it can take. Find the cheapest way to serve it.",
    group: "Basics",
    graph: build(
      {
        users: ["users", { rps: 3, promptTokens: 800, outputTokens: 300 }],
        llm: ["llm-selfhost", { model: "8B", gpu: "A10G", replicas: 1, batching: true, maxBatch: 32 }],
      },
      "users > llm",
    ),
    tryThis: [
      "Run it: the single GPU is over capacity, so requests queue and time out.",
      "Turn continuous batching off and run again - throughput collapses, because each decode step streams all 16 GB of weights for just one request.",
      "Add replicas until success is above 99%, then try INT8 quantization or an H100 instead and compare cost per month.",
    ],
  },
  {
    id: "semantic-cache",
    title: "Cut model spend with a semantic cache",
    summary: "A FAQ-style assistant where half the questions repeat. How much can a cache save, and what does it cost in quality?",
    group: "Basics",
    graph: build(
      {
        users: ["users", { rps: 10, repeatShare: 0.6, hardShare: 0.2 }],
        cache: ["semantic-cache", { similarity: 0.9 }],
        llm: ["llm-api", { model: "medium", rateLimitRps: 8 }],
      },
      "users > cache > llm",
    ),
    tryThis: [
      "Lower the similarity threshold: the hit rate climbs and cost falls, but watch quality - false hits answer the wrong question.",
      "Delete the cache and compare cost per month.",
      "Inject a cache flush: every request hits the model at once - more than its rate limit - until the cache refills.",
      "Raise the model's rate limit so a cold cache can't take you down.",
    ],
    incident: { type: "cacheFlush" },
  },
  {
    id: "model-router",
    title: "Route easy queries to a small model",
    summary: "70% of questions are easy. Send them to a model that costs 25× less, and keep quality high for the hard ones.",
    group: "Basics",
    graph: build(
      {
        users: ["users", { rps: 10, hardShare: 0.3 }],
        router: ["router", { threshold: 0.6 }],
        small: ["llm-api", { model: "small" }],
        large: ["llm-api", { model: "large" }],
      },
      "users > router > small, router > large",
    ),
    tryThis: [
      "Slide the router's confidence threshold: lower sends more to the small model (cheaper), higher protects quality.",
      "Replace the router with only the large model and compare cost and quality.",
      "Change the users' share of hard queries and see how the best threshold moves.",
    ],
  },

  // ---------------------------------------------------------------- Retrieval
  {
    id: "rag-basic",
    title: "Answer from your own documents (RAG)",
    summary: "Most questions are about internal docs the model has never seen. Without retrieval it guesses.",
    group: "Retrieval",
    graph: build(
      {
        users: ["users", { rps: 5, groundedShare: 0.8, hardShare: 0.3 }],
        llm: ["llm-api", { model: "medium" }],
        retriever: ["retriever", { topK: 3, index: "hnsw", docsMillions: 1 }],
      },
      "users > llm",
    ),
    tryThis: [
      "Run it first: quality is low because the model hallucinates on questions about your documents.",
      "Wire Users → Retriever → LLM (remove the direct edge). Quality jumps.",
      "Raise top-k: recall goes up, but every chunk makes the prompt longer - cost and TTFT grow, and past ~10 chunks the noise hurts.",
    ],
  },
  {
    id: "rag-production",
    title: "Production RAG: rerank, cache, guard",
    summary: "A full retrieval pipeline. Tune recall, latency and cost - and see what a slow vector database does to it.",
    group: "Retrieval",
    graph: build(
      {
        users: ["users", { rps: 30, groundedShare: 0.8, repeatShare: 0.3, attackShare: 0.02 }],
        gateway: ["gateway", { auth: true }],
        guard: ["input-guardrail", { model: "classifier", threshold: 0.5 }],
        cache: ["semantic-cache", { similarity: 0.93 }],
        retriever: ["retriever", { topK: 40, index: "hnsw", docsMillions: 20, replicas: 1 }],
        rerank: ["reranker", { depth: 40, keep: 4 }],
        llm: ["llm-api", { model: "medium", rateLimitRps: 200, promptCache: true }],
        out: ["output-guardrail", { model: "classifier", threshold: 0.5 }],
        obs: ["observability"],
      },
      "users > gateway > guard > cache > retriever > rerank > llm > out",
    ),
    tryThis: [
      "Remove the reranker (wire Retriever → LLM) and compare quality and cost: 40 raw chunks are long and noisy.",
      "Inject \"slow vector DB\" and watch the retriever saturate. Add replicas or switch to IVF-PQ.",
      "Try a flat (exact) index on the 20M-chunk corpus to see why approximate indexes exist.",
    ],
    incident: { type: "slowVectorDb", factor: 10 },
  },

  // ---------------------------------------------------------------- Agents
  {
    id: "support-agent",
    title: "Customer-support agent with tools",
    summary: "An agent that looks up orders and policies before answering. Every extra step adds latency and another chance to fail.",
    group: "Agents",
    graph: build(
      {
        users: ["users", { rps: 2, hardShare: 0.4, promptTokens: 1500, outputTokens: 250 }],
        guard: ["input-guardrail"],
        agent: ["agent", { steps: 5, stepSuccess: 0.93, retries: 0 }],
        llm: ["llm-api", { model: "medium", rateLimitRps: 100 }],
        orders: ["tool", { latencyMs: 400, failureRate: 0.03 }, "Orders API"],
        kb: ["retriever", { topK: 5 }],
      },
      "users > guard > agent > llm, agent > orders, agent > kb",
    ),
    tryThis: [
      "Task success is per-step success to the power of steps. Allow 1 retry per step and compare.",
      "Cut the steps from 5 to 3 (a better prompt or a single combined tool) - faster and more reliable.",
      "Make the Orders API flaky (failure rate 15%) and see how it compounds over steps.",
    ],
  },
  {
    id: "code-assistant",
    title: "Code assistant (case study)",
    summary: "Long prompts full of code, streaming answers, developers who notice every 100 ms of TTFT.",
    group: "Case studies",
    graph: build(
      {
        users: ["users", { rps: 10, promptTokens: 4000, outputTokens: 400, hardShare: 0.45, repeatShare: 0.1, tenants: 200 }],
        gateway: ["gateway", { auth: true, maxOutputTokens: 1000 }],
        router: ["router", { threshold: 0.6 }],
        small: ["llm-api", { model: "small", rateLimitRps: 300 }],
        large: ["llm-api", { model: "large", rateLimitRps: 7 }],
        obs: ["observability"],
      },
      "users > gateway > router > small, router > large",
    ),
    tryThis: [
      "The large model is close to its rate limit. Raise the router threshold and watch it go over: 429s.",
      "Turn on prompt caching on both models: 4k-token prompts share a long prefix, so input cost and TTFT both drop.",
      "Inject a 3× traffic spike. Which component fails first?",
    ],
  },

  // ---------------------------------------------------------------- Production
  {
    id: "guarded-assistant",
    title: "Guardrails against prompt injection",
    summary: "5% of traffic is attacks. Block them without refusing your real users.",
    group: "Production",
    graph: build(
      {
        users: ["users", { rps: 10, attackShare: 0.05 }],
        llm: ["llm-api", { model: "medium" }],
      },
      "users > llm",
    ),
    tryThis: [
      "Run it: every attack reaches the model and gets an answer (leaked).",
      "Add an input guardrail in front of the model, then an output guardrail after it. Defence in depth: each catches what the other misses.",
      "Lower the threshold to catch more attacks - and watch false blocks of real users rise. Inject an injection campaign.",
    ],
    incident: { type: "injectionCampaign", attackShare: 0.2 },
  },
  {
    id: "provider-outage",
    title: "Survive a provider outage",
    summary: "Your only model provider goes down. Add a fallback that actually helps.",
    group: "Production",
    graph: build(
      {
        users: ["users", { rps: 10 }],
        llm: ["llm-api", { model: "medium", provider: "a" }],
      },
      "users > llm",
    ),
    tryThis: [
      "Inject a provider A outage and run: success drops to zero.",
      "Add a Fallback in front of the model with a second LLM on provider A. Run the outage again - why didn't it help?",
      "Move the backup to provider B. Then check the timeout: a long timeout makes every failed-over request slow.",
    ],
    incident: { type: "providerOutage", provider: "a" },
  },
  {
    id: "llm-gateway",
    title: "LLM gateway: fair use and budgets",
    summary: "One tenant sends half of all traffic. Keep the shared model healthy for everyone, and cap runaway answers.",
    group: "Production",
    graph: build(
      {
        users: ["users", { rps: 40, tenants: 50, topTenantShare: 0.5, outputTokens: 600 }],
        gateway: ["gateway", { auth: true, perTenantRps: 0, maxOutputTokens: 0 }],
        llm: ["llm-api", { model: "small", rateLimitRps: 50 }],
      },
      "users > gateway > llm",
    ),
    tryThis: [
      "Inject a 2× spike: the model hits its rate limit and every tenant's requests fail at random.",
      "Set a per-tenant limit (say 5 rps): the noisy tenant gets 429s, everyone else is served.",
      "Set max output tokens to 300: cost and latency drop, but answers that needed more get truncated.",
    ],
    incident: { type: "trafficSpike", factor: 2 },
  },
  {
    id: "gpu-capacity",
    title: "Self-host a 70B model",
    summary: "A 70B model needs 140 GB of weights. Fit it, batch it, and decide if it beats the API on cost.",
    group: "Production",
    graph: build(
      {
        users: ["users", { rps: 6, promptTokens: 1200, outputTokens: 300 }],
        llm: ["llm-selfhost", { model: "70B", gpu: "A100", quantization: "fp16", replicas: 1, maxBatch: 64 }],
      },
      "users > llm",
    ),
    tryThis: [
      "FP16 70B needs 4 A100s per replica (tensor parallel). Try INT8: 2 GPUs, faster decode, more KV-cache room.",
      "Raise max batch and watch tokens/s per stream fall while total throughput rises - until KV memory caps it.",
      "Compare with a medium-model API at the same traffic: which is cheaper per month?",
    ],
  },
  {
    id: "bad-rollout",
    title: "Catch a bad model rollout",
    summary: "A new model version quietly answers worse. Without evals nobody notices for days.",
    group: "Production",
    graph: build(
      {
        users: ["users", { rps: 10 }],
        gateway: ["gateway"],
        llm: ["llm-api", { model: "medium" }],
      },
      "users > gateway > llm",
    ),
    tryThis: [
      "Inject the bad rollout: success stays at 100% but quality drops - no error alarm fires.",
      "Add Observability & evals and run again: the timeline shows the regression detected and rolled back.",
      "Raise the eval sample rate: faster detection, higher judge cost.",
    ],
    incident: { type: "badRollout" },
  },

  // ---------------------------------------------------------------- Evaluation
  {
    id: "eval-gated-release",
    title: "Gate releases with offline evals",
    summary: "A new model version answers worse but throws no errors. Stop it in CI with an eval gate, and size the gate so it catches regressions without blocking good releases.",
    group: "Evaluation",
    graph: build(
      {
        users: ["users", { rps: 10, hardShare: 0.3 }],
        gateway: ["gateway"],
        llm: ["llm-api", { model: "medium" }],
        obs: ["observability"],
      },
      "users > gateway > llm",
    ),
    tryThis: [
      "Run it with the bad rollout: success stays at 100% while quality falls - only the online evals notice, after users already saw bad answers.",
      "Use the guide's \"Add an eval gate\" fix (or drop an Eval gate between the gateway and the model). Run again: most bad versions are now blocked before release.",
      "Click the gate: with 50 items it catches far fewer bad versions than with 2,000. Each run of the set is paid for on every candidate - watch eval spend.",
      "Lower the threshold to 0.5 pp: more regressions caught, but the false-alarm rate on the node card shoots up. Switch the grader to assertions, then to human review, and compare catch rate and cost.",
    ],
    incident: { type: "badRollout" },
  },
  {
    id: "agent-eval-harness",
    title: "Evaluate a support agent before it ships",
    summary: "An order-support agent with two tools, tracing and an eval gate. Measure pass^3, see how tool errors compound, and decide how much evaluation is worth paying for.",
    group: "Evaluation",
    graph: build(
      {
        users: ["users", { rps: 2, hardShare: 0.4, promptTokens: 1500, outputTokens: 250 }],
        gate: ["eval-gate", { evalSetSize: 300, threshold: 3, judge: "llm-judge" }],
        agent: ["agent", { steps: 4, stepSuccess: 0.95, retries: 1 }, "Support agent"],
        llm: ["llm-api", { model: "medium", rateLimitRps: 100 }],
        orders: ["tool", { latencyMs: 400, failureRate: 0.03 }, "Orders API"],
        refunds: ["tool", { latencyMs: 600, failureRate: 0.05 }, "Refunds API"],
        obs: ["observability"],
      },
      "users > gate > agent > llm, agent > orders, agent > refunds",
    ),
    tryThis: [
      "Compare Success with the Agent pass^3 tile: pass^3 = (task success)^3 is the chance a task works on three tries in a row - what a repeat customer experiences.",
      "Raise the Refunds API failure rate to 20% and watch success and pass^3 fall: tool errors compound across steps. Then allow 2 retries per step.",
      "Inject the bad rollout: the eval gate stops most bad versions of the agent's model. Shrink the eval set to 50 and run it again.",
      "Switch the gate's grader to human review: the catch rate barely moves but the eval bill jumps. Where is the sweet spot for your budget?",
    ],
    incident: { type: "badRollout" },
  },

  // ---------------------------------------------------------------- Case studies
  {
    id: "doc-extraction",
    title: "Bulk document extraction (case study)",
    summary: "Turn invoices into JSON: long inputs, short outputs, no streaming, cost is everything.",
    group: "Case studies",
    graph: build(
      {
        users: ["users", { rps: 15, promptTokens: 5000, outputTokens: 150, hardShare: 0.15, repeatShare: 0, streaming: false, timeoutMs: 120000 }],
        llm: ["llm-api", { model: "large", rateLimitRps: 50 }],
      },
      "users > llm",
    ),
    tryThis: [
      "Input tokens dominate the bill. Try a medium or small model and check quality.",
      "Self-host an 8B model with batching: prefill-heavy work batches well. How many replicas do you need?",
      "Add a router so only the hard 15% use the large model.",
    ],
  },
  {
    id: "voice-agent",
    title: "Voice assistant (case study)",
    summary: "Speech needs the first words within ~500 ms. TTFT is the whole game.",
    group: "Case studies",
    graph: build(
      {
        users: ["users", { rps: 8, promptTokens: 1500, outputTokens: 80, hardShare: 0.15, streaming: true, timeoutMs: 5000 }],
        guard: ["input-guardrail", { model: "llm-judge" }],
        llm: ["llm-api", { model: "large" }],
      },
      "users > guard > llm",
    ),
    tryThis: [
      "p99 TTFT is far over budget. The LLM-judge guardrail alone adds ~350 ms - switch it to a classifier.",
      "A large model has a slow first token. Try small or medium, or self-host an 8B on H100s.",
      "Turn on prompt caching to shave prefill time off every turn.",
    ],
  },
  {
    id: "bank-support",
    title: "Bank support assistant (case study)",
    summary: "Regulated, grounded in policy documents, attacked daily, and it must stay up when a provider fails.",
    group: "Case studies",
    graph: build(
      {
        users: ["users", { rps: 12, groundedShare: 0.7, attackShare: 0.03, hardShare: 0.35, repeatShare: 0.25 }],
        gateway: ["gateway"],
        guard: ["input-guardrail"],
        retriever: ["retriever", { topK: 30 }],
        rerank: ["reranker", { keep: 4 }],
        fallback: ["fallback", { timeoutMs: 10000 }],
        primary: ["llm-api", { model: "medium", provider: "a" }],
        backup: ["llm-api", { model: "medium", provider: "b" }],
        out: ["output-guardrail"],
        obs: ["observability"],
      },
      "users > gateway > guard > retriever > rerank > fallback > primary > out, fallback > backup > out",
    ),
    tryThis: [
      "Run every what-if: traffic ×2, provider down, cache flushed. Which one hurts most?",
      "Add a semantic cache before the retriever. Is a 25% repeat rate worth the false-hit risk for a bank?",
      "Tighten both guardrails until attacks leaked < 0.5%, and keep false blocks under 2%.",
    ],
    incident: { type: "providerOutage", provider: "a" },
  },
];

export const getScenario = (id: string) => SCENARIOS.find((s) => s.id === id);
