"use client";
// Animated timeline: a playhead walks the milestones, the parameter chart draws in, a card explains each step.
import { useCallback } from "react";
import { useWidth } from "../ui";
import type { SimViewProps } from "../types";
import { SimStyle, Transport, usePlayback, useTween } from "./anim";
import { human } from "./lib";
import { MILESTONES, indexOf, type Milestone } from "./timeline-data";

const ERA: Record<Milestone["era"], { label: string; color: string; from: number; to: number }> = {
  stats: { label: "statistics", color: "var(--warm)", from: 1944, to: 1990 },
  neural: { label: "neural nets", color: "var(--info)", from: 1990, to: 2016.9 },
  transformer: { label: "transformers", color: "var(--accent)", from: 2016.9, to: 2021.9 },
  assistant: { label: "assistants", color: "var(--ai)", from: 2021.9, to: 2025.6 },
};

// piecewise-linear year axis: the quiet decades are squeezed, the busy recent years get room
const YK: [number, number][] = [[1944, 0], [1995, 0.17], [2012, 0.3], [2016.5, 0.42], [2025.6, 1]];
function yearFrac(y: number) {
  for (let k = 1; k < YK.length; k++) {
    if (y <= YK[k][0]) {
      const [a, fa] = YK[k - 1], [b, fb] = YK[k];
      return fa + ((y - a) / (b - a)) * (fb - fa);
    }
  }
  return 1;
}

export default function TimelineView({ params, setParam }: SimViewProps) {
  const [ref, w] = useWidth(560);
  const i = indexOf(params);
  const last = MILESTONES.length - 1;
  const setIndex = (k: number) => setParam("milestone", MILESTONES[Math.max(0, Math.min(last, k))].key);
  const pb = usePlayback({ index: i, setIndex, last, ms: 1700 });
  const m = MILESTONES[i];

  /* ---- track ---- */
  const padX = 14;
  const tw = w - 2 * padX;
  const xs: number[] = [];
  MILESTONES.forEach((ms, k) => {
    let x = padX + yearFrac(ms.year) * tw;
    if (k > 0 && x - xs[k - 1] < 13) x = xs[k - 1] + 13;
    xs.push(x);
  });
  const head = useTween(xs[i], 650);
  const shownYear = Math.round(useTween(Math.floor(m.year), 650));

  /* ---- chart ---- */
  const ch = 210;
  const pad = { l: 44, r: 14, t: 14, b: 24 };
  const cx0 = 2016.5, cx1 = 2025.2;
  const cx = (y: number) => pad.l + ((y - cx0) / (cx1 - cx0)) * (w - pad.l - pad.r);
  const ly0 = 7, ly1 = 12;
  const cy = (v: number) => pad.t + (1 - (Math.log10(v) - ly0) / (ly1 - ly0)) * (ch - pad.t - pad.b);
  const sized = MILESTONES.map((ms, k) => ({ ms, k })).filter((o) => o.ms.params !== null && o.ms.year >= cx0);
  // frontier: largest published size so far, as a step line
  let best = 0;
  const frontier: string[] = [];
  sized.forEach(({ ms }, n) => {
    const v = Math.max(best, ms.params as number);
    if (n === 0) frontier.push(`M${cx(ms.year).toFixed(1)},${cy(v).toFixed(1)}`);
    else frontier.push(`L${cx(ms.year).toFixed(1)},${cy(best).toFixed(1)}`, `L${cx(ms.year).toFixed(1)},${cy(v).toFixed(1)}`);
    best = v;
  });
  frontier.push(`L${cx(cx1).toFixed(1)},${cy(best).toFixed(1)}`);
  const clipTarget = m.year < cx0 ? pad.l : Math.min(w, cx(m.year) + 10);
  const clipW = useTween(clipTarget, 700);
  const clipId = `tl-clip-${w}`;
  const narrow = w < 480;
  const rootRef = pb.rootRef;
  const setRoot = useCallback((el: HTMLElement | null) => { ref(el); rootRef(el); }, [ref, rootRef]);

  return (
    <div className="sc" ref={setRoot}>
      <SimStyle />
      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span className="sc-mono" style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{shownYear}</span>
        <span className="sc-chip" style={{ background: `color-mix(in srgb, ${ERA[m.era].color} 18%, transparent)`, color: ERA[m.era].color, fontWeight: 600 }}>{ERA[m.era].label} era</span>
      </div>

      {/* track */}
      <svg width={w} height={70} role="group" aria-label="timeline of milestones" style={{ overflow: "visible" }}>
        {(Object.keys(ERA) as Milestone["era"][]).map((e) => {
          const a = padX + yearFrac(ERA[e].from) * tw, b = padX + yearFrac(ERA[e].to) * tw;
          return <rect key={e} x={a} y={22} width={Math.max(0, b - a)} height={8} rx={4} fill={ERA[e].color} opacity={0.18} />;
        })}
        <rect x={padX} y={25} width={Math.max(0, head - padX)} height={2} fill="var(--accent)" />
        <line x1={head} x2={head} y1={4} y2={44} stroke="var(--accent-strong)" strokeWidth={2} />
        <polygon points={`${head - 5},2 ${head + 5},2 ${head},9`} fill="var(--accent-strong)" />
        {MILESTONES.map((ms, k) => {
          const sel = k === i, past = k <= i;
          return (
            <g
              key={ms.key}
              role="button"
              tabIndex={0}
              aria-label={`${ms.when}: ${ms.name}`}
              aria-pressed={sel}
              style={{ cursor: "pointer", outline: "none" }}
              onClick={() => { pb.pause(); setIndex(k); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pb.pause(); setIndex(k); } }}
            >
              <circle cx={xs[k]} cy={26} r={12} fill="transparent" />
              {sel && <circle key={`ring-${ms.key}`} className="sc-ring" cx={xs[k]} cy={26} r={7} fill="none" stroke={ERA[ms.era].color} strokeWidth={2} />}
              <circle cx={xs[k]} cy={26} r={sel ? 7 : 4.5} fill={past ? ERA[ms.era].color : "var(--panel)"} stroke={past ? "var(--panel)" : "var(--line-2)"} strokeWidth={sel ? 2.5 : 1.5} style={{ transition: "r .3s" }} />
            </g>
          );
        })}
        {[1950, 2000, 2010, 2017, 2020, 2025].filter((y) => !(narrow && (y === 2010 || y === 2017))).map((y) => (
          <text key={y} x={padX + yearFrac(y) * tw} y={62} textAnchor="middle" className="axis">{y}</text>
        ))}
      </svg>

      {/* milestone card */}
      <div key={m.key} className="sc-card sc-in" style={{ borderLeft: `3px solid ${ERA[m.era].color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
          <b style={{ fontSize: "1.02rem", color: "var(--text)" }}>{m.name}</b>
          <span className="sc-count">{m.when} · {m.who}</span>
        </div>
        <div className="sc-cap" style={{ marginTop: 4 }}>{m.line}</div>
        <div style={{ marginTop: 8 }}>
          <span className="sc-chip" style={{ background: m.params ? "var(--accent-soft)" : "var(--panel-3)", color: m.params ? "var(--accent-strong)" : "var(--muted)" }}>
            {m.params ? `${human(m.params)} parameters${m.paramsNote ? ` (${m.paramsNote})` : ""}` : m.paramsNote ?? "no single parameter count to compare"}
          </span>
        </div>
      </div>

      {/* parameter chart */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <span className="sc-label">Published model size (log scale)</span>
          <span className="sc-count">each grid line = 10×</span>
        </div>
        <svg width={w} height={ch} role="img" aria-label="parameter counts by year, log scale">
          <defs>
            <clipPath id={clipId}><rect x={0} y={0} width={Math.max(0, clipW)} height={ch} /></clipPath>
          </defs>
          {[1e7, 1e8, 1e9, 1e10, 1e11, 1e12].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={cy(v)} y2={cy(v)} stroke="var(--line)" />
              <text x={pad.l - 6} y={cy(v) + 4} textAnchor="end" className="axis">{human(v)}</text>
            </g>
          ))}
          {[2017, 2019, 2021, 2023, 2025].map((y) => (
            <text key={y} x={cx(y)} y={ch - 6} textAnchor="middle" className="axis">{y}</text>
          ))}
          <g clipPath={`url(#${clipId})`}>
            <path d={frontier.join("")} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
            {sized.map(({ ms, k }) => {
              const x = cx(ms.year), y = cy(ms.params as number), sel = k === i;
              const below = ms.key === "instructgpt" || ms.key === "bert";
              return (
                <g key={ms.key} style={{ cursor: "pointer" }} onClick={() => { pb.pause(); setIndex(k); }}>
                  <circle cx={x} cy={y} r={sel ? 7 : 5} fill={ms.key === "instructgpt" ? "var(--ai)" : "var(--accent)"} stroke="var(--panel)" strokeWidth={2} />
                  {(!narrow || sel) && (
                    <text x={Math.min(x + 8, w - 70)} y={below ? y + 16 : y - 8} className={`axis ${sel ? "strong" : ""}`}>
                      {ms.name.replace(" (RLHF)", "")} {human(ms.params as number)}
                    </text>
                  )}
                </g>
              );
            })}
            {MILESTONES.map((ms, k) => ms.params === null && ms.year >= cx0 ? (
              <g key={ms.key} onClick={() => { pb.pause(); setIndex(k); }} style={{ cursor: "pointer" }}>
                <line x1={cx(ms.year)} x2={cx(ms.year)} y1={pad.t} y2={pad.t + 26} stroke={ms.key === m.key ? "var(--ai)" : "var(--line-2)"} strokeDasharray="3 3" strokeWidth={2} />
                <text x={cx(ms.year)} y={pad.t + 38} textAnchor="middle" className="axis">?</text>
              </g>
            ) : null)}
          </g>
          {m.year < cx0 && (
            <text x={(pad.l + w) / 2} y={ch / 2} textAnchor="middle" className="axis">Model sizes become headline numbers from 2017 →</text>
          )}
        </svg>
        <div className="sc-count" style={{ whiteSpace: "normal" }}>Green line: largest published size so far. “?” = size not published.</div>
      </div>

      <Transport pb={pb} index={i} last={last} label="milestone" />
    </div>
  );
}
