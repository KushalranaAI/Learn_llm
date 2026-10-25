import { describe, expect, it } from "vitest";
import { SIMS_B } from "../registry-b";
import type { Params, SimDef } from "../types";
import { PRESETS, rankAll, evalRanking } from "./retrieval-compare";
import { mulberry32, binomCdf, normCdf, normInv } from "./lib";

const byId = Object.fromEntries(SIMS_B.map((s) => [s.id, s])) as Record<string, SimDef>;
const run = (id: string, over: Params = {}) => byId[id].compute({ ...byId[id].defaults, ...over });

const IDS = [
  "prompt-cache", "constrained-decoding", "ab-significance", "metric-compare", "judge-agreement", "rag-pipeline",
  "retrieval-compare", "hnsw-recall", "rerank-depth", "chunking", "agent-loop", "agent-reliability", "retry-backoff",
  "model-cascade", "fallback-availability", "token-bucket", "guardrail-threshold", "canary-rollout",
];

describe("group B registry", () => {
  it("registers every catalogue sim exactly once", () => {
    expect(SIMS_B.map((s) => s.id).sort()).toEqual([...IDS].sort());
  });
});

describe.each(SIMS_B.map((s) => [s.id, s] as const))("%s", (_id, sim) => {
  it("returns finite numbers for every declared metric on defaults, fast and deterministic", () => {
    const t = performance.now();
    const a = sim.compute(sim.defaults);
    const dt = performance.now() - t;
    for (const m of sim.metrics) expect(Number.isFinite(a[m.key]), `${sim.id}.${m.key} = ${a[m.key]}`).toBe(true);
    expect(sim.compute(sim.defaults)).toEqual(a);
    expect(dt).toBeLessThan(50); // generous for cold JIT; typical runs are < 2 ms
  });
  it("has defaults for every param and a math text and explanation", () => {
    for (const p of sim.params) expect(sim.defaults[p.key], `${sim.id} default ${p.key}`).not.toBeUndefined();
    expect(sim.math.length).toBeGreaterThan(200);
    expect(sim.math).not.toMatch(/NaN|undefined/);
    expect(typeof sim.explain?.(sim.defaults, sim.compute(sim.defaults))).toBe("string");
  });
});

describe("lib", () => {
  it("mulberry32 is seeded and in [0,1)", () => {
    const a = mulberry32(5), b = mulberry32(5);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x >= 0 && x < 1).toBe(true);
    }
  });
  it("normal and binomial helpers", () => {
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normInv(0.975)).toBeCloseTo(1.96, 2);
    expect(binomCdf(0, 10, 0.1)).toBeCloseTo(0.9 ** 10, 10);
  });
});

describe("sanity", () => {
  it("prompt-cache: higher hit rate is cheaper and faster; below break-even caching costs more", () => {
    const lo = run("prompt-cache", { hitRate: 0.3 }), hi = run("prompt-cache", { hitRate: 0.9 });
    expect(hi.costPerRequest).toBeLessThan(lo.costPerRequest);
    expect(hi.ttftMs).toBeLessThan(lo.ttftMs);
    expect(run("prompt-cache", { hitRate: 0.1 }).costSaving).toBeLessThan(0);
  });
  it("constrained-decoding: mask gives zero invalid rate; temperature raises unconstrained invalid rate", () => {
    expect(run("constrained-decoding", { constrained: true }).invalidRate).toBe(0);
    expect(run("constrained-decoding", { temperature: 1.5 }).invalidRateFree).toBeGreaterThan(run("constrained-decoding", { temperature: 0.5 }).invalidRateFree);
    const m = run("constrained-decoding", { constrained: false, calls: 10 });
    expect(m.pAnyInvalid).toBeCloseTo(1 - (1 - m.invalidRateFree) ** 10, 10);
  });
  it("ab-significance: more samples → smaller p-value and MDE, more power", () => {
    const a = run("ab-significance", { n: 500 }), b = run("ab-significance", { n: 5000 });
    expect(b.pValue).toBeLessThan(a.pValue);
    expect(b.mde).toBeLessThan(a.mde);
    expect(b.power).toBeGreaterThan(a.power);
    expect(a.pValue).toBeCloseTo(0.1138, 3);
  });
  it("metric-compare: identical pair scores 1 everywhere; paraphrase is EM 0", () => {
    const m = run("metric-compare", { pair: "exact" });
    expect(m.exactMatch).toBe(1);
    expect(m.tokenF1).toBe(1);
    expect(m.semanticSim).toBeCloseTo(1, 6);
    expect(run("metric-compare").exactMatch).toBe(0);
    expect(run("metric-compare", { pair: "case", normalise: false }).exactMatch).toBe(0);
  });
  it("judge-agreement: better judge agrees more; swap-average removes most position flips' effect", () => {
    expect(run("judge-agreement", { accuracy: 0.95 }).agreement).toBeGreaterThan(run("judge-agreement", { accuracy: 0.65 }).agreement);
    expect(run("judge-agreement", { positionBias: 0.8 }).biasRate).toBeGreaterThan(run("judge-agreement", { positionBias: 0 }).biasRate);
    expect(run("judge-agreement", { positionBias: 0.8, swapAverage: true }).agreement).toBeGreaterThan(run("judge-agreement", { positionBias: 0.8 }).agreement);
  });
  it("rag-pipeline: recall rises with k, context and cost too", () => {
    const a = run("rag-pipeline", { k: 2 }), b = run("rag-pipeline", { k: 10 });
    expect(b.recallAtK).toBeGreaterThan(a.recallAtK);
    expect(b.costPerQuery).toBeGreaterThan(a.costPerQuery);
    expect(b.faithfulness).toBeLessThan(a.faithfulness);
  });
  it("retrieval-compare: hybrid recall ≥ min(bm25, dense) on every preset, and best on average", () => {
    for (const k of [1, 3, 5]) {
      for (const p of PRESETS) {
        const r = rankAll(p.q, 1.2, 0.75);
        const [b, d, h] = [r.bm25, r.dense, r.hybrid].map((l) => evalRanking(l, p.rel, k).recall);
        expect(h, `${p.id} k=${k}`).toBeGreaterThanOrEqual(Math.min(b, d));
      }
      const mean = (method: string) => run("retrieval-compare", { method, k }).meanRecallAtK;
      expect(mean("hybrid")).toBeGreaterThanOrEqual(Math.max(mean("bm25"), mean("dense")) - 1e-9);
    }
    expect(Number.isNaN(run("retrieval-compare", { preset: "custom" }).recallAtK)).toBe(true);
  });
  it("hnsw-recall: higher efSearch → higher recall and latency; flat is exact", () => {
    const a = run("hnsw-recall", { efSearch: 32 }), b = run("hnsw-recall", { efSearch: 256 });
    expect(b.recallAt10).toBeGreaterThan(a.recallAt10);
    expect(b.latencyMs).toBeGreaterThan(a.latencyMs);
    expect(run("hnsw-recall", { index: "flat" }).recallAt10).toBe(1);
    expect(run("hnsw-recall", { M: 32 }).memoryMb).toBeGreaterThan(run("hnsw-recall", { M: 8 }).memoryMb);
    expect(run("hnsw-recall", { index: "ivf", nprobe: 64 }).recallAt10).toBeGreaterThan(run("hnsw-recall", { index: "ivf", nprobe: 4 }).recallAt10);
  });
  it("rerank-depth: reranking beats no reranking at defaults; latency grows with N", () => {
    const m = run("rerank-depth");
    expect(m.recallAtK).toBeGreaterThan(m.recallNoRerank);
    expect(m.recallAtK).toBeLessThanOrEqual(m.candidateRecall);
    expect(run("rerank-depth", { candidates: 150 }).latencyMs).toBeGreaterThan(m.latencyMs);
  });
  it("chunking: more overlap → more chunks and indexed tokens; smaller chunks → more chunks", () => {
    const a = run("chunking", { overlap: 0 }), b = run("chunking", { overlap: 40 });
    expect(b.chunks).toBeGreaterThan(a.chunks);
    expect(b.indexTokens).toBeGreaterThan(a.indexTokens);
    expect(run("chunking", { chunkSize: 60 }).chunks).toBeGreaterThan(run("chunking", { chunkSize: 300 }).chunks);
    expect(a.splitFacts).toBeGreaterThan(0);
    expect(run("chunking", { strategy: "heading", chunkSize: 200 }).splitFacts).toBe(0);
  });
  it("agent-loop: no failures → success in minimal steps; verification raises success rate", () => {
    const clean = run("agent-loop", { toolFailureRate: 0, verify: false });
    expect(clean.success).toBe(1);
    expect(clean.steps).toBe(4);
    expect(run("agent-loop", { toolFailureRate: 0.2, verify: true }).successRate).toBeGreaterThan(run("agent-loop", { toolFailureRate: 0.2, verify: false }).successRate);
    expect(run("agent-loop", { maxSteps: 3 }).success).toBe(0);
  });
  it("agent-reliability: pⁿ falls with n; retries and verification help", () => {
    expect(run("agent-reliability", { n: 20, retries: 0 }).successRate).toBeLessThan(run("agent-reliability", { n: 5, retries: 0 }).successRate);
    expect(run("agent-reliability", { retries: 0 }).successRate).toBeCloseTo(0.95 ** 10, 10);
    expect(run("agent-reliability", { verify: true }).successRate).toBeGreaterThan(run("agent-reliability").successRate);
  });
  it("retry-backoff: fixed retries storm; exponential backoff serves more with lower peak", () => {
    const f = run("retry-backoff", { strategy: "fixed" }), e = run("retry-backoff", { strategy: "exponential" }), j = run("retry-backoff", { strategy: "jitter" });
    expect(f.peakLoadX).toBeGreaterThan(e.peakLoadX);
    expect(e.successRate).toBeGreaterThan(f.successRate);
    expect(j.recoverySec).toBeLessThan(f.recoverySec);
    expect(run("retry-backoff", { strategy: "none" }).amplification).toBeCloseTo(1, 9);
  });
  it("model-cascade: higher threshold escalates more, costs more, quality not lower", () => {
    const a = run("model-cascade", { threshold: 0.4 }), b = run("model-cascade", { threshold: 0.9 });
    expect(b.escalationRate).toBeGreaterThan(a.escalationRate);
    expect(b.costPer1k).toBeGreaterThan(a.costPer1k);
    expect(b.quality).toBeGreaterThanOrEqual(a.quality);
  });
  it("fallback-availability: fallback raises availability; correlation lowers it", () => {
    expect(run("fallback-availability").availability).toBeGreaterThan(run("fallback-availability", { fallback: false }).availability);
    expect(run("fallback-availability", { correlation: 0.9 }).availability).toBeLessThan(run("fallback-availability", { correlation: 0 }).availability);
  });
  it("token-bucket: bigger bucket or faster refill rejects less; steady traffic below refill is never throttled", () => {
    expect(run("token-bucket", { bucketSize: 120 }).rejected).toBeLessThan(run("token-bucket").rejected);
    expect(run("token-bucket", { refillRate: 30 }).rejected).toBeLessThan(run("token-bucket").rejected);
    expect(run("token-bucket", { pattern: "steady" }).rejected).toBeCloseTo(0, 6);
    expect(Math.abs(run("token-bucket").rejected - (61 + 61 + 66))).toBeLessThan(1);
  });
  it("guardrail-threshold: higher threshold → higher precision, lower recall; base rate drives precision", () => {
    const a = run("guardrail-threshold", { threshold: 0.3 }), b = run("guardrail-threshold", { threshold: 0.8 });
    expect(b.precision).toBeGreaterThan(a.precision);
    expect(b.recall).toBeLessThan(a.recall);
    expect(run("guardrail-threshold", { baseRate: 0.1 }).precision).toBeGreaterThan(run("guardrail-threshold", { baseRate: 0.001 }).precision);
  });
  it("canary-rollout: P(detect) = 1 − (1 − p)^n for m = 1, and rises with duration", () => {
    const m = run("canary-rollout", { alertThreshold: 1 });
    expect(m.pDetect).toBeCloseTo(1 - (1 - 0.0005) ** m.canaryRequests, 9);
    expect(run("canary-rollout", { durationMin: 240 }).pDetect).toBeGreaterThan(run("canary-rollout").pDetect);
  });
});
