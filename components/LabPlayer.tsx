"use client";
// Plays a lab step by step: read, answer, compute by hand, meet goals in a simulation, build in the sandbox.
import Link from "next/link";
import { Fragment, type ReactNode, useCallback, useState } from "react";
import { getLab } from "@/labs";
import { useChatSource } from "@/lib/ai/sources";
import type { LabStep } from "@/labs/types";
import { setLabStep, useProgress } from "@/lib/progress";
import { getSim } from "@/sims";
import { goalMet, type Metrics } from "@/sims/types";
import SimWorkspace from "@/sims/workspace";
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

function SimStep({ step, onPass, brief, nav }: { step: Extract<LabStep, { type: "sim" }>; onPass: () => void; brief: ReactNode; nav: ReactNode }) {
  const def = getSim(step.sim);
  const [hints, setHints] = useState(0);
  const [solved, setSolved] = useState(0);
  const onMetrics = useCallback(
    (m: Metrics) => {
      if (step.goals.every((g) => goalMet(g, m))) onPass();
    },
    [step.goals, onPass],
  );
  if (!def) return <div className="callout warn"><b>Simulation “{step.sim}” is not available yet.</b></div>;
  return (
    <SimWorkspace
      def={def}
      initial={solved ? { ...step.params, ...step.solution } : step.params}
      resetKey={solved || undefined}
      goals={step.goals}
      locked={step.locked}
      hidden={step.hidden}
      onMetrics={onMetrics}
      leftTop={
        <div className="simws-brief">
          {brief}
          <div className="row" style={{ marginTop: 12, gap: 6 }}>
            {hints < step.hints.length && <button type="button" className="chip-btn" onClick={() => setHints(hints + 1)}><Icon name="lightbulb" size={14} /> Hint {hints + 1}/{step.hints.length}</button>}
            <button type="button" className="chip-btn" onClick={() => setSolved((n) => n + 1)}><Icon name="eye" size={14} /> Solution</button>
          </div>
          {step.hints.slice(0, hints).map((h) => <div key={h} className="callout tip"><b><Icon name="lightbulb" size={15} /> Hint</b><MiniMarkdown>{h}</MiniMarkdown></div>)}
        </div>
      }
      rightTop={<div className="simws-panel">{nav}</div>}
    />
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
  // What the optional AI tutor sees: the step's brief and question, never the answer, hints' solution or worked solution.
  useChatSource(
    "lab",
    lab
      ? {
          label: `Lab · ${lab.title} · step ${i + 1}: ${lab.steps[i]?.title ?? ""}`,
          suggestions: ["Give me a hint without giving away the answer", "Explain the idea behind this step"],
          build: () => {
            const st = lab.steps[i];
            const ask = st.type === "quiz" ? { question: st.question, options: st.options.map((o) => o.text) } : st.type === "math" ? { question: st.question, unit: st.unit } : st.type === "sim" ? { goals: st.goals.map((g) => g.label) } : {};
            return { lab: lab.title, summary: lab.summary, step: `${i + 1} of ${lab.steps.length} (${STEP_LABEL[st.type]})`, title: st.title, brief: st.body, ...ask, note: "Answers and worked solutions are hidden from the tutor: give hints, not the answer." };
          },
        }
      : null,
  );
  if (!lab) return <div className="card empty">Unknown lab.</div>;
  const step = lab.steps[i];
  const needsPass = step.type !== "intro";
  const ok = !needsPass || passed.has(i);
  const finished = p.labs[lab.slug]?.passed;

  const canGo = (k: number) => lab.steps.slice(0, k).every((st, j) => st.type === "intro" || passed.has(j));
  const isDone = (k: number) => passed.has(k) || (lab.steps[k].type === "intro" && k < i);
  const goNext = () => {
    if (!needsPass) pass(i);
    setI(i + 1);
  };

  const wide = step.type === "sim" || step.type === "design";
  const brief = (
    <>
      <p className="eyebrow">Step {i + 1} of {lab.steps.length} · {STEP_LABEL[step.type]}</p>
      {wide ? <h2>{step.title}</h2> : <h1>{step.title}</h1>}
      <Markdown>{step.body}</Markdown>
    </>
  );
  const nav = (
    <div className="lab-nav-row">
      <button type="button" className="btn" disabled={i === 0} onClick={() => setI(i - 1)}><Icon name="arrow-left" size={15} /> Back</button>
      <span className="row" style={{ gap: 6 }}>
        {!wide && <span className={`pill ${lab.difficulty}`}>{lab.difficulty}</span>}
        {!wide && <span className="pill"><Icon name="clock" size={12} /> {lab.minutes} min</span>}
        {finished && <span className="pill accent"><Icon name="trophy" size={12} /> completed</span>}
        {ok && needsPass && <span className="pill accent"><Icon name="check" size={12} /> done</span>}
      </span>
      {i < lab.steps.length - 1 ? (
        <button type="button" className="btn primary" disabled={!ok} onClick={goNext} title={ok ? undefined : "Complete this step first"}>
          {i === 0 ? "Continue" : "Next"} <Icon name="arrow-right" size={15} />
        </button>
      ) : (
        <Link href="/labs" className="btn primary" aria-disabled={!ok} onClick={(e) => { if (!ok) e.preventDefault(); else pass(i); }}>
          Finish <Icon name="trophy" size={15} />
        </Link>
      )}
    </div>
  );

  return (
    <div>
      <div className="labbar">
        <Link href="/labs" className="icon-btn" aria-label="Back to labs"><Icon name="chevron-left" size={18} /></Link>
        <div className="labbar-title">
          <small>{lab.product}</small>
          <b>{lab.title}</b>
        </div>
        <div className="labsteps" role="list" aria-label="Lab steps">
          {lab.steps.map((st, k) => (
            <Fragment key={k}>
              {k > 0 && <span className={`labjoin ${isDone(k - 1) ? "done" : ""}`} />}
              <button
                type="button"
                role="listitem"
                className={`labstep ${k === i ? "on" : ""} ${isDone(k) ? "done" : ""}`}
                disabled={!canGo(k)}
                onClick={() => setI(k)}
                aria-label={`Step ${k + 1}: ${st.title}`}
                aria-current={k === i ? "step" : undefined}
              >
                {isDone(k) ? <Icon name="check" size={13} /> : k + 1}
              </button>
            </Fragment>
          ))}
          <span className="labbar-label">{step.title}</span>
        </div>
        <button type="button" className="icon-btn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Previous step"><Icon name="arrow-left" size={18} /></button>
        <button type="button" className="icon-btn" disabled={i === lab.steps.length - 1 || !ok} onClick={goNext} aria-label="Next step"><Icon name="arrow-right" size={18} /></button>
      </div>

      {wide ? (
        <div className="page wide" style={{ paddingTop: 20 }}>
          {step.type === "sim" && <SimStep key={i} step={step} onPass={() => pass(i)} brief={brief} nav={nav} />}
          {step.type === "design" && <DesignStep key={i} step={step} onPass={() => pass(i)} brief={brief} nav={nav} />}
        </div>
      ) : (
        <div className="labstage">
          <article className="labcard">
            {brief}
            {step.type === "quiz" && <QuizStep key={i} step={step} onPass={() => pass(i)} />}
            {step.type === "math" && <MathStep key={i} step={step} onPass={() => pass(i)} />}
            <div className="topic-end">{nav}</div>
          </article>
        </div>
      )}
    </div>
  );
}
