"use client";
// Spaced review. Every quick check you answer joins the deck; it comes back just as you are about to forget it.
// A session is capped (DAILY_CAP) so a week away never turns into a wall, confident mistakes come first, and
// neighbouring items come from different lessons where possible (mixing related ideas sharpens the differences).
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { QuizCard } from "@/components/lesson/Quiz";
import Icon from "@/components/ui/Icon";
import { answerReview, DAILY_CAP, dueReviews, INTERVALS, isMastered, MASTERY_WINS, type ReviewItem, reviewSession, useProgress } from "@/lib/progress";

const days = (n: number) => (n < 1 ? "later today" : `in ${Math.round(n)} day${Math.round(n) === 1 ? "" : "s"}`);

export default function ReviewPage() {
  const p = useProgress();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // freeze the session's queue so answered items don't reshuffle under the learner
  const [session, setSession] = useState<ReviewItem[] | null>(null);
  const [i, setI] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [right, setRight] = useState(0);
  const due = useMemo(() => (mounted ? dueReviews(p) : []), [mounted, p]);
  const items = mounted ? Object.values(p.reviews) : [];
  const active = items.filter((r) => !r.retired).sort((a, b) => a.due - b.due);
  const mastered = items.filter(isMastered).length;
  const confErrs = due.filter((r) => r.confErr).length;

  const start = () => {
    setSession(reviewSession(p));
    setI(0);
    setRight(0);
    setAnswered(null);
  };

  if (session && i < session.length) {
    const item = session[i];
    const live = p.reviews[item.id] ?? item;
    return (
      <div className="page narrow stack">
        <div className="card tight">
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
            label={item.confErr ? "Review · you were sure and missed this" : `Review · step ${item.box + 1} of ${INTERVALS.length}`}
            icon="repeat"
            resetKey={item.id}
            onAnswer={(ok, conf) => {
              setAnswered(ok);
              if (ok) setRight((n) => n + 1);
              answerReview(item.id, ok, conf);
            }}
          />
          {answered !== null && (
            <div className="row" style={{ justifyContent: "space-between", marginTop: 18 }}>
              <span className="muted">
                {live.retired ? "Retired: you have it for good." : answered ? `Next time: ${days((live.due - Date.now()) / 86_400_000)}.` : "It comes back soon. Re-read the topic if it still feels shaky."}
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
    <div className="page">
      <div className="grid-main">
        <div className="stack">
          <header className="card">
            <span className="eyebrow"><Icon name="repeat" size={14} /> Review</span>
            <h1 style={{ marginTop: 8 }}>
              {session ? `Session done: ${right} of ${session.length} right` : due.length ? `${Math.min(due.length, DAILY_CAP)} to review today` : "Nothing due right now"}
            </h1>
            <p className="lead">
              Every quick check you answer joins your deck. Each one comes back after {INTERVALS.slice(0, 4).join(", ")} days and longer, just as you are
              about to forget it, because pulling an idea back out of memory is what makes it last. Re-reading feels easier but does much less.
            </p>
            {due.length > DAILY_CAP && <p className="muted small">{due.length} are due; a session takes the {DAILY_CAP} most urgent so a break never becomes a wall. The rest wait for tomorrow.</p>}
            {confErrs > 0 && <p className="muted small"><Icon name="alert" size={13} /> {confErrs} you were sure about but missed come first.</p>}
            <div className="row" style={{ marginTop: 22 }}>
              {due.length > 0 && <button type="button" className="btn primary" onClick={start}>Start review <Icon name="arrow-right" size={16} /></button>}
              <Link href="/curriculum" className="btn ghost">Keep learning</Link>
            </div>
          </header>
          <section className="card">
            <h2 style={{ marginBottom: 10 }}>Your deck</h2>
            {active.length === 0 && <div className="empty">Empty. Answer a quick check in any topic and it will appear here.</div>}
            <div className="list-rows">
              {active.slice(0, 60).map((r) => (
                <div key={r.id}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontWeight: 500, display: "block" }}>{r.quiz.q.length > 110 ? `${r.quiz.q.slice(0, 110)}…` : r.quiz.q}</b>
                    <Link href={`/learn/${r.topic}`} className="muted small">{r.topicTitle}</Link>
                  </span>
                  <span className="pill">{r.due <= Date.now() ? "due" : days((r.due - Date.now()) / 86_400_000)}</span>
                </div>
              ))}
            </div>
            {active.length > 60 && <p className="muted small" style={{ marginTop: 10 }}>and {active.length - 60} more.</p>}
          </section>
        </div>
        <aside className="side">
          <section className="card">
            <h3>Your deck</h3>
            <div className="stat-row" style={{ margin: "14px 0 6px" }}>
              <div><b>{active.length}</b><span>Scheduled</span></div>
              <div><b>{due.length}</b><span>Due</span></div>
              <div><b>{mastered}</b><span>Mastered</span></div>
            </div>
            <p className="muted small">
              A check counts as mastered after you get it right in {MASTERY_WINS} later sessions on different days. A lesson is mastered when most of its checks are.
            </p>
          </section>
          <section className="card">
            <h3>Steps</h3>
            <p className="muted small">Each right answer moves a check one step to the right; a miss sends it back to the start.</p>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${INTERVALS.length}, 1fr)`, gap: 6, marginTop: 14 }}>
              {INTERVALS.map((d, k) => (
                <div key={d} className="metric" style={{ textAlign: "center" }}>
                  <span>{d}d</span>
                  <b>{active.filter((r) => r.box === k).length}</b>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
