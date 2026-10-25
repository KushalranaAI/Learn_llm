"use client";
// Small progress-aware pieces dropped into server-rendered pages.
import Link from "next/link";
import { useEffect } from "react";
import { setDone, useProgress, visitTopic } from "@/lib/progress";
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

/** Records the visit, and offers "Mark as finished" + next topic. */
export function TopicFooter({ id, next, nextLabel }: { id: string; next: string | null; nextLabel: string }) {
  const p = useProgress();
  useEffect(() => visitTopic(id), [id]);
  const done = !!p.done[id];
  return (
    <div className="topic-end">
      <button type="button" className={`btn ${done ? "ghost" : "ghost"}`} onClick={() => setDone(id, !done)}>
        <Icon name={done ? "circle-check" : "circle"} size={18} /> {done ? "Finished" : "Mark as finished"}
      </button>
      {next && (
        <Link href={next} className="btn" onClick={() => !done && setDone(id, true)}>
          {nextLabel} <Icon name="arrow-right" size={16} />
        </Link>
      )}
    </div>
  );
}
