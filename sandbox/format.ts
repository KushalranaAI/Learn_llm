// Number formatting shared by the engine, explanations and UI. Pure.

export const pct = (x: number, digits = 0) => {
  if (!Number.isFinite(x)) return "–";
  const v = x * 100;
  if (digits === 0 && v > 99 && v < 100) return `${v.toFixed(1)}%`;
  if (digits === 0 && v > 0 && v < 1) return `${v.toFixed(1)}%`;
  return `${v.toFixed(digits)}%`;
};

export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

export function fmtUsd(x: number): string {
  if (!Number.isFinite(x)) return "–";
  const a = Math.abs(x);
  if (a === 0) return "$0";
  if (a < 0.0001) return `$${x.toExponential(1)}`;
  if (a < 0.01) return `$${x.toFixed(5)}`;
  if (a < 1) return `$${x.toFixed(4)}`;
  if (a < 100) return `$${x.toFixed(2)}`;
  if (a < 10_000) return `$${Math.round(x).toLocaleString("en-US")}`;
  if (a < 1_000_000) return `$${(x / 1000).toFixed(1)}k`;
  return `$${(x / 1_000_000).toFixed(2)}M`;
}

export function fmtRps(x: number): string {
  if (!Number.isFinite(x)) return "–";
  if (x === 0) return "0";
  if (x < 0.1) return x.toFixed(3);
  if (x < 10) return x.toFixed(1);
  if (x < 10_000) return Math.round(x).toLocaleString("en-US");
  return `${(x / 1000).toFixed(1)}k`;
}

export function fmtNum(x: number): string {
  if (!Number.isFinite(x)) return "–";
  if (Math.abs(x) >= 1000) return Math.round(x).toLocaleString("en-US");
  if (Math.abs(x) >= 10) return String(Math.round(x));
  return String(Math.round(x * 100) / 100);
}
