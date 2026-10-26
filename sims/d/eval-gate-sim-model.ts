// Params → numbers for the eval-gate sim, plus seeded CI runs for the animation. No React.
import { num, type Params } from "../types";
import { gauss, mulberry32 } from "../b/lib";
import { gateRates } from "./eval-gate-model";

export function model(p: Params) {
  const g = {
    n: Math.round(num(p, "evalSetSize")),
    thresholdPp: num(p, "threshold"),
    regressionPp: num(p, "trueRegression"),
    baseline: num(p, "baselineAccuracy"),
    noisePp: num(p, "noise"),
  };
  return { ...g, ...gateRates(g) };
}

export function compute(p: Params) {
  const m = model(p);
  return { falseAlarmRate: m.falseAlarm, missRate: m.miss, minDetectable: m.minDetectable / 100, seDrop: m.se / 100 };
}

export const RUNS = 8;

/** Simulated CI runs: measured drops (pp) for a clean build and for the regressed build. */
export function ciRuns(p: Params): { clean: number[]; regressed: number[] } {
  const m = model(p);
  const rnd = mulberry32(num(p, "seed") * 6151 + 9);
  const clean: number[] = [], regressed: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    clean.push(gauss(rnd) * m.se);
    regressed.push(m.regressionPp + gauss(rnd) * m.se);
  }
  return { clean, regressed };
}
