"use client";
// Interview prep: every question by module and lesson, filter by level, think first, then reveal the answer.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { InterviewSection } from "@/lib/content";
import { setKnown, useProgress } from "@/lib/progress";
import MiniMarkdown from "./MiniMarkdown";
import Icon from "./ui/Icon";

type Mod = { slug: string; title: string; order: number };
const LEVELS = ["junior", "mid", "senior"] as const;

export default function InterviewBrowser({ sections, modules }: { sections: InterviewSection[]; modules: Mod[] }) {
  const sp = useSearchParams();
  const p = useProgress();
  const [mod, setMod] = useState<string>(sp.get("module") ?? "all");
  const [section, setSection] = useState<string>(sp.get("section") ?? "all");
  const [levels, setLevels] = useState<Set<string>>(new Set(LEVELS));
  const [hideKnown, setHideKnown] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(sp.get("q") ? [sp.get("q")!] : []));
  const target = sp.get("q");

  useEffect(() => {
    if (!target) return;
    const s = sections.find((x) => x.questions.some((qq) => qq.id === target));
    if (s) {
      setMod(s.module);
      setSection(s.slug);
    }
    setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: "center" }), 60);
  }, [target, sections]);

  const visibleSections = useMemo(() => {
    const term = q.toLowerCase().trim();
    return sections
      .filter((s) => (mod === "all" || s.module === mod) && (section === "all" || s.slug === section))
      .map((s) => ({
        ...s,
        questions: s.questions.filter(
          (x) => levels.has(x.level) && (!hideKnown || !p.known[x.id]) && (!term || x.q.toLowerCase().includes(term) || x.a.toLowerCase().includes(term)),
        ),
      }))
      .filter((s) => s.questions.length > 0);
  }, [sections, mod, section, levels, hideKnown, q, p.known]);

  const total = visibleSections.reduce((a, s) => a + s.questions.length, 0);
  const all = sections.flatMap((s) => s.questions);
  const known = all.filter((x) => p.known[x.id]).length;
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="page">
    <div className="grid-main">
      <div className="stack">
        <header className="page-head">
          <span className="eyebrow"><Icon name="chats" size={14} /> Interview prep</span>
          <h1 style={{ marginTop: 8 }}>{all.length} questions, junior to senior</h1>
          <p className="lead">Say your answer out loud first, then reveal ours. Mark the ones you know so you can hide them and focus on the rest.</p>
          <div className="filters" style={{ marginTop: 22 }}>
            {LEVELS.map((l) => (
              <button key={l} type="button" className={`filter ${levels.has(l) ? "on" : ""}`} onClick={() => setLevels((s) => { const n = new Set(s); if (n.has(l)) n.delete(l); else n.add(l); return n; })}>
                {l[0].toUpperCase() + l.slice(1)} · {all.filter((x) => x.level === l).length}
              </button>
            ))}
            <button type="button" className={`filter ${hideKnown ? "on" : ""}`} onClick={() => setHideKnown((h) => !h)}>Hide known</button>
            <input className="field" style={{ flex: "1 1 220px", borderRadius: 999, padding: "8px 16px" }} placeholder="Filter questions…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter questions" />
          </div>
        </header>

        {visibleSections.length === 0 && <div className="card empty">No questions match these filters.</div>}
        {visibleSections.map((s) => (
          <section key={`${s.module}-${s.slug}`} className="card">
            <div className="section-title">
              <div>
                <span className="eyebrow">{modules.find((m) => m.slug === s.module)?.title}</span>
                <h2 style={{ marginTop: 6 }}>{s.title}</h2>
              </div>
              {s.lesson && <Link href={`/learn/${s.module}/${s.lesson}`} className="chip-btn">Lesson <Icon name="arrow-right" size={13} /></Link>}
            </div>
            {s.questions.map((x) => (
              <details key={x.id} id={x.id} className="qa" open={open.has(x.id)} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open !== open.has(x.id)) toggle(x.id); }}>
                <summary>
                  <b>{x.q}</b>
                  <span className="row" style={{ gap: 8 }}>
                    {p.known[x.id] && <Icon name="circle-check" size={16} label="known" className="accent-text" />}
                    <span className={`pill ${x.level}`}>{x.level}</span>
                  </span>
                </summary>
                <div className="answer">
                  <MiniMarkdown>{x.a}</MiniMarkdown>
                  <div className="answer-actions">
                    <button type="button" className="chip-btn" onClick={() => setKnown(x.id, !p.known[x.id])}>
                      <Icon name={p.known[x.id] ? "x" : "check"} size={14} /> {p.known[x.id] ? "Unmark" : "I know this"}
                    </button>
                  </div>
                </div>
              </details>
            ))}
          </section>
        ))}
        <p className="muted small" style={{ textAlign: "center" }}>{total} shown</p>
      </div>

      <aside className="side">
        <section className="card">
          <h3>Your progress</h3>
          <p style={{ margin: "16px 0 6px" }}><span className="big-number">{known}</span> <span className="muted">of {all.length} known</span></p>
          <div className="bar green"><i style={{ width: `${(known / Math.max(1, all.length)) * 100}%` }} /></div>
        </section>
        <section className="card tight">
          <div className="list-rows">
            <button type="button" className={`filter ${mod === "all" ? "on" : ""}`} style={{ margin: "0 0 10px" }} onClick={() => { setMod("all"); setSection("all"); }}>All modules</button>
            {modules.map((m) => {
              const secs = sections.filter((s) => s.module === m.slug);
              if (!secs.length) return null;
              return (
                <div key={m.slug} style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <button type="button" className="link-btn" style={{ color: mod === m.slug && section === "all" ? "var(--accent)" : "var(--text)", fontSize: "0.98rem", justifyContent: "space-between" }} onClick={() => { setMod(m.slug); setSection("all"); }}>
                    <span>{m.title}</span>
                    <span className="muted small">{secs.reduce((a, s) => a + s.questions.length, 0)}</span>
                  </button>
                  {mod === m.slug && secs.map((s) => (
                    <button key={s.slug} type="button" className="link-btn" style={{ paddingLeft: 14, color: section === s.slug ? "var(--accent)" : undefined, justifyContent: "space-between" }} onClick={() => setSection(s.slug)}>
                      <span>{s.title}</span>
                      <span className="small">{s.questions.length}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </aside>
    </div>
    </div>
  );
}
