"use client";
// Browse: a compact searchable list of every question, expand to read the answer, mark "I know this".
import { useEffect, useMemo, useState } from "react";
import { LEVELS } from "@/lib/interview";
import { setKnown, useProgress } from "@/lib/progress";
import MiniMarkdown from "../MiniMarkdown";
import Icon from "../ui/Icon";
import { type HubModule, type HubQuestion, isKnown, lessonHref } from "./shared";

const PAGE = 40;

export default function Browse({ questions, modules, initialModule, onPractise }: { questions: HubQuestion[]; modules: HubModule[]; initialModule: string; onPractise: (ids: string[], label: string) => void }) {
  const p = useProgress();
  const [term, setTerm] = useState("");
  const [mod, setMod] = useState(initialModule);
  const [levels, setLevels] = useState<string[]>([...LEVELS]);
  const [hideKnown, setHideKnown] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const list = useMemo(() => {
    const t = term.toLowerCase().trim();
    return questions.filter(
      (q) =>
        (mod === "all" || q.module === mod) &&
        levels.includes(q.level) &&
        (!hideKnown || !isKnown(p, q.id)) &&
        (!t || q.q.toLowerCase().includes(t) || q.a.toLowerCase().includes(t) || q.sectionTitle.toLowerCase().includes(t)),
    );
  }, [questions, term, mod, levels, hideKnown, p]);
  useEffect(() => setLimit(PAGE), [term, mod, levels, hideKnown]);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="iv-toolbar">
        <input type="text" className="field" style={{ flex: "1 1 220px", borderRadius: 999, padding: "8px 16px" }} placeholder="Search…" aria-label="Search questions" value={term} onChange={(e) => setTerm(e.target.value)} />
        <select aria-label="Module" value={mod} onChange={(e) => setMod(e.target.value)}>
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.title}
            </option>
          ))}
        </select>
        <div className="filters" role="group" aria-label="Levels">
          {LEVELS.map((l) => {
            const on = levels.includes(l);
            return (
              <button key={l} type="button" className={`filter ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setLevels((s) => (on ? s.filter((x) => x !== l) : [...s, l]))}>
                {l[0].toUpperCase() + l.slice(1)}
              </button>
            );
          })}
          <button type="button" className={`filter ${hideKnown ? "on" : ""}`} aria-pressed={hideKnown} onClick={() => setHideKnown((h) => !h)}>
            <Icon name="eye-off" size={13} /> Known
          </button>
        </div>
      </div>

      <section className="card tight">
        {list.length === 0 ? (
          <div className="iv-empty">No questions match.</div>
        ) : (
          <div className="iv-list">
            {list.slice(0, limit).map((q) => {
              const isOpen = open === q.id;
              const known = isKnown(p, q.id);
              return (
                <div key={q.id} id={`b-${q.id}`} className={`iv-row ${isOpen ? "open" : ""}`}>
                  <button type="button" aria-expanded={isOpen} aria-controls={`a-${q.id}`} onClick={() => setOpen(isOpen ? null : q.id)}>
                    <span>
                      <b>{q.q}</b>
                      <small>{q.sectionTitle}</small>
                    </span>
                    <span className="meta">
                      {known && <Icon name="circle-check" size={16} label="known" className="accent-text" />}
                      <span className={`pill ${q.level}`}>{q.level}</span>
                      <Icon name="chevron-down" size={16} className="chev muted" />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="answer" id={`a-${q.id}`}>
                      <MiniMarkdown>{q.a}</MiniMarkdown>
                      <div className="answer-actions">
                        <button type="button" className={`chip-btn ${p.known[q.id] ? "accent-text" : ""}`} aria-pressed={!!p.known[q.id]} onClick={() => setKnown(q.id, !p.known[q.id])}>
                          <Icon name={p.known[q.id] ? "circle-check" : "check"} size={14} /> I know this
                        </button>
                        <button type="button" className="chip-btn" onClick={() => onPractise([q.id], "1 card")}>
                          <Icon name="play" size={13} /> Practise
                        </button>
                        <a className="chip-btn" href={lessonHref(q)}>
                          <Icon name="book" size={13} /> Lesson
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
      <div className="row" style={{ justifyContent: "center" }}>
        <span className="muted small">
          {Math.min(limit, list.length)}/{list.length}
        </span>
        {limit < list.length && (
          <button type="button" className="btn sm" onClick={() => setLimit((l) => l + PAGE)}>
            More
          </button>
        )}
      </div>
    </div>
  );
}
