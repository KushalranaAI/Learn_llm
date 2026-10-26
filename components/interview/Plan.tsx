"use client";
// Plan: "when is your interview?" -> a day-by-day timeline of lessons to revise and question sets, saved in this browser.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, buildPlan, daysBetween, type InterviewPlan, type Level, localDay, type PlanItem, planItemCount } from "@/lib/interview";
import { savePlan, togglePlanItem, useProgress } from "@/lib/progress";
import Icon from "../ui/Icon";
import { type HubOutline, type HubQuestion, ProgressRing, Seg } from "./shared";

const QUICK_DAYS = [3, 7, 14, 30];
const MINUTES = [20, 30, 45, 60, 90];

const fmt = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

export default function Plan({ questions, outline, onStartSet, onMock }: { questions: HubQuestion[]; outline: HubOutline; onStartSet: (ids: string[], label: string) => void; onMock: () => void }) {
  const p = useProgress();
  const plan = p.plan ?? null;
  const [editing, setEditing] = useState(false);
  if (!plan || editing) return <PlanForm questions={questions} outline={outline} initial={plan} onDone={() => setEditing(false)} onCancel={plan ? () => setEditing(false) : undefined} />;
  return <PlanView plan={plan} onEdit={() => setEditing(true)} onStartSet={onStartSet} onMock={onMock} />;
}

function PlanForm({ questions, outline, initial, onDone, onCancel }: { questions: HubQuestion[]; outline: HubOutline; initial: InterviewPlan | null; onDone: () => void; onCancel?: () => void }) {
  const [today, setToday] = useState("");
  const [date, setDate] = useState(initial?.interview ?? "");
  const [level, setLevel] = useState<Level>(initial?.level ?? "mid");
  const [minutes, setMinutes] = useState(initial?.minutes ?? 45);
  useEffect(() => {
    const t = localDay();
    setToday(t);
    setDate((d) => (d && d > t ? d : addDays(t, 14)));
  }, []);
  const days = today && date ? daysBetween(today, date) : 0;

  const build = () => {
    const lessons = outline.flatMap((m) => m.lessons.map((l) => ({ module: m.slug, lesson: l.slug, title: l.title })));
    const qs = questions.map((q) => ({ id: q.id, level: q.level, module: q.module, lesson: q.lesson ?? q.section }));
    savePlan(buildPlan({ start: today, days, level, minutes, lessons, questions: qs }));
    onDone();
  };

  return (
    <div className="card iv-setup">
      <div className="iv-field">
        <span>
          <Icon name="clock" size={13} /> When is your interview?
        </span>
        <div className="row">
          <input type="date" className="field" style={{ width: "auto" }} aria-label="Interview date" min={today ? addDays(today, 1) : undefined} max={today ? addDays(today, 90) : undefined} value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="filters" role="group" aria-label="Days from now">
            {QUICK_DAYS.map((d) => (
              <button key={d} type="button" className={`filter ${days === d ? "on" : ""}`} aria-pressed={days === d} onClick={() => setDate(addDays(today, d))}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="iv-field">
        <span>
          <Icon name="user" size={13} /> Level
        </span>
        <Seg label="Target level" value={level} onChange={setLevel} options={[{ v: "junior", label: "Junior" }, { v: "mid", label: "Mid" }, { v: "senior", label: "Senior" }]} />
      </div>
      <div className="iv-field">
        <span>
          <Icon name="zap" size={13} /> Minutes a day
        </span>
        <Seg label="Minutes a day" value={minutes} onChange={setMinutes} options={MINUTES.map((m) => ({ v: m, label: String(m) }))} />
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="muted small">{days > 0 ? `${days} day${days === 1 ? "" : "s"}` : "Pick a future date"}</span>
        <div className="row">
          {onCancel && (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="btn primary big" disabled={days < 1 || days > 90} onClick={build}>
            <Icon name="sparkles" size={16} /> Build plan
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanView({ plan, onEdit, onStartSet, onMock }: { plan: InterviewPlan; onEdit: () => void; onStartSet: (ids: string[], label: string) => void; onMock: () => void }) {
  const [today, setToday] = useState("");
  useEffect(() => setToday(localDay()), []);
  const total = planItemCount(plan);
  const ticked = Object.keys(plan.checked).length;
  const todayIdx = plan.days.findIndex((d) => d.date === today);
  const left = today ? daysBetween(today, plan.interview) : null;
  const todayRef = useRef<HTMLElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (todayIdx > 1 && !scrolled.current && todayRef.current) {
      scrolled.current = true;
      todayRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [todayIdx]);

  const setIds = (items: PlanItem[]) => [...new Set(items.flatMap((i) => (i.kind === "set" ? i.ids : [])))];
  const todayIds = todayIdx >= 0 ? setIds(plan.days[todayIdx].items) : [];
  const levelLabel = useMemo(() => plan.level[0].toUpperCase() + plan.level.slice(1), [plan.level]);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card iv-plan-top">
        <div className="iv-dday" aria-label={left === null ? "" : `${left} days to the interview`}>
          <b>{left === null ? "–" : left > 0 ? `D-${left}` : left === 0 ? "Today" : "Done"}</b>
          <small>{fmt(plan.interview)}</small>
        </div>
        <div className="stack" style={{ gap: 8, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className={`pill ${plan.level}`}>{levelLabel}</span>
            <span className="pill">
              <Icon name="clock" size={11} /> {plan.minutes} min/day
            </span>
            <span className="muted small">
              {ticked}/{total}
            </span>
          </div>
          <span className="meter" role="progressbar" aria-label="Plan progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={ticked}>
            <span style={{ width: `${(ticked / Math.max(1, total)) * 100}%` }} />
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn primary" disabled={!todayIds.length} onClick={() => onStartSet(todayIds, "Today's set")}>
            <Icon name="play" size={15} /> Start today&apos;s set
          </button>
          <button type="button" className="icon-btn" aria-label="Edit plan" title="Edit plan" onClick={onEdit}>
            <Icon name="pen" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete plan"
            title="Delete plan"
            onClick={() => {
              if (confirm("Delete this plan?")) savePlan(null);
            }}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </section>

      <ol className="iv-timeline" style={{ listStyle: "none", margin: 0 }}>
        {plan.days.map((d, di) => {
          const keys = d.items.map((_, ii) => `${di}:${ii}`);
          const complete = keys.every((k) => plan.checked[k]);
          const isToday = d.date === today;
          const past = today !== "" && d.date < today;
          const ids = setIds(d.items);
          return (
            <li
              key={d.date}
              ref={isToday ? (todayRef as React.RefObject<HTMLLIElement>) : undefined}
              className={`iv-day ${isToday ? "today" : ""} ${complete ? "complete" : ""} ${past ? "past" : ""}`}
              style={{ animationDelay: `${Math.min(di, 12) * 40}ms` }}
              aria-current={isToday ? "date" : undefined}
            >
              <header>
                <b>{fmt(d.date)}</b>
                {isToday && <span className="pill accent">Today</span>}
                <span className="muted small">Day {di + 1}</span>
                <span className="spacer" />
                {complete ? (
                  <Icon name="circle-check" size={18} className="good" label="Day complete" />
                ) : (
                  <ProgressRing size={26} stroke={3} value={keys.filter((k) => plan.checked[k]).length / keys.length} label={`${keys.filter((k) => plan.checked[k]).length} of ${keys.length} done`} />
                )}
              </header>
              <ul>
                {d.items.map((it, ii) => {
                  const k = `${di}:${ii}`;
                  const on = !!plan.checked[k];
                  const id = `iv-plan-${k}`;
                  return (
                    <li key={k} className={`iv-item ${on ? "checked" : ""}`}>
                      <input id={id} type="checkbox" checked={on} onChange={(e) => togglePlanItem(k, e.target.checked)} aria-label={`Done: ${it.title}`} />
                      <span className="kind" aria-hidden>
                        <Icon name={it.kind === "lesson" ? "book" : it.kind === "set" ? "chats" : "target"} size={15} />
                      </span>
                      {it.kind === "lesson" ? (
                        <Link className="lbl" href={`/learn/${it.module}/${it.lesson}`}>
                          {it.title}
                        </Link>
                      ) : (
                        <label className="lbl" htmlFor={id}>
                          {it.title}
                          {it.kind === "set" && <span className="muted"> · {it.ids.length}</span>}
                        </label>
                      )}
                      {it.kind === "set" && (
                        <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label={`Practise ${it.title}, ${fmt(d.date)}`} onClick={() => onStartSet(it.ids, `${fmt(d.date)}`)}>
                          <Icon name="play" size={14} />
                        </button>
                      )}
                      {it.kind === "mock" && (
                        <button type="button" className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Open mock interview" onClick={onMock}>
                          <Icon name="play" size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {ids.length > 0 && isToday && (
                <span className="sr-only">
                  {ids.length} questions today
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
