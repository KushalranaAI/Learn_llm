import { describe, expect, it } from "vitest";
import { SIMS_D } from "../registry-d";
import { SIM_BY_ID } from "../index";
import type { Params, SimDef } from "../types";
import { fitBT, trueRatings, winCounts, simulateVotes } from "./arena-elo-model";
import { gateRates } from "./eval-gate-model";
import { runAgent } from "./agent-trajectory-model";

const byId = Object.fromEntries(SIMS_D.map((s) => [s.id, s])) as Record<string, SimDef>;
const run = (id: string, over: Params = {}) => byId[id].compute({ ...byId[id].defaults, ...over });

const IDS = ["pass-at-k", "arena-elo", "benchmark-contamination", "eval-gate", "agent-trajectory"];

describe("group D registry", () => {
  it("registers every sim exactly once and in the global index", () => {
    expect(SIMS_D.map((s) => s.id).sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(SIM_BY_ID[id], id).toBeDefined();
  });
});

describe.each(SIMS_D.map((s) => [s.id, s] as const))("%s", (_id, sim) => {
  it("returns finite numbers for every declared metric on defaults, deterministically", () => {
    const a = sim.compute(sim.defaults);
    for (const m of sim.metrics) expect(Number.isFinite(a[m.key]), `${sim.id}.${m.key} = ${a[m.key]}`).toBe(true);
    expect(sim.compute({ ...sim.defaults })).toEqual(a);
  });
  it("has defaults for every param, maths and an explanation", () => {
    for (const p of sim.params) expect(sim.defaults[p.key], `${sim.id} default ${p.key}`).not.toBeUndefined();
    expect(sim.math.length).toBeGreaterThan(200);
    expect(sim.math).not.toMatch(/NaN|undefined|Infinity/);
    expect(typeof sim.explain?.(sim.defaults, sim.compute(sim.defaults))).toBe("string");
    expect(sim.View).toBeDefined();
  });
  it("stays finite across the corners of its parameter ranges", () => {
    for (const corner of ["min", "max"] as const) {
      const p: Params = { ...sim.defaults };
      for (const s of sim.params) if (s.kind === "range") p[s.key] = s[corner];
      const m = sim.compute(p);
      for (const k of sim.metrics) expect(Number.isFinite(m[k.key]), `${sim.id}.${k.key} at ${corner}`).toBe(true);
    }
  });
});

describe("sanity", () => {
  it("pass-at-k: pass@k ≥ pass^k, equal at k = 1, worked example", () => {
    for (const k of [1, 2, 5, 10, 20])
      for (const spread of [0, 0.5, 1]) {
        const m = run("pass-at-k", { k, spread });
        expect(m.passAtK).toBeGreaterThanOrEqual(m.passHatK - 1e-12);
      }
    const one = run("pass-at-k", { k: 1 });
    expect(one.passAtK).toBeCloseTo(one.passHatK, 12);
    const d = run("pass-at-k");
    expect(d.passAtK).toBeCloseTo(1 - 0.3 ** 5, 6);
    expect(d.passHatK).toBeCloseTo(0.7 ** 5, 6);
    expect(d.gap).toBeCloseTo(d.passAtK - d.passHatK, 12);
  });

  it("arena-elo: more votes narrow the CI; big gaps with many votes rank correctly", () => {
    const few = run("arena-elo", { votes: 300 });
    const many = run("arena-elo", { votes: 12000 });
    expect(many.ciWidth).toBeLessThan(few.ciWidth * 0.3);
    expect(run("arena-elo", { votes: 20000, trueGap: 80 }).rankCorrect).toBe(1);
    // fitted ratings recover the truth with lots of data
    const truth = trueRatings(4, 60);
    const fit = fitBT(winCounts(4, simulateVotes(truth, 20000, 2)));
    fit.ratings.forEach((r, i) => expect(Math.abs(r - truth[i])).toBeLessThan(4 * fit.se[i] + 5));
  });

  it("benchmark-contamination: no contamination → no inflation; retest reveals the true score", () => {
    expect(run("benchmark-contamination", { contaminationRate: 0 }).inflation).toBeCloseTo(0, 12);
    const d = run("benchmark-contamination");
    expect(d.inflation).toBeCloseTo(0.3 * (0.95 - 0.6), 12);
    expect(d.measuredScore).toBeCloseTo(d.reportedScore, 12);
    expect(run("benchmark-contamination", { retest: true }).measuredScore).toBeCloseTo(d.trueScore, 12);
  });

  it("eval-gate: a bigger eval set lowers the miss rate at a fixed threshold (and false alarms)", () => {
    const small = run("eval-gate", { evalSetSize: 100 });
    const big = run("eval-gate", { evalSetSize: 3000 });
    expect(big.missRate).toBeLessThan(small.missRate);
    expect(big.falseAlarmRate).toBeLessThan(small.falseAlarmRate);
    // a higher threshold trades false alarms for misses
    const loose = run("eval-gate", { threshold: 4 });
    expect(loose.falseAlarmRate).toBeLessThan(run("eval-gate").falseAlarmRate);
    expect(loose.missRate).toBeGreaterThan(run("eval-gate").missRate);
    // the shared gate model agrees
    expect(gateRates({ n: 300, thresholdPp: 2, regressionPp: 3, baseline: 0.85, noisePp: 1 }).miss).toBeCloseTo(run("eval-gate").missRate, 12);
  });

  it("agent-trajectory: no tool errors → higher success; verification and strict judges behave", () => {
    const d = run("agent-trajectory");
    const clean = run("agent-trajectory", { toolErrorRate: 0 });
    expect(clean.taskSuccess).toBeGreaterThan(d.taskSuccess);
    expect(clean.trueSuccess).toBeGreaterThan(d.trueSuccess);
    expect(clean.costPerSuccess).toBeLessThan(d.costPerSuccess);
    const lenient = run("agent-trajectory", { judgeStrictness: 0 });
    const strict = run("agent-trajectory", { judgeStrictness: 1 });
    expect(lenient.taskSuccess).toBeGreaterThan(strict.taskSuccess);
    expect(strict.taskSuccess).toBeCloseTo(strict.trueSuccess, 12);
    const noisy = { toolErrorRate: 0.3, judgeStrictness: 1, maxSteps: 16 };
    expect(run("agent-trajectory", { ...noisy, verify: true }).trueSuccess).toBeGreaterThan(run("agent-trajectory", noisy).trueSuccess);
    // a tiny budget runs out
    expect(run("agent-trajectory", { maxSteps: 4, toolErrorRate: 0.3 }).taskSuccess).toBeLessThan(d.taskSuccess);
    const r = runAgent(0, 10, false, 1, 5);
    expect(r.steps.length).toBeGreaterThanOrEqual(4);
  });
});
