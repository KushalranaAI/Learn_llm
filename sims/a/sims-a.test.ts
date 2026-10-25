import { describe, expect, it } from "vitest";
import { SIMS_A } from "../registry-a";
import type { Params, SimDef } from "../types";
import { attend } from "./attention-heatmap";
import { GB } from "./lib";

const byId = Object.fromEntries(SIMS_A.map((s) => [s.id, s])) as Record<string, SimDef>;
const run = (id: string, over: Params = {}) => byId[id].compute({ ...byId[id].defaults, ...over });

const EXPECTED_IDS = [
  "neuron", "gradient-descent", "xor-training", "bpe-tokenizer", "token-cost", "embedding-space", "attention-heatmap", "transformer-params",
  "sampling", "kv-cache-memory", "context-position", "scaling-laws", "training-memory", "lr-schedule", "preference-loss", "lora-params",
  "latency-breakdown", "roofline", "llm-batching", "quantization", "speculative-decoding", "gpu-capacity",
];

describe("group A registry", () => {
  it("registers every catalogue sim exactly once", () => {
    expect(SIMS_A.map((s) => s.id).sort()).toEqual([...EXPECTED_IDS].sort());
  });
});

describe.each(SIMS_A.map((s) => [s.id, s] as const))("%s: contract", (_id, sim) => {
  it("has defaults for every param and a math write-up", () => {
    for (const p of sim.params) expect(sim.defaults[p.key], p.key).not.toBeUndefined();
    expect(sim.math.length).toBeGreaterThan(200);
  });
  it("returns a finite number for every declared metric at defaults", () => {
    const m = sim.compute({ ...sim.defaults });
    for (const spec of sim.metrics) expect(Number.isFinite(m[spec.key]), spec.key).toBe(true);
  });
  it("is deterministic and fast", () => {
    const a = sim.compute({ ...sim.defaults });
    const b = sim.compute({ ...sim.defaults });
    expect(b).toEqual(a);
    const t = performance.now();
    sim.compute({ ...sim.defaults, __bust: Math.random() });
    expect(performance.now() - t).toBeLessThan(50);
  });
  it("explain() gives a sentence", () => {
    const m = sim.compute({ ...sim.defaults });
    if (sim.explain) expect(sim.explain(sim.defaults, m).length).toBeGreaterThan(20);
  });
});

describe("sanity checks", () => {
  it("gradient-descent: stable below 2/λmax, diverges above", () => {
    expect(run("gradient-descent").diverged).toBe(0);
    expect(run("gradient-descent", { lr: 0.21 }).diverged).toBe(1);
    expect(run("gradient-descent", { surface: "bowl", lr: 1 }).stepsToConverge).toBe(1);
    expect(run("gradient-descent", { lr: 0.05 }).stepsToConverge).toBeGreaterThan(run("gradient-descent").stepsToConverge);
  });

  it("xor-training: H=4 solves XOR, H=1 cannot beat 75%", () => {
    expect(run("xor-training").accuracy).toBe(1);
    expect(run("xor-training", { hidden: 1, epochs: 3000 }).accuracy).toBeLessThanOrEqual(0.75);
    expect(run("xor-training", { hidden: 8, data: "cloud", epochs: 1000 }).accuracy).toBeGreaterThan(0.9);
  });

  it("bpe-tokenizer: zero merges = one token per character; merges shrink the sequence", () => {
    const m0 = run("bpe-tokenizer", { merges: 0 });
    expect(m0.tokens).toBe(m0.chars);
    const m = run("bpe-tokenizer");
    expect(m.tokens).toBeLessThan(m0.tokens);
    expect(m.vocabSize).toBe(m0.vocabSize + m.mergesApplied);
    expect(run("bpe-tokenizer", { merges: 300 }).tokens).toBeLessThanOrEqual(m.tokens);
  });

  it("token-cost: linear in price and traffic", () => {
    const m = run("token-cost");
    expect(m.costPerMonth).toBeCloseTo(m.costPerDay * 30, 9);
    expect(run("token-cost", { inputPrice: 6, outputPrice: 30 }).costPerRequest).toBeCloseTo(2 * m.costPerRequest, 12);
    expect(run("token-cost", { language: "hindi" }).inputTokens).toBeGreaterThan(m.inputTokens);
  });

  it("embedding-space: king − man + woman ≈ queen; cos(a, a) = 1", () => {
    expect(run("embedding-space").topIsExpected).toBe(1);
    expect(run("embedding-space", { a: "puppy", b: "dog", c: "cat" }).topIsExpected).toBe(1);
    expect(run("embedding-space", { mode: "neighbours", a: "cat", b: "cat" }).cosAB).toBeCloseTo(1, 9);
  });

  it("attention-heatmap: rows sum to 1, causal mask, uniform head", () => {
    const r = attend({ ...byId["attention-heatmap"].defaults });
    for (const row of r.W) expect(row.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
    expect(r.W[0][0]).toBeCloseTo(1, 9); // first token can only see itself
    const u = run("attention-heatmap", { head: "uniform", query: 7 });
    expect(u.entropyBits).toBeCloseTo(3, 9); // 8 visible tokens
    expect(run("attention-heatmap", { head: "previous", query: 5 }).argmaxPos).toBe(4);
    expect(run("attention-heatmap", { scale: 0.1 }).entropyBits).toBeGreaterThan(run("attention-heatmap").entropyBits);
  });

  it("transformer-params: reproduces published sizes", () => {
    expect(run("transformer-params").paramsB).toBeCloseTo(6.738, 3);
    expect(run("transformer-params", { kvHeads: 8, ffnHidden: 14336, vocab: 128256 }).paramsB).toBeCloseTo(8.03, 2);
    expect(run("transformer-params", { dModel: 8192, layers: 80, heads: 64, kvHeads: 8, ffnHidden: 28672, vocab: 128256 }).paramsB).toBeCloseTo(70.55, 1);
  });

  it("sampling: T→0 is greedy, top-k=1 keeps one, no filter keeps all", () => {
    const g = run("sampling", { temperature: 0 });
    expect(g.entropyBits).toBe(0);
    expect(g.keptTokens).toBe(1);
    expect(run("sampling", { temperature: 0.05, topP: 1 }).entropyBits).toBeLessThan(0.01);
    expect(run("sampling", { topK: 1, topP: 1 }).keptTokens).toBe(1);
    expect(run("sampling", { topK: 0, topP: 1 }).keptTokens).toBe(10);
    expect(run("sampling", { prompt: "story", topP: 1, temperature: 1.5 }).entropyBits).toBeGreaterThan(run("sampling", { prompt: "story", topP: 1, temperature: 0.5 }).entropyBits);
  });

  it("kv-cache-memory: linear in sequence; GQA-8 is 1/4 of MHA-32", () => {
    const m = run("kv-cache-memory");
    expect(m.kvKBPerToken).toBe(128);
    expect(run("kv-cache-memory", { seqLen: 16384 }).kvCacheGB).toBeCloseTo(2 * m.kvCacheGB, 9);
    expect(run("kv-cache-memory", { attn: "mha" }).kvCacheGB).toBeCloseTo(4 * m.kvCacheGB, 9);
    expect(run("kv-cache-memory", { model: "llama2-7b" }).kvKBPerToken).toBe(512);
    expect(run("kv-cache-memory", { model: "llama3-70b" }).fits).toBe(0);
  });

  it("context-position: the middle is worst and the dip grows with length", () => {
    const m = run("context-position");
    expect(m.recall).toBeLessThan(m.edgeRecall);
    expect(run("context-position", { contextTokens: 16384 }).middleDip).toBeGreaterThan(m.middleDip);
    expect(run("context-position", { model: "modern" }).middleDip).toBeLessThan(m.middleDip);
  });

  it("scaling-laws: Chinchilla is ~compute-optimal; off-optimal costs loss", () => {
    const m = run("scaling-laws");
    expect(m.tokensPerParam).toBeCloseTo(20, 9);
    expect(m.lossGap).toBeLessThan(0.001);
    expect(m.lossGap).toBeGreaterThanOrEqual(0);
    expect(run("scaling-laws", { paramsB: 700, tokensB: 140 }).lossGap).toBeGreaterThan(0.05);
  });

  it("training-memory: ZeRO-3 shards states 1/n; checkpointing saves activations", () => {
    const z0 = run("training-memory");
    expect(z0.bytesPerParam).toBe(16);
    expect(run("training-memory", { zero: 3 }).modelStatesGB).toBeCloseTo(z0.modelStatesGB / 8, 9);
    expect(run("training-memory", { zero: 3 }).fits).toBe(1);
    expect(run("training-memory", { checkpointing: false }).activationsGB).toBeGreaterThan(z0.activationsGB * 5);
  });

  it("lr-schedule: warmup prevents instability; decay beats constant", () => {
    expect(run("lr-schedule").unstableSteps).toBe(0);
    expect(run("lr-schedule", { peakLr: 2e-3, warmupSteps: 0 }).unstableSteps).toBeGreaterThan(0);
    expect(run("lr-schedule").finalLoss).toBeLessThan(run("lr-schedule", { schedule: "constant" }).finalLoss);
    expect(run("lr-schedule").finalLrRatio).toBeCloseTo(0.1, 3);
    expect(run("lr-schedule", { totalSteps: 50000 }).finalLoss).toBeLessThan(run("lr-schedule").finalLoss);
  });

  it("preference-loss: zero margin is log 2; bigger margin, smaller loss", () => {
    const z = run("preference-loss", { chosenLogRatio: 0, rejectedLogRatio: 0 });
    expect(z.loss).toBeCloseTo(Math.LN2, 12);
    expect(z.pChosen).toBeCloseTo(0.5, 12);
    expect(run("preference-loss", { beta: 0.5 }).loss).toBeLessThan(run("preference-loss").loss);
  });

  it("lora-params: classic 4.2M count; QLoRA < LoRA < full", () => {
    expect(run("lora-params", { model: "llama2-7b", targets: "qv", rank: 8 }).trainableParamsM * 1e6).toBe(4194304);
    const l = run("lora-params"), q = run("lora-params", { method: "qlora" }), f = run("lora-params", { method: "full" });
    expect(q.memoryGB).toBeLessThan(l.memoryGB);
    expect(l.memoryGB).toBeLessThan(f.memoryGB);
    expect(f.trainablePct).toBe(1);
    expect(run("lora-params", { model: "llama3-70b", method: "qlora", gpu: "h100" }).fits).toBe(1);
    expect(run("lora-params", { rank: 32 }).trainableParamsM).toBeCloseTo(2 * l.trainableParamsM, 9);
  });

  it("latency-breakdown: e2e = TTFT + (O−1)·TPOT; decode speed = 1000/TPOT", () => {
    const m = run("latency-breakdown");
    expect(m.e2eMs).toBeCloseTo(m.ttftMs + 299 * m.tpotMs, 6);
    expect(m.tokensPerSec).toBeCloseTo(1000 / m.tpotMs, 9);
    expect(run("latency-breakdown", { promptTokens: 20000 }).ttftMs).toBeGreaterThan(5 * m.prefillMs);
    expect(run("latency-breakdown", { gpu: "h200" }).tpotMs).toBeLessThan(m.tpotMs);
  });

  it("roofline: decode is memory-bound at ~1 FLOP/byte; big passes are compute-bound", () => {
    const m = run("roofline");
    expect(m.computeBound).toBe(0);
    expect(m.intensity).toBeCloseTo(1, 1);
    expect(m.ridgePoint).toBeCloseTo(295, 0);
    expect(run("roofline", { tokens: 4096 }).computeBound).toBe(1);
    expect(run("roofline", { precision: "int4w" }).intensity).toBeCloseTo(4 * m.intensity, 1);
  });

  it("llm-batching: batching raises throughput, lowers cost and per-user speed", () => {
    const b1 = run("llm-batching", { batch: 1 }), b32 = run("llm-batching");
    expect(b32.tokensPerSec).toBeGreaterThan(10 * b1.tokensPerSec);
    expect(b32.costPer1M).toBeLessThan(b1.costPer1M);
    expect(b32.perUserTps).toBeLessThan(b1.perUserTps);
    expect(run("llm-batching", { batch: 512, promptTokens: 8000 }).kvFits).toBe(0);
  });

  it("quantization: fewer bits, more error; memory follows bits", () => {
    const e = (format: string) => run("quantization", { format }).relError;
    expect(e("fp32")).toBe(0);
    expect(e("bf16")).toBeLessThan(e("int8"));
    expect(e("int8")).toBeLessThan(e("int4"));
    expect(e("int4")).toBeLessThan(e("int3"));
    expect(e("int3")).toBeLessThan(e("int2"));
    expect(e("nf4")).toBeLessThan(e("int4"));
    expect(run("quantization").memoryGB).toBeCloseTo((8e9 * 4.125) / 8 / GB, 9);
    expect(run("quantization", { outliers: true, groupSize: "4096" }).relError).toBeGreaterThan(run("quantization", { outliers: true }).relError);
  });

  it("speculative-decoding: matches the closed form and the simulation", () => {
    expect(run("speculative-decoding", { alpha: 0 }).tokensPerPass).toBe(1);
    const m = run("speculative-decoding");
    expect(m.tokensPerPass).toBeCloseTo((1 - 0.8 ** 5) / 0.2, 12);
    expect(m.speedup).toBeCloseTo(m.tokensPerPass / 1.4, 12);
    expect(Math.abs(m.simTokensPerPass - m.tokensPerPass)).toBeLessThan(0.3);
    expect(m.bestSpeedup).toBeGreaterThanOrEqual(m.speedup);
  });

  it("gpu-capacity: more traffic needs more GPUs; utilisation stays under target", () => {
    const m = run("gpu-capacity");
    expect(m.actualUtil).toBeLessThanOrEqual(0.7);
    expect(run("gpu-capacity", { qps: 200 }).gpusNeeded).toBeGreaterThanOrEqual(9 * m.gpusNeeded);
    expect(run("gpu-capacity", { model: "llama3-70b" }).gpusNeeded).toBeGreaterThan(m.gpusNeeded);
  });

  it("worst-case params stay fast", () => {
    const t = performance.now();
    run("xor-training", { hidden: 8, data: "cloud", epochs: 3000, seed: 3 });
    run("lr-schedule", { totalSteps: 50000, seed: 2 });
    run("bpe-tokenizer", { merges: 300, text: byId["bpe-tokenizer"].defaults.text + " extra words here" });
    expect(performance.now() - t).toBeLessThan(150);
  });
});
