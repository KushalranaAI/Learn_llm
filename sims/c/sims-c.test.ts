import { describe, expect, it } from "vitest";
import { SIMS_C } from "../registry-c";
import type { Params, SimDef } from "../types";
import { generate } from "./autocomplete-model";
import { CARDS } from "./can-cant-data";
import { MILESTONES } from "./timeline-data";
import { SENTENCES, embed, mlpToy, toyParams } from "./transformer-flow-model";

const byId = Object.fromEntries(SIMS_C.map((s) => [s.id, s])) as Record<string, SimDef>;
const run = (id: string, over: Params = {}) => byId[id].compute({ ...byId[id].defaults, ...over });

describe("group C registry", () => {
  it("registers the five opener sims", () => {
    expect(SIMS_C.map((s) => s.id).sort()).toEqual(["llm-autocomplete", "llm-can-cant", "llm-timeline", "training-stages", "transformer-flow"]);
  });
});

describe.each(SIMS_C.map((s) => [s.id, s] as const))("%s: contract", (_id, sim) => {
  it("has defaults for every param and a math write-up", () => {
    for (const p of sim.params) expect(sim.defaults[p.key], p.key).not.toBeUndefined();
    expect(sim.math.length).toBeGreaterThan(200);
    expect(sim.math).not.toMatch(/NaN|undefined/);
  });
  it("returns a finite number for every declared metric at defaults", () => {
    const m = sim.compute({ ...sim.defaults });
    for (const spec of sim.metrics) expect(Number.isFinite(m[spec.key]), spec.key).toBe(true);
  });
  it("is deterministic and fast", () => {
    const a = sim.compute({ ...sim.defaults });
    expect(sim.compute({ ...sim.defaults })).toEqual(a);
    const t = performance.now();
    sim.compute({ ...sim.defaults, __bust: Math.random() });
    expect(performance.now() - t).toBeLessThan(50);
  });
  it("explain() gives a sentence", () => {
    const m = sim.compute({ ...sim.defaults });
    expect(sim.explain?.(sim.defaults, m).length ?? 0).toBeGreaterThan(20);
  });
});

describe("sanity checks", () => {
  it("llm-autocomplete: greedy picks the top token every step; heat lowers confidence", () => {
    const g = generate({ prompt: "capital", T: 0, seed: 1 });
    expect(g.chosen.every((k) => k === 0)).toBe(true);
    expect(g.steps[0][g.chosen[0]][0]).toBe(" Paris");
    const cold = run("llm-autocomplete", { temperature: 0 });
    expect(cold.avgProb).toBe(1);
    expect(cold.entropyBits).toBe(0);
    expect(run("llm-autocomplete", { temperature: 2 }).entropyBits).toBeGreaterThan(run("llm-autocomplete").entropyBits);
    expect(run("llm-autocomplete").tokens).toBe(7);
    expect(run("llm-autocomplete", { at: 2 }).tokens).toBe(2);
    for (const p of ["capital", "story", "code", "translate"]) {
      for (const step of generate({ prompt: p, T: 1, seed: 1 }).steps) expect(step).toHaveLength(5);
    }
  });

  it("llm-timeline: GPT-3 is ~1,500× GPT-1; unpublished sizes are NaN", () => {
    const m = run("llm-timeline");
    expect(m.paramsB).toBe(175);
    expect(Math.round(m.growth)).toBe(1496);
    expect(Number.isNaN(run("llm-timeline", { milestone: "chatgpt" }).paramsB)).toBe(true);
    expect(run("llm-timeline", { milestone: "chatgpt" }).largestB).toBe(175);
    expect(run("llm-timeline", { milestone: "shannon" }).largestB).toBe(0);
    const years = MILESTONES.map((x) => x.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  it("transformer-flow: toy parameter count follows Vd + 12Ld²", () => {
    expect(run("transformer-flow").params).toBe(1000 * 8 + 12 * 2 * 64);
    expect(run("transformer-flow", { layers: 4 }).params - run("transformer-flow", { layers: 3 }).params).toBe(12 * 64);
    expect(toyParams(1)).toBe(8768);
    expect(run("transformer-flow", { sentence: "ml" }).tokens).toBe(3);
    expect(run("transformer-flow").topProb).toBeGreaterThan(0.5);
    const mlp = mlpToy(SENTENCES.cat.ids.map(embed));
    expect(mlp.x).toHaveLength(4);
    expect(mlp.h).toHaveLength(6);
    expect(mlp.h.every((v) => v >= 0)).toBe(true); // ReLU
    expect(mlp.att.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(mlpToy(SENTENCES.cat.ids.map(embed))).toEqual(mlp);
  });

  it("training-stages: data shrinks after pretraining, deployment trains nothing", () => {
    expect(run("training-stages").stage).toBe(1);
    expect(run("training-stages").dataLog10).toBe(13);
    expect(run("training-stages", { stage: "sft" }).dataLog10).toBeLessThan(13);
    expect(Number.isNaN(run("training-stages", { stage: "deploy" }).dataLog10)).toBe(true);
  });

  it("llm-can-cant: scoring counts right buckets; all 'good at' scores 50%", () => {
    const right = CARDS.map((c) => c.right).join("");
    expect(run("llm-can-cant").placed).toBe(0);
    expect(run("llm-can-cant", { answers: right }).score).toBe(1);
    expect(run("llm-can-cant", { answers: "g".repeat(CARDS.length) }).score).toBe(0.5);
    expect(run("llm-can-cant", { answers: "gt" }).placed).toBe(2);
  });
});
