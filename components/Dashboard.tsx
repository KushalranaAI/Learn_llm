"use client";
// Home: pick up where you left off, what's due for review, the current module, interview prep and practice.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Outline } from "@/lib/content";
import { dueReviews, type Progress, streak, useProgress } from "@/lib/progress";
import Cover from "./Cover";
import Icon from "./ui/Icon";

type InterviewStats = { total: number; junior: number; mid: number; senior: number; byModule: { slug: string; title: string; count: number }[] };
type PracticeStats = { sims: number; labs: number; scenarios: number };

const pad = (n: number) => String(n).padStart(2, "0");

/** The topic to resume: the one after the last finished topic in the last-opened lesson, else the first unfinished. */
function resumePoint(outline: Outline, p: Progress) {
  const all = outline.flatMap((m) => m.lessons.flatMap((l) => l.topics.map((t, i) => ({ m, l, t, i, id: `${m.slug}/${l.slug}/${t.slug}` }))));
  if (!all.length) return null;
  const last = p.last ? all.findIndex((x) => x.id === p.last) : -1;
  if (last >= 0) {
    const here = all[last];
    if (!p.done[here.id]) return here;
    const next = all.slice(last + 1).find((x) => !p.done[x.id]);
    if (next) return next;
  }
  return all.find((x) => !p.done[x.id]) ?? all[0];
}

export default function Dashboard({ outline, interview, practice }: { outline: Outline; interview: InterviewStats; practice: PracticeStats }) {
  const p = useProgress();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const prog = mounted ? p : ({ done: {}, last: null, days: {}, reviews: {}, checks: {}, known: {}, visited: {}, labs: {}, simsTried: {} } as Progress);
  const start = resumePoint(outline, prog);
  const started = Object.keys(prog.done).length > 0 || prog.last !== null;
  const due = dueReviews(prog);
  const queued = Object.keys(prog.reviews).length;
  const days = streak(prog);
  const currentModule = outline.find((m) => m.slug === start?.m.slug) ?? outline[0];
  const doneIn = (m: Outline[number], l: Outline[number]["lessons"][number]) => l.topics.filter((t) => prog.done[`${m.slug}/${l.slug}/${t.slug}`]).length;

  if (!outline.length) return <div className="card empty">The course content is being written. Check back soon.</div>;

  return (
    <div className="stack">
      <div className="grid-main">
        <section className="card">
          <h1>{started ? "Welcome back" : "Hello there"}</h1>
          <p className="lead">
            {started
              ? `${Object.keys(prog.done).length} topics finished${days > 0 ? ` · ${days}-day streak` : ""}. Pick up where you left off.`
              : "Everything here is free and runs in your browser. Every idea comes with the maths, a live simulation, a lab and a sandbox."}
          </p>
          <div className="row" style={{ marginTop: 22 }}>
            <Link href="/curriculum" className="btn ghost">Browse the curriculum</Link>
            {start && (
              <Link href={`/learn/${start.m.slug}/${start.l.slug}/${start.t.slug}`} className="btn">
                {started ? "Continue" : "Start learning"}
              </Link>
            )}
          </div>

          {start && (
            <div className="card inset" style={{ marginTop: 32, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0, 340px)", gap: 28, alignItems: "center" }}>
              <div>
                <span className="eyebrow">{started ? "Continue" : "Start here"} · Module {pad(start.m.order)}</span>
                <h2 style={{ margin: "10px 0 8px" }}>{start.l.title}</h2>
                <p className="muted" style={{ margin: 0 }}>Topic {start.i + 1}: {start.t.title}</p>
                <div className="segments" style={{ margin: "22px 0 14px" }}>
                  {start.l.topics.map((t, i) => (
                    <i key={t.slug} className={prog.done[`${start.m.slug}/${start.l.slug}/${t.slug}`] ? "done" : i === start.i ? "on" : ""} />
                  ))}
                </div>
                <p className="mono muted" style={{ margin: "0 0 22px" }}>
                  {doneIn(start.m, start.l)} of {start.l.topics.length} topics · {start.l.minutes} min
                </p>
                <div className="row">
                  <Link href={`/learn/${start.m.slug}/${start.l.slug}/${start.t.slug}`} className="btn">{started ? "Resume" : "Start lesson"}</Link>
                  <Link href={`/learn/${start.m.slug}/${start.l.slug}`} className="btn ghost">Outline</Link>
                </div>
              </div>
              <Cover seed={`${start.m.slug}/${start.l.slug}`} caption={`${start.l.title.toLowerCase()} · ${start.l.topics.length} topics`} />
            </div>
          )}
        </section>

        <aside className="side">
          <section className="card">
            <h3 className="row" style={{ gap: 10 }}><Icon name="repeat" /> Review</h3>
            {due.length > 0 ? (
              <>
                <p className="big-number" style={{ margin: "18px 0 6px" }}>{due.length}</p>
                <p className="muted" style={{ marginTop: 0 }}>quick checks due today. Answer them while they are about to slip.</p>
                <Link href="/review" className="btn">Start review</Link>
              </>
            ) : (
              <>
                <p className="lead" style={{ fontSize: "1.02rem" }}>
                  The quick checks you miss come back on the right day: after 1 day, then 3, 7, 14 and 30, until they stick.
                </p>
                <p className="muted">{queued > 0 ? `${queued} in your queue, none due yet.` : "Nothing in your queue yet."}</p>
                <Link href="/review" className="btn ghost">Open review</Link>
              </>
            )}
          </section>
          <section className="card">
            <h3 className="row" style={{ gap: 10 }}><Icon name="flame" /> This week</h3>
            <WeekDots p={prog} />
            <p className="muted small" style={{ marginBottom: 0 }}>{days > 0 ? `${days}-day streak. Keep it going.` : "Finish a topic or a check to start a streak."}</p>
          </section>
        </aside>
      </div>

      <div className="grid-main">
        <section className="card">
          <div className="section-title">
            <div>
              <span className="eyebrow">Module {pad(currentModule.order)}</span>
              <h2 style={{ marginTop: 6 }}>{currentModule.title}</h2>
              <p>
                {currentModule.lessons.filter((l) => doneIn(currentModule, l) > 0).length} of {currentModule.lessons.length} lessons started ·{" "}
                {currentModule.lessons.reduce((a, l) => a + l.topics.length, 0)} topics
              </p>
            </div>
            <Link href={`/learn/${currentModule.slug}`} className="btn ghost">View module</Link>
          </div>
          <div className="cards-3">
            {currentModule.lessons.map((l) => {
              const d = doneIn(currentModule, l);
              return (
                <Link key={l.slug} href={`/learn/${currentModule.slug}/${l.slug}`} className="module-card">
                  <Cover seed={`${currentModule.slug}/${l.slug}`} caption={l.title.toLowerCase()} />
                  <h3>{l.title}</h3>
                  <p className="mono">{d} of {l.topics.length} topics · {l.minutes} min</p>
                  <div className="bar green"><i style={{ width: `${(d / Math.max(1, l.topics.length)) * 100}%` }} /></div>
                </Link>
              );
            })}
          </div>
        </section>

        <aside className="side">
          <section className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>Interview prep</h3>
              <span className="muted small">{interview.byModule.length} module{interview.byModule.length === 1 ? "" : "s"}</span>
            </div>
            <p style={{ margin: "18px 0 4px" }}>
              <span className="big-number">{interview.total}</span> <span className="muted">questions to practise</span>
            </p>
            <p className="muted small">{Object.keys(prog.known).length} marked as known.</p>
            <div className="stat-row" style={{ margin: "18px 0 10px" }}>
              <div><b>{interview.junior}</b><span>Junior</span></div>
              <div><b>{interview.mid}</b><span>Mid</span></div>
              <div><b>{interview.senior}</b><span>Senior</span></div>
            </div>
            <div className="list-rows">
              {interview.byModule.map((m) => (
                <Link key={m.slug} href={`/interview?module=${m.slug}`}>
                  <span style={{ flex: 1 }}>{m.title}</span>
                  <span className="muted small">{m.count} questions</span>
                  <Icon name="chevron-right" size={16} />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Practise by doing</h2>
            <p>Change a number, watch the system respond, then prove you understand it.</p>
          </div>
        </div>
        <div className="cards-3">
          <PracticeCard href="/simulations" icon="activity" title="Simulations" count={practice.sims} text="Live models of every key idea: attention, sampling, KV caches, batching, retrieval, agents." />
          <PracticeCard href="/labs" icon="beaker" title="Labs" count={practice.labs} text="Guided challenges: predict, compute it by hand, then meet the goals in a sim or the sandbox." />
          <PracticeCard href="/sandbox" icon="boxes" title="Sandbox" count={practice.scenarios} text="Wire an LLM system on a canvas, push traffic through it, break it on purpose." unit="starting points" />
        </div>
      </section>
    </div>
  );
}

function PracticeCard({ href, icon, title, count, text, unit }: { href: string; icon: "activity" | "beaker" | "boxes"; title: string; count: number; text: string; unit?: string }) {
  return (
    <Link href={href} className="module-card" style={{ padding: 24 }}>
      <span className="badge"><Icon name={icon} size={16} /> {count} {unit ?? title.toLowerCase()}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </Link>
  );
}

function WeekDots({ p }: { p: Progress }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, label: d.toLocaleDateString("en-US", { weekday: "narrow" }), n: p.days[key] ?? 0 };
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, margin: "18px 0 10px", textAlign: "center" }}>
      {days.map((d) => (
        <div key={d.key}>
          <div style={{ aspectRatio: "1", borderRadius: 10, background: d.n ? "var(--accent)" : "var(--card-2)", opacity: d.n ? Math.min(1, 0.4 + d.n * 0.15) : 1 }} title={`${d.key}: ${d.n} actions`} />
          <span className="muted small">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
