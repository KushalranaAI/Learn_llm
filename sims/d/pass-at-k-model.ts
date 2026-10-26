// Pure model for pass-at-k: pass@k (at least one of k attempts succeeds) vs pass^k (all k succeed), for one
// task difficulty or a spread of task difficulties. No React.
import { num, type Params } from "../types";
import { mulberry32, normInv, sigmoid, logit, clamp } from "../b/lib";

/** Per-task success probabilities: `tasks` tasks whose logits spread around logit(p) (deterministic quantiles). */
export function taskProbs(p: number, tasks: number, spread: number): number[] {
  const T = Math.max(1, Math.round(tasks));
  const pc = clamp(p, 0.001, 0.999);
  if (spread <= 0 || T === 1) return Array.from({ length: T }, () => pc);
  const sd = 3 * spread;
  return Array.from({ length: T }, (_, i) => sigmoid(logit(pc) + sd * normInv((i + 0.5) / T)));
}

export const passAt = (ps: number[], k: number) => ps.reduce((s, q) => s + 1 - Math.pow(1 - q, k), 0) / ps.length;
export const passHat = (ps: number[], k: number) => ps.reduce((s, q) => s + Math.pow(q, k), 0) / ps.length;

export function model(p: Params) {
  const ps = taskProbs(num(p, "p"), num(p, "tasks"), num(p, "spread"));
  const k = Math.max(1, Math.round(num(p, "k")));
  const at = passAt(ps, k);
  const hat = passHat(ps, k);
  const pass1 = ps.reduce((s, q) => s + q, 0) / ps.length;
  return { ps, k, at, hat, pass1 };
}

export function compute(p: Params) {
  const m = model(p);
  return { passAtK: m.at, passHatK: m.hat, gap: Math.max(0, m.at - m.hat), pass1: m.pass1 };
}

/** Simulated attempts for the picture: grid[task][attempt] = success, seeded so it is stable. */
export function attemptGrid(ps: number[], k: number, seed = 11): boolean[][] {
  const rnd = mulberry32(seed * 7919 + 17);
  return ps.map((q) => Array.from({ length: 20 }, () => rnd() < q).slice(0, Math.max(1, k)));
}
