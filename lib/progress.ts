"use client";
// Everything the learner has done, kept in their own browser: finished topics, daily activity, quick-check results,
// the spaced-review queue, interview answers they know, labs passed. Export/import makes it portable.
import { jsonStore, useStore } from "./localstore";

export type QuizData = { q: string; options: string[]; answer: number; explain?: string };

export type ReviewItem = {
  id: string;
  /** module/lesson/topic */
  topic: string;
  topicTitle: string;
  quiz: QuizData;
  /** index into INTERVALS */
  box: number;
  due: number;
  misses: number;
};

/** Days until the next review after each successful recall; past the last one the item is retired. */
export const INTERVALS = [1, 3, 7, 14, 30];
const DAY = 86_400_000;

export type Progress = {
  done: Record<string, number>; // topic id -> finished at (ms)
  visited: Record<string, number>; // topic id -> last opened (ms)
  last: string | null; // last topic opened
  days: Record<string, number>; // yyyy-mm-dd -> actions that day
  checks: Record<string, { ok: boolean; at: number }>; // quiz id -> first answer
  reviews: Record<string, ReviewItem>;
  known: Record<string, number>; // interview question id -> marked known at
  labs: Record<string, { step: number; passed?: number }>;
  simsTried: Record<string, number>;
};

const EMPTY: Progress = { done: {}, visited: {}, last: null, days: {}, checks: {}, reviews: {}, known: {}, labs: {}, simsTried: {} };

export const progressStore = jsonStore<Progress>("llm100-progress", EMPTY);
export const useProgress = () => useStore(progressStore);

const today = () => new Date().toISOString().slice(0, 10);
const bump = (p: Progress): Progress => ({ ...p, days: { ...p.days, [today()]: (p.days[today()] ?? 0) + 1 } });

export function visitTopic(id: string) {
  progressStore.set((p) => ({ ...p, last: id, visited: { ...p.visited, [id]: Date.now() } }));
}

export function setDone(id: string, done: boolean) {
  progressStore.set((p) => {
    const next = { ...p.done };
    if (done) next[id] = Date.now();
    else delete next[id];
    return done ? bump({ ...p, done: next }) : { ...p, done: next };
  });
}

/** First answer to a quick check. A miss puts it in the review queue for tomorrow. */
export function recordCheck(id: string, ok: boolean, item: Omit<ReviewItem, "box" | "due" | "misses">) {
  progressStore.set((p) => {
    if (p.checks[id]) return p;
    const reviews = { ...p.reviews };
    if (!ok) reviews[id] = { ...item, box: 0, due: Date.now() + INTERVALS[0] * DAY, misses: 1 };
    return bump({ ...p, checks: { ...p.checks, [id]: { ok, at: Date.now() } }, reviews });
  });
}

/** Answer during review: right moves it to a longer interval (retired after the last), wrong starts it again. */
export function answerReview(id: string, ok: boolean) {
  progressStore.set((p) => {
    const it = p.reviews[id];
    if (!it) return p;
    const reviews = { ...p.reviews };
    if (ok) {
      const box = it.box + 1;
      if (box >= INTERVALS.length) delete reviews[id];
      else reviews[id] = { ...it, box, due: Date.now() + INTERVALS[box] * DAY };
    } else {
      reviews[id] = { ...it, box: 0, due: Date.now() + INTERVALS[0] * DAY, misses: it.misses + 1 };
    }
    return bump({ ...p, reviews });
  });
}

export function addToReview(item: Omit<ReviewItem, "box" | "due" | "misses">) {
  progressStore.set((p) => (p.reviews[item.id] ? p : { ...p, reviews: { ...p.reviews, [item.id]: { ...item, box: 0, due: Date.now(), misses: 0 } } }));
}

export function setKnown(id: string, known: boolean) {
  progressStore.set((p) => {
    const next = { ...p.known };
    if (known) next[id] = Date.now();
    else delete next[id];
    return known ? bump({ ...p, known: next }) : { ...p, known: next };
  });
}

export function setLabStep(slug: string, step: number, passed?: boolean) {
  progressStore.set((p) => {
    const prev = p.labs[slug];
    const s = { step: Math.max(step, prev?.step ?? 0), passed: passed ? Date.now() : prev?.passed };
    return passed && !prev?.passed ? bump({ ...p, labs: { ...p.labs, [slug]: s } }) : { ...p, labs: { ...p.labs, [slug]: s } };
  });
}

export function markSimTried(id: string) {
  progressStore.set((p) => (p.simsTried[id] ? p : { ...p, simsTried: { ...p.simsTried, [id]: Date.now() } }));
}

export const dueReviews = (p: Progress, now = Date.now()) => Object.values(p.reviews).filter((r) => r.due <= now).sort((a, b) => a.due - b.due);

/** Consecutive days with activity, ending today (or yesterday, so a streak survives until tonight). */
export function streak(p: Progress): number {
  let n = 0;
  const d = new Date();
  if (!p.days[d.toISOString().slice(0, 10)]) d.setDate(d.getDate() - 1);
  while (p.days[d.toISOString().slice(0, 10)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function exportProgress(): string {
  return JSON.stringify({ app: "llm-1-to-100", version: 1, progress: progressStore.get() }, null, 2);
}

export function importProgress(raw: string): boolean {
  try {
    const data = JSON.parse(raw);
    if (data?.app !== "llm-1-to-100" || typeof data.progress !== "object") return false;
    progressStore.set({ ...EMPTY, ...data.progress });
    return true;
  } catch {
    return false;
  }
}

export function resetProgress() {
  progressStore.set(EMPTY);
}
