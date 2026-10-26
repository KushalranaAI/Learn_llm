"use client";
// Mock interview: pick modules and a role, answer against the clock, score your key points, see weak spots.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pickMock, type Role, splitKeyPoints } from "@/lib/interview";
import { queueInterview, recordMockScore } from "@/lib/progress";
import Icon from "../ui/Icon";
import { type HubModule, type HubQuestion, isTypingTarget, KeyPoints, lessonHref, ownsSpace, pct, Seg, useCountUp, useMounted } from "./shared";

type Setup = { modules: string[]; role: Role; count: 5 | 8 | 12; seconds: 60 | 90 | 120 };
type Answer = { id: string; covered: number; points: number; ticks: number };

export default function Mock({ questions, modules, onPractise }: { questions: HubQuestion[]; modules: HubModule[]; onPractise: (ids: string[], label: string) => void }) {
  const [setup, setSetup] = useState<Setup>({ modules: [], role: "mid", count: 5, seconds: 90 });
  const [run, setRun] = useState<{ ids: string[]; answers: Answer[] } | null>(null);
  const [done, setDone] = useState<Answer[] | null>(null);
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const start = () => {
    const pool = questions.filter((q) => !setup.modules.length || setup.modules.includes(q.module));
    const ids = pickMock(
      pool.map((q) => ({ id: q.id, level: q.level, module: q.module, section: q.section })),
      setup.role,
      setup.count,
    );
    if (!ids.length) return;
    setDone(null);
    setRun({ ids, answers: [] });
  };

  const finish = (answers: Answer[]) => {
    answers.forEach((a) => recordMockScore(a.id, a.covered));
    setRun(null);
    setDone(answers);
  };

  if (run) return <Session key={run.ids.join()} ids={run.ids} byId={byId} seconds={setup.seconds} onFinish={finish} onQuit={() => setRun(null)} />;
  if (done) return <Results answers={done} byId={byId} modules={modules} onPractise={onPractise} onAgain={() => setDone(null)} />;

  const toggleMod = (slug: string) => setSetup((s) => ({ ...s, modules: s.modules.includes(slug) ? s.modules.filter((m) => m !== slug) : [...s.modules, slug] }));
  return (
    <div className="card iv-setup">
      <div className="iv-field">
        <span>
          <Icon name="layers" size={13} /> Modules
        </span>
        <div className="filters">
          <button type="button" className={`filter ${setup.modules.length === 0 ? "on" : ""}`} aria-pressed={setup.modules.length === 0} onClick={() => setSetup((s) => ({ ...s, modules: [] }))}>
            All
          </button>
          {modules.map((m) => (
            <button key={m.slug} type="button" className={`filter ${setup.modules.includes(m.slug) ? "on" : ""}`} aria-pressed={setup.modules.includes(m.slug)} onClick={() => toggleMod(m.slug)}>
              {m.title}
            </button>
          ))}
        </div>
      </div>
      <div className="iv-field">
        <span>
          <Icon name="user" size={13} /> Role
        </span>
        <Seg label="Target role" value={setup.role} onChange={(role) => setSetup((s) => ({ ...s, role }))} options={[{ v: "junior", label: "Junior" }, { v: "mid", label: "Mid" }, { v: "senior", label: "Senior" }, { v: "mix", label: "Mix" }]} />
      </div>
      <div className="row" style={{ gap: 24, alignItems: "flex-start" }}>
        <div className="iv-field">
          <span>
            <Icon name="list" size={13} /> Questions
          </span>
          <Seg label="Number of questions" value={setup.count} onChange={(count) => setSetup((s) => ({ ...s, count }))} options={[5, 8, 12].map((v) => ({ v: v as Setup["count"], label: String(v) }))} />
        </div>
        <div className="iv-field">
          <span>
            <Icon name="clock" size={13} /> Seconds each
          </span>
          <Seg label="Seconds per question" value={setup.seconds} onChange={(seconds) => setSetup((s) => ({ ...s, seconds }))} options={[60, 90, 120].map((v) => ({ v: v as Setup["seconds"], label: `${v}s` }))} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted small">
          ≈ {Math.round((setup.count * (setup.seconds + 40)) / 60)} min
        </span>
        <button type="button" className="btn primary big" onClick={start}>
          <Icon name="play" size={16} /> Start
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the timed session */

function Session({ ids, byId, seconds, onFinish, onQuit }: { ids: string[]; byId: Map<string, HubQuestion>; seconds: number; onFinish: (a: Answer[]) => void; onQuit: () => void }) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<"ask" | "score">("ask");
  const [left, setLeft] = useState(seconds * 1000);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [answers, setAnswers] = useState<Answer[]>([]);
  const q = byId.get(ids[i])!;
  const points = useMemo(() => splitKeyPoints(q.a), [q.a]);
  const scoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "ask") return;
    const end = Date.now() + seconds * 1000;
    setLeft(seconds * 1000);
    const t = setInterval(() => {
      const l = Math.max(0, end - Date.now());
      setLeft(l);
      if (l === 0) setPhase("score");
    }, 200);
    return () => clearInterval(t);
  }, [i, phase, seconds]);

  useEffect(() => {
    if (phase === "score") setTimeout(() => scoreRef.current?.querySelector<HTMLElement>(".iv-point")?.focus({ preventScroll: true }), 60);
  }, [phase]);

  const next = useCallback(() => {
    const a: Answer = { id: q.id, covered: points.length ? ticked.size / points.length : 0, points: points.length, ticks: ticked.size };
    const all = [...answers, a];
    if (i + 1 >= ids.length) onFinish(all);
    else {
      setAnswers(all);
      setTicked(new Set());
      setPhase("ask");
      setI(i + 1);
    }
  }, [q.id, points.length, ticked, answers, i, ids.length, onFinish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || ownsSpace(e.target)) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (phase === "ask") setPhase("score");
        else next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, next]);

  const share = left / (seconds * 1000);
  const secs = Math.ceil(left / 1000);
  return (
    <div className="iv-stage stack" style={{ gap: 14 }}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <div className="segments" style={{ flex: 1 }} aria-label={`Question ${i + 1} of ${ids.length}`}>
          {ids.map((id, k) => (
            <i key={id} className={k < i ? "done" : k === i ? "on" : ""} />
          ))}
        </div>
        <button type="button" className="icon-btn" aria-label="Quit mock interview" onClick={onQuit}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div key={i} className="iv-slide">
        <section className="iv-face" style={{ minHeight: 0 }}>
          <div className="iv-mock-meta">
            <span>
              <span className={`pill ${q.level}`}>{q.level}</span> {i + 1}/{ids.length}
            </span>
            {phase === "ask" && (
              <span aria-live="off">
                <Icon name="clock" size={13} /> <b>{secs}</b>s
              </span>
            )}
          </div>
          {phase === "ask" && (
            <div className={`iv-countdown ${share < 0.15 ? "out" : share < 0.33 ? "low" : ""}`} role="timer" aria-label={`${secs} seconds left`}>
              <i style={{ width: `${share * 100}%` }} />
            </div>
          )}
          <h2 className="iv-q">{q.q}</h2>
          {phase === "ask" ? (
            <div className="row" style={{ justifyContent: "flex-end", marginTop: "auto" }}>
              <button type="button" className="btn primary big" onClick={() => setPhase("score")}>
                <Icon name="check" size={16} /> I&apos;m done <kbd>Space</kbd>
              </button>
            </div>
          ) : (
            <div ref={scoreRef} className="stack" style={{ gap: 14 }}>
              {left === 0 && (
                <span className="pill" style={{ alignSelf: "flex-start", color: "var(--hot)" }}>
                  <Icon name="clock" size={12} /> Time
                </span>
              )}
              <KeyPoints
                points={points}
                ticked={ticked}
                onToggle={(k) =>
                  setTicked((s) => {
                    const n = new Set(s);
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    return n;
                  })
                }
              />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn primary" onClick={next}>
                  {i + 1 >= ids.length ? "Finish" : "Next"} <Icon name="arrow-right" size={15} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ results */

function Results({ answers, byId, modules, onPractise, onAgain }: { answers: Answer[]; byId: Map<string, HubQuestion>; modules: HubModule[]; onPractise: (ids: string[], label: string) => void; onAgain: () => void }) {
  const overall = answers.length ? answers.reduce((a, x) => a + x.covered, 0) / answers.length : 0;
  const shown = useCountUp(overall * 100, 1200);
  const mounted = useMounted();
  const topics = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const a of answers) {
      const q = byId.get(a.id)!;
      const t = m.get(q.module) ?? { sum: 0, n: 0 };
      m.set(q.module, { sum: t.sum + a.covered, n: t.n + 1 });
    }
    return [...m].map(([slug, t]) => ({ slug, title: modules.find((x) => x.slug === slug)?.title ?? slug, score: t.sum / t.n, n: t.n })).sort((a, b) => a.score - b.score);
  }, [answers, byId, modules]);
  const weak = answers.filter((a) => a.covered < 0.6).sort((a, b) => a.covered - b.covered);
  const size = 180;
  const r = 78;
  const c = 2 * Math.PI * r;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card iv-result">
        <div className="iv-bigring" role="img" aria-label={`Overall score ${Math.round(overall * 100)} percent`}>
          <svg width={size} height={size} aria-hidden>
            <defs>
              <linearGradient id="iv-grad" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" />
                <stop offset="1" stopColor="#5eead4" />
              </linearGradient>
            </defs>
            <circle className="trk" cx={size / 2} cy={size / 2} r={r} />
            <circle className="fil" cx={size / 2} cy={size / 2} r={r} strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
          </svg>
          <b aria-hidden>
            {Math.round(shown)}
            <small>%</small>
          </b>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <h4 style={{ margin: 0 }}>By module</h4>
          <div className="iv-bars">
            {topics.map((t) => (
              <div key={t.slug} className="iv-bar">
                <span title={t.title}>{t.title}</span>
                <span className="track" role="img" aria-label={`${t.title}: ${pct(t.score)}`}>
                  <i className={t.score < 0.4 ? "low" : t.score < 0.7 ? "mid" : ""} style={{ width: mounted ? `${Math.max(3, t.score * 100)}%` : 0 }} />
                </span>
                <b>{pct(t.score)}</b>
              </div>
            ))}
          </div>
        </div>
      </section>

      {weak.length > 0 && (
        <section className="card">
          <div className="section-title" style={{ marginTop: 0 }}>
            <h2>
              <Icon name="target" size={16} className="warm" /> Weak spots
            </h2>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => {
                const ids = weak.map((w) => w.id);
                queueInterview(ids);
                onPractise(ids, "Weak spots");
              }}
            >
              <Icon name="repeat" size={14} /> Practise these again
            </button>
          </div>
          <div className="iv-weak">
            {weak.map((w, k) => {
              const q = byId.get(w.id)!;
              return (
                <div key={w.id} style={{ animationDelay: `${k * 70}ms` }}>
                  <b className="pct">{pct(w.covered)}</b>
                  <p>{q.q}</p>
                  <Link className="chip-btn" href={lessonHref(q)} aria-label={`Open lesson for: ${q.q}`}>
                    <Icon name="book" size={13} /> Lesson
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="row" style={{ justifyContent: "center" }}>
        <button type="button" className="btn" onClick={onAgain}>
          <Icon name="refresh" size={15} /> New mock
        </button>
      </div>
    </div>
  );
}
