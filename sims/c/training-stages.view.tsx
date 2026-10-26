"use client";
// Stage track with an animated progress rail; data samples slide in; the model's answer types itself out per stage.
import type { SimViewProps } from "../types";
import { SimStyle, Transport, usePlayback, useTween, useTypewriter } from "./anim";
import { STAGES, VERDICT, promptOf, stageOf } from "./training-stages-data";

const COLORS = ["var(--info)", "var(--accent)", "var(--ai)", "var(--warm)"];
const CPS = 70;

export default function TrainingStagesView({ params, setParam }: SimViewProps) {
  const s = stageOf(params);
  const P = promptOf(params);
  const last = STAGES.length - 1;
  const setIndex = (k: number) => setParam("stage", STAGES[Math.max(0, Math.min(last, k))].key);
  const pb = usePlayback({ index: s, setIndex, last, ms: (i) => Math.max(2600, (P.answers[i].length / CPS) * 1000 + 1800) });
  const rail = useTween(s / last, 700);
  const answer = P.answers[s];
  const shown = useTypewriter(answer, `${s}|${params.prompt}`, CPS);
  const st = STAGES[s];
  const typing = shown < answer.length;

  return (
    <div className="sc" ref={pb.rootRef}>
      <SimStyle />
      {/* stage track */}
      <div style={{ position: "relative", padding: "0 6px" }}>
        <div style={{ position: "absolute", left: "12.5%", right: "12.5%", top: 15, height: 4, borderRadius: 99, background: "var(--panel-3)" }}>
          <div style={{ width: `${rail * 100}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg, var(--info), var(--accent), var(--ai), var(--warm))" }} />
        </div>
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 4 }}>
          {STAGES.map((x, k) => {
            const on = k === s, done = k < s;
            return (
              <button
                key={x.key}
                type="button"
                onClick={() => { pb.pause(); setIndex(k); }}
                aria-current={on ? "step" : undefined}
                style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center", minWidth: 0 }}
              >
                <span
                  className={on ? "sc-pop" : ""}
                  key={on ? `on-${k}` : `off-${k}`}
                  style={{ width: 34, height: 34, borderRadius: 99, display: "grid", placeItems: "center", fontWeight: 700, fontSize: "0.85rem", background: on || done ? COLORS[k] : "var(--panel-2)", color: on || done ? "var(--on-accent)" : "var(--muted)", border: `2px solid ${on ? "var(--text)" : "var(--panel)"}`, transition: "background .3s" }}
                >
                  {k + 1}
                </span>
                <span style={{ fontSize: "0.74rem", fontWeight: on ? 700 : 500, color: on ? "var(--text)" : "var(--muted)", lineHeight: 1.25 }}>{x.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div key={`what-${s}`} className="sc-in sc-cap" style={{ textAlign: "center", color: "var(--text)" }}>
        <b style={{ color: COLORS[s] }}>{st.short}.</b> {st.what}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        {/* data */}
        <div className="sc-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="sc-label">Training data · {st.data}</span>
          <div key={`data-${s}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {st.sample.map((line, i) => (
              <span key={i} className="sc-in sc-mono" style={{ animationDelay: `${i * 160}ms`, fontSize: "0.76rem", padding: "4px 7px", borderRadius: 6, background: "var(--panel)", border: "1px solid var(--line)", color: "var(--text-2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {line}
              </span>
            ))}
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
              <span className="sc-count">data scale (illustrative)</span>
              <span className="sc-count" style={{ color: "var(--text-2)" }}>{Number.isFinite(st.dataLog10) ? `~10^${st.dataLog10} ${st.dataUnit}` : "none"}</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "var(--panel-3)", overflow: "hidden", marginTop: 4 }}>
              <div key={`bar-${s}`} className="sc-grow" style={{ height: "100%", width: `${Number.isFinite(st.dataLog10) ? (st.dataLog10 / 13) * 100 : 0}%`, background: COLORS[s], borderRadius: 99 }} />
            </div>
          </div>
        </div>

        {/* answer */}
        <div className="sc-card" style={{ display: "flex", flexDirection: "column", gap: 8, borderColor: `color-mix(in srgb, ${COLORS[s]} 45%, var(--line))` }}>
          <span className="sc-label">The model after stage {s + 1}</span>
          <span className="sc-mono" style={{ fontSize: "0.78rem", color: "var(--muted)" }}>User: {P.text}</span>
          <div aria-live="polite" style={{ fontSize: "0.9rem", lineHeight: 1.55, color: "var(--text)", whiteSpace: "pre-wrap", minHeight: 96 }}>
            {answer.slice(0, shown)}
            {typing && <span className="sc-caret" aria-hidden="true" />}
          </div>
          <span key={`v-${s}-${typing}`} className={typing ? "" : "sc-pop"} style={{ alignSelf: "flex-start", fontSize: "0.76rem", padding: "3px 8px", borderRadius: 99, background: `color-mix(in srgb, ${COLORS[s]} 16%, transparent)`, color: "var(--text-2)", opacity: typing ? 0 : 1 }}>
            {VERDICT[s]}
          </span>
        </div>
      </div>

      <Transport pb={pb} index={s} last={last} label="stage" />
    </div>
  );
}
