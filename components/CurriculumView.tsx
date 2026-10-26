"use client";
// The curriculum as System Learn's "path": a progress card, then one expandable card per module with a progress ring
// and a row per lesson (status, number, title, what it covers, length, and an "Up next" marker).
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Outline } from "@/lib/content";
import { type Progress, useProgress } from "@/lib/progress";
import Icon from "./ui/Icon";

const EMPTY: Progress = { done: {}, visited: {}, last: null, days: {}, checks: {}, reviews: {}, known: {}, labs: {}, simsTried: {} };
const pad = (n: number) => String(n).padStart(2, "0");

/** The course in three phases: learners see the whole journey before the detail. */
const PHASES = [
  { title: "Understand", sub: "How models work and how they are made", modules: [1, 2] },
  { title: "Build", sub: "Serve, steer, measure and ground them", modules: [3, 4, 5, 6] },
  { title: "Ship", sub: "Agents, production and system design", modules: [7, 8, 9] },
];

function Roadmap({ outline, ratio, current, onPick }: { outline: Outline; ratio: (m: Outline[number]) => number; current?: string; onPick: (slug: string) => void }) {
  return (
    <div className="roadmap" aria-label="Course roadmap">
      {PHASES.map((ph, pi) => (
        <div key={ph.title} className="roadmap-phase">
          <div className="roadmap-phase-head">
            <span className="roadmap-phase-num">{pi + 1}</span>
            <span><b>{ph.title}</b><small>{ph.sub}</small></span>
          </div>
          <div className="roadmap-stops">
            {ph.modules.map((n) => {
              const m = outline.find((x) => x.order === n);
              if (!m) return null;
              const r = ratio(m);
              return (
                <button key={m.slug} type="button" className={`roadmap-stop ${m.slug === current ? "current" : ""} ${r >= 1 ? "done" : ""}`} onClick={() => onPick(m.slug)} title={m.title}>
                  <Ring value={r} label={r >= 1 ? "✓" : String(m.order)} />
                  <span className="roadmap-stop-title">{m.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <span className="module-num">
      <svg className="ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ring-track" cx="18" cy="18" r={r} />
        <circle className="ring-fill" cx="18" cy="18" r={r} strokeDasharray={`${value * c} ${c}`} />
      </svg>
      <span>{label}</span>
    </span>
  );
}

export default function CurriculumView({ outline }: { outline: Outline }) {
  const p = useProgress();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const prog = mounted ? p : EMPTY;

  const id = (m: Outline[number], l: Outline[number]["lessons"][number], t: { slug: string }) => `${m.slug}/${l.slug}/${t.slug}`;
  const allTopics = outline.flatMap((m) => m.lessons.flatMap((l) => l.topics.map((t) => id(m, l, t))));
  const done = allTopics.filter((x) => prog.done[x]).length;
  const next = outline.flatMap((m) => m.lessons.map((l) => ({ m, l }))).find(({ m, l }) => l.topics.some((t) => !prog.done[id(m, l, t)]));
  const nextTopic = next?.l.topics.find((t) => !prog.done[id(next.m, next.l, t)]);
  const nextHref = next && nextTopic ? `/learn/${next.m.slug}/${next.l.slug}/${nextTopic.slug}` : "/curriculum";

  const [open, setOpen] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!mounted || seeded) return;
    setSeeded(true);
    setOpen(new Set([next?.m.slug ?? outline[0]?.slug].filter(Boolean) as string[]));
  }, [mounted, seeded, next, outline]);
  const toggle = (slug: string) => setOpen((o) => { const n = new Set(o); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });

  return (
    <div className="page mid">
      <p className="eyebrow">The curriculum</p>
      <h1>LLM engineering, in the order real products need it.</h1>
      <p className="lead">Each module builds on the last: how models work, how they are trained and served, how you steer and measure them, and how you run them for real users.</p>

      <div className="card path-progress">
        <div className="grow">
          <b>Your progress</b>
          <div className="meter"><span style={{ width: `${(done / Math.max(1, allTopics.length)) * 100}%` }} /></div>
        </div>
        <span className="muted small" style={{ whiteSpace: "nowrap" }}>{done} of {allTopics.length} topics</span>
        <Link href={nextHref} className="btn primary">{done > 0 ? "Continue" : "Start"}{next ? `: ${next.m.order}.${next.l.order}` : ""} <Icon name="arrow-right" size={15} /></Link>
      </div>

      <Roadmap
        outline={outline}
        current={next?.m.slug}
        ratio={(m) => {
          const ids = m.lessons.flatMap((l) => l.topics.map((t) => id(m, l, t)));
          return ids.filter((x) => prog.done[x]).length / Math.max(1, ids.length);
        }}
        onPick={(slug) => {
          setOpen((o) => new Set(o).add(slug));
          setTimeout(() => document.getElementById(`m-${slug}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
        }}
      />

      {outline.map((m) => {
        const ids = m.lessons.flatMap((l) => l.topics.map((t) => id(m, l, t)));
        const d = ids.filter((x) => prog.done[x]).length;
        const isOpen = open.has(m.slug);
        return (
          <section key={m.slug} id={`m-${m.slug}`} style={{ scrollMarginTop: 72 }}>
            <div className="part">Module {pad(m.order)} · {PHASES.find((p) => p.modules.includes(m.order))?.title}</div>
            <div className={`module ${isOpen ? "open" : ""} ${d === ids.length && d > 0 ? "complete" : ""}`}>
              <button type="button" className="module-head" onClick={() => toggle(m.slug)} aria-expanded={isOpen}>
                <Ring value={d / Math.max(1, ids.length)} label={String(m.order)} />
                <span className="module-title">{m.title}<span className="module-sub">{m.summary}</span></span>
                <span className="module-meta">{d}/{ids.length} topics</span>
                <Icon name="chevron-down" size={18} className="chev" />
              </button>
              {isOpen && (
                <ol className="lessons">
                  {m.lessons.map((l) => {
                    const ld = l.topics.filter((t) => prog.done[id(m, l, t)]).length;
                    const complete = ld === l.topics.length && ld > 0;
                    const isNext = next?.m.slug === m.slug && next.l.slug === l.slug;
                    return (
                      <li key={l.slug} className={isNext ? "next" : ""}>
                        <Link href={`/learn/${m.slug}/${l.slug}`}>
                          <span className={`lesson-status ${complete ? "done" : ld > 0 ? "part" : ""}`} style={ld > 0 && !complete ? ({ "--p": `${(ld / l.topics.length) * 100}%` } as React.CSSProperties) : undefined}>
                            {complete && <Icon name="check" size={12} />}
                          </span>
                          <span className="lesson-main">
                            <span className="lesson-title"><span className="lesson-id">{m.order}.{l.order}</span>{l.title}</span>
                            <span className="lesson-learn">{l.summary}</span>
                          </span>
                          <span className="lesson-meta">
                            {isNext && <span className="pill accent">Up next</span>}
                            {l.sims > 0 && <span title={`${l.sims} simulation${l.sims > 1 ? "s" : ""}`}><Icon name="activity" size={13} /> {l.sims}</span>}
                            {l.labs > 0 && <span title={`${l.labs} lab${l.labs > 1 ? "s" : ""}`}><Icon name="beaker" size={13} /> {l.labs}</span>}
                            {l.sandbox > 0 && <span title="Sandbox scenario"><Icon name="boxes" size={13} /></span>}
                            <span title={`${l.topics.length} topics`}><Icon name="book" size={13} /> {l.topics.length}</span>
                            <span><Icon name="clock" size={13} /> {l.minutes}m</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
