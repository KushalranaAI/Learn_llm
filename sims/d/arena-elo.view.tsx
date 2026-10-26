"use client";
// Arena ratings: votes stream in, the Bradley–Terry fit and its 95% intervals settle; a win-rate heatmap underneath.
import "./sims-d.css";
import { C, Heatmap } from "../ui";
import { num, type SimViewProps } from "../types";
import { SvgBox } from "../b/viz";
import { SimStyle, Transport, useLocalPlayback } from "../c/anim";
import { NAMES, fitBT, model, orderOf, winCounts } from "./arena-elo-model";

const FRAMES = 20;

export default function ArenaEloView({ params }: SimViewProps) {
  const { truth, votes } = model(params);
  const M = truth.length;
  const pb = useLocalPlayback(FRAMES, 260, `${num(params, "seed")}|${num(params, "votes")}|${M}|${num(params, "trueGap")}`);
  const upto = Math.round((votes.length * pb.index) / FRAMES);
  const wins = winCounts(M, votes, upto);
  const fit = fitBT(wins);
  const fo = orderOf(fit.ratings);
  const to = orderOf(truth);
  const correct = upto > 0 && fo.every((x, i) => x === to[i]);
  const lo = Math.min(...truth, ...fit.ratings.map((r, i) => r - 1.96 * fit.se[i]));
  const hi = Math.max(...truth, ...fit.ratings.map((r, i) => r + 1.96 * fit.se[i]));
  const span = Math.max(40, hi - lo);
  const x0 = lo - span * 0.06, x1 = hi + span * 0.06;
  const rowH = 30;
  const rate = wins.map((row, i) => row.map((w, j) => (i === j ? 0 : w + wins[j][i] > 0 ? w / (w + wins[j][i]) : 0.5)));
  const names = truth.map((_, i) => NAMES[i].replace("Model ", ""));

  return (
    <div className="sd sc" ref={pb.rootRef}>
      <SimStyle />
      <Transport pb={pb} index={pb.index} last={FRAMES} label="batch" />
      <div className="sd-card">
        <div className="sd-row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <span className="sd-label">Fitted rating ± 95% CI after {upto.toLocaleString("en-US")} votes</span>
          <span className={`sd-badge ${correct ? "good" : "bad"}`}>{upto === 0 ? "no votes yet" : correct ? "ranking correct" : "ranking wrong"}</span>
        </div>
        <SvgBox height={M * rowH + 30} label="ratings with confidence intervals">
          {(w) => {
            const padL = 66, padR = 14;
            const sx = (v: number) => padL + ((v - x0) / (x1 - x0)) * (w - padL - padR);
            const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(x0 + f * (x1 - x0)));
            return (
              <>
                {ticks.map((t) => (
                  <g key={t}>
                    <line x1={sx(t)} x2={sx(t)} y1={4} y2={M * rowH + 6} stroke={C.grid} />
                    <text x={sx(t)} y={M * rowH + 22} textAnchor="middle" className="axis">{t}</text>
                  </g>
                ))}
                {truth.map((tr, i) => {
                  const y = 6 + i * rowH + rowH / 2;
                  const f = fit.ratings[i];
                  const h = 1.96 * fit.se[i];
                  const rank = fo.indexOf(i) + 1;
                  const ok = rank === to.indexOf(i) + 1;
                  return (
                    <g key={i}>
                      <text x={4} y={y + 4} className="axis strong">{NAMES[i]}</text>
                      <rect className="sd-bar" x={sx(x0)} y={y - 6} width={Math.max(0, sx(f) - sx(x0))} height={12} rx={4} fill={ok ? "var(--accent)" : "var(--warm)"} opacity={0.22} />
                      <line className="sd-bar" x1={sx(f - h)} x2={sx(f + h)} y1={y} y2={y} stroke={ok ? "var(--accent)" : "var(--warm)"} strokeWidth={3} strokeLinecap="round" />
                      <line x1={sx(f - h)} x2={sx(f - h)} y1={y - 6} y2={y + 6} stroke={ok ? "var(--accent)" : "var(--warm)"} strokeWidth={2} />
                      <line x1={sx(f + h)} x2={sx(f + h)} y1={y - 6} y2={y + 6} stroke={ok ? "var(--accent)" : "var(--warm)"} strokeWidth={2} />
                      <circle cx={sx(f)} cy={y} r={5} fill={ok ? "var(--accent)" : "var(--warm)"} />
                      <path d={`M${sx(tr)},${y - 9} l5,-7 h-10 z`} fill="var(--text-2)">
                        <title>true rating {Math.round(tr)}</title>
                      </path>
                      <text x={w - padR} y={y - 8} textAnchor="end" className="axis">#{rank} · {Math.round(f)}</text>
                    </g>
                  );
                })}
              </>
            );
          }}
        </SvgBox>
        <div className="sd-legend">
          <span><i style={{ background: "var(--accent)" }} />fitted, rank matches truth</span>
          <span><i style={{ background: "var(--warm)" }} />rank wrong</span>
          <span><i style={{ background: "var(--text-2)", borderRadius: 0, clipPath: "polygon(50% 100%, 0 0, 100% 0)" }} />true rating</span>
        </div>
      </div>
      <div className="sd-card">
        <span className="sd-label">Win rate, row model vs column model</span>
        <Heatmap rows={names.map((n) => `${n} beats`)} cols={names} values={rate} max={1} format="pct" cell={M > 5 ? 36 : 40} />
      </div>
    </div>
  );
}
