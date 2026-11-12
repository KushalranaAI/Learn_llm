"use client";
// Small progress-aware pieces dropped into server-rendered pages.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { creditLessons, setDone, useProgress, visitTopic } from "@/lib/progress";
import Icon from "./ui/Icon";

export function useMounted() {
  const p = useProgress();
  return p;
}

/** "3 of 8 topics" bar for a lesson. */
export function LessonBar({ ids, minutes }: { ids: string[]; minutes?: number }) {
  const p = useProgress();
  const d = ids.filter((id) => p.done[id]).length;
  return (
    <div>
      <div className="bar green"><i style={{ width: `${(d / Math.max(1, ids.length)) * 100}%` }} /></div>
      <p className="mono muted small" style={{ margin: "8px 0 0" }}>
        {d} of {ids.length} topics{minutes ? ` · ${minutes} min` : ""}
      </p>
    </div>
  );
}

export function DoneTick({ id }: { id: string }) {
  const p = useProgress();
  return p.done[id] ? <Icon name="circle-check" size={18} label="finished" className="accent-text" /> : <Icon name="circle" size={18} className="muted" />;
}

/** The segmented bar at the top of a topic: one segment per topic, linked. */
export function TopicSegments({ base, topics, current }: { base: string; topics: { slug: string; title: string }[]; current: number }) {
  const p = useProgress();
  return (
    <div className="segments">
      {topics.map((t, i) => (
        <Link
          key={t.slug}
          href={`/learn/${base}/${t.slug}`}
          className={i === current ? "on" : p.done[`${base}/${t.slug}`] ? "done" : ""}
          aria-label={`Topic ${i + 1}: ${t.title}`}
          title={t.title}
        />
      ))}
    </div>
  );
}

export function TocList({ base, topics, current }: { base: string; topics: { slug: string; title: string }[]; current: number }) {
  const p = useProgress();
  return (
    <ol>
      {topics.map((t, i) => (
        <li key={t.slug}>
          <Link href={`/learn/${base}/${t.slug}`} className={i === current ? "on" : ""} aria-current={i === current ? "page" : undefined}>
            <span className="n">{i + 1}</span>
            <span>{t.title}</span>
            {p.done[`${base}/${t.slug}`] ? <Icon name="check" size={15} label="finished" /> : <span />}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * Records the visit, and offers "Mark as finished" + next topic. ← and → step between topics.
 * `credits`: in practice lessons, finishing a topic counts as review of the theory lessons it builds on.
 */
export function TopicFooter({ id, next, nextLabel, prev, credits = [] }: { id: string; next: string | null; nextLabel: string; prev?: string | null; credits?: string[] }) {
  const p = useProgress();
  const router = useRouter();
  useEffect(() => visitTopic(id), [id]);
  const done = !!p.done[id];
  const finish = () => {
    if (done) return;
    setDone(id, true);
    creditLessons(credits);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest("[role=slider]"))) return;
      if (e.key === "ArrowRight" && next) router.push(next);
      if (e.key === "ArrowLeft" && prev) router.push(prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, router]);
  return (
    <div className="topic-end">
      <button type="button" className="btn" onClick={() => (done ? setDone(id, false) : finish())}>
        <Icon name={done ? "circle-check" : "circle"} size={18} /> {done ? "Finished" : "Mark as finished"}
      </button>
      <span className="kbd-hint muted small" aria-hidden="true"><kbd>←</kbd> <kbd>→</kbd> to step</span>
      {next && (
        <Link href={next} className="btn primary" onClick={finish}>
          {nextLabel} <Icon name="arrow-right" size={16} />
        </Link>
      )}
    </div>
  );
}
