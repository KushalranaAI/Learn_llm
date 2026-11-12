import { describe, expect, it } from "vitest";
import { SIMS_B } from "../registry-b";
import type { Params, SimDef } from "../types";
import { mulberry32, binomCdf, normCdf, normInv } from "./lib";

const byId = Object.fromEntries(SIMS_B.map((s) => [s.id, s])) as Record<string, SimDef>;
const run = (id: string, over: Params = {}) => byId[id].compute({ ...byId[id].defaults, ...over });

const IDS = [
  "prompt-cache", "constrained-decoding", "ab-significance", "metric-compare", "judge-agreement",
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
});
