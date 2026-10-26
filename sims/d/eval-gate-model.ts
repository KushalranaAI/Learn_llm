// Pure model of a CI regression gate on an eval set (shared by the eval-gate sim and the sandbox's Eval gate node).
// A candidate build is scored on n eval items and compared with the baseline score; the release is blocked when the
// measured drop exceeds a threshold. No React.
import { normCdf, normInv } from "../b/lib";

export const Z80 = normInv(0.8);

export interface GateInput {
  /** eval items */
  n: number;
  /** block when the measured drop is larger than this many percentage points */
  thresholdPp: number;
  /** the candidate's true drop in accuracy, percentage points */
  regressionPp: number;
  /** baseline accuracy, 0..1 */
  baseline: number;
  /** run-to-run noise (sampling temperature, flaky judge), standard deviation in percentage points */
  noisePp: number;
}

/** Standard error of the measured drop, in percentage points. */
export function dropSe(g: Pick<GateInput, "n" | "baseline" | "noisePp">): number {
  const p = Math.min(0.999, Math.max(0.001, g.baseline));
  const v = (2 * p * (1 - p)) / Math.max(1, g.n) + (g.noisePp / 100) ** 2;
  return 100 * Math.sqrt(v);
}

export function gateRates(g: GateInput) {
  const se = dropSe(g);
  const falseAlarm = 1 - normCdf(g.thresholdPp / se);
  const catchRate = 1 - normCdf((g.thresholdPp - g.regressionPp) / se);
  return { se, falseAlarm, catchRate, miss: 1 - catchRate, minDetectable: g.thresholdPp + Z80 * se };
}
