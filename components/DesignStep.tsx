"use client";
// A lab "design" step: build in the sandbox canvas, run the step's test, and see each constraint pass or fail.
import { useState } from "react";
import type { LabStep } from "@/labs/types";
import { SandboxCanvas } from "@/sandbox/Canvas";
import { evaluateDesign } from "@/sandbox/engine";
import type { DesignEvaluation, Graph } from "@/sandbox/types";
import MiniMarkdown from "./MiniMarkdown";
import Icon from "./ui/Icon";

export default function DesignStep({ step, onPass }: { step: Extract<LabStep, { type: "design" }>; onPass: () => void }) {
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

  return (
    <div style={{ margin: "1.6em 0" }}>
      <SandboxCanvas
        initial={initial}
        palette={step.palette}
        height={480}
        result={evaluation?.run ?? null}
        stale={stale}
        onChange={(g) => {
          setGraph(g);
          setStale(true);
        }}
      />
      <div className="row" style={{ margin: "14px 0" }}>
        <button type="button" className="btn sm accent" onClick={test}><Icon name="play" size={15} /> Run the test</button>
        {hints < step.hints.length && <button type="button" className="chip-btn" onClick={() => setHints(hints + 1)}><Icon name="lightbulb" size={14} /> Hint {hints + 1} of {step.hints.length}</button>}
        <button type="button" className="chip-btn" onClick={() => { setInitial(step.solution); setGraph(step.solution); setEvaluation(null); }}><Icon name="eye" size={14} /> Load a solution</button>
        <button type="button" className="chip-btn" onClick={() => { const s = step.starter ?? { nodes: [], edges: [] }; setInitial(s); setGraph(s); setEvaluation(null); }}><Icon name="refresh" size={14} /> Start over</button>
      </div>
      {step.hints.slice(0, hints).map((h) => <div key={h} className="callout tip"><b><Icon name="lightbulb" size={15} /> Hint</b><MiniMarkdown>{h}</MiniMarkdown></div>)}
      {evaluation && (
        <div className={`quiz-feedback ${evaluation.pass ? "right" : "wrong"}`}>
          <b>{evaluation.pass ? "All checks pass." : stale ? "You changed the design: run the test again." : "Not yet. See which checks fail:"}</b>
          <ul className="goal-list" style={{ border: 0, padding: "8px 0 0" }}>
            {evaluation.results.map((r) => (
              <li key={r.label} className={r.pass ? "ok" : ""}>
                <Icon name={r.pass ? "circle-check" : "x"} size={16} /> <span><b style={{ display: "inline", fontWeight: 500 }}>{r.label}</b> · {r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
