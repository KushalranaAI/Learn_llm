"use client";
// Soft prerequisites: "this builds on X, which you haven't finished". Never a lock: open it, or say you already
// know it (which also counts it as finished on the roadmap, and can be undone there).
import Link from "next/link";
import { useEffect, useState } from "react";
import { setSkipped, useProgress } from "@/lib/progress";
import Icon from "./ui/Icon";

export type Prereq = { id: string; title: string; moduleTitle: string; topics: string[] };

export default function BuildsOn({ reqs, compact = false }: { reqs: Prereq[]; compact?: boolean }) {
  const p = useProgress();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !reqs.length) return null;
  const missing = reqs.filter((r) => !p.skipped?.[r.id] && !(r.topics.length && r.topics.every((t) => p.done[`${r.id}/${t}`])));
  if (!missing.length) {
    if (compact) return null;
    return (
      <p className="builds-on ok">
        <Icon name="circle-check" size={15} /> Builds on {reqs.map((r, i) => <span key={r.id}>{i ? ", " : ""}<Link href={`/learn/${r.id}`}>{r.title}</Link></span>)}: all finished.
      </p>
    );
  }
  return (
    <div className="builds-on">
      <Icon name="route" size={16} />
      <div>
        <b>This builds on {missing.length === 1 ? "a lesson" : `${missing.length} lessons`} you haven't finished.</b>
        <ul>
          {missing.map((r) => (
            <li key={r.id}>
              <Link href={`/learn/${r.id}`}>{r.title}</Link> <span className="muted small">({r.moduleTitle})</span>
              <button type="button" className="chip-btn" onClick={() => setSkipped(r.id, true)}>I know this</button>
            </li>
          ))}
        </ul>
        {!compact && <p className="muted small">You can go ahead anyway; nothing is locked.</p>}
      </div>
    </div>
  );
}
