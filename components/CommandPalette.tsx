"use client";
// Ctrl/Cmd K search over modules, lessons, topics, sections, simulations, labs, interview questions and glossary terms.
// The index is generated at build time (/search-index.json) and fetched the first time the palette opens.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { asset } from "@/lib/brand";
import Icon from "./ui/Icon";

export type SearchItem = { kind: string; title: string; context: string; href: string };

let cached: SearchItem[] | null = null;

function score(item: SearchItem, terms: string[]): number {
  const t = item.title.toLowerCase();
  const c = item.context.toLowerCase();
  let s = 0;
  for (const term of terms) {
    if (t.startsWith(term)) s += 6;
    else if (t.includes(` ${term}`)) s += 4;
    else if (t.includes(term)) s += 3;
    else if (c.includes(term)) s += 1;
    else return 0;
  }
  const kindBoost: Record<string, number> = { Module: 3, Lesson: 2.5, Simulation: 2, Lab: 2, Topic: 1.5, Term: 1.2, Section: 0.5, Question: 0 };
  return s + (kindBoost[item.kind] ?? 0);
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<SearchItem[]>(cached ?? []);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
    if (cached) return;
    fetch(asset("/search-index.json"))
      .then((r) => r.json())
      .then((d: SearchItem[]) => {
        cached = d;
        setItems(d);
      })
      .catch(() => setItems([]));
  }, []);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return items.filter((i) => i.kind === "Module" || i.kind === "Simulation" || i.kind === "Lab").slice(0, 30);
    return items
      .map((i) => ({ i, s: score(i, terms) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.i);
  }, [items, q]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector(".palette-item.on")?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const go = (r: SearchItem | undefined) => {
    if (!r) return;
    onClose();
    router.push(r.href);
  };

  return (
    <div className="palette-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input">
          <Icon name="search" size={20} />
          <input
            ref={input}
            value={q}
            placeholder="Search lessons, topics, sims, labs, interview questions, terms…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(results.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "Enter") go(results[sel]);
            }}
            aria-label="Search"
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="palette-results" ref={list} role="listbox">
          {results.length === 0 && <div className="empty">{items.length ? "No matches." : "Loading the index…"}</div>}
          {results.map((r, i) => (
            <div
              key={`${r.href}-${i}`}
              role="option"
              aria-selected={i === sel}
              className={`palette-item ${i === sel ? "on" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(r)}
            >
              <span className="kind">{r.kind}</span>
              <span>
                <b>{r.title}</b>
                <small>{r.context}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span><kbd className="kbd">↑↓</kbd> move</span>
          <span><kbd className="kbd">Enter</kbd> open</span>
          <span><kbd className="kbd">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
