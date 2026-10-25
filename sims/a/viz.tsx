"use client";
// Extra pictures for group A sims: 2-D fields (loss surfaces, decision boundaries), log–log charts, a play bar.
// Client module: these components use hooks. Sim definition files import them (as client references) only for their Views.
import { useEffect, useState, type ReactNode } from "react";
import { C, fmt, Legend, SERIES, useWidth } from "../ui";
import type { MetricFormat } from "../types";

/* ---------------- play bar: a local step counter for iterative sims ---------------- */

export function usePlayer(max: number, msPerFrame = 40) {
  const [t, setT] = useState(max);
  const [playing, setPlaying] = useState(false);
  useEffect(() => setT(max), [max]);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((v) => {
        if (v >= max) {
          setPlaying(false);
          return max;
        }
        return Math.min(max, v + Math.max(1, Math.round(max / 120)));
      });
    }, msPerFrame);
    return () => clearInterval(id);
  }, [playing, max, msPerFrame]);
  const toggle = () => {
    if (!playing && t >= max) setT(0);
    setPlaying((p) => !p);
  };
  return { t: Math.min(t, max), setT, playing, toggle };
}

export function PlayBar({ t, max, playing, toggle, setT, label = "step" }: { t: number; max: number; playing: boolean; toggle: () => void; setT: (v: number) => void; label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.85rem" }}>
      <button type="button" className="chip-btn" onClick={toggle} aria-label={playing ? "pause" : "play"}>
        {playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      <input type="range" min={0} max={max} step={1} value={t} onChange={(e) => setT(Number(e.target.value))} aria-label={`${label} shown`} style={{ flex: 1, minWidth: 80 }} />
      <span className="mono muted" style={{ minWidth: 72, textAlign: "right" }}>
        {label} {t}/{max}
      </span>
    </div>
  );
}

/* ---------------- small text helpers ---------------- */

export function Caption({ children }: { children: ReactNode }) {
  return <div className="muted" style={{ fontSize: "0.82rem", marginBottom: -8 }}>{children}</div>;
}

/** Two-column key/value table for derived numbers. */
export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: "4px 14px", fontSize: "0.86rem" }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <span className="muted">{k}</span>
          <span className="mono" style={{ textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal labelled bars (fits narrow screens better than vertical bars with long labels). */
export function HBars({ bars, format = "num", max, highlight }: { bars: { label: string; value: number; color?: string; note?: string }[]; format?: MetricFormat; max?: number; highlight?: number }) {
  const top = max ?? Math.max(...bars.map((b) => b.value), 1e-12);
  return (
    <div role="img" aria-label="bar chart" style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.82rem" }}>
      {bars.map((b, i) => (
        <div key={`${b.label}-${i}`} style={{ display: "grid", gridTemplateColumns: "minmax(56px, 30%) minmax(0,1fr) auto", gap: 8, alignItems: "center", opacity: highlight === undefined || highlight === i ? 1 : 0.55 }}>
          <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "pre" }} title={b.label}>{b.label}</span>
          <span style={{ background: "var(--card-3)", borderRadius: 4, height: 12, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(1, b.value / top)) * 100}%`, background: b.color ?? (highlight === i ? C.accent : C.blue), borderRadius: 4 }} />
          </span>
          <span className="mono" style={{ minWidth: 48, textAlign: "right" }}>{b.note ?? fmt(b.value, format)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- 2-D field ---------------- */

export type FieldPath = { pts: [number, number][]; color?: string; dots?: boolean };
export type FieldPoint = { x: number; y: number; color?: string; r?: number; label?: string; ring?: boolean };

/**
 * A scalar or colour field over [x0,x1]×[y0,y1] drawn as a grid of rects, with optional paths and points on top.
 * `cell(x, y)` returns a fill colour and opacity for the cell centred at (x, y).
 */
export function Field2D({
  x0, x1, y0, y1, nx = 40, ny = 28, cell, paths = [], points = [], height = 260, label = "2-D field", aspect,
}: {
  x0: number; x1: number; y0: number; y1: number; nx?: number; ny?: number;
  cell: (x: number, y: number) => { fill: string; opacity: number };
  paths?: FieldPath[]; points?: FieldPoint[]; height?: number; label?: string;
  /** if set, height = width * aspect (square plots for decision boundaries) */
  aspect?: number;
}) {
  const [ref, w] = useWidth(480);
  const h = aspect ? Math.min(420, Math.round(w * aspect)) : height;
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * w;
  const sy = (y: number) => h - ((y - y0) / (y1 - y0)) * h;
  const cw = w / nx, ch = h / ny;
  const rects: ReactNode[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((i + 0.5) / nx) * (x1 - x0);
      const y = y1 - ((j + 0.5) / ny) * (y1 - y0);
      const c = cell(x, y);
      rects.push(<rect key={`${i}-${j}`} x={i * cw} y={j * ch} width={cw + 0.6} height={ch + 0.6} fill={c.fill} fillOpacity={c.opacity} />);
    }
  }
  const inside = (p: [number, number]) => p[0] >= x0 - 1e-9 && p[0] <= x1 + 1e-9 && p[1] >= y0 - 1e-9 && p[1] <= y1 + 1e-9;
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={h} role="img" aria-label={label} style={{ borderRadius: 10 }}>
        <rect x={0} y={0} width={w} height={h} fill="var(--card-2)" />
        {rects}
        {paths.map((p, k) => {
          const pts = p.pts.map((q): [number, number] => [Math.max(x0, Math.min(x1, q[0])), Math.max(y0, Math.min(y1, q[1]))]);
          return (
            <g key={k}>
              <path d={pts.map((q, i) => `${i ? "L" : "M"}${sx(q[0]).toFixed(1)},${sy(q[1]).toFixed(1)}`).join("")} fill="none" stroke={p.color ?? "var(--text)"} strokeWidth={2} />
              {p.dots && p.pts.map((q, i) => inside(q) && <circle key={i} cx={sx(q[0])} cy={sy(q[1])} r={i === p.pts.length - 1 ? 5 : 2.5} fill={p.color ?? "var(--text)"} />)}
            </g>
          );
        })}
        {points.map((p, k) => (
          <g key={k}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={p.r ?? 4} fill={p.ring ? "none" : p.color ?? C.accent} stroke={p.ring ? p.color ?? "var(--text)" : "var(--card)"} strokeWidth={p.ring ? 2.5 : 1} />
            {p.label && <text x={sx(p.x) + 7} y={sy(p.y) - 6} className="axis strong">{p.label}</text>}
          </g>
        ))}
        <rect x={0.5} y={0.5} width={w - 1} height={h - 1} rx={10} fill="none" stroke={C.grid} />
      </svg>
    </div>
  );
}

/* ---------------- log–log chart (roofline, scaling) ---------------- */

export type LogSeries = { name: string; pts: [number, number][]; color?: string; dashed?: boolean };

export function LogLogChart({
  series, points = [], height = 240, xLabel, yLabel, xFmt = (v) => fmtSI(v), yFmt = (v) => fmtSI(v), vlines = [], logY = true,
}: {
  series: LogSeries[];
  points?: { x: number; y: number; label?: string; color?: string }[];
  height?: number; xLabel?: string; yLabel?: string;
  xFmt?: (v: number) => string; yFmt?: (v: number) => string;
  vlines?: { x: number; label?: string; color?: string }[];
  logY?: boolean;
}) {
  const [ref, w] = useWidth();
  const pad = { l: 54, r: 14, t: 14, b: xLabel ? 40 : 26 };
  const pw = w - pad.l - pad.r, ph = height - pad.t - pad.b;
  const xs = series.flatMap((s) => s.pts.map((p) => p[0])).concat(points.map((p) => p.x)).filter((v) => v > 0 && Number.isFinite(v));
  const ys = series.flatMap((s) => s.pts.map((p) => p[1])).concat(points.map((p) => p.y)).filter((v) => (logY ? v > 0 : true) && Number.isFinite(v));
  const lx0 = Math.log10(Math.min(...xs)), lx1 = Math.log10(Math.max(...xs));
  const fy = (v: number) => (logY ? Math.log10(v) : v);
  let ly0 = fy(Math.min(...ys)), ly1 = fy(Math.max(...ys));
  if (logY) { ly0 = Math.floor(ly0 * 2) / 2; ly1 = Math.ceil(ly1 * 2) / 2; } else { const m = (ly1 - ly0) * 0.08 || 0.1; ly0 -= m; ly1 += m; }
  if (ly1 === ly0) ly1 = ly0 + 1;
  const tx = (v: number) => pad.l + ((Math.log10(v) - lx0) / (lx1 - lx0 || 1)) * pw;
  const ty = (v: number) => pad.t + ph - ((fy(v) - ly0) / (ly1 - ly0)) * ph;
  const xt: number[] = [];
  for (let e = Math.ceil(lx0); e <= Math.floor(lx1); e++) xt.push(10 ** e);
  const xticks = xt.length > 7 ? xt.filter((_, i) => i % 2 === 0) : xt;
  const yticks: number[] = [];
  if (logY) { for (let e = Math.ceil(ly0); e <= Math.floor(ly1); e++) yticks.push(10 ** e); if (yticks.length < 2) yticks.push(10 ** ly0, 10 ** ly1); }
  else for (let i = 0; i <= 4; i++) yticks.push(ly0 + ((ly1 - ly0) * i) / 4);
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label={yLabel ? `${yLabel} chart` : "log-log chart"}>
        {yticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={pad.l} x2={w - pad.r} y1={ty(t)} y2={ty(t)} stroke={C.grid} />
            <text x={pad.l - 6} y={ty(t) + 4} textAnchor="end" className="axis">{yFmt(t)}</text>
          </g>
        ))}
        {xticks.map((t) => (
          <text key={`x${t}`} x={tx(t)} y={pad.t + ph + 16} textAnchor="middle" className="axis">{xFmt(t)}</text>
        ))}
        {xLabel && <text x={pad.l + pw / 2} y={height - 6} textAnchor="middle" className="axis-label">{xLabel}</text>}
        {yLabel && <text x={pad.l} y={pad.t - 3} className="axis">{yLabel}</text>}
        {vlines.map((v, i) => (
          <g key={`v${i}`}>
            <line x1={tx(v.x)} x2={tx(v.x)} y1={pad.t} y2={pad.t + ph} stroke={v.color ?? C.muted} strokeDasharray="4 4" />
            {v.label && <text x={tx(v.x) + 4} y={pad.t + 12} className="axis">{v.label}</text>}
          </g>
        ))}
        {series.map((s, si) => (
          <path key={s.name} d={s.pts.filter((p) => p[0] > 0 && (!logY || p[1] > 0)).map((p, i) => `${i ? "L" : "M"}${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`).join("")}
            fill="none" stroke={s.color ?? SERIES[si % SERIES.length]} strokeWidth={2.25} strokeDasharray={s.dashed ? "6 5" : undefined} />
        ))}
        {points.map((p, i) => (
          <g key={`p${i}`}>
            <circle cx={tx(p.x)} cy={ty(p.y)} r={5.5} fill={p.color ?? C.accent} stroke="var(--card)" strokeWidth={1.5} />
            {p.label && <text x={Math.min(tx(p.x) + 8, w - 90)} y={ty(p.y) - 8} className="axis strong">{p.label}</text>}
          </g>
        ))}
      </svg>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.name, color: s.color ?? SERIES[i % SERIES.length], dashed: s.dashed }))} />}
    </div>
  );
}

export function fmtSI(v: number): string {
  const a = Math.abs(v);
  const r = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(0) : +x.toFixed(1) + "");
  if (a >= 1e15) return `${r(v / 1e15)}P`;
  if (a >= 1e12) return `${r(v / 1e12)}T`;
  if (a >= 1e9) return `${r(v / 1e9)}G`;
  if (a >= 1e6) return `${r(v / 1e6)}M`;
  if (a >= 1e3) return `${r(v / 1e3)}k`;
  if (a >= 1 || a === 0) return r(v);
  return v.toPrecision(1);
}

/** Simple row of preset buttons that set several params at once. */
export function Presets({ items, onPick }: { items: { label: string; values: Record<string, number | string | boolean> }[]; onPick: (v: Record<string, number | string | boolean>) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <span className="muted" style={{ fontSize: "0.82rem", alignSelf: "center" }}>Presets:</span>
      {items.map((it) => (
        <button key={it.label} type="button" className="chip-btn" style={{ fontSize: "0.8rem", padding: "2px 10px" }} onClick={() => onPick(it.values)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}
