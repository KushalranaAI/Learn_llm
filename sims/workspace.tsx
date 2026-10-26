"use client";
// The full-size simulation layout, the same pattern as System Learn's workspace:
// settings on the left, the canvas in the middle, results and the guide on the right.
import { type ReactNode, useEffect, useState } from "react";
import ExplainButton from "@/components/ai/ExplainButton";
import MiniMarkdown from "@/components/MiniMarkdown";
import Icon from "@/components/ui/Icon";
import { useChatSource } from "@/lib/ai/sources";
import { type Goal, goalMet, type Metrics, type Params, type SimDef } from "./types";
import { Control, fmt, useSim } from "./ui";

export default function SimWorkspace({
  def,
  initial,
  goals,
  locked = [],
  hidden = [],
  onMetrics,
  leftTop,
  rightTop,
  resetKey,
}: {
  def: SimDef;
  initial?: Params;
  goals?: Goal[];
  locked?: string[];
  hidden?: string[];
  onMetrics?: (m: Metrics, p: Params) => void;
  /** shown above the settings (a lab step's brief) */
  leftTop?: ReactNode;
  /** shown above the results (a lab step's status) */
  rightTop?: ReactNode;
  /** change to restart the sim from `initial` (e.g. "show solution") */
  resetKey?: string | number;
}) {
  const { params, metrics, setParam, reset, setParams } = useSim(def, initial);
  const [showMath, setShowMath] = useState(false);
  useEffect(() => {
    if (resetKey !== undefined) setParams({ ...def.defaults, ...initial });
    // only when the caller asks for a restart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);
  useEffect(() => onMetrics?.(metrics, params), [metrics, params, onMetrics]);
  const View = def.View;
  const explanation = def.explain?.(params, metrics);
  const met = goals?.filter((g) => goalMet(g, metrics)).length ?? 0;
  // What the optional AI tutor sees: the sim, its current settings and results, and its maths (never a lab's solution).
  useChatSource("sim", {
    label: `Simulation · ${def.title}`,
    suggestions: ["What is this simulation showing?", "Why do the results look like this?", "What should I change first, and what will happen?"],
    build: () => ({
      simulation: def.title,
      summary: def.summary,
      settings: Object.fromEntries(def.params.filter((s) => !hidden.includes(s.key)).map((s) => [s.label, params[s.key]])),
      results: Object.fromEntries(def.metrics.map((s) => [s.label, fmt(metrics[s.key], s.format)])),
      ...(goals?.length ? { goals: goals.map((g) => `${g.label}: ${goalMet(g, metrics) ? "met" : "not met yet"}`) } : {}),
      ...(explanation ? { builtInReading: explanation } : {}),
      maths: def.math,
    }),
  });

  return (
    <div className="simws">
      <aside className="simws-left">
        {leftTop}
        <div className="simws-panel">
          <div className="simws-panel-head">
            <h4>Settings</h4>
            <button type="button" className="icon-btn" onClick={reset} aria-label="Reset settings" title="Reset"><Icon name="refresh" size={15} /></button>
          </div>
          <div className="simws-controls">
            {def.params.filter((s) => !hidden.includes(s.key)).map((s) => (
              <Control key={s.key} spec={s} value={params[s.key]} locked={locked.includes(s.key)} onChange={(v) => setParam(s.key, v)} />
            ))}
          </div>
        </div>
      </aside>

      <section className="simws-stage" aria-label={`${def.title}: canvas`}>
        <div className="simws-stage-head">
          <span className="eyebrow" style={{ margin: 0 }}><Icon name="activity" size={13} /> Live</span>
          <b>{def.title}</b>
        </div>
        <div className="simws-canvas">{View ? <View params={params} metrics={metrics} setParam={setParam} /> : <p className="muted">Change the settings and watch the results.</p>}</div>
      </section>

      <aside className="simws-right">
        {rightTop}
        {explanation && (
          <div className="simws-guide">
            <Icon name="lightbulb" size={16} />
            <p>{explanation}</p>
          </div>
        )}
        {goals && goals.length > 0 && (
          <div className="simws-panel">
            <div className="simws-panel-head">
              <h4>Goals</h4>
              <span className={`pill ${met === goals.length ? "accent" : ""}`}>{met}/{goals.length}</span>
            </div>
            <ul className="goal-list" style={{ border: 0, padding: 0 }}>
              {goals.map((g) => {
                const ok = goalMet(g, metrics);
                return (
                  <li key={g.label} className={ok ? "ok" : ""}>
                    <Icon name={ok ? "circle-check" : "circle"} size={16} /> {g.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <div className="simws-panel">
          <div className="simws-panel-head"><h4>Results</h4></div>
          <div className="simws-stats">
            {def.metrics.map((s) => {
              const g = goals?.find((x) => x.metric === s.key);
              const ok = g ? goalMet(g, metrics) : undefined;
              return (
                <div key={s.key} className={`simws-stat ${ok === true ? "ok" : ok === false ? "bad" : ""}`} title={s.help}>
                  <span>{s.label}</span>
                  <b key={fmt(metrics[s.key], s.format)}>{fmt(metrics[s.key], s.format)}</b>
                </div>
              );
            })}
          </div>
          <ExplainButton prompt="Explain what these results mean for my current settings, why they come out this way (use the maths), and one change I should try next." />
        </div>
        <div className="simws-panel">
          <button type="button" className="simws-math-toggle" onClick={() => setShowMath((s) => !s)} aria-expanded={showMath}>
            <Icon name="sigma" size={15} /> How this is computed <Icon name="chevron-down" size={15} className={showMath ? "flip" : ""} />
          </button>
          {showMath && <MiniMarkdown className="sim-math">{def.math}</MiniMarkdown>}
        </div>
      </aside>
    </div>
  );
}
