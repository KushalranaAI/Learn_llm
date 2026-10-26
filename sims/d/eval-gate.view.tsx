"use client";
// The regression gate: sampling distributions of the measured drop for a clean and a regressed build, the threshold,
// the two error areas, and CI runs dropping in one at a time.
import "./sims-d.css";
import { C } from "../ui";
import { num, type SimViewProps } from "../types";
import { SvgBox } from "../b/viz";
import { normPdf } from "../b/lib";
import { SimStyle, Transport, useLocalPlayback } from "../c/anim";
import { RUNS, ciRuns, model } from "./eval-gate-sim-model";

export default function EvalGateView({ params, metrics }: SimViewProps) {
  const m = model(params);
  const runs = ciRuns(params);
  const last = 2 * RUNS;
  const pb = useLocalPlayback(last, 420, `${num(params, "seed")}|${m.n}|${m.thresholdPp}|${m.regressionPp}|${m.noisePp}|${m.baseline}`);
  const shown = pb.index;
  const order = Array.from({ length: last }, (_, i) => (i % 2 === 0 ? { kind: "clean" as const, v: runs.clean[i / 2] } : { kind: "regressed" as const, v: runs.regressed[(i - 1) / 2] }));
  const vis = order.slice(0, shown);
  const falseBlocks = vis.filter((r) => r.kind === "clean" && r.v > m.thresholdPp).length;
  const misses = vis.filter((r) => r.kind === "regressed" && r.v <= m.thresholdPp).length;
  const cleanN = vis.filter((r) => r.kind === "clean").length;
  const regN = vis.length - cleanN;
  const lo = Math.min(-3.6 * m.se, m.thresholdPp - 1, ...runs.clean, ...runs.regressed);
  const hi = Math.max(m.regressionPp + 3.6 * m.se, m.thresholdPp + 1, ...runs.clean, ...runs.regressed);
  const peak = normPdf(0) / m.se;
  const H = 250, top = 14, axisY = 150;

  return (
    <div className="sd sc" ref={pb.rootRef}>
      <SimStyle />
      <Transport pb={pb} index={shown} last={last} label="CI run" />
      <div className="sd-card">
        <span className="sd-label">Measured drop on {m.n.toLocaleString("en-US")} items (± {m.se.toFixed(2)} pp standard error)</span>
        <SvgBox height={H} label="sampling distributions of the measured drop with the gate threshold">
          {(w) => {
            const padL = 12, padR = 12;
            const sx = (v: number) => padL + ((v - lo) / (hi - lo)) * (w - padL - padR);
            const sy = (d: number) => axisY - (d / peak) * (axisY - top - 8);
            const xs = Array.from({ length: 161 }, (_, i) => lo + ((hi - lo) * i) / 160);
            const curve = (mu: number) => xs.map((x) => [x, normPdf((x - mu) / m.se) / m.se] as const);
            const path = (mu: number) => curve(mu).map(([x, d], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(d).toFixed(1)}`).join("");
            const area = (mu: number, right: boolean) => {
              const pts = curve(mu).filter(([x]) => (right ? x >= m.thresholdPp : x <= m.thresholdPp));
              if (!pts.length) return "";
              const edge = right ? pts[0][0] : pts[pts.length - 1][0];
              const body = pts.map(([x, d]) => `L${sx(x).toFixed(1)},${sy(d).toFixed(1)}`).join("");
              return right
                ? `M${sx(m.thresholdPp)},${axisY}L${sx(m.thresholdPp)},${sy(normPdf((m.thresholdPp - mu) / m.se) / m.se)}${body}L${sx(pts[pts.length - 1][0])},${axisY}Z`
                : `M${sx(pts[0][0])},${axisY}${body}L${sx(edge)},${sy(normPdf((m.thresholdPp - mu) / m.se) / m.se)}L${sx(m.thresholdPp)},${axisY}Z`;
            };
            const ticks = Array.from(new Set([Math.ceil(lo), 0, Math.round(m.regressionPp), Math.floor(hi)])).filter((t) => t >= lo && t <= hi);
            return (
              <>
                <rect x={sx(m.thresholdPp)} y={top} width={Math.max(0, sx(hi) - sx(m.thresholdPp))} height={axisY - top} fill="var(--bad)" opacity={0.06} />
                <text x={Math.min(w - padR - 4, sx(m.thresholdPp) + 6)} y={top + 10} className="axis" style={{ fill: "var(--bad)" }} textAnchor={sx(m.thresholdPp) > w - 90 ? "end" : "start"}>BLOCK</text>
                <text x={Math.max(padL + 4, sx(m.thresholdPp) - 6)} y={top + 10} className="axis" style={{ fill: "var(--good)" }} textAnchor="end">SHIP</text>
                <path d={area(0, true)} fill="var(--bad)" opacity={0.45} />
                {m.regressionPp > 0 && <path d={area(m.regressionPp, false)} fill="var(--warm)" opacity={0.45} />}
                <path d={path(0)} fill="none" stroke="var(--info)" strokeWidth={2.25} />
                {m.regressionPp > 0 && <path d={path(m.regressionPp)} fill="none" stroke="var(--warm)" strokeWidth={2.25} strokeDasharray="6 4" />}
                <line x1={padL} x2={w - padR} y1={axisY} y2={axisY} stroke={C.grid} />
                {ticks.map((t) => (
                  <text key={t} x={sx(t)} y={axisY + 14} textAnchor="middle" className="axis">{t} pp</text>
                ))}
                <line x1={sx(m.thresholdPp)} x2={sx(m.thresholdPp)} y1={top} y2={H - 6} stroke="var(--text)" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={sx(m.thresholdPp)} y={H - 2} textAnchor="middle" className="axis strong">gate {m.thresholdPp} pp</text>
                <text x={padL} y={axisY + 40} className="axis">clean build</text>
                <text x={padL} y={axisY + 72} className="axis">regressed build</text>
                {vis.map((r, i) => {
                  const blocked = r.v > m.thresholdPp;
                  const right = r.kind === "clean" ? !blocked : blocked;
                  const y = r.kind === "clean" ? axisY + 50 : axisY + 82;
                  return (
                    <g key={i} className="sd-drop" style={{ transformBox: "fill-box" }}>
                      <circle cx={sx(r.v)} cy={y} r={6} fill={right ? "var(--good)" : "var(--bad)"} stroke="var(--panel)" strokeWidth={1.5}>
                        <title>{`${r.kind} build: measured drop ${r.v.toFixed(2)} pp → ${blocked ? "blocked" : "shipped"}`}</title>
                      </circle>
                    </g>
                  );
                })}
              </>
            );
          }}
        </SvgBox>
        <div className="sd-legend">
          <span><i style={{ background: "var(--info)" }} />clean build (no regression)</span>
          <span><i style={{ background: "var(--warm)" }} />build with a {m.regressionPp} pp regression</span>
          <span><i style={{ background: "color-mix(in srgb, var(--bad) 45%, transparent)" }} />false alarm area</span>
          <span><i style={{ background: "color-mix(in srgb, var(--warm) 45%, transparent)" }} />miss area</span>
        </div>
        <p className="sd-cap" style={{ margin: "6px 0 0" }} aria-live="polite">
          {shown === 0 ? "Press Play to run the gate on a clean and a regressed build, alternately." : `${cleanN} clean run${cleanN === 1 ? "" : "s"}: ${falseBlocks} wrongly blocked. ${regN} regressed run${regN === 1 ? "" : "s"}: ${misses} shipped anyway.`}
        </p>
      </div>
      <div className="sd-stats">
        <div className={`sd-stat ${metrics.falseAlarmRate > 0.1 ? "bad" : "good"}`}><span>False alarm rate</span><b>{(metrics.falseAlarmRate * 100).toFixed(1)}%</b></div>
        <div className={`sd-stat ${metrics.missRate > 0.2 ? "bad" : "good"}`}><span>Miss rate</span><b>{(metrics.missRate * 100).toFixed(1)}%</b></div>
        <div className="sd-stat"><span>Caught 80% of the time</span><b>≥ {(metrics.minDetectable * 100).toFixed(1)} pp</b></div>
      </div>
    </div>
  );
}
