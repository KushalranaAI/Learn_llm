"use client";
// A lab "design" step in the workspace layout: brief and hints on the left, the sandbox canvas in the middle,
// the test and its checks on the right.
import { type ReactNode, useState } from "react";
import type { LabStep } from "@/labs/types";
import { SandboxCanvas } from "@/sandbox/Canvas";
import { constraintLabel, evaluateDesign } from "@/sandbox/engine";
import type { DesignEvaluation, Graph } from "@/sandbox/types";
import MiniMarkdown from "./MiniMarkdown";
import Icon from "./ui/Icon";

export default function DesignStep({
  step,
  onPass,
  brief,
  nav,
}: {
  step: Extract<LabStep, { type: "design" }>;
  onPass: () => void;
  brief?: ReactNode;
  nav?: ReactNode;
}) {
  const [initial, setInitial] = useState<Graph>(() => step.starter ?? { nodes: [], edges: [] });
  const [graph, setGraph] = useState<Graph>(initial);
  const [evaluation, setEvaluation] = useState<DesignEvaluation | null>(null);
  const [stale, setStale] = useState(false);
  const [hints, setHints] = useState(0);

  const test = () => {
    const e = evaluateDesign(graph, step.test);
    setEvaluation(e);
    setStale(false);
    if (e.pass) onPass();
  };
  const load = (g: Graph) => {
    setInitial(g);
    setGraph(g);
    setEvaluation(null);
  };
  const passed = evaluation?.results.filter((r) => r.pass).length ?? 0;

  return (
    <div className="simws design-ws">
      <aside className="simws-left">
        <div className="simws-brief">
          {brief}
          <div className="row" style={{ marginTop: 12, gap: 6 }}>
            {hints < step.hints.length && <button type="button" className="chip-btn" onClick={() => setHints(hints + 1)}><Icon name="lightbulb" size={14} /> Hint {hints + 1}/{step.hints.length}</button>}
            <button type="button" className="chip-btn" onClick={() => load(step.solution)}><Icon name="eye" size={14} /> Solution</button>
            <button type="button" className="chip-btn" onClick={() => load(step.starter ?? { nodes: [], edges: [] })}><Icon name="refresh" size={14} /> Start over</button>
          </div>
          {step.hints.slice(0, hints).map((h) => <div key={h} className="callout tip"><b><Icon name="lightbulb" size={15} /> Hint</b><MiniMarkdown>{h}</MiniMarkdown></div>)}
        </div>
      </aside>

      <section className="simws-stage" aria-label="Sandbox canvas">
        <div className="simws-stage-head">
          <span className="eyebrow" style={{ margin: 0 }}><Icon name="boxes" size={13} /> Build</span>
          <b>Wire the system, then run the test</b>
        </div>
        <SandboxCanvas
          initial={initial}
          palette={step.palette}
          height={600}
          result={evaluation?.run ?? null}
          stale={stale}
          onChange={(g) => {
            setGraph(g);
            setStale(true);
          }}
        />
      </section>

      <aside className="simws-right">
        <div className="simws-panel">
          <button type="button" className="btn primary" style={{ width: "100%" }} onClick={test}><Icon name="play" size={15} /> Run the test</button>
        </div>
        <div className="simws-panel">
          <div className="simws-panel-head">
            <h4>Checks</h4>
            {evaluation && <span className={`pill ${evaluation.pass ? "accent" : ""}`}>{passed}/{evaluation.results.length}</span>}
          </div>
          {!evaluation && (
            <ul className="goal-list" style={{ border: 0, padding: 0 }}>
              {step.test.constraints.map((c, k) => (
                <li key={k}><Icon name="circle" size={16} /> {constraintLabel(c)}</li>
              ))}
            </ul>
          )}
          {evaluation && (
            <>
              {stale && <p className="muted small">You changed the design: run the test again.</p>}
              <ul className="goal-list" style={{ border: 0, padding: 0 }}>
                {evaluation.results.map((r) => (
                  <li key={r.label} className={r.pass ? "ok" : ""} style={{ alignItems: "flex-start" }}>
                    <Icon name={r.pass ? "circle-check" : "x"} size={16} />
                    <span><b style={{ fontWeight: 550, color: r.pass ? undefined : "var(--text)" }}>{r.label}</b><br /><span className="small muted">{r.detail}</span></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {nav && <div className="simws-panel">{nav}</div>}
      </aside>
    </div>
  );
}
