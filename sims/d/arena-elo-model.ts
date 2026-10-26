// Pure model for arena-elo: simulate pairwise human votes between models with known true strengths, fit a
// Bradley–Terry model (Hunter's MM algorithm), report Elo-scale ratings with analytic 95% intervals. No React.
import { num, type Params } from "../types";
import { mulberry32 } from "../b/lib";

export const NAMES = ["Model A", "Model B", "Model C", "Model D", "Model E", "Model F"];
export const ELO = 400 / Math.LN10; // natural-log strength → Elo points
const BASE = 1000;
/** pseudo-votes per ordered pair (a weak prior that keeps every strength finite) */
const PRIOR = 0.5;

/** True ratings: model A strongest, each next one `gap` Elo points weaker, centred on 1000. */
export function trueRatings(models: number, gap: number): number[] {
  const M = Math.max(2, Math.round(models));
  return Array.from({ length: M }, (_, i) => BASE + gap * ((M - 1) / 2 - i));
}

/** P(i beats j) under Elo / Bradley–Terry. */
export const winProb = (ri: number, rj: number) => 1 / (1 + Math.pow(10, -(ri - rj) / 400));

export type Vote = { i: number; j: number; iWins: boolean };

export function simulateVotes(ratings: number[], votes: number, seed: number): Vote[] {
  const rnd = mulberry32(seed * 104729 + 3);
  const M = ratings.length;
  const out: Vote[] = [];
  for (let v = 0; v < votes; v++) {
    const i = Math.floor(rnd() * M);
    let j = Math.floor(rnd() * (M - 1));
    if (j >= i) j++;
    out.push({ i, j, iWins: rnd() < winProb(ratings[i], ratings[j]) });
  }
  return out;
}

/** wins[i][j] = times i beat j, over the first `upto` votes. */
export function winCounts(M: number, votes: Vote[], upto = votes.length): number[][] {
  const w = Array.from({ length: M }, () => new Array<number>(M).fill(0));
  for (let v = 0; v < Math.min(upto, votes.length); v++) {
    const { i, j, iWins } = votes[v];
    if (iWins) w[i][j]++;
    else w[j][i]++;
  }
  return w;
}

/** Solve A x = b for a small dense matrix (Gaussian elimination with partial pivoting). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

export type Fit = { ratings: number[]; se: number[]; games: number[][]; wins: number[][]; iterations: number };

/** Bradley–Terry by minorise–maximise, then the Fisher information for standard errors. */
export function fitBT(wins: number[][]): Fit {
  const M = wins.length;
  const w = wins.map((row, i) => row.map((x, j) => (i === j ? 0 : x + PRIOR)));
  const n = w.map((row, i) => row.map((x, j) => (i === j ? 0 : x + w[j][i])));
  let pi = new Array<number>(M).fill(1);
  let it = 0;
  for (; it < 500; it++) {
    const next = pi.map((p, i) => {
      const W = w[i].reduce((s, x) => s + x, 0);
      let den = 0;
      for (let j = 0; j < M; j++) if (j !== i) den += n[i][j] / (p + pi[j]);
      return W / den;
    });
    const g = Math.exp(next.reduce((s, x) => s + Math.log(x), 0) / M);
    const normed = next.map((x) => x / g);
    const delta = Math.max(...normed.map((x, i) => Math.abs(Math.log(x / pi[i]))));
    pi = normed;
    if (delta < 1e-10) break;
  }
  const theta = pi.map(Math.log);
  // Fisher information (a weighted graph Laplacian); its pseudo-inverse is the covariance of θ under Σθ = 0.
  const L = Array.from({ length: M }, () => new Array<number>(M).fill(0));
  for (let i = 0; i < M; i++)
    for (let j = 0; j < M; j++) {
      if (i === j) continue;
      const pij = 1 / (1 + Math.exp(theta[j] - theta[i]));
      const v = n[i][j] * pij * (1 - pij); // each ordered pair fills its own row once
      L[i][j] -= v;
      L[i][i] += v;
    }
  const J = 1 / M;
  const A = L.map((row) => row.map((x) => x + J));
  const se = theta.map((_, i) => {
    const e = new Array<number>(M).fill(0);
    e[i] = 1;
    const col = solve(A, e);
    return Math.sqrt(Math.max(0, col[i] - J)) * ELO;
  });
  return { ratings: theta.map((t) => BASE + t * ELO), se, games: n.map((row) => row.map((x) => Math.max(0, x - 2 * PRIOR))), wins, iterations: it };
}

export function model(p: Params) {
  const truth = trueRatings(num(p, "models"), num(p, "trueGap"));
  const votes = simulateVotes(truth, Math.round(num(p, "votes")), num(p, "seed"));
  const fit = fitBT(winCounts(truth.length, votes));
  return { truth, votes, fit };
}

export const orderOf = (xs: number[]) => xs.map((x, i) => [x, i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i);

export function compute(p: Params) {
  const { truth, fit } = model(p);
  const top = Math.max(...fit.ratings);
  const ciWidth = fit.se.reduce((s, x) => s + 2 * 1.96 * x, 0) / fit.se.length;
  const fo = orderOf(fit.ratings), to = orderOf(truth);
  const rankCorrect = fo.every((x, i) => x === to[i]) ? 1 : 0;
  const err = fit.ratings.reduce((s, x, i) => s + Math.abs(x - truth[i]), 0) / truth.length;
  return { topRating: top, ciWidth, rankCorrect, meanError: err };
}
