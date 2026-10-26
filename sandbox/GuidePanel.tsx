"use client";
// The guide: before a run it describes the scenario and what to try; after a run it shows the metrics,
// explains bottlenecks and failures with one-click fixes, the trade-offs, "what if" checks and the
// incident timeline.
import Icon from "@/components/ui/Icon";
import { incidentLabel } from "./engine";
import type { Action, Guide, WhatIf } from "./explain";
import { fmtMs, fmtUsd, pct } from "./format";
import { TIMELINE, type Tick, type TimelineSummary } from "./timeline";
import type { Incident, Metrics, RunResult } from "./types";

export interface GuidePanelProps {
  intro: string[];
  tryThis?: string[];
  result: RunResult | null;
  guide: Guide | null;
  whatIfs: WhatIf[];
  ticks: Tick[] | null;
  timelineSummary: TimelineSummary | null;
  timelineText: string | null;
  incident: Incident;
  stale: boolean;
  onApply: (a: Action) => void;
  onSelect: (id: string) => void;
  onRun: () => void;
}

export function MetricTiles({ m, streaming = true }: { m: Metrics; streaming?: boolean }) {
  const tiles: { label: string; value: string; tone?: "ok" | "bad"; title: string }[] = [
    { label: "Success", value: pct(m.successRate, m.successRate > 0.99 && m.successRate < 1 ? 2 : 1), tone: m.successRate >= 0.99 ? "ok" : m.successRate < 0.95 ? "bad" : undefined, title: "Share of real (non-attack) requests that got an answer." },
    { label: "p50 latency", value: fmtMs(m.p50Ms), title: "Half of answered requests finish faster than this." },
    { label: "p99 latency", value: fmtMs(m.p99Ms), title: "99% of answered requests finish faster than this." },
    { label: streaming ? "p99 first token" : "p99 first byte", value: fmtMs(m.ttftP99Ms), title: "Time until the user sees the first token (TTFT)." },
    { label: "Cost / request", value: fmtUsd(m.costPerRequest), title: "Monthly cost divided by monthly requests." },
    { label: "Cost / month", value: fmtUsd(m.costPerMonth), title: "Tokens, GPUs and infrastructure for 30 days at this traffic." },
    { label: "Quality", value: m.successRate > 0 ? m.quality.toFixed(2) : "–", tone: m.successRate > 0 && m.quality < 0.6 ? "bad" : undefined, title: "Answer-quality proxy (0-1) over answered requests: model strength, grounding, truncation, cache false hits." },
    { label: "Cache hits", value: pct(m.cacheHitRate), title: "Share of requests answered from the semantic cache." },
  ];
  if (m.taskSuccessPassK !== undefined) tiles.push({ label: "Agent pass^3", value: pct(m.taskSuccessPassK, 1), tone: m.taskSuccessPassK < 0.7 ? "bad" : m.taskSuccessPassK >= 0.9 ? "ok" : undefined, title: "Chance the same agent task succeeds on all three of three tries (pass^k, k = 3): reliability as a repeat customer sees it." });
  if (m.gpuUtil !== null) tiles.push({ label: "GPU busy", value: pct(m.gpuUtil), tone: m.gpuUtil >= 1 ? "bad" : undefined, title: "Load-weighted utilisation of self-hosted GPUs." });
  if (m.attackRps > 0) {
    tiles.push({ label: "Attacks blocked", value: pct(m.attacksBlocked, 1), title: "Share of attack requests blocked by guardrails or auth." });
    tiles.push({ label: "Attacks leaked", value: pct(m.attacksLeaked, 1), tone: m.attacksLeaked > 0.01 ? "bad" : "ok", title: "Share of attack requests that got a model answer through." });
  }
  if (m.falseBlocks > 0.001) tiles.push({ label: "Wrongly blocked", value: pct(m.falseBlocks, 1), tone: m.falseBlocks > 0.03 ? "bad" : undefined, title: "Real users refused by a guardrail (false positives)." });
  if (m.rateLimited > 0.001) tiles.push({ label: "Rate limited", value: pct(m.rateLimited, 1), title: "Real requests rejected by the gateway's per-tenant limit." });
  return (
    <div className="metric-tiles sbx-tiles">
      {tiles.map((t) => (
        <div key={t.label} className={`metric ${t.tone ?? ""}`} title={t.title}>
          <span>{t.label}</span>
          <b>{t.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Tiny line chart of a per-second series with the incident window shaded. */
function Spark({ ticks, get, max, label, fmt, color }: { ticks: Tick[]; get: (t: Tick) => number; max?: number; label: string; fmt: (v: number) => string; color: string }) {
  const W = 320;
  const H = 70;
  const vals = ticks.map(get);
  const hi = max ?? Math.max(1e-9, ...vals) * 1.1;
  const x = (i: number) => (i / Math.max(1, ticks.length - 1)) * W;
  const y = (v: number) => H - 4 - (Math.min(hi, Math.max(0, v)) / hi) * (H - 10);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const worst = max === 1 ? Math.min(...vals) : Math.max(...vals);
  return (
    <figure className="sbx-spark">
      <figcaption><span>{label}</span><b>{max === 1 ? "worst" : "peak"} {fmt(worst)}</b></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} over 60 seconds`}>
        <rect x={x(TIMELINE.at)} y={0} width={x(TIMELINE.until) - x(TIMELINE.at)} height={H} className="sbx-spark-window" />
        <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
    </figure>
  );
}

export default function GuidePanel(p: GuidePanelProps) {
  const { result, guide, stale } = p;
  return (
    <div className="sbx-guide">
      <div className="sbx-guide-head">
        <Icon name="lightbulb" size={16} />
        <b>Guide</b>
        {result && stale && <span className="pill accent">design changed - run again</span>}
      </div>

      {!result || !guide ? (
        <>
          {p.intro.map((t) => <p key={t} className="sbx-text">{t}</p>)}
          {p.incident.type !== "none" && <p className="sbx-text muted">Incident ready: <b>{incidentLabel(p.incident)}</b> - Run shows a 60-second timeline.</p>}
          {p.tryThis && p.tryThis.length > 0 && (
            <>
              <h4 className="sbx-h">Things to try</h4>
              <ol className="sbx-try">{p.tryThis.map((t) => <li key={t}>{t}</li>)}</ol>
            </>
          )}
          <button type="button" className="btn accent sm" onClick={p.onRun}><Icon name="play" size={14} /> Run</button>
        </>
      ) : (
        <div className={stale ? "sbx-dim" : ""}>
          <p className={`sbx-headline ${guide.tone}`}>
            <Icon name={guide.tone === "good" ? "circle-check" : guide.tone === "warn" ? "alert" : "alert"} size={16} />
            <span>{guide.headline}</span>
          </p>
          <MetricTiles m={result.metrics} />

          {p.ticks && p.timelineSummary && (
            <section className="sbx-timeline">
              <h4 className="sbx-h">Timeline: {incidentLabel(p.incident)} at t={TIMELINE.at}s</h4>
              <div className="sbx-sparks">
                <Spark ticks={p.ticks} get={(t) => t.metrics.successRate} max={1} label="Success rate" fmt={(v) => pct(v, 1)} color="var(--green)" />
                <Spark ticks={p.ticks} get={(t) => t.metrics.p99Ms} label="p99 latency" fmt={fmtMs} color="var(--accent)" />
                {p.incident.type === "badRollout" && <Spark ticks={p.ticks} get={(t) => (t.metrics.successRate > 0 ? t.metrics.quality : 0)} max={1} label="Quality" fmt={(v) => v.toFixed(2)} color="var(--blue)" />}
                {p.incident.type === "injectionCampaign" && <Spark ticks={p.ticks} get={(t) => t.metrics.attackRps * t.metrics.attacksLeaked} label="Attacks answered / s" fmt={(v) => v.toFixed(2)} color="var(--red)" />}
                {p.incident.type === "cacheFlush" && <Spark ticks={p.ticks} get={(t) => t.metrics.cacheHitRate} max={1} label="Cache hit rate" fmt={(v) => pct(v)} color="var(--blue)" />}
              </div>
              {p.timelineText && <p className="sbx-text">{p.timelineText}</p>}
            </section>
          )}

          {guide.advice.length > 0 ? (
            <>
              <h4 className="sbx-h">What&apos;s going on</h4>
              <ul className="sbx-advice">
                {guide.advice.map((a) => (
                  <li key={a.problem} className={a.severity}>
                    <p className="sbx-problem">
                      <Icon name={a.severity === "info" ? "info" : "alert"} size={14} />
                      <b>{a.problem}</b>
                    </p>
                    <p>{a.why}</p>
                    <p><span className="sbx-tag">Try</span> {a.fix}</p>
                    <p className="muted"><span className="sbx-tag">Trade-off</span> {a.tradeoff}</p>
                    <div className="row">
                      {a.action && <button type="button" className="btn accent sm" onClick={() => p.onApply(a.action!)}><Icon name="zap" size={14} /> {a.action.label}</button>}
                      {a.nodeId && <button type="button" className="chip-btn" onClick={() => p.onSelect(a.nodeId!)}><Icon name="target" size={13} /> Show</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="sbx-text">No problems found at this traffic. Try the what-ifs below, or inject an incident.</p>
          )}

          {p.whatIfs.length > 0 && (
            <>
              <h4 className="sbx-h">What if…</h4>
              <ul className="sbx-whatifs">
                {p.whatIfs.map((w) => (
                  <li key={w.id} className={w.tone}>
                    <div><b>{w.scenario}</b><span>{pct(w.successRate, 1)} ok · p99 {fmtMs(w.p99Ms)} · {fmtUsd(w.costPerMonth)}/mo</span></div>
                    <p>{w.verdict}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="sbx-h">How requests flow</h4>
          {guide.path.map((t) => <p key={t} className="sbx-text muted">{t}</p>)}
        </div>
      )}
    </div>
  );
}
