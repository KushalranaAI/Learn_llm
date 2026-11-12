"use client";
// Everything the learner has done, kept in their own browser: finished topics, daily activity, quick-check results,
// the spaced-review queue, interview answers they know, labs passed. Export/import makes it portable.
import { type Grade, type InterviewPlan, type IvCard, scheduleCard } from "./interview";
import { jsonStore, useStore } from "./localstore";

export type QuizData = { q: string; options: string[]; answer: number; explain?: string };

/** How sure the learner was before seeing the answer. Asked on every quick check and review. */
export type Confidence = "sure" | "think" | "guess";

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
  /** correct recalls in review, each on a different day (the first answer in the lesson is not counted) */
  wins?: number;
  /** yyyy-mm-dd of the last counted win */
  lastWin?: string;
  /** answered wrongly while "sure": shown first in the next session */
  confErr?: boolean;
  /** past the last interval: kept (it still counts as mastered) but no longer scheduled */
  retired?: number;
};

/** Days until the next review after each successful recall; past the last one the item is retired. */
export const INTERVALS = [1, 3, 7, 14, 30, 60];
/** An item is mastered after correct delayed recall in this many separate review sessions (plus the first answer). */
export const MASTERY_WINS = 2;
/** Review sessions are capped so a long break never produces an impossible pile. */
export const DAILY_CAP = 20;
const DAY = 86_400_000;
const MIN = 60_000;

/** First schedule for a quick check, from whether it was right and how sure the learner was. */
function firstSchedule(ok: boolean, conf: Confidence | undefined, now: number): Pick<ReviewItem, "box" | "due" | "misses" | "confErr"> {
  if (!ok) return conf === "sure" ? { box: 0, due: now + 10 * MIN, misses: 1, confErr: true } : { box: 0, due: now + DAY, misses: 1 };
  if (conf === "sure") return { box: 2, due: now + INTERVALS[2] * DAY, misses: 0 };
  if (conf === "think") return { box: 1, due: now + INTERVALS[1] * DAY, misses: 0 };
  return { box: 0, due: now + INTERVALS[0] * DAY, misses: 0 };
}

export type Progress = {
  done: Record<string, number>; // topic id -> finished at (ms)
  visited: Record<string, number>; // topic id -> last opened (ms)
  last: string | null; // last topic opened
  days: Record<string, number>; // yyyy-mm-dd -> actions that day
  checks: Record<string, { ok: boolean; at: number; conf?: Confidence }>; // quiz id -> first answer
  /** lesson id (module/lesson) -> "I know this" at; counts as finished for prerequisites and the map */
  skipped?: Record<string, number>;
  /** prediction block id -> the option picked before the reveal */
  predictions?: Record<string, { pick: number; at: number }>;
  /** code drills (put-in-order, find-the-bug): first-try result and attempts */
  drills?: Record<string, { ok: boolean; at: number; tries: number }>;
  /** every review answer, for the calibration chart: [at, ok, conf] */
  answers?: [number, boolean, Confidence | null][];
  reviews: Record<string, ReviewItem>;
  known: Record<string, number>; // interview question id -> marked known at
  labs: Record<string, { step: number; passed?: number }>;
  simsTried: Record<string, number>;
  /** interview question id -> spaced-repetition schedule (optional so older saved progress still loads) */
  iv?: Record<string, IvCard>;
  /** the learner's interview revision plan */
  plan?: InterviewPlan | null;
};

const EMPTY: Progress = { done: {}, visited: {}, last: null, days: {}, checks: {}, reviews: {}, known: {}, labs: {}, simsTried: {}, iv: {}, plan: null };

/**
 * Lessons that moved between modules keep their progress: saved ids under an old path are renamed on load.
 * build-from-scratch merged into model-foundations; instruction tuning, LoRA and preference tuning moved from
 * training-and-adaptation into fine-tuning. Idempotent, so it is safe to run on every load and on imports.
 */
const MOVES: [RegExp, string][] = [
  [/^build-from-scratch(?=\/)/, "model-foundations"],
  [/^training-and-adaptation\/(instruction-tuning|peft-lora|preference-tuning)(?=\/|#|$)/, "fine-tuning/$1"],
];
const movedId = (id: string) => MOVES.reduce((s, [re, to]) => s.replace(re, to), id);
const moveKeys = <V,>(o: Record<string, V> | undefined, fix?: (v: V) => V): Record<string, V> | undefined =>
  o && Object.fromEntries(Object.entries(o).map(([k, v]) => [movedId(k), fix ? fix(v) : v]));

export function upgradeProgress(p: Progress): Progress {
  const keys = [...Object.keys(p.done ?? {}), ...Object.keys(p.reviews ?? {}), ...Object.keys(p.skipped ?? {}), p.last ?? ""];
  if (!keys.some((k) => movedId(k) !== k)) return p;
  return {
    ...p,
    done: moveKeys(p.done)!,
    visited: moveKeys(p.visited)!,
    last: p.last ? movedId(p.last) : p.last,
    checks: moveKeys(p.checks)!,
    reviews: moveKeys(p.reviews, (r) => ({ ...r, id: movedId(r.id), topic: movedId(r.topic) }))!,
    skipped: moveKeys(p.skipped),
    predictions: moveKeys(p.predictions),
  };
}

export const progressStore = jsonStore<Progress>("llm100-progress", EMPTY, undefined, upgradeProgress);
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

const logAnswer = (p: Progress, ok: boolean, conf?: Confidence): Progress => ({
  ...p,
  answers: [...(p.answers ?? []), [Date.now(), ok, conf ?? null] as [number, boolean, Confidence | null]].slice(-2000),
});

/**
 * First answer to a quick check. Every check joins the review deck (retrieval spaced over days is what makes it
 * stick): a confident miss comes back in minutes, other misses tomorrow, right answers after 1, 3 or 7 days
 * depending on how sure the learner was.
 */
export function recordCheck(id: string, ok: boolean, item: Omit<ReviewItem, "box" | "due" | "misses">, conf?: Confidence) {
  progressStore.set((p) => {
    if (p.checks[id]) return p;
    const reviews = { ...p.reviews, [id]: { ...item, ...firstSchedule(ok, conf, Date.now()), wins: 0 } };
    return bump(logAnswer({ ...p, checks: { ...p.checks, [id]: { ok, at: Date.now(), conf } }, reviews }, ok, conf));
  });
}

/** Pure scheduling step for one review answer (exported for tests). */
export function nextReview(it: ReviewItem, ok: boolean, conf: Confidence | undefined, now: number): ReviewItem {
  const day = new Date(now).toISOString().slice(0, 10);
  if (!ok) return { ...it, box: 0, due: now + (conf === "sure" ? 10 * MIN : DAY), misses: it.misses + 1, confErr: conf === "sure", retired: undefined };
  // a lucky guess still counts as right, but it moves one box less
  const box = Math.min(it.box + (conf === "guess" ? 0 : 1), INTERVALS.length);
  const wins = (it.wins ?? 0) + (it.lastWin === day ? 0 : 1);
  if (box >= INTERVALS.length) return { ...it, box: INTERVALS.length - 1, wins, lastWin: day, confErr: false, retired: now, due: Number.MAX_SAFE_INTEGER };
  return { ...it, box, wins, lastWin: day, confErr: false, due: now + INTERVALS[box] * DAY };
}

/** Answer during review. */
export function answerReview(id: string, ok: boolean, conf?: Confidence) {
  progressStore.set((p) => {
    const it = p.reviews[id];
    if (!it) return p;
    return bump(logAnswer({ ...p, reviews: { ...p.reviews, [id]: nextReview(it, ok, conf, Date.now()) } }, ok, conf));
  });
}

/**
 * Encompassing credit: finishing a topic in a practice lesson (building attention in code, running DPO) exercises
 * the theory it builds on, so review items from those lessons that are due within a day are pushed back by their
 * current interval, as if reviewed. Their box and win count do not change: only real recall earns mastery.
 */
export function creditLessons(lessonIds: string[]) {
  if (!lessonIds.length) return;
  progressStore.set((p) => {
    const now = Date.now();
    let changed = false;
    const reviews = { ...p.reviews };
    for (const it of Object.values(reviews)) {
      if (it.retired || it.confErr || it.due > now + DAY) continue;
      if (!lessonIds.some((l) => it.topic.startsWith(`${l}/`))) continue;
      reviews[it.id] = { ...it, due: now + INTERVALS[it.box] * DAY };
      changed = true;
    }
    return changed ? { ...p, reviews } : p;
  });
}

export function setSkipped(lessonId: string, on: boolean) {
  progressStore.set((p) => {
    const skipped = { ...(p.skipped ?? {}) };
    if (on) skipped[lessonId] = Date.now();
    else delete skipped[lessonId];
    return { ...p, skipped };
  });
}

/** A code drill attempt. The first success is kept; tries counts every check until then. */
export function recordDrill(id: string, ok: boolean) {
  progressStore.set((p) => {
    const prev = p.drills?.[id];
    if (prev?.ok) return p;
    const next = { ok, at: Date.now(), tries: (prev?.tries ?? 0) + 1 };
    return (ok ? bump : (x: Progress) => x)({ ...p, drills: { ...(p.drills ?? {}), [id]: next } });
  });
}

export function recordPrediction(id: string, pick: number) {
  progressStore.set((p) => (p.predictions?.[id] ? p : bump({ ...p, predictions: { ...(p.predictions ?? {}), [id]: { pick, at: Date.now() } } })));
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

/** Grade an interview card (1 Again, 2 Hard, 3 Good, 4 Easy) and schedule its next appearance. */
export function gradeInterview(id: string, grade: Grade, score?: number) {
  progressStore.set((p) => bump({ ...p, iv: { ...(p.iv ?? {}), [id]: scheduleCard(p.iv?.[id], grade, Date.now(), score) } }));
}

/** Record a mock-interview score (0..1). Weak answers (< 0.6) become due now so Practice picks them up. */
export function recordMockScore(id: string, score: number) {
  progressStore.set((p) => {
    const prev = p.iv?.[id];
    const card: IvCard = { box: score < 0.6 ? 0 : prev?.box ?? 0, due: score < 0.6 ? Date.now() : prev?.due ?? Date.now(), reps: (prev?.reps ?? 0) + 1, lastScore: score };
    return { ...p, iv: { ...(p.iv ?? {}), [id]: card } };
  });
}

/** Make these questions due now (e.g. "practise these again"). */
export function queueInterview(ids: string[]) {
  progressStore.set((p) => {
    const iv = { ...(p.iv ?? {}) };
    const now = Date.now();
    for (const id of ids) iv[id] = { ...(iv[id] ?? { box: 0, reps: 0 }), due: now };
    return { ...p, iv };
  });
}

export function savePlan(plan: InterviewPlan | null) {
  progressStore.set((p) => ({ ...p, plan }));
}

/** Tick or untick one plan item (`${day}:${item}`). */
export function togglePlanItem(key: string, on: boolean) {
  progressStore.set((p) => {
    if (!p.plan) return p;
    const checked = { ...p.plan.checked };
    if (on) checked[key] = Date.now();
    else delete checked[key];
    const next = { ...p, plan: { ...p.plan, checked } };
    return on ? bump(next) : next;
  });
}

/** Everything due now, confident mistakes first, then the most overdue. */
export const dueReviews = (p: Progress, now = Date.now()) =>
  Object.values(p.reviews)
    .filter((r) => !r.retired && r.due <= now)
    .sort((a, b) => Number(!!b.confErr) - Number(!!a.confErr) || a.due - b.due);

/** Today's session: at most DAILY_CAP items, with neighbouring items from different lessons where possible. */
export function reviewSession(p: Progress, now = Date.now()): ReviewItem[] {
  const due = dueReviews(p, now).slice(0, DAILY_CAP);
  const lessonOf = (r: ReviewItem) => r.topic.split("/").slice(0, 2).join("/");
  const out: ReviewItem[] = [];
  const rest = [...due];
  while (rest.length) {
    const prev = out.length ? lessonOf(out[out.length - 1]) : null;
    const k = rest.findIndex((r) => lessonOf(r) !== prev);
    out.push(rest.splice(k < 0 ? 0 : k, 1)[0]);
  }
  return out;
}

export const isMastered = (r: ReviewItem | undefined) => !!r && (r.wins ?? 0) >= MASTERY_WINS && !r.confErr;

/** Days with activity in the current week (Monday start), and how many weeks in a row had any activity. */
export function weekActivity(p: Progress, now = new Date()) {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  let thisWeek = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (p.days[key(d)]) thisWeek++;
  }
  let weeks = 0;
  const start = new Date(monday);
  if (!thisWeek) start.setDate(start.getDate() - 7); // the current week is not over yet
  for (;;) {
    let any = false;
    for (let i = 0; i < 7 && !any; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      any = !!p.days[key(d)];
    }
    if (!any) break;
    weeks++;
    start.setDate(start.getDate() - 7);
  }
  return { thisWeek, weeks };
}

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
    progressStore.set(upgradeProgress({ ...EMPTY, ...data.progress }));
    return true;
  } catch {
    return false;
  }
}

export function resetProgress() {
  progressStore.set(EMPTY);
}
