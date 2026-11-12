"use client";
// My progress: completion and mastery by module, activity, calibration (confidence vs accuracy), labs, backup/restore.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Outline } from "@/lib/content";
import { calibration, moduleStats } from "@/lib/learner";
import { exportProgress, importProgress, isMastered, resetProgress, useProgress, weekActivity } from "@/lib/progress";
import Icon from "./ui/Icon";

export default function ProgressPage({ outline, totals }: { outline: Outline; totals: { questions: number; labs: number; sims: number } }) {
  const p = useProgress();
  const [mounted, setMounted] = useState(false);
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="page mid"><div className="card empty">Loading your progress…</div></div>;

  const topics = outline.flatMap((m) => m.lessons.flatMap((l) => l.topics.map((t) => `${m.slug}/${l.slug}/${t.slug}`)));
  const done = topics.filter((id) => p.done[id]).length;
  const checks = Object.values(p.checks);
  const right = checks.filter((c) => c.ok).length;
  const labsPassed = Object.values(p.labs).filter((l) => l.passed).length;

  // 53 weeks × 7 days, most recent at the end
  const cells: { key: string; n: number }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - (52 * 7 + d.getDay()));
  for (let k = 0; k < 53 * 7; k++) {
    const key = d.toISOString().slice(0, 10);
    cells.push({ key, n: p.days[key] ?? 0 });
    d.setDate(d.getDate() + 1);
  }
  const ordered = Array.from({ length: 53 * 7 }, (_, k) => cells[(k % 53) * 7 + Math.floor(k / 53)]);

  const download = () => {
    const blob = new Blob([exportProgress()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `llm-1-to-100-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page mid stack">
      <header className="page-head">
        <span className="eyebrow"><Icon name="chart" size={14} /> My progress</span>
        <h1 style={{ marginTop: 8 }}>{done ? `${Math.round((done / Math.max(1, topics.length)) * 100)}% of the course` : "Your journey starts here"}</h1>
        <p className="lead">Everything is saved in this browser only. Export a backup to move it to another device.</p>
        <div className="metric-tiles" style={{ marginTop: 22 }}>
          <div className="metric"><span>Topics finished</span><b>{done} / {topics.length}</b></div>
          <div className="metric"><span>Active this week</span><b>{weekActivity(p).thisWeek} of 7 days</b></div>
          <div className="metric"><span>Lessons mastered</span><b>{outline.reduce((a, m) => a + moduleStats(p, outline, m).mastered, 0)}</b></div>
          <div className="metric"><span>Quick checks right first time</span><b>{checks.length ? `${Math.round((right / checks.length) * 100)}%` : "–"}</b></div>
          <div className="metric"><span>Checks mastered</span><b>{Object.values(p.reviews).filter(isMastered).length} / {Object.keys(p.reviews).length}</b></div>
          <div className="metric"><span>Interview known</span><b>{Object.keys(p.known).length} / {totals.questions}</b></div>
          <div className="metric"><span>Labs passed</span><b>{labsPassed} / {totals.labs}</b></div>
          <div className="metric"><span>Sims tried</span><b>{Object.keys(p.simsTried).length} / {totals.sims}</b></div>
        </div>
      </header>

      <section className="card">
        <h2 style={{ marginBottom: 16 }}>Activity</h2>
        <div className="heat" aria-label="Activity over the last year">
          {ordered.map((c, k) => <i key={k} className={c.n >= 8 ? "l3" : c.n >= 4 ? "l2" : c.n > 0 ? "l1" : ""} title={`${c.key}: ${c.n}`} />)}
        </div>
      </section>

      <Calibration rows={calibration(p)} />

      <section className="card">
        <h2 style={{ marginBottom: 6 }}>By module</h2>
        <div className="list-rows">
          {outline.map((m) => {
            const ids = m.lessons.flatMap((l) => l.topics.map((t) => `${m.slug}/${l.slug}/${t.slug}`));
            const n = ids.filter((id) => p.done[id]).length;
            return (
              <Link key={m.slug} href={`/learn/${m.slug}`} style={{ flexWrap: "wrap" }}>
                <span className="mono muted" style={{ width: 28 }}>{String(m.order).padStart(2, "0")}</span>
                <span style={{ flex: "1 1 200px" }}>{m.title}</span>
                <span style={{ flex: "1 1 200px" }}><div className="bar green"><i style={{ width: `${(n / Math.max(1, ids.length)) * 100}%` }} /></div></span>
                <span className="muted small" style={{ width: 150, textAlign: "right" }}>{n} / {ids.length} topics{moduleStats(p, outline, m).mastered ? ` · ${moduleStats(p, outline, m).mastered} mastered` : ""}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginBottom: 12 }}>Backup</h2>
        <div className="row">
          <button type="button" className="btn ghost sm" onClick={download}><Icon name="download" size={15} /> Export</button>
          <button type="button" className="btn ghost sm" onClick={() => file.current?.click()}><Icon name="upload" size={15} /> Import</button>
          <button type="button" className="btn ghost sm" onClick={() => { if (confirm("Delete all progress in this browser? This cannot be undone.")) { resetProgress(); setMsg("Progress reset."); } }}>
            <Icon name="trash" size={15} /> Reset
          </button>
          <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setMsg(importProgress(await f.text()) ? "Progress imported." : "That file is not a progress backup from this course.");
            e.target.value = "";
          }} />
          {msg && <span className="muted">{msg}</span>}
        </div>
      </section>
    </div>
  );
}

/** Confidence vs accuracy: are you as right as you feel? Learners routinely overrate fluent material. */
function Calibration({ rows }: { rows: ReturnType<typeof calibration> }) {
  const order = [["sure", "Sure"], ["think", "Think so"], ["guess", "Guessing"]] as const;
  const n = order.reduce((a, [k]) => a + rows[k].n, 0);
  const sure = rows.sure.n ? rows.sure.ok / rows.sure.n : null;
  return (
    <section className="card">
      <h2 style={{ marginBottom: 6 }}>Are you as right as you feel?</h2>
      <p className="muted small" style={{ margin: 0 }}>Every quick check asks how sure you are before showing the answer. Well calibrated means "sure" is right nearly every time and "guessing" much less often.</p>
      {n === 0 ? (
        <div className="empty" style={{ marginTop: 12 }}>Answer a few quick checks and this fills in.</div>
      ) : (
        <div className="calib">
          {order.map(([k, label]) => {
            const r = rows[k];
            const acc = r.n ? r.ok / r.n : 0;
            return (
              <div key={k} className="calib-row">
                <span>{label}</span>
                <span className="calib-bar"><i style={{ width: `${acc * 100}%` }} /></span>
                <span className="muted small mono">{r.n ? `${Math.round(acc * 100)}% of ${r.n}` : "–"}</span>
              </div>
            );
          })}
          {sure !== null && rows.sure.n >= 10 && (
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {sure < 0.8 ? "You are often wrong when sure: slow down on those, and use review to find which ideas feel more familiar than they are." : "When you are sure, you are usually right. Good calibration."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
