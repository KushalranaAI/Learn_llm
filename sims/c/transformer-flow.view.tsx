"use client";
// Vertical pipeline: a packet drops from stage to stage; the active stage lights up with a one-line caption.
import type { ReactNode } from "react";
import NeuralNetDiagram from "../nn-diagram";
import type { SimViewProps } from "../types";
import { SimStyle, Transport, usePlayback } from "./anim";
import { D, STAGES, mlpToy, runFlow, stageIndex } from "./transformer-flow-model";

const TONES = ["var(--accent)", "var(--info)", "var(--ai)", "var(--warm)", "var(--good)"];
const tint = (c: string, pct = 20) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
const vis = (t: string) => t.replace(/^ /, "␣");

function Cells({ v, size = 11 }: { v: number[]; size?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }} aria-label={`vector [${v.join(", ")}]`}>
      {v.map((x, i) => (
        <span key={i} title={x.toFixed(2)} style={{ width: size, height: size * 1.6, borderRadius: 3, background: x >= 0 ? "var(--accent)" : "var(--ai)", opacity: 0.18 + Math.abs(x) * 0.82 }} />
      ))}
    </span>
  );
}

function Bars({ rows, max, fmt, hl }: { rows: [string, number][]; max: number; fmt: (v: number) => string; hl: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {rows.map(([lab, v], i) => (
        <div key={lab} style={{ display: "grid", gridTemplateColumns: "minmax(60px, 26%) minmax(0,1fr) 46px", gap: 8, alignItems: "center", fontSize: "0.8rem" }}>
          <span className="sc-mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "pre", color: i === hl ? "var(--accent-strong)" : "var(--text-2)" }}>{vis(lab)}</span>
          <span style={{ height: 10, background: "var(--panel-3)", borderRadius: 99, overflow: "hidden" }}>
            <span className="sc-grow" style={{ display: "block", height: "100%", width: `${Math.max(2, (v / max) * 100)}%`, background: i === hl ? "var(--accent)" : "var(--info)", borderRadius: 99, animationDelay: `${i * 60}ms` }} />
          </span>
          <span className="sc-mono" style={{ textAlign: "right", color: "var(--text-2)" }}>{fmt(v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function TransformerFlowView({ params, setParam }: SimViewProps) {
  const r = runFlow(params);
  const s = stageIndex(params);
  const last = STAGES.length - 1;
  const setIndex = (k: number) => setParam("stage", STAGES[Math.max(0, Math.min(last, k))].key);
  const pb = usePlayback({ index: s, setIndex, last, ms: (i) => (i === 4 || i === 5 ? 1500 + r.L * 350 : 1700) });
  const n = r.S.tokens.length;
  // toy attention of the last token over the sequence: softmax(q·k / √d) with q = k = the embeddings
  const mlp = mlpToy(r.vectors);
  const att = mlp.att;

  // rows: the blocks row covers stages 4 (attention) and 5 (MLP)
  const rows: { stages: number[]; title: string; body: ReactNode }[] = [
    { stages: [0], title: "Text", body: <span className="sc-mono" style={{ fontSize: "0.95rem" }}>{r.S.label}</span> },
    {
      stages: [1], title: "Tokens",
      body: <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{r.S.tokens.map((t, i) => <span key={i} className="sc-chip" style={{ background: tint(TONES[i % 5]) }}>{vis(t)}</span>)}</span>,
    },
    {
      stages: [2], title: "Token IDs",
      body: <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{r.S.ids.map((id, i) => <span key={i} className="sc-chip" style={{ background: tint(TONES[i % 5]), fontWeight: 600 }}>{id}</span>)}</span>,
    },
    {
      stages: [3], title: `Embeddings (d = ${D})`,
      body: (
        <span style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
          {r.vectors.map((v, i) => (
            <span key={i} style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
              <span className="sc-mono" style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{vis(r.S.tokens[i])}</span>
              <Cells v={v} size={8} />
            </span>
          ))}
        </span>
      ),
    },
    {
      stages: [4, 5], title: `${r.L} transformer block${r.L > 1 ? "s" : ""}`,
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Array.from({ length: r.L }, (_, k) => (
              <div key={`${k}-${s}`} style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4, minWidth: 96, flex: "1 1 96px", background: "var(--panel)" }}>
                <span className="sc-count">block {k + 1}</span>
                {(["attention", "mlp"] as const).map((part) => {
                  const on = (part === "attention" && s === 4) || (part === "mlp" && s === 5);
                  return (
                    <span key={part} className={on ? "sc-glow" : ""} style={{ animationDelay: `${k * 350}ms`, borderRadius: 6, padding: "2px 6px", fontSize: "0.76rem", fontWeight: 600, border: `1px solid ${on ? "var(--accent-line)" : "var(--line)"}`, color: on ? "var(--accent-strong)" : "var(--text-2)" }}>
                      {part === "attention" ? "Attention" : "MLP"}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          {s >= 5 && (
            <div key={`mlp-${r.S.label}`} className="sc-in">
              <span className="sc-label">Inside one MLP: neurons (4 of the {D} numbers shown)</span>
              <NeuralNetDiagram
                height={200}
                range={[-1, 1]}
                caption="h = ReLU(W₁x + b), out = W₂h"
                layers={[
                  { title: "token vector", nodes: mlp.x.map((v, i) => ({ value: v, label: `x${"₁₂₃₄"[i]}` })) },
                  { title: "hidden (ReLU)", nodes: mlp.h.map((v) => ({ value: v })) },
                  { title: "new vector", nodes: mlp.y.map((v, i) => ({ value: v, label: `y${"₁₂₃₄"[i]}` })) },
                ]}
                weights={[mlp.W1, mlp.W2]}
              />
            </div>
          )}
          {s === 4 && (
            <div className="sc-cap" style={{ fontSize: "0.8rem" }}>
              <span className="sc-label">“{vis(r.S.tokens[n - 1]).trim()}” attends to</span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {r.S.tokens.map((t, i) => (
                  <span key={i} className="sc-chip" title={`${(att[i] * 100).toFixed(0)}%`} style={{ background: `color-mix(in srgb, var(--accent) ${Math.round(8 + att[i] * 80)}%, transparent)` }}>
                    {vis(t)} <small style={{ opacity: 0.75 }}>{(att[i] * 100).toFixed(0)}%</small>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      stages: [6], title: "Logits (scores)",
      body: <Bars rows={r.S.cands} max={8} fmt={(v) => v.toFixed(1)} hl={r.top} />,
    },
    {
      stages: [7], title: "Probabilities (softmax)",
      body: <Bars rows={r.S.cands.map((c, i) => [c[0], r.probs[i]])} max={1} fmt={(v) => `${(v * 100).toFixed(0)}%`} hl={r.top} />,
    },
    {
      stages: [8], title: "Next token",
      body: (
        <span className="sc-mono" style={{ fontSize: "0.95rem" }}>
          {r.S.label}
          <span key={`nx-${s}-${r.S.label}`} className={s === 8 ? "sc-fly" : ""} style={{ display: "inline-block", whiteSpace: "pre", color: "var(--accent-strong)", background: "var(--accent-soft)", borderRadius: 5, padding: "0 2px" }}>
            {r.S.cands[r.top][0]}
          </span>
          <span className="sc-count" style={{ marginLeft: 8 }}>↺ append, repeat</span>
        </span>
      ),
    },
  ];

  return (
    <div className="sc" ref={pb.rootRef}>
      <SimStyle />
      <div key={`cap-${s}`} className="sc-card sc-in" style={{ borderColor: "var(--accent-line)", background: "var(--accent-soft)", display: "flex", gap: 10, alignItems: "baseline" }}>
        <b className="sc-mono" style={{ color: "var(--accent-strong)" }}>{s + 1}/{STAGES.length}</b>
        <span className="sc-cap" style={{ color: "var(--text)" }}><b>{STAGES[s].label}.</b> {STAGES[s].cap}</span>
      </div>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {rows.map((row, k) => {
          const active = row.stages.includes(s);
          const done = Math.max(...row.stages) < s;
          const future = !active && !done;
          return (
            <li key={row.title + k} style={{ display: "grid", gridTemplateColumns: "22px minmax(0,1fr)", gap: 10 }}>
              <span style={{ position: "relative", display: "flex", justifyContent: "center" }} aria-hidden="true">
                {k < rows.length - 1 && <span style={{ position: "absolute", top: 16, bottom: -2, width: 2, background: done ? "var(--accent)" : "var(--line)", transition: "background .4s" }} />}
                <span style={{ position: "relative", marginTop: 6, width: 12, height: 12, borderRadius: 99, background: active || done ? "var(--accent)" : "var(--panel-3)", border: "2px solid var(--panel)", boxShadow: active ? "0 0 0 3px var(--accent-line)" : "none", transition: "background .3s" }} />
                {active && <span key={`pk-${s}`} className="sc-drop" style={{ position: "absolute", top: 7, width: 8, height: 8, borderRadius: 99, background: "var(--accent-strong)", boxShadow: "0 0 10px var(--accent)" }} />}
              </span>
              <div
                style={{ marginBottom: 8, padding: "6px 10px", borderRadius: 10, border: `1px solid ${active ? "var(--accent-line)" : "transparent"}`, background: active ? "var(--panel-2)" : "transparent", opacity: future ? 0.38 : 1, transition: "opacity .4s, background .3s, border-color .3s", minWidth: 0 }}
              >
                <button
                  type="button"
                  onClick={() => { pb.pause(); setIndex(row.stages[0]); }}
                  style={{ all: "unset", cursor: "pointer", display: "block", marginBottom: 4 }}
                  className="sc-label"
                  aria-current={active ? "step" : undefined}
                >
                  {row.title}
                </button>
                {row.body}
              </div>
            </li>
          );
        })}
      </ol>
      <Transport pb={pb} index={s} last={last} label="stage" />
    </div>
  );
}
