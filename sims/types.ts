// A simulation is a pure model (params -> metrics) plus an optional custom picture.
// The pure part makes it testable and lets labs check goals; the picture makes it teach.
import type { ComponentType } from "react";

export type Params = Record<string, number | string | boolean>;

export type ParamSpec =
  | { key: string; label: string; kind: "range"; min: number; max: number; step: number; unit?: string; /** slider moves in log space */ log?: boolean; help?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; help?: string }
  | { key: string; label: string; kind: "toggle"; help?: string }
  | { key: string; label: string; kind: "text"; help?: string; multiline?: boolean };

export type MetricFormat = "int" | "num" | "pct" | "ms" | "s" | "usd" | "gb" | "x" | "tps";

export type MetricSpec = { key: string; label: string; format: MetricFormat; /** shown under the value */ help?: string };

export type Metrics = Record<string, number>;

export type Goal = { metric: string; op: ">=" | "<=" | "=="; value: number; label: string };

export const goalMet = (g: Goal, m: Metrics) => {
  const v = m[g.metric];
  if (v === undefined || Number.isNaN(v)) return false;
  return g.op === ">=" ? v >= g.value - 1e-9 : g.op === "<=" ? v <= g.value + 1e-9 : Math.abs(v - g.value) < 1e-9;
};

export type SimViewProps = {
  params: Params;
  metrics: Metrics;
  setParam: (key: string, value: Params[string]) => void;
  /** true inside a lesson (narrower, fewer extras) */
  compact?: boolean;
};

export interface SimDef {
  id: string;
  title: string;
  /** one sentence: what you can learn by playing with it */
  summary: string;
  /** module slug, e.g. "model-foundations" */
  module: string;
  tags: string[];
  params: ParamSpec[];
  defaults: Params;
  metrics: MetricSpec[];
  /** pure and deterministic: same params, same numbers */
  compute: (p: Params) => Metrics;
  /** the picture: charts, heatmaps, token strips... drawn from params/metrics */
  View?: ComponentType<SimViewProps>;
  /** the maths behind the model, as markdown with $KaTeX$, shown under "How this is computed" */
  math: string;
  /** plain-language reading of the current result, shown live under the metrics */
  explain?: (p: Params, m: Metrics) => string;
}

export const num = (p: Params, k: string) => Number(p[k]);
export const str = (p: Params, k: string) => String(p[k]);
export const bool = (p: Params, k: string) => p[k] === true || p[k] === "true";
