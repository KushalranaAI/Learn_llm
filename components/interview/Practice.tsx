"use client";
// Practice: a flashcard deck with a think timer, a 3D flip to key points, self-grading and spaced repetition.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GRADES, type Grade, intervalDays, intervalLabel, isDue, LEVELS, type Level, splitKeyPoints, suggestGrade } from "@/lib/interview";
import { gradeInterview, progressStore, useProgress } from "@/lib/progress";
import MiniMarkdown from "../MiniMarkdown";
import Icon from "../ui/Icon";
import { type HubModule, type HubQuestion, KeyPoints, lessonHref, ownsSpace, isTypingTarget, pct, type PracticeQueue, useReducedMotion } from "./shared";

export type PracticeFilter = { module: string; section: string; levels: Level[]; dueOnly: boolean };
const THINK = 60;
const SIZES = [10, 20, 0] as const; // 0 = all

/** Due first (most overdue first), then never-seen in course order, then the rest by due date. */
function orderDeck(qs: HubQuestion[], now: number): string[] {
  const iv = progressStore.get().iv ?? {};
  const due = qs.filter((q) => isDue(iv[q.id], now)).sort((a, b) => iv[a.id].due - iv[b.id].due);
  const fresh = qs.filter((q) => !iv[q.id]);
  const rest = qs.filter((q) => iv[q.id] && !isDue(iv[q.id], now)).sort((a, b) => iv[a.id].due - iv[b.id].due);
  return [...due, ...fresh, ...rest].map((q) => q.id);
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Result = { grade: Grade; covered?: number };

export default function Practice({
  questions,
  modules,
  filter,
  setFilter,
  queue,
  clearQueue,
}: {
  questions: HubQuestion[];
  modules: HubModule[];
  filter: PracticeFilter;
  setFilter: (f: PracticeFilter) => void;
  queue: PracticeQueue | null;
  clearQueue: () => void;
}) {
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const sections = useMemo(() => {
    const seen = new Map<string, string>();
    for (const q of questions) if ((filter.module === "all" || q.module === filter.module) && !seen.has(q.section)) seen.set(q.section, q.sectionTitle);
    return [...seen];
  }, [questions, filter.module]);

  const [size, setSize] = useState<(typeof SIZES)[number]>(20);
  const [shuffled, setShuffled] = useState(0);
  const [deck, setDeck] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState<"right" | "left">("right");
  const [results, setResults] = useState<Record<string, Result>>({});
  const [retry, setRetry] = useState<string[] | null>(null);
  const [round, setRound] = useState(0);

  const filterKey = `${filter.module}|${filter.section}|${filter.levels.join(",")}|${filter.dueOnly}`;
  // Build the deck when the inputs change (not when grading changes the schedule, so the session stays put).
  useEffect(() => {
    let ids: string[];
    if (retry) ids = retry;
    else if (queue) ids = queue.ids.filter((id) => byId.has(id));
    else {
      const now = Date.now();
      const iv = progressStore.get().iv ?? {};
      const pool = questions.filter(
        (q) =>
          (filter.module === "all" || q.module === filter.module) &&
          (filter.section === "all" || q.section === filter.section) &&
          filter.levels.includes(q.level) &&
          (!filter.dueOnly || isDue(iv[q.id], now)),
      );
      ids = shuffled ? shuffle(pool.map((q) => q.id)) : orderDeck(pool, now);
      if (size) ids = ids.slice(0, size);
    }
    setDeck(ids);
    setIdx(0);
    setDir("right");
    setResults({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, queue?.nonce, size, shuffled, retry, round, byId]);

  const total = deck?.length ?? 0;
  const graded = Object.values(results);
  const good = graded.filter((r) => r.grade >= 3).length;
  const finished = deck !== null && total > 0 && idx >= total;
  const current = deck && idx < total ? byId.get(deck[idx]) : undefined;

  const go = useCallback(
    (d: 1 | -1) => {
      setDir(d > 0 ? "right" : "left");
      setIdx((i) => Math.max(0, Math.min(total, i + d)));
    },
    [total],
  );

  const grade = useCallback(
    (id: string, g: Grade, covered?: number) => {
      gradeInterview(id, g, covered);
      setResults((r) => ({ ...r, [id]: { grade: g, covered } }));
      setDir("right");
      setIdx((i) => i + 1);
    },
    [],
  );

  const restart = (ids: string[] | null) => {
    setRetry(ids);
    setRound((r) => r + 1);
  };

  const setF = (patch: Partial<PracticeFilter>) => {
    setRetry(null);
    if (queue) clearQueue();
    setFilter({ ...filter, ...patch });
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="iv-toolbar">
        {queue && !retry ? (
          <span className="iv-queue pill accent">
            <Icon name="target" size={13} /> {queue.label} · {queue.ids.length}
            <button type="button" className="icon-btn" style={{ width: 20, height: 20 }} aria-label="Clear custom set" onClick={clearQueue}>
              <Icon name="x" size={12} />
            </button>
          </span>
        ) : (
          <>
            <select aria-label="Module" value={filter.module} onChange={(e) => setF({ module: e.target.value, section: "all" })}>
              <option value="all">All modules</option>
              {modules.map((m) => (
                <option key={m.slug} value={m.slug}>
                  {m.title}
                </option>
              ))}
            </select>
            <select aria-label="Lesson section" value={filter.section} onChange={(e) => setF({ section: e.target.value })}>
              <option value="all">All sections</option>
              {sections.map(([slug, title]) => (
                <option key={slug} value={slug}>
                  {title}
                </option>
              ))}
            </select>
            <div className="filters" role="group" aria-label="Levels">
              {LEVELS.map((l) => {
                const on = filter.levels.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    className={`filter ${on ? "on" : ""}`}
                    aria-pressed={on}
                    onClick={() => setF({ levels: on ? (filter.levels.length > 1 ? filter.levels.filter((x) => x !== l) : filter.levels) : [...filter.levels, l] })}
                  >
                    {l[0].toUpperCase() + l.slice(1)}
                  </button>
                );
              })}
              <button type="button" className={`filter ${filter.dueOnly ? "on" : ""}`} aria-pressed={filter.dueOnly} onClick={() => setF({ dueOnly: !filter.dueOnly })}>
                <Icon name="clock" size={13} /> Due
              </button>
            </div>
          </>
        )}
        <span className="grow" />
        {!queue && (
          <select aria-label="Cards per session" value={size} onChange={(e) => setSize(Number(e.target.value) as (typeof SIZES)[number])}>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s ? `${s} cards` : "All cards"}
              </option>
            ))}
          </select>
        )}
        {!queue && (
          <button type="button" className={`icon-btn ${shuffled ? "accent-text" : ""}`} aria-label={shuffled ? "Turn shuffle off" : "Shuffle deck"} aria-pressed={!!shuffled} title="Shuffle" onClick={() => setShuffled((s) => (s ? 0 : 1))}>
            <Icon name="dice" size={17} />
          </button>
        )}
        <ShortcutHelp />
      </div>

      {total > 0 && !finished && (
        <div className="iv-session" aria-label="Session progress">
          <span>
            <b>{Math.min(idx + 1, total)}</b>/{total}
          </span>
          <span className="meter">
            <span style={{ width: `${(graded.length / total) * 100}%` }} />
          </span>
          {graded.length > 0 && (
            <span title="Good or Easy">
              <Icon name="target" size={13} /> <b>{pct(good / graded.length)}</b>
            </span>
          )}
        </div>
      )}

      <div className="iv-stage">
        {deck === null ? (
          <div className="iv-face" aria-busy="true" />
        ) : total === 0 ? (
          <div className="card iv-empty">
            <span className="tile">
              <Icon name={filter.dueOnly ? "circle-check" : "filter"} size={20} />
            </span>
            <p>{filter.dueOnly ? "Nothing due." : "No cards match."}</p>
            <button type="button" className="btn sm" onClick={() => setF({ module: "all", section: "all", levels: [...LEVELS], dueOnly: false })}>
              Show all cards
            </button>
          </div>
        ) : finished ? (
          <Finished
            total={total}
            results={results}
            onAgain={(ids) => restart(ids)}
            onNew={() => {
              if (queue) clearQueue();
              restart(null);
            }}
          />
        ) : current ? (
          <div key={`${current.id}-${idx}`} className={`iv-slide ${dir}`}>
            <FlashCard q={current} onGrade={grade} onPrev={() => go(-1)} onNext={() => go(1)} canPrev={idx > 0} />
          </div>
        ) : null}
      </div>

      {total > 0 && !finished && total <= 40 && deck && (
        <div className="iv-dots" style={{ margin: "0 auto" }} aria-hidden>
          {deck.map((id, i) => (
            <i key={id} className={i === idx ? "on" : results[id] ? `g${results[id].grade}` : ""} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ one card */

function FlashCard({ q, onGrade, onPrev, onNext, canPrev }: { q: HubQuestion; onGrade: (id: string, g: Grade, covered?: number) => void; onPrev: () => void; onNext: () => void; canPrev: boolean }) {
  const p = useProgress();
  const points = useMemo(() => splitKeyPoints(q.a), [q.a]);
  const [flipped, setFlipped] = useState(false);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [full, setFull] = useState(false);
  const [left, setLeft] = useState(THINK * 1000);
  const [running, setRunning] = useState(false);
  const backRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!running) return;
    const end = Date.now() + left;
    const t = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      if (l === 0) setRunning(false);
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const reveal = useCallback(() => {
    setFlipped(true);
    setRunning(false);
    setTimeout(() => backRef.current?.querySelector<HTMLElement>(".iv-point")?.focus({ preventScroll: true }), 80);
  }, []);
  const toggle = (i: number) =>
    setTicked((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const covered = points.length ? ticked.size / points.length : 0;
  const submit = useCallback((g: Grade) => onGrade(q.id, g, ticked.size ? ticked.size / Math.max(1, points.length) : undefined), [onGrade, q.id, ticked, points.length]);
  const toggleTimer = useCallback(() => {
    if (left === 0) {
      setLeft(THINK * 1000);
      setRunning(true);
    } else setRunning((r) => !r);
  }, [left]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if ((e.target as HTMLElement | null)?.getAttribute?.("role") === "tab") return;
      if (e.key === " " && !flipped && !ownsSpace(e.target)) {
        e.preventDefault();
        reveal();
      } else if (flipped && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        submit(Number(e.key) as Grade);
      } else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft" && canPrev) onPrev();
      else if ((e.key === "t" || e.key === "T") && !flipped) toggleTimer();
      else if ((e.key === "f" || e.key === "F") && flipped) setFull((f) => !f);
      else if (e.key === "Enter" && !flipped && !ownsSpace(e.target)) reveal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, reveal, submit, onNext, onPrev, canPrev, toggleTimer]);

  const suggestion = ticked.size ? suggestGrade(covered) : null;
  const ivc = p.iv?.[q.id];

  return (
    <div>
      <div className={`iv-flip ${flipped ? "flipped" : ""}`}>
        <div className="iv-flip-inner">
          <section className="iv-face front" inert={flipped} aria-hidden={flipped} aria-label="Question">
            <div className="iv-face-top">
              <span className={`pill ${q.level}`}>{q.level}</span>
              <span>{q.sectionTitle}</span>
              <span className="spacer" />
              {ivc && <span className="pill" title="Reviews">×{ivc.reps}</span>}
            </div>
            <h2 className="iv-q">{q.q}</h2>
            <div className="iv-front-foot">
              <TimerRing left={left} total={THINK * 1000} running={running} onToggle={toggleTimer} />
              <button ref={frontRef} type="button" className="btn primary big" onClick={reveal}>
                <Icon name="refresh" size={16} /> Reveal <kbd>Space</kbd>
              </button>
            </div>
          </section>

          <section ref={backRef} className="iv-face back" inert={!flipped} aria-hidden={!flipped} aria-label="Answer">
            <div className="iv-face-top">
              <span className={`pill ${q.level}`}>{q.level}</span>
              <span className="spacer" />
              <a className="link-btn" href={lessonHref(q)}>
                <Icon name="book" size={13} /> Lesson
              </a>
              <button type="button" className="link-btn" aria-expanded={full} onClick={() => setFull((f) => !f)}>
                <Icon name={full ? "eye-off" : "eye"} size={13} /> {full ? "Hide full answer" : "Show full answer"}
              </button>
            </div>
            <p className="iv-q">{q.q}</p>
            {flipped && <KeyPoints points={points} ticked={ticked} onToggle={toggle} />}
            {flipped && full && (
              <div className="iv-full">
                <MiniMarkdown>{q.a}</MiniMarkdown>
              </div>
            )}
            <div className="iv-grades" role="group" aria-label="How did it go?">
              {GRADES.map((g) => (
                <button key={g.grade} type="button" className={`iv-grade g${g.grade} ${suggestion === g.grade ? "suggest" : ""}`} onClick={() => submit(g.grade)} aria-label={`${g.label}, next in ${intervalLabel(intervalDays(ivc, g.grade))} (key ${g.key})`}>
                  {g.label}
                  <small>{intervalLabel(intervalDays(ivc, g.grade))}</small>
                  <kbd>{g.key}</kbd>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
      <div className="iv-nav">
        <button type="button" className="btn ghost sm" onClick={onPrev} disabled={!canPrev} aria-label="Previous card">
          <Icon name="arrow-left" size={15} />
        </button>
        {flipped ? (
          <button type="button" className="btn ghost sm" onClick={() => setFlipped(false)} aria-label="Flip back to question">
            <Icon name="refresh" size={14} />
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="btn ghost sm" onClick={onNext} aria-label="Skip to next card">
          <Icon name="arrow-right" size={15} />
        </button>
      </div>
    </div>
  );
}

function TimerRing({ left, total, running, onToggle }: { left: number; total: number; running: boolean; onToggle: () => void }) {
  const size = 64;
  const r = 28;
  const c = 2 * Math.PI * r;
  const secs = Math.ceil(left / 1000);
  const state = left === 0 ? "done" : left < 10_000 ? "low" : "";
  return (
    <button type="button" className={`iv-timer ${state}`} onClick={onToggle} aria-label={running ? `Pause think timer, ${secs} seconds left` : left === 0 ? "Restart think timer" : `Start ${secs} second think timer`} title="Think timer (T)">
      <svg width={size} height={size} aria-hidden>
        <circle className="trk" cx={size / 2} cy={size / 2} r={r} />
        <circle className="fil" cx={size / 2} cy={size / 2} r={r} strokeDasharray={c} strokeDashoffset={c * (1 - left / total)} />
      </svg>
      <b>{secs}</b>
      <i aria-hidden>
        <Icon name={left === 0 ? "refresh" : running ? "pause" : "play"} size={10} />
      </i>
    </button>
  );
}

/* ------------------------------------------------------------------ end of deck */

const CONFETTI = ["var(--accent)", "var(--accent-strong)", "var(--info)", "var(--warm)", "var(--ai)", "var(--hot)"];

function Finished({ total, results, onAgain, onNew }: { total: number; results: Record<string, Result>; onAgain: (ids: string[]) => void; onNew: () => void }) {
  const reduced = useReducedMotion();
  const graded = Object.entries(results);
  const again = graded.filter(([, r]) => r.grade <= 2).map(([id]) => id);
  const good = graded.filter(([, r]) => r.grade >= 3).length;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus({ preventScroll: true }), []);
  return (
    <div className="iv-done" role="status">
      {!reduced && (
        <div className="iv-confetti" aria-hidden>
          {Array.from({ length: 36 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--x": `${(i * 37) % 100}%`,
                  "--c": CONFETTI[i % CONFETTI.length],
                  "--d": `${1.6 + ((i * 13) % 10) / 10}s`,
                  "--delay": `${((i * 7) % 12) / 20}s`,
                  "--dx": `${((i * 29) % 120) - 60}px`,
                  "--r": `${((i * 53) % 720) - 360}deg`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}
      <span className="tile">
        <Icon name="trophy" size={30} />
      </span>
      <h2>Deck done</h2>
      <div className="iv-done-stats">
        <div>
          <b>{graded.length}</b>
          <span>graded</span>
        </div>
        <div>
          <b>{graded.length ? pct(good / graded.length) : "-"}</b>
          <span>good or easy</span>
        </div>
        <div>
          <b>{total - graded.length}</b>
          <span>skipped</span>
        </div>
      </div>
      <div className="row">
        {again.length > 0 && (
          <button type="button" className="btn" onClick={() => onAgain(again)}>
            <Icon name="repeat" size={15} /> Again · {again.length}
          </button>
        )}
        <button ref={btn} type="button" className="btn primary" onClick={onNew}>
          <Icon name="refresh" size={15} /> New deck
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shortcuts */

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "?") setOpen((o) => !o);
      else if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);
  return (
    <div className="iv-help" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Keyboard shortcuts" aria-expanded={open} onClick={() => setOpen((o) => !o)} title="Shortcuts (?)">
        <b style={{ fontSize: "0.95rem" }}>?</b>
      </button>
      {open && (
        <div className="iv-pop" role="dialog" aria-label="Keyboard shortcuts">
          <dl>
            <dt><kbd>Space</kbd></dt><dd>Reveal</dd>
            <dt><kbd>1</kbd>–<kbd>4</kbd></dt><dd>Again · Hard · Good · Easy</dd>
            <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous / next</dd>
            <dt><kbd>T</kbd></dt><dd>Think timer</dd>
            <dt><kbd>F</kbd></dt><dd>Full answer</dd>
            <dt><kbd>?</kbd></dt><dd>This help</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
