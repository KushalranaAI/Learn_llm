"use client";
// Step-through trace view for agent-loop (uses state, so it is a client module).
import { useState } from "react";
import { C } from "../ui";
import { num, type SimViewProps } from "../types";
import { Caption, Pill } from "./viz";
import { box, mono } from "./styles";
import { big } from "./lib";
import { RUNS, params, runAgent, type Kind } from "./agent-loop-model";

const KIND: Record<Kind, { label: string; color: string }> = {
  think: { label: "think", color: C.muted },
  call: { label: "tool call", color: C.blue },
  obs: { label: "observation", color: C.green },
  error: { label: "error", color: C.red },
  verify: { label: "verify", color: C.purple },
  answer: { label: "answer", color: C.accent },
  fail: { label: "stopped", color: C.red },
};

export default function AgentLoopView({ params: p, metrics }: SimViewProps) {
  const [ms, f, v] = params(p);
  const run = runAgent(ms, f, v, num(p, "seed"));
  const [shown, setShown] = useState(1000);
  const n = Math.min(shown, run.trace.length);
  const btn = { padding: "2px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--card-2)", color: "var(--text)", cursor: "pointer" } as const;
  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Caption>Trace (seed {num(p, "seed")}): {n}/{run.trace.length} events</Caption>
        <button type="button" style={btn} onClick={() => setShown(Math.max(1, n - 1))} aria-label="previous event">◀</button>
        <button type="button" style={btn} onClick={() => setShown(Math.min(run.trace.length, n + 1))} aria-label="next event">▶</button>
        <button type="button" style={btn} onClick={() => setShown(1000)}>All</button>
        <Pill color={run.success ? C.green : C.red}>{run.success ? "task solved" : "task failed"}</Pill>
      </div>
      <div style={{ ...box, display: "flex", flexDirection: "column", gap: 0, maxHeight: 340, overflowY: "auto" }}>
        <div style={{ fontSize: "0.8rem", color: "var(--text-2)", marginBottom: 6 }}>User: “Where is my order #4417? If it is late, refund the shipping fee.”</div>
        {run.trace.slice(0, n).map((t, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 78px 1fr", gap: 6, alignItems: "baseline", borderLeft: `3px solid ${KIND[t.kind].color}`, padding: "3px 0 3px 6px", fontSize: "0.78rem" }}>
            <span style={{ ...mono, color: "var(--muted)" }}>{t.step}</span>
            <span style={{ color: KIND[t.kind].color, fontWeight: 600 }}>{KIND[t.kind].label}</span>
            <span style={{ ...(t.kind === "call" || t.kind === "obs" || t.kind === "error" ? mono : {}), overflowWrap: "anywhere" }}>{t.text}</span>
          </div>
        ))}
      </div>
      <small className="muted">
        {run.steps} LLM calls · {big(run.tokIn)} input + {big(run.tokOut)} output tokens. Over {RUNS} runs with these settings the agent succeeds {Math.round(metrics.successRate * 100)}% of the time.
      </small>
    </>
  );
}
