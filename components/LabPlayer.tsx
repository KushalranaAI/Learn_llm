"use client";
// Plays a lab step by step: read, answer, compute by hand, meet goals in a simulation, build in the sandbox.
import Link from "next/link";
import { useCallback, useState } from "react";
import { getLab } from "@/labs";
import type { LabStep } from "@/labs/types";
import { setLabStep, useProgress } from "@/lib/progress";
import { getSim } from "@/sims";
import { goalMet, type Metrics } from "@/sims/types";
import { SimPanel } from "@/sims/ui";
import DesignStep from "./DesignStep";
import Markdown from "./Markdown";
import MiniMarkdown from "./MiniMarkdown";
import Icon from "./ui/Icon";

const STEP_ICON = { intro: "book", quiz: "target", math: "sigma", sim: "activity", design: "boxes" } as const;
const STEP_LABEL = { intro: "Brief", quiz: "Predict", math: "Compute", sim: "Simulate", design: "Build" } as const;

function QuizStep({ step, onPass }: { step: Extract<LabStep, { type: "quiz" }>; onPass: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="quiz">
      <MiniMarkdown className="quiz-q">{step.question}</MiniMarkdown>
      <div className="quiz-options">
        {step.options.map((o, i) => {
          const state = picked === null ? "" : o.correct ? (picked === i ? "right" : "") : picked === i ? "wrong" : "dim";
          return (
            <button key={i} type="button" className={`quiz-option ${state}`} onClick={() => { setPicked(i); if (o.correct) onPass(); }}>
              <span className="quiz-letter">{String.fromCharCode(65 + i)}</span>
              <MiniMarkdown>{o.text}</MiniMarkdown>
              {state === "right" ? <Icon name="check" size={16} /> : state === "wrong" ? <Icon name="x" size={16} /> : <span />}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className={`quiz-feedback ${step.options[picked].correct ? "right" : "wrong"}`}>
          <b>{step.options[picked].correct ? "Right." : "Not quite. Try another option."}</b>
          <MiniMarkdown>{step.options[picked].why}</MiniMarkdown>
        </div>
      )}
    </div>
  );
}

function MathStep({ step, onPass }: { step: Extract<LabStep, { type: "math" }>; onPass: () => void }) {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<"right" | "wrong" | null>(null);
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const check = () => {
    const v = Number(value.replace(/[, _]/g, ""));
    const ok = Number.isFinite(v) && Math.abs(v - step.answer) <= Math.abs(step.answer) * step.tolerance + 1e-12;
    setResult(ok ? "right" : "wrong");
    if (ok) onPass();
  };
  return (
    <div className="quiz">
      <div className="quiz-head"><Icon name="sigma" size={15} /> Work it out</div>
      <MiniMarkdown className="quiz-q">{step.question}</MiniMarkdown>
      <div className="row">
        <input className="field mono" style={{ maxWidth: 240 }} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} placeholder="Your answer" aria-label="Your answer" />
        {step.unit && <span className="muted">{step.unit}</span>}
        <button type="button" className="btn sm" onClick={check}>Check</button>
        <button type="button" className="chip-btn" onClick={() => setHint(true)}><Icon name="lightbulb" size={14} /> Hint</button>
        <button type="button" className="chip-btn" onClick={() => setSolution(true)}><Icon name="eye" size={14} /> Solution</button>
      </div>
      {result && (
        <div className={`quiz-feedback ${result}`}>
          <b>{result === "right" ? `Right: ${step.answer.toLocaleString("en-US")}${step.unit ? ` ${step.unit}` : ""}.` : `Not within ${Math.round(step.tolerance * 100)}%. Check your working.`}</b>
        </div>
      )}
      {hint && <div className="callout tip"><b><Icon name="lightbulb" size={15} /> Hint</b><MiniMarkdown>{step.hint}</MiniMarkdown></div>}
      {solution && <div className="callout math"><b><Icon name="sigma" size={15} /> Worked solution</b><MiniMarkdown>{step.solution}</MiniMarkdown></div>}
    </div>
  );
}

function SimStep({ step, onPass }: { step: Extract<LabStep, { type: "sim" }>; onPass: () => void }) {
  const def = getSim(step.sim);
  const [hints, setHints] = useState(0);
  const [solved, setSolved] = useState(false);
  const [key, setKey] = useState(0);
  const onMetrics = useCallback(
    (m: Metrics) => {
      if (step.goals.every((g) => goalMet(g, m))) onPass();
    },
    [step.goals, onPass],
  );
  if (!def) return <div className="callout warn"><b>Simulation “{step.sim}” is not available yet.</b></div>;
  return (
    <>
      <SimPanel key={key} def={def} initial={solved ? { ...step.params, ...step.solution } : step.params} goals={step.goals} locked={step.locked} hidden={step.hidden} onMetrics={onMetrics} />
      <div className="row">
        {hints < step.hints.length && <button type="button" className="chip-btn" onClick={() => setHints(hints + 1)}><Icon name="lightbulb" size={14} /> Hint {hints + 1} of {step.hints.length}</button>}
        <button type="button" className="chip-btn" onClick={() => { setSolved(true); setKey(key + 1); }}><Icon name="eye" size={14} /> Show a solution</button>
      </div>
      {step.hints.slice(0, hints).map((h) => <div key={h} className="callout tip"><b><Icon name="lightbulb" size={15} /> Hint</b><MiniMarkdown>{h}</MiniMarkdown></div>)}
    </>
  );
}

export default function LabPlayer({ slug }: { slug: string }) {
  const lab = getLab(slug);
  const p = useProgress();
  const [i, setI] = useState(0);
  const [passed, setPassed] = useState<Set<number>>(new Set());
  const pass = useCallback(
    (k: number) => {
      setPassed((s) => (s.has(k) ? s : new Set(s).add(k)));
      if (lab) setLabStep(lab.slug, k + 1, lab.steps.every((st, j) => j === k || st.type === "intro" || passed.has(j)));
    },
    [lab, passed],
  );
  if (!lab) return <div className="card empty">Unknown lab.</div>;
  const step = lab.steps[i];
  const needsPass = step.type !== "intro";
  const ok = !needsPass || passed.has(i);
  const finished = p.labs[lab.slug]?.passed;

  return (
    <div className="topic-layout">
      <div className="stack" style={{ gap: 24 }}>
        <div className="topic-progress" style={{ marginBottom: 0 }}>
          <div className="row">
            <span>{lab.title}</span>
            <span className="mono muted">Step {i + 1} / {lab.steps.length}</span>
          </div>
          <div className="segments">{lab.steps.map((_, k) => <i key={k} className={k === i ? "on" : passed.has(k) || (lab.steps[k].type === "intro" && k < i) ? "done" : ""} />)}</div>
        </div>
        <article className="topic-article" style={{ padding: "40px 6% 36px" }}>
          <span className="eyebrow"><Icon name={STEP_ICON[step.type]} size={14} /> {STEP_LABEL[step.type]}</span>
          <h1 style={{ margin: "6px 0 18px" }}>{step.title}</h1>
          <Markdown>{step.body}</Markdown>
          {step.type === "quiz" && <QuizStep key={i} step={step} onPass={() => pass(i)} />}
          {step.type === "math" && <MathStep key={i} step={step} onPass={() => pass(i)} />}
          {step.type === "sim" && <SimStep key={i} step={step} onPass={() => pass(i)} />}
          {step.type === "design" && <DesignStep key={i} step={step} onPass={() => pass(i)} />}
          <div className="topic-end">
            <button type="button" className="btn ghost" disabled={i === 0} onClick={() => setI(i - 1)}><Icon name="arrow-left" size={16} /> Back</button>
            {ok && needsPass && <span className="pill green"><Icon name="check" size={13} /> Step complete</span>}
            {i < lab.steps.length - 1 ? (
              <button type="button" className="btn" disabled={!ok} onClick={() => { if (!needsPass) pass(i); setI(i + 1); }} title={ok ? undefined : "Complete this step first"}>
                Next <Icon name="arrow-right" size={16} />
              </button>
            ) : (
              <Link href="/labs" className="btn" aria-disabled={!ok} onClick={(e) => { if (!ok) e.preventDefault(); else pass(i); }}>
                Finish lab <Icon name="trophy" size={16} />
              </Link>
            )}
          </div>
        </article>
      </div>
      <aside className="toc">
        <h4>{lab.product}</h4>
        <ol>
          {lab.steps.map((s, k) => (
            <li key={k}>
              <a href="#" className={k === i ? "on" : ""} onClick={(e) => { e.preventDefault(); if (k <= i || passed.has(k - 1) || lab.steps[k - 1]?.type === "intro") setI(k); }}>
                <span className="n">{k + 1}</span>
                <span>{s.title}</span>
                {passed.has(k) ? <Icon name="check" size={15} /> : <span />}
              </a>
            </li>
          ))}
        </ol>
        <div className="toc-foot">
          <span className={`pill ${lab.difficulty}`}>{lab.difficulty}</span> <span className="pill"><Icon name="clock" size={12} /> {lab.minutes} min</span>
          {finished && <p className="small" style={{ color: "var(--green)" }}><Icon name="trophy" size={14} /> Completed</p>}
        </div>
      </aside>
    </div>
  );
}
