"use client";
// Agent trajectory: the trace appears step by step with the judge's verdict on each; a scorecard grades the run.
import "./sims-d.css";
import { num, type SimViewProps } from "../types";
import { SimStyle, Transport, useLocalPlayback } from "../c/anim";
import { OPTIMAL, RUNS, runAgent, settings, type Step } from "./agent-trajectory-model";

const COLOR: Record<Step["kind"], string> = { tool: "var(--info)", verify: "var(--ai)", reply: "var(--accent)" };

function Mark({ s }: { s: Step }) {
  const disagree = s.pass !== (s.truth === "ok" || s.truth === "env");
  const cls = s.pass ? (s.truth === "minor" || s.truth === "major" ? "minor" : "ok") : "bad";
  return (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <span className={`sd-mark ${cls}`} aria-label={s.pass ? "judge: pass" : "judge: fail"}>{s.pass ? "✓" : "✗"}</span>
      {disagree && <span className="sd-badge warm" title="The judge's verdict differs from what really happened">{s.truth === "minor" ? "lenient" : "missed"}</span>}
    </span>
  );
}

export default function AgentTrajectoryView({ params, metrics }: SimViewProps) {
  const s = settings(params);
  const run = runAgent(s.f, s.maxSteps, s.verify, s.strict, num(params, "seed"));
  const last = run.steps.length + 1; // the final frame shows the scorecard
  const pb = useLocalPlayback(last, 650, `${num(params, "seed")}|${s.f}|${s.maxSteps}|${s.verify}|${s.strict}`);
  const shown = Math.min(pb.index, run.steps.length);
  const done = pb.index >= last;
  const visible = run.steps.slice(0, shown);
  const passN = run.steps.filter((x) => x.pass).length;
  const calls = run.steps.filter((x) => x.callValid !== null);
  const valid = calls.filter((x) => x.callValid).length;
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

  return (
    <div className="sd sc" ref={pb.rootRef}>
      <SimStyle />
      <Transport pb={pb} index={pb.index} last={last} label="step" />
      <div className="sd-card">
        <div className="sd-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <span className="sd-label">Trace · seed {num(params, "seed")} · budget {s.maxSteps} steps</span>
          <span className="sd-legend">
            <span><i style={{ background: COLOR.tool }} />tool call</span>
            {s.verify && <span><i style={{ background: COLOR.verify }} />verify</span>}
            <span><i style={{ background: COLOR.reply }} />reply</span>
          </span>
        </div>
        <div className="sd-cap" style={{ marginBottom: 6 }}>User: “My headphones (order A-4417) arrived broken. Can I get my money back?”</div>
        <div className="sd-steps" aria-live="polite">
          {visible.map((st, i) => (
            <div key={i} className={`sd-step ${i === shown - 1 && !done ? "in" : ""}`} style={{ borderLeftColor: st.truth === "env" ? "var(--warm)" : COLOR[st.kind] }}>
              <span className="sd-n">{st.n}</span>
              <span style={{ minWidth: 0 }}>
                <span className="sd-what">
                  {st.kind === "reply" ? <b>reply</b> : <b className="sd-mono">{st.tool}</b>}
                  {st.args && <span className="sd-mono" style={{ color: "var(--text-2)" }}> {st.args}</span>}
                </span>
                <div className="sd-obs">→ {st.obs}</div>
                <div className="sd-obs" style={{ color: st.truth === "major" ? "var(--bad)" : st.truth === "minor" ? "var(--warm)" : "var(--muted)" }}>{st.note}</div>
              </span>
              <Mark s={st} />
            </div>
          ))}
          {shown === 0 && <div className="sd-cap">Press Play or Step to replay the agent's trajectory.</div>}
          {done && run.outOfBudget && <div className="sd-step in" style={{ borderLeftColor: "var(--bad)" }}><span className="sd-n">!</span><span className="sd-what">Step budget used up before the agent replied.</span><span className="sd-mark bad">✗</span></div>}
        </div>
      </div>
      {done && (
        <div className="sd-card sd-fade">
          <div className="sd-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span className="sd-label">Scorecard for this run</span>
            <span className={`sd-badge ${run.judgedSuccess ? "good" : "bad"}`}>{run.judgedSuccess ? "judged: task solved" : "judged: task failed"}</span>
            {run.judgedSuccess !== run.trueSuccess && <span className="sd-badge warm">really: {run.trueSuccess ? "solved" : "not solved"}</span>}
          </div>
          <div className="sd-stats">
            <div className="sd-stat"><span>Step accuracy</span><b>{run.steps.length ? pct(passN / run.steps.length) : "–"}</b></div>
            <div className="sd-stat"><span>Tool-call accuracy</span><b>{calls.length ? pct(valid / calls.length) : "–"}</b></div>
            <div className="sd-stat"><span>Steps vs optimal</span><b>{run.steps.length} / {OPTIMAL}</b></div>
            <div className="sd-stat"><span>Cost</span><b>${run.cost.toFixed(4)}</b></div>
          </div>
        </div>
      )}
      <div className="sd-card">
        <span className="sd-label">Over {RUNS} runs with these settings</span>
        <div className="sd-stats" style={{ marginTop: 6 }}>
          <div className={`sd-stat ${metrics.taskSuccess >= 0.8 ? "good" : "bad"}`}><span>Task success (judged)</span><b>{pct(metrics.taskSuccess)}</b></div>
          <div className="sd-stat"><span>Really solved</span><b>{pct(metrics.trueSuccess)}</b></div>
          <div className="sd-stat"><span>Efficiency</span><b>{pct(metrics.efficiency)}</b></div>
          <div className="sd-stat"><span>Cost / success</span><b>${metrics.costPerSuccess.toFixed(3)}</b></div>
        </div>
      </div>
    </div>
  );
}
