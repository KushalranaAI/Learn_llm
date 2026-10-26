"use client";
// pass@k vs pass^k: a grid of attempts per task revealed one attempt at a time, and both curves against k.
import "./sims-d.css";
import { C, LineChart } from "../ui";
import { num, type SimViewProps } from "../types";
import { SimStyle, Transport, useLocalPlayback } from "../c/anim";
import { attemptGrid, model, passAt, passHat } from "./pass-at-k-model";

const SHOW = 10;

export default function PassAtKView({ params, metrics }: SimViewProps) {
  const m = model(params);
  const k = m.k;
  // show up to 10 tasks, spread evenly across the difficulty range
  const idx = m.ps.length <= SHOW ? m.ps.map((_, i) => i) : Array.from({ length: SHOW }, (_, i) => Math.round((i * (m.ps.length - 1)) / (SHOW - 1)));
  const rows = idx.map((i) => m.ps[i]);
  const grid = attemptGrid(rows, k);
  const pb = useLocalPlayback(k, 380, `${k}|${num(params, "tasks")}|${num(params, "spread")}|${num(params, "p")}`);
  const shown = pb.index;
  const anyN = grid.filter((g) => g.slice(0, shown).some(Boolean)).length;
  const allN = shown > 0 ? grid.filter((g) => g.slice(0, shown).every(Boolean)).length : 0;
  const ks = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <div className="sd sc" ref={pb.rootRef}>
      <SimStyle />
      <Transport pb={pb} index={shown} last={k} label="attempt" />
      <div className="sd-card">
        <div className="sd-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <span className="sd-label">{rows.length} of {m.ps.length} task{m.ps.length > 1 ? "s" : ""} · {k} attempt{k > 1 ? "s" : ""} each</span>
          <span className="sd-legend">
            <span><i style={{ background: "var(--good)" }} />solved</span>
            <span><i style={{ background: "color-mix(in srgb, var(--bad) 70%, transparent)" }} />failed</span>
          </span>
        </div>
        <div className="sd-attempts" style={{ gridTemplateColumns: "64px minmax(0, 1fr) 40px 40px" }}>
          <span />
          <span className="sd-label" style={{ fontSize: "0.64rem" }}>attempts →</span>
          <span className="sd-label" style={{ fontSize: "0.64rem", textAlign: "center" }} title="pass@k: at least one success">any</span>
          <span className="sd-label" style={{ fontSize: "0.64rem", textAlign: "center" }} title="pass^k: every attempt succeeds">all</span>
          {grid.map((g, r) => {
            const seen = g.slice(0, shown);
            const any = seen.some(Boolean);
            const all = shown > 0 && seen.every(Boolean);
            return [
              <span key={`l${r}`} className="sd-tl sd-mono" title={`per-attempt success ${(rows[r] * 100).toFixed(0)}%`}>p={(rows[r] * 100).toFixed(0)}%</span>,
              <span key={`c${r}`} className="sd-cells" style={{ gridTemplateColumns: `repeat(${k}, minmax(0, 22px))` }}>
                {g.map((ok, j) => (
                  <span key={`${j}-${j < shown}`} className={`sd-cell ${j < shown ? (ok ? "ok" : "no") : "empty"} ${j === shown - 1 ? "new" : ""}`} aria-hidden="true">
                    {j < shown && k <= 12 ? (ok ? "✓" : "✗") : ""}
                  </span>
                ))}
              </span>,
              <span key={`a${r}`} style={{ textAlign: "center" }}>{shown > 0 && <span className={`sd-mark ${any ? "ok" : "bad"}`}>{any ? "✓" : "✗"}</span>}</span>,
              <span key={`b${r}`} style={{ textAlign: "center" }}>{shown > 0 && <span className={`sd-mark ${all ? "ok" : "bad"}`}>{all ? "✓" : "✗"}</span>}</span>,
            ];
          })}
        </div>
        <p className="sd-cap" style={{ margin: "8px 0 0" }} aria-live="polite">
          After {shown} attempt{shown === 1 ? "" : "s"}: <b style={{ color: "var(--info)" }}>{anyN}/{rows.length}</b> tasks solved at least once (pass@{shown || 1} expects {(passAt(rows, Math.max(1, shown)) * rows.length).toFixed(1)}),{" "}
          <b style={{ color: "var(--warm)" }}>{allN}/{rows.length}</b> solved every time (pass^{shown || 1} expects {(passHat(rows, Math.max(1, shown)) * rows.length).toFixed(1)}).
        </p>
      </div>
      <div className="sd-stats">
        <div className="sd-stat"><span>pass@1 (one try)</span><b>{(metrics.pass1 * 100).toFixed(1)}%</b></div>
        <div className="sd-stat good"><span>pass@{k} (any)</span><b>{(metrics.passAtK * 100).toFixed(1)}%</b></div>
        <div className="sd-stat bad"><span>pass^{k} (all)</span><b>{(metrics.passHatK * 100).toFixed(1)}%</b></div>
      </div>
      <LineChart
        x={ks}
        series={[
          { name: "pass@k: succeeds at least once", values: ks.map((x) => passAt(m.ps, x)), color: C.blue },
          { name: "pass^k: succeeds every time", values: ks.map((x) => passHat(m.ps, x)), color: "var(--warm)" },
          { name: "pass@1", values: ks.map(() => m.pass1), color: C.muted, dashed: true },
        ]}
        xLabel="attempts k"
        yFormat="pct"
        yMax={1}
        marker={k - 1}
        height={210}
      />
    </div>
  );
}
