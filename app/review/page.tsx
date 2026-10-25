"use client";
// Spaced review: quick checks you missed come back after 1, 3, 7, 14 and 30 days until they stick.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { QuizCard } from "@/components/lesson/Quiz";
import Icon from "@/components/ui/Icon";
import { answerReview, dueReviews, INTERVALS, type ReviewItem, useProgress } from "@/lib/progress";

export default function ReviewPage() {
  const p = useProgress();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // freeze the session's queue so answered items don't reshuffle under the learner
  const [session, setSession] = useState<ReviewItem[] | null>(null);
  const [i, setI] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const due = useMemo(() => (mounted ? dueReviews(p) : []), [mounted, p]);
  const all = mounted ? Object.values(p.reviews).sort((a, b) => a.due - b.due) : [];

  const start = () => {
    setSession(due);
    setI(0);
    setAnswered(null);
  };

  if (session && i < session.length) {
    const item = session[i];
    return (
      <div className="stack" style={{ maxWidth: 820 }}>
        <div className="topic-progress">
          <div className="row">
            <span>Review session</span>
            <span className="mono muted">{i + 1} / {session.length}</span>
          </div>
          <div className="segments">{session.map((s, k) => <i key={s.id} className={k < i ? "done" : k === i ? "on" : ""} />)}</div>
        </div>
        <section className="card">
          <Link href={`/learn/${item.topic}`} className="eyebrow">{item.topicTitle}</Link>
          <QuizCard
            quiz={item.quiz}
            label={`Review · box ${item.box + 1} of ${INTERVALS.length}`}
            resetKey={item.id}
            onAnswer={(ok) => {
              setAnswered(ok);
              answerReview(item.id, ok);
            }}
          />
          {answered !== null && (
            <div className="row" style={{ justifyContent: "space-between", marginTop: 18 }}>
              <span className="muted">
                {answered
                  ? item.box + 1 >= INTERVALS.length
                    ? "Retired: you have it."
                    : `Next review in ${INTERVALS[item.box + 1]} days.`
                  : "Back tomorrow. Re-read the topic if it still feels shaky."}
              </span>
              <button type="button" className="btn" onClick={() => { setI(i + 1); setAnswered(null); }}>
                {i + 1 < session.length ? "Next" : "Finish"} <Icon name="arrow-right" size={16} />
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="grid-main">
      <div className="stack">
        <header className="card">
          <span className="eyebrow"><Icon name="repeat" size={14} /> Review</span>
          <h1 style={{ marginTop: 8 }}>{session ? "Session complete" : due.length ? `${due.length} due today` : "Nothing due right now"}</h1>
          <p className="lead">
            Every quick check you miss in a lesson joins this queue. Get it right and it comes back later: after {INTERVALS.join(", ")} days. Miss it and it starts
            again tomorrow. Remembering at the moment you are about to forget is what makes knowledge stick.
          </p>
          <div className="row" style={{ marginTop: 22 }}>
            {due.length > 0 && <button type="button" className="btn" onClick={start}>Start review ({due.length})</button>}
            <Link href="/curriculum" className="btn ghost">Keep learning</Link>
          </div>
        </header>
        <section className="card">
          <h2 style={{ marginBottom: 10 }}>Your queue</h2>
          {all.length === 0 && <div className="empty">Empty. Miss a quick check in any topic and it will appear here.</div>}
          <div className="list-rows">
            {all.map((r) => (
              <div key={r.id}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontWeight: 500, display: "block" }}>{r.quiz.q.length > 110 ? `${r.quiz.q.slice(0, 110)}…` : r.quiz.q}</b>
                  <Link href={`/learn/${r.topic}`} className="muted small">{r.topicTitle}</Link>
                </span>
                <span className="pill">{r.due <= Date.now() ? "due" : `in ${Math.ceil((r.due - Date.now()) / 86_400_000)} d`}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <aside className="side">
        <section className="card">
          <h3>Boxes</h3>
          <p className="muted small">Each correct answer moves a check one box to the right.</p>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${INTERVALS.length}, 1fr)`, gap: 8, marginTop: 14 }}>
            {INTERVALS.map((d, k) => (
              <div key={d} className="metric" style={{ textAlign: "center" }}>
                <span>{d}d</span>
                <b>{all.filter((r) => r.box === k).length}</b>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
