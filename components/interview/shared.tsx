"use client";
// Shared types, hooks and small pieces for the interview hub.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Level } from "@/lib/interview";
import type { Progress } from "@/lib/progress";
import MiniMarkdown from "../MiniMarkdown";
import Icon from "../ui/Icon";

export type HubQuestion = {
  id: string;
  level: Level;
  q: string;
  a: string;
  module: string;
  section: string;
  sectionTitle: string;
  lesson?: string;
};
export type HubModule = { slug: string; title: string; order: number };
export type HubOutline = { slug: string; title: string; lessons: { slug: string; title: string; minutes: number }[] }[];
/** A custom set of questions for Practice (from a plan day, a mock interview or a deep link). */
export type PracticeQueue = { ids: string[]; label: string; nonce: number };

export const lessonHref = (q: Pick<HubQuestion, "module" | "lesson">) => (q.lesson ? `/learn/${q.module}/${q.lesson}` : `/learn/${q.module}`);

/** Known = marked "I know this", or last practised well. */
export const isKnown = (p: Progress, id: string) => !!p.known[id] || (p.iv?.[id]?.lastScore ?? 0) >= 0.75;

/* ---------- motion ---------- */
const RM = "(prefers-reduced-motion: reduce)";
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(RM);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

/** Animate a number from its previous value to `target` (ease-out). Reduced motion jumps straight to the value. */
export function useCountUp(target: number, ms = 900): number {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) {
      from.current = target;
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const val = a + (target - a) * (1 - Math.pow(1 - k, 3));
      setV(val);
      from.current = val;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);
  return v;
}

/** True one frame after mount: lets CSS transitions run from their zero state. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(r);
  }, []);
  return m;
}

/* ---------- pieces ---------- */
export function ProgressRing({ value, size = 44, stroke = 4, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mounted = useMounted();
  const v = Math.max(0, Math.min(1, value));
  return (
    <span className="iv-pring" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v * 100)}%`}>
      <svg width={size} height={size} aria-hidden>
        <circle className="trk" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="fil" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={mounted ? c * (1 - v) : c} />
      </svg>
      <b aria-hidden>{Math.round(v * 100)}</b>
    </span>
  );
}

/** Small segmented single choice. */
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="iv-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "Which did you cover?" checklist with a filling score bar. */
export function KeyPoints({ points, ticked, onToggle }: { points: string[]; ticked: Set<number>; onToggle: (i: number) => void }) {
  const share = points.length ? ticked.size / points.length : 0;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="iv-points-head">
        <h4>Which did you cover?</h4>
        <div className="iv-score" aria-live="polite">
          <span className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={points.length} aria-valuenow={ticked.size} aria-label="Points covered">
            <span style={{ width: `${share * 100}%` }} />
          </span>
          <span>
            {ticked.size}/{points.length}
          </span>
        </div>
      </div>
      <div className="iv-points" role="group" aria-label="Key points">
        {points.map((pt, i) => (
          <div
            key={i}
            className="iv-point"
            role="checkbox"
            aria-checked={ticked.has(i)}
            tabIndex={0}
            style={{ animationDelay: `${i * 55}ms` }}
            onClick={() => onToggle(i)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                onToggle(i);
              }
            }}
          >
            <span className="box" aria-hidden>
              <Icon name="check" size={14} />
            </span>
            <MiniMarkdown>{pt}</MiniMarkdown>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ignore global shortcuts while typing or when a control owns the key. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}
export function ownsSpace(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return isTypingTarget(t) || el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "checkbox" || el.getAttribute("role") === "tab";
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
