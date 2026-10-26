// Pure model for benchmark-contamination: some test items leaked into training data; the model answers those from
// memory. Reported score vs the true (held-out) score, and a sample of items for the picture. No React.
import { bool, num, type Params } from "../types";
import { mulberry32 } from "../b/lib";

export function model(p: Params) {
  const n = Math.round(num(p, "benchmarkSize"));
  const c = num(p, "contaminationRate");
  const a = num(p, "trueAccuracy");
  // memorised items are answered at least as well as unseen ones
  const m = Math.max(a, num(p, "memorisationBoost"));
  const reported = (1 - c) * a + c * m;
  const retest = bool(p, "retest");
  const margin = 1.96 * Math.sqrt((a * (1 - a)) / Math.max(1, n));
  return { n, c, a, m, reported, retest, margin, measured: retest ? a : reported };
}

export function compute(p: Params) {
  const x = model(p);
  return { reportedScore: x.reported, trueScore: x.a, inflation: x.reported - x.a, measuredScore: x.measured, noiseMargin: x.margin };
}

export type Item = { seen: boolean; right: boolean; rightRetest: boolean };

/** A sample of `cells` items: whether each leaked into training, and whether it is answered right (before / after a rephrased re-test). */
export function sampleItems(p: Params, cells: number): Item[] {
  const x = model(p);
  const rnd = mulberry32(num(p, "seed") * 7727 + 5);
  return Array.from({ length: cells }, () => {
    const u1 = rnd(), u2 = rnd(), u3 = rnd();
    const seen = u1 < x.c;
    return { seen, right: u2 < (seen ? x.m : x.a), rightRetest: (seen ? u3 : u2) < x.a };
  });
}
