"use client";
// Extra picture primitives for group B (built on the shared ui.tsx palette and sizing). Client-only: SvgBox uses a hook.
import type { CSSProperties, ReactNode } from "react";
import { C, fmt, useWidth } from "../ui";
import type { MetricFormat } from "../types";

/** Small caption above a picture. */
export function Caption({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 4, fontWeight: 600, letterSpacing: "0.02em" }}>{children}</div>;
}

/** Horizontal bars: one row per item, value in [0, max]. Good for probabilities and ranked scores. */
export function HBars({
  rows,
  max,
  format = "num",
  labelWidth = 110,
}: {
  rows: { label: string; value: number; color?: string; note?: string; struck?: boolean; bold?: boolean; /** replaces the formatted value */ display?: string }[];
  max?: number;
  format?: MetricFormat;
  labelWidth?: number;
}) {
  const top = max ?? Math.max(1e-9, ...rows.map((x) => x.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.8rem" }}>
      {rows.map((x, i) => (
        <div key={`${x.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: labelWidth,
              flex: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono), monospace",
              textDecoration: x.struck ? "line-through" : undefined,
              color: x.struck ? "var(--muted)" : "var(--text)",
              fontWeight: x.bold ? 700 : 400,
            }}
            title={x.label}
          >
            {x.label}
          </span>
          <span style={{ flex: 1, minWidth: 30, height: 12, background: "var(--card-3)", borderRadius: 6, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(1, x.value / top)) * 100}%`, background: x.color ?? C.accent, opacity: x.struck ? 0.35 : 1, borderRadius: 6 }} />
          </span>
          <span style={{ width: 58, flex: "none", textAlign: "right", fontFamily: "var(--font-mono), monospace", color: "var(--text-2)" }}>{x.display ?? fmt(x.value, format)}</span>
          {x.note !== undefined && <span style={{ width: 62, flex: "none", color: "var(--muted)", fontSize: "0.74rem" }}>{x.note}</span>}
        </div>
      ))}
    </div>
  );
}

/** A responsive SVG box: children get the measured width. */
export function SvgBox({ height, children, label }: { height: number; label: string; children: (w: number) => ReactNode }) {
  const [ref, w] = useWidth();
  return (
    <div ref={ref} className="chart">
      <svg width={w} height={height} role="img" aria-label={label}>
        {children(w)}
      </svg>
    </div>
  );
}

/** Pill badge. */
export function Pill({ children, color = C.accent, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: "0.72rem",
        fontWeight: 600,
        border: `1px solid ${color}`,
        color,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** A responsive row of equal columns that wraps on narrow screens. */
export function Columns({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>;
}

