"use client";
// Building blocks every simulation uses: charts drawn as SVG at 1:1 pixels, controls, metric tiles, and SimPanel.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import MiniMarkdown from "@/components/MiniMarkdown";
import Icon from "@/components/ui/Icon";
import { type Goal, goalMet, type MetricFormat, type MetricSpec, type Metrics, type ParamSpec, type Params, type SimDef } from "./types";

/* ---------------- formatting ---------------- */

export function fmt(v: number, f: MetricFormat): string {
  if (v === undefined || Number.isNaN(v)) return "–";
  if (!Number.isFinite(v)) return "∞";
  const n = (x: number, d = 2) => x.toLocaleString("en-US", { maximumFractionDigits: d });
  switch (f) {
    case "int":
      return Math.round(v).toLocaleString("en-US");
    case "pct":
      return `${n(v * 100, v < 0.1 ? 2 : 1)}%`;
    case "ms":
      return v >= 1000 ? `${n(v / 1000, 2)} s` : `${n(v, v < 10 ? 2 : 0)} ms`;
    case "s":
      return `${n(v, 2)} s`;
    case "usd":
      return v < 0.01 && v > 0 ? `$${v.toPrecision(2)}` : `$${n(v, v < 10 ? 3 : 0)}`;
    case "gb":
      return v < 1 ? `${n(v * 1024, 0)} MB` : `${n(v, 1)} GB`;
    case "x":
      return `${n(v, 2)}×`;
    case "tps":
      return `${n(v, 0)} tok/s`;
    default:
      return Math.abs(v) >= 1000 ? n(v, 0) : n(v, 3);
  }
}

/* ---------------- palette ---------------- */

/** Series colours, readable on both themes (CSS variables defined in globals.css). */
export const C = {
  accent: "var(--accent)",
  green: "var(--green)",
  blue: "var(--blue)",
  red: "var(--red)",
  purple: "var(--purple)",
  yellow: "var(--yellow)",
  muted: "var(--muted)",
  grid: "var(--line)",
} as const;
export const SERIES = [C.accent, C.green, C.blue, C.purple, C.yellow, C.red];

/* ---------------- size ---------------- */

export function useWidth(fallback = 640): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!el) return;
    const measure = () => setW(Math.max(240, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, w];
}

export function niceCeil(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s >= v / e - 1e-9) ?? 10;
  return step * e;
}

/* ---------------- charts ---------------- */

export type Series = { name: string; values: number[]; color?: string; dashed?: boolean };

/** Line chart over shared x values. `marker` draws a vertical line at an x index (e.g. the current setting). */
export function LineChart({
  x,
  series,
  height = 220,
  xLabel,
  yLabel,
  yFormat = "num",
  xFormat = (v: number) => String(v),
  marker,
  yMax,
  logX,
}: {
  x: number[];
  series: Series[];
  height?: number;
  xLabel?: string;
  yLabel?: string;
  yFormat?: MetricFormat;
  xFormat?: (v: number) => string;
  marker?: number;
  yMax?: number;
  logX?: boolean;
}) {
  const [ref, w] = useWidth();
  const pad = { l: 56, r: 14, t: 12, b: xLabel ? 40 : 26 };
  const pw = w - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const top = yMax ?? niceCeil(Math.max(...all, 0));
  const lo = Math.min(0, ...all);
  const tx = (i: number) => {
    if (x.length < 2) return pad.l;
    if (logX) {
      const a = Math.log(x[0]), b = Math.log(x[x.length - 1]);
      return pad.l + ((Math.log(x[i]) - a) / (b - a)) * pw;
    }
    return pad.l + ((x[i] - x[0]) / (x[x.length - 1] - x[0])) * pw;
  };
  const ty = (v: number) => pad.t + ph - ((Math.min(v, top) - lo) / (top - lo || 1)) * ph;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (top - lo));
  const xt = x.length <= 6 ? x.map((_, i) => i) : [0, Math.floor(x.length / 4), Math.floor(x.length / 2), Math.floor((3 * x.length) / 4), x.length - 1];
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label={yLabel ? `${yLabel} chart` : "chart"}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={ty(t)} y2={ty(t)} stroke={C.grid} />
            <text x={pad.l - 8} y={ty(t) + 4} textAnchor="end" className="axis">{fmt(t, yFormat)}</text>
          </g>
        ))}
        {xt.map((i) => (
          <text key={i} x={tx(i)} y={pad.t + ph + 16} textAnchor="middle" className="axis">{xFormat(x[i])}</text>
        ))}
        {xLabel && <text x={pad.l + pw / 2} y={height - 6} textAnchor="middle" className="axis-label">{xLabel}</text>}
        {marker !== undefined && x[marker] !== undefined && (
          <line x1={tx(marker)} x2={tx(marker)} y1={pad.t} y2={pad.t + ph} stroke={C.muted} strokeDasharray="4 4" />
        )}
        {series.map((s, si) => (
          <path
            key={s.name}
            d={s.values.map((v, i) => `${i ? "L" : "M"}${tx(i).toFixed(1)},${ty(Number.isFinite(v) ? v : top).toFixed(1)}`).join("")}
            fill="none"
            stroke={s.color ?? SERIES[si % SERIES.length]}
            strokeWidth={2.25}
            strokeDasharray={s.dashed ? "6 5" : undefined}
          />
        ))}
      </svg>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.name, color: s.color ?? SERIES[i % SERIES.length], dashed: s.dashed }))} />}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span key={it.label}>
          <i style={{ background: it.dashed ? "transparent" : it.color, borderColor: it.color }} className={it.dashed ? "dashed" : ""} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Vertical bars with labels. `highlight` marks one bar. */
export function BarChart({
  bars,
  height = 200,
  format = "num",
  highlight,
  yMax,
}: {
  bars: { label: string; value: number; color?: string }[];
  height?: number;
  format?: MetricFormat;
  highlight?: number;
  yMax?: number;
}) {
  const [ref, w] = useWidth();
  const pad = { l: 8, r: 8, t: 22, b: 30 };
  const top = yMax ?? niceCeil(Math.max(...bars.map((b) => b.value), 0));
  const bw = (w - pad.l - pad.r) / Math.max(1, bars.length);
  const ph = height - pad.t - pad.b;
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label="bar chart">
        <line x1={pad.l} x2={w - pad.r} y1={pad.t + ph} y2={pad.t + ph} stroke={C.grid} />
        {bars.map((b, i) => {
          const h = (Math.max(0, b.value) / (top || 1)) * ph;
          const x = pad.l + i * bw + bw * 0.15;
          const color = b.color ?? (highlight === undefined || highlight === i ? C.accent : C.muted);
          return (
            <g key={`${b.label}-${i}`}>
              <rect x={x} y={pad.t + ph - h} width={bw * 0.7} height={h} rx={4} fill={color} opacity={highlight === undefined || highlight === i ? 1 : 0.45} />
              {bw > 26 && <text x={x + bw * 0.35} y={pad.t + ph - h - 6} textAnchor="middle" className="axis">{fmt(b.value, format)}</text>}
              <text x={x + bw * 0.35} y={height - 10} textAnchor="middle" className="axis">{b.label.length * 6 > bw ? b.label.slice(0, Math.max(1, Math.floor(bw / 7))) : b.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** A grid of values in [0,1] (or scaled), e.g. attention weights. */
export function Heatmap({
  rows,
  cols,
  values,
  max,
  format = "num",
  showValues = true,
  cell = 40,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  max?: number;
  format?: MetricFormat;
  showValues?: boolean;
  cell?: number;
}) {
  const top = max ?? Math.max(...values.flat(), 1e-9);
  const lw = Math.max(...rows.map((r) => r.length)) * 7 + 12;
  const th = Math.max(...cols.map((c) => c.length)) * 6 + 14;
  return (
    <div className="chart heatmap-wrap">
      <svg width={lw + cols.length * cell + 4} height={th + rows.length * cell + 4} role="img" aria-label="heatmap">
        {cols.map((c, j) => (
          <text key={`c${j}`} x={lw + j * cell + cell / 2} y={th - 6} textAnchor="start" className="axis" transform={`rotate(-40 ${lw + j * cell + cell / 2} ${th - 6})`}>
            {c}
          </text>
        ))}
        {rows.map((r, i) => (
          <g key={`r${i}`}>
            <text x={lw - 8} y={th + i * cell + cell / 2 + 4} textAnchor="end" className="axis">{r}</text>
            {cols.map((_, j) => {
              const v = values[i]?.[j] ?? 0;
              const a = Math.max(0, Math.min(1, v / top));
              return (
                <g key={j}>
                  <rect x={lw + j * cell + 1} y={th + i * cell + 1} width={cell - 2} height={cell - 2} rx={5} fill="var(--accent)" fillOpacity={0.06 + a * 0.9} />
                  {showValues && cell >= 34 && (
                    <text x={lw + j * cell + cell / 2} y={th + i * cell + cell / 2 + 4} textAnchor="middle" className={`axis ${a > 0.55 ? "on-accent" : ""}`}>
                      {fmt(v, format)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Tokens as coloured chips (tokenizers, sampling, chunking). */
export function TokenStrip({ tokens, highlight }: { tokens: { text: string; id?: number | string; tone?: number }[]; highlight?: number }) {
  return (
    <div className="token-strip">
      {tokens.map((t, i) => (
        <span key={i} className={`token tone-${(t.tone ?? i) % 6} ${highlight === i ? "hl" : ""}`} title={t.id !== undefined ? `id ${t.id}` : undefined}>
          {t.text.replace(/ /g, "␣").replace(/\n/g, "↵")}
          {t.id !== undefined && <sub>{t.id}</sub>}
        </span>
      ))}
    </div>
  );
}

/** 2-D scatter (embeddings, decision boundaries). Points in data space; the view fits them. */
export function Scatter({
  points,
  height = 260,
  lines,
}: {
  points: { x: number; y: number; label?: string; color?: string; r?: number }[];
  height?: number;
  lines?: { x1: number; y1: number; x2: number; y2: number; color?: string; dashed?: boolean }[];
}) {
  const [ref, w] = useWidth();
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const pad = 28;
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (w - 2 * pad);
  const sy = (v: number) => height - pad - ((v - y0) / (y1 - y0 || 1)) * (height - 2 * pad);
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label="scatter plot">
        <rect x={0.5} y={0.5} width={w - 1} height={height - 1} rx={10} fill="none" stroke={C.grid} />
        {lines?.map((l, i) => (
          <line key={i} x1={sx(l.x1)} y1={sy(l.y1)} x2={sx(l.x2)} y2={sy(l.y2)} stroke={l.color ?? C.muted} strokeWidth={1.5} strokeDasharray={l.dashed ? "5 4" : undefined} />
        ))}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={p.r ?? 5} fill={p.color ?? C.accent} />
            {p.label && <text x={sx(p.x) + 8} y={sy(p.y) + 4} className="axis strong">{p.label}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Horizontal stacked bar: parts of a whole (latency breakdown, memory breakdown, cost split). */
export function StackBar({ parts, format = "num" }: { parts: { label: string; value: number; color?: string }[]; format?: MetricFormat }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1;
  return (
    <div className="stackbar">
      <div className="stackbar-track">
        {parts.map((p, i) => (
          <span key={p.label} style={{ width: `${(Math.max(0, p.value) / total) * 100}%`, background: p.color ?? SERIES[i % SERIES.length] }} title={`${p.label}: ${fmt(p.value, format)}`} />
        ))}
      </div>
      <Legend items={parts.map((p, i) => ({ label: `${p.label} · ${fmt(p.value, format)}`, color: p.color ?? SERIES[i % SERIES.length] }))} />
    </div>
  );
}

/* ---------------- controls ---------------- */

function toSlider(spec: Extract<ParamSpec, { kind: "range" }>, v: number) {
  if (!spec.log) return v;
  return Math.log(v);
}
function fromSlider(spec: Extract<ParamSpec, { kind: "range" }>, s: number) {
  if (!spec.log) return s;
  const raw = Math.exp(s);
  return Math.max(spec.min, Math.min(spec.max, Math.round(raw / spec.step) * spec.step));
}

export function Control({ spec, value, onChange, locked }: { spec: ParamSpec; value: Params[string]; onChange: (v: Params[string]) => void; locked?: boolean }) {
  const id = `p-${spec.key}-${useId()}`;
  return (
    <label className={`control ${locked ? "locked" : ""}`} htmlFor={id} title={spec.help}>
      <span className="control-label">
        {spec.label}
        {locked && <Icon name="lock" size={12} label="locked in this step" />}
        {spec.kind === "range" && (
          <b>
            {Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 })}
            {spec.unit ? ` ${spec.unit}` : ""}
          </b>
        )}
      </span>
      {spec.kind === "range" && (
        <input
          id={id}
          type="range"
          disabled={locked}
          min={toSlider(spec, spec.min)}
          max={toSlider(spec, spec.max)}
          step={spec.log ? (toSlider(spec, spec.max) - toSlider(spec, spec.min)) / 200 : spec.step}
          value={toSlider(spec, Number(value))}
          onChange={(e) => onChange(fromSlider(spec, Number(e.target.value)))}
        />
      )}
      {spec.kind === "select" && (
        <select id={id} disabled={locked} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {spec.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
      {spec.kind === "toggle" && (
        <button id={id} type="button" role="switch" aria-checked={value === true} disabled={locked} className={`switch ${value === true ? "on" : ""}`} onClick={() => onChange(!(value === true))}>
          <i />
        </button>
      )}
      {spec.kind === "text" &&
        (spec.multiline ? (
          <textarea id={id} disabled={locked} rows={3} value={String(value)} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input id={id} type="text" disabled={locked} value={String(value)} onChange={(e) => onChange(e.target.value)} />
        ))}
      {spec.help && <small className="muted">{spec.help}</small>}
    </label>
  );
}

export function MetricTiles({ specs, metrics, goals }: { specs: MetricSpec[]; metrics: Metrics; goals?: Goal[] }) {
  return (
    <div className="metric-tiles">
      {specs.map((s) => {
        const g = goals?.find((x) => x.metric === s.key);
        const ok = g ? goalMet(g, metrics) : undefined;
        return (
          <div key={s.key} className={`metric ${ok === true ? "ok" : ok === false ? "bad" : ""}`} title={s.help}>
            <span>{s.label}</span>
            <b>{fmt(metrics[s.key], s.format)}</b>
          </div>
        );
      })}
    </div>
  );
}

export function GoalList({ goals, metrics }: { goals: Goal[]; metrics: Metrics }) {
  return (
    <ul className="goal-list">
      {goals.map((g) => {
        const ok = goalMet(g, metrics);
        return (
          <li key={g.label} className={ok ? "ok" : ""}>
            <Icon name={ok ? "circle-check" : "circle"} size={16} /> {g.label}
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- the panel ---------------- */

export function useSim(def: SimDef, initial?: Params) {
  const [params, setParams] = useState<Params>(() => ({ ...def.defaults, ...initial }));
  const metrics = useMemo(() => {
    try {
      return def.compute(params);
    } catch {
      return {};
    }
  }, [def, params]);
  const setParam = (k: string, v: Params[string]) => setParams((p) => ({ ...p, [k]: v }));
  const reset = () => setParams({ ...def.defaults, ...initial });
  return { params, setParams, metrics, setParam, reset };
}

export function SimPanel({
  def,
  initial,
  compact,
  goals,
  locked = [],
  hidden = [],
  onMetrics,
  footer,
}: {
  def: SimDef;
  initial?: Params;
  compact?: boolean;
  goals?: Goal[];
  locked?: string[];
  /** params not shown at all */
  hidden?: string[];
  onMetrics?: (m: Metrics, p: Params) => void;
  footer?: ReactNode;
}) {
  const { params, metrics, setParam, reset } = useSim(def, initial);
  const [showMath, setShowMath] = useState(false);
  useEffect(() => onMetrics?.(metrics, params), [metrics, params, onMetrics]);
  const View = def.View;
  const explanation = def.explain?.(params, metrics);
  return (
    <section className={`sim ${compact ? "compact" : ""}`} aria-label={def.title}>
      <header className="sim-head">
        <div>
          <span className="eyebrow"><Icon name="activity" size={13} /> Simulation</span>
          <h3>{def.title}</h3>
          {!compact && <p className="muted">{def.summary}</p>}
        </div>
        <button type="button" className="chip-btn" onClick={reset}>
          <Icon name="refresh" size={14} /> Reset
        </button>
      </header>
      <div className="sim-body">
        <div className="sim-controls">
          {def.params.filter((s) => !hidden.includes(s.key)).map((s) => (
            <Control key={s.key} spec={s} value={params[s.key]} locked={locked.includes(s.key)} onChange={(v) => setParam(s.key, v)} />
          ))}
        </div>
        <div className="sim-main">
          <MetricTiles specs={def.metrics} metrics={metrics} goals={goals} />
          {View && <View params={params} metrics={metrics} setParam={setParam} compact={compact} />}
          {explanation && <p className="sim-explain"><Icon name="lightbulb" size={15} /> {explanation}</p>}
        </div>
      </div>
      {goals && <GoalList goals={goals} metrics={metrics} />}
      <div className="sim-foot">
        <button type="button" className="link-btn" onClick={() => setShowMath((s) => !s)} aria-expanded={showMath}>
          <Icon name="sigma" size={14} /> {showMath ? "Hide" : "How this is computed"}
        </button>
        {footer}
      </div>
      {showMath && <MiniMarkdown className="sim-math">{def.math}</MiniMarkdown>}
    </section>
  );
}
