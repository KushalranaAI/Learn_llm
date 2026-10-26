// Pure helpers for interview practice: split an answer into key points, schedule a card with spaced repetition,
// pick a mock interview, and build a day-by-day revision plan. No React, no storage: everything here is unit-tested.

export type Level = "junior" | "mid" | "senior";
export const LEVELS: Level[] = ["junior", "mid", "senior"];

const DAY = 86_400_000;

/* ------------------------------------------------------------------ key points */

const ABBREV = /(?:\b(?:e\.g|i\.e|vs|etc|approx|cf|Dr|Mr|Ms|Fig|Eq|No|al)\.)$/i;
const MAX_POINTS = 8;
const MIN_CHARS = 32;

/** Split one paragraph of markdown into sentences, never inside `$maths$`, `code` or **bold**. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  let math = false;
  let code = false;
  let bold = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && !code) {
      i++; // skip the escaped character (e.g. \$ currency)
      continue;
    }
    if (c === "`") code = !code;
    else if (code) continue;
    else if (c === "$") {
      if (text[i + 1] === "$") i++;
      math = !math;
    } else if (c === "*" && text[i + 1] === "*" && !math) {
      bold = !bold;
      i++;
    } else if (!math && !bold && (c === "." || c === "!" || c === "?")) {
      // end of sentence: punctuation (+ closing quote/bracket) then space then a capital, digit, markup or maths
      let j = i + 1;
      while (j < text.length && /["')\]”’]/.test(text[j])) j++;
      if (j >= text.length || !/\s/.test(text[j])) continue;
      let k = j;
      while (k < text.length && /\s/.test(text[k])) k++;
      if (k >= text.length) continue;
      if (!/[A-Z0-9*$`("“_\\]/.test(text[k])) continue;
      const head = text.slice(start, i + 1);
      if (c === "." && ABBREV.test(head)) continue;
      if (c === "." && /\b[A-Z]\.$/.test(head)) continue; // initials: "J. Smith"
      out.push(text.slice(start, j).trim());
      start = k;
      i = k - 1;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/** Merge the shortest point with a neighbour until there are at most `max`. */
function capPoints(points: string[], max: number): string[] {
  const p = [...points];
  while (p.length > max) {
    let s = 0;
    for (let i = 1; i < p.length; i++) if (p[i].length < p[s].length) s = i;
    const left = s > 0 ? p[s - 1].length : Infinity;
    const right = s < p.length - 1 ? p[s + 1].length : Infinity;
    if (left <= right) p.splice(s - 1, 2, `${p[s - 1]} ${p[s]}`);
    else p.splice(s, 2, `${p[s]} ${p[s + 1]}`);
  }
  return p;
}

/**
 * Turn an 80-200 word markdown answer into a short checklist of key points: one per bullet item or sentence.
 * Display maths, code fences and tables stay attached to the point before them. Tiny fragments are merged.
 */
export function splitKeyPoints(md: string, max = MAX_POINTS): string[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  // 1. blocks: paragraphs, list items, and "sticky" blocks (fence, $$ maths, table) that join the previous point
  type Block = { text: string; sticky: boolean; list: boolean };
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ text: para.join(" ").trim(), sticky: false, list: false });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/^(```|~~~)/.test(t)) {
      flush();
      const fence = [line];
      while (++i < lines.length) {
        fence.push(lines[i]);
        if (/^(```|~~~)/.test(lines[i].trim())) break;
      }
      blocks.push({ text: fence.join("\n"), sticky: true, list: false });
    } else if (t.startsWith("$$")) {
      flush();
      const disp = [line];
      if (!(t.length > 2 && t.endsWith("$$"))) {
        while (++i < lines.length) {
          disp.push(lines[i]);
          if (lines[i].trim().endsWith("$$")) break;
        }
      }
      blocks.push({ text: disp.join("\n"), sticky: true, list: false });
    } else if (t.startsWith("|")) {
      flush();
      const table = [line];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) table.push(lines[++i]);
      blocks.push({ text: table.join("\n"), sticky: true, list: false });
    } else if (/^([-*+]|\d+[.)])\s+/.test(t)) {
      flush();
      blocks.push({ text: t.replace(/^([-*+]|\d+[.)])\s+/, ""), sticky: false, list: true });
    } else if (!t) {
      flush();
    } else if (/^\s{2,}\S/.test(line) && blocks.length && blocks[blocks.length - 1].list && !para.length) {
      blocks[blocks.length - 1].text += ` ${t}`; // continuation of a list item
    } else {
      para.push(t);
    }
  }
  flush();

  // 2. points: list items stay whole, paragraphs split into sentences
  const points: string[] = [];
  for (const b of blocks) {
    if (b.sticky) {
      if (points.length) points[points.length - 1] += `\n\n${b.text}`;
      else points.push(b.text);
    } else if (b.list) {
      points.push(b.text);
    } else {
      points.push(...splitSentences(b.text));
    }
  }

  // 3. merge fragments that are too short to be a point on their own ("Example:", "So it has 4.")
  const merged: string[] = [];
  for (const p of points) {
    const plain = p.replace(/[*`$\\]/g, "");
    if (merged.length && (plain.length < MIN_CHARS || /:$/.test(merged[merged.length - 1]))) {
      const sep = p.includes("\n") || merged[merged.length - 1].includes("\n") ? "\n\n" : " ";
      merged[merged.length - 1] += sep + p;
    } else merged.push(p);
  }
  if (merged.length > 1 && merged[0].replace(/[*`$\\]/g, "").length < MIN_CHARS) {
    merged.splice(0, 2, `${merged[0]} ${merged[1]}`);
  }
  return capPoints(merged.filter((x) => x.trim()), Math.max(1, max));
}

/* ------------------------------------------------------------------ spaced repetition */

/** One interview question's schedule. `box` counts successful recalls in a row; `lastScore` is 0..1. */
export type IvCard = { box: number; due: number; reps: number; lastScore?: number };
/** 1 Again, 2 Hard, 3 Good, 4 Easy */
export type Grade = 1 | 2 | 3 | 4;
export const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: 1, label: "Again", key: "1" },
  { grade: 2, label: "Hard", key: "2" },
  { grade: 3, label: "Good", key: "3" },
  { grade: 4, label: "Easy", key: "4" },
];
/** Days until the next review after "Good", by box. */
export const GOOD_STEPS = [3, 7, 14, 30, 60];
const GRADE_SCORE: Record<Grade, number> = { 1: 0, 2: 0.4, 3: 0.75, 4: 1 };

/** Days from now until the card is next due for this grade (0 = later today). */
export function intervalDays(prev: IvCard | undefined, grade: Grade): number {
  const box = prev?.box ?? 0;
  const last = GOOD_STEPS.length - 1;
  if (grade === 1) return 0;
  if (grade === 2) return 1;
  if (grade === 3) return GOOD_STEPS[Math.min(box, last)];
  return box >= last ? Math.round(GOOD_STEPS[last] * 1.5) : GOOD_STEPS[Math.min(box + 1, last)];
}

export function scheduleCard(prev: IvCard | undefined, grade: Grade, now = Date.now(), score?: number): IvCard {
  const box = prev?.box ?? 0;
  const nextBox = grade === 1 ? 0 : grade === 2 ? box : grade === 3 ? box + 1 : box + 2;
  return {
    box: Math.min(nextBox, GOOD_STEPS.length),
    due: now + intervalDays(prev, grade) * DAY,
    reps: (prev?.reps ?? 0) + 1,
    lastScore: score ?? GRADE_SCORE[grade],
  };
}

export const intervalLabel = (days: number) => (days === 0 ? "now" : days < 30 ? `${days}d` : `${Math.round(days / 30)}mo`);

/** Suggested grade from the share of key points covered. */
export const suggestGrade = (covered: number): Grade => (covered < 0.4 ? 1 : covered < 0.7 ? 2 : covered < 1 ? 3 : 4);

export function endOfDay(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
export const isDue = (c: IvCard | undefined, now = Date.now()) => !!c && c.due <= endOfDay(now);

/** yyyy-mm-dd in local time. */
export function localDay(d: Date | number = new Date()): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + n));
}
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

/* ------------------------------------------------------------------ mock interview */

export type Role = Level | "mix";
export const ROLE_WEIGHTS: Record<Role, Record<Level, number>> = {
  junior: { junior: 0.7, mid: 0.3, senior: 0 },
  mid: { junior: 0.3, mid: 0.5, senior: 0.2 },
  senior: { junior: 0.1, mid: 0.4, senior: 0.5 },
  mix: { junior: 1 / 3, mid: 1 / 3, senior: 1 / 3 },
};

export type QRef = { id: string; level: Level; module: string; section: string };

/** Pick `count` questions for a mock interview, weighted by role, spreading over sections. `rand` is injectable for tests. */
export function pickMock(pool: QRef[], role: Role, count: number, rand: () => number = Math.random): string[] {
  const w = ROLE_WEIGHTS[role];
  const left = [...pool];
  const out: QRef[] = [];
  const usedSections = new Set<string>();
  while (out.length < count && left.length) {
    const avail = LEVELS.filter((l) => w[l] > 0 && left.some((q) => q.level === l));
    const levels = avail.length ? avail : LEVELS.filter((l) => left.some((q) => q.level === l));
    const total = levels.reduce((a, l) => a + (w[l] || 1), 0);
    let r = rand() * total;
    let level = levels[levels.length - 1];
    for (const l of levels) {
      r -= w[l] || 1;
      if (r <= 0) {
        level = l;
        break;
      }
    }
    const ofLevel = left.filter((q) => q.level === level);
    const fresh = ofLevel.filter((q) => !usedSections.has(q.section));
    const from = fresh.length ? fresh : ofLevel;
    const pick = from[Math.min(from.length - 1, Math.floor(rand() * from.length))];
    out.push(pick);
    usedSections.add(pick.section);
    left.splice(left.indexOf(pick), 1);
  }
  return out.map((q) => q.id);
}

/* ------------------------------------------------------------------ revision plan */

export type PlanItem =
  | { kind: "lesson"; module: string; lesson: string; title: string }
  | { kind: "set"; ids: string[]; title: string }
  | { kind: "mock"; title: string };
export type PlanDay = { date: string; items: PlanItem[] };
export type InterviewPlan = {
  created: number;
  /** interview day, yyyy-mm-dd */
  interview: string;
  level: Level;
  minutes: number;
  days: PlanDay[];
  /** `${dayIndex}:${itemIndex}` -> ticked at (ms) */
  checked: Record<string, number>;
};

export type PlanLesson = { module: string; lesson: string; title: string };
export type PlanQuestion = { id: string; level: Level; module: string; lesson: string };

export const LESSON_MINUTES = 8;
export const QUESTION_MINUTES = 3;

const LEVEL_ORDER: Record<Level, Level[]> = { junior: ["junior"], mid: ["mid", "junior"], senior: ["senior", "mid", "junior"] };

/** Pick `n` lessons spread across modules (first lesson of each module, then the second...), kept in course order. */
function spreadLessons(lessons: PlanLesson[], n: number): PlanLesson[] {
  if (n >= lessons.length) return lessons;
  const byModule = new Map<string, PlanLesson[]>();
  for (const l of lessons) byModule.set(l.module, [...(byModule.get(l.module) ?? []), l]);
  const picked = new Set<PlanLesson>();
  for (let round = 0; picked.size < n; round++) {
    let any = false;
    for (const ls of byModule.values()) {
      if (picked.size >= n) break;
      if (ls[round]) {
        picked.add(ls[round]);
        any = true;
      }
    }
    if (!any) break;
  }
  return lessons.filter((l) => picked.has(l));
}

/**
 * Build a day-by-day plan from `start` (today) up to the interview day. Every day but the last revises a few lessons
 * and answers their questions (at the target level and below); days without a lesson mix earlier questions;
 * the interview eve is a review mix plus a mock interview.
 */
export function buildPlan(o: {
  start: string;
  days: number;
  level: Level;
  minutes: number;
  lessons: PlanLesson[];
  questions: PlanQuestion[];
  now?: number;
}): InterviewPlan {
  const N = Math.max(1, Math.min(90, Math.round(o.days)));
  const minutes = Math.max(10, o.minutes);
  const levels = LEVEL_ORDER[o.level];
  const rank = (q: PlanQuestion) => levels.indexOf(q.level);
  const qs = o.questions.filter((q) => rank(q) >= 0);
  const lessonsWithQs = o.lessons.filter((l) => qs.some((q) => q.module === l.module && q.lesson === l.lesson));
  const studyDays = N >= 3 ? N - 1 : N;
  const perDay = Math.max(1, Math.floor((minutes * 0.45) / LESSON_MINUTES));
  const chosen = spreadLessons(lessonsWithQs, studyDays * perDay);
  const dayLessons: PlanLesson[][] = Array.from({ length: studyDays }, () => []);
  chosen.forEach((l, i) => dayLessons[Math.floor((i * studyDays) / chosen.length)].push(l));

  const used = new Map<string, number>();
  const take = (pool: PlanQuestion[], n: number) => {
    const sorted = [...pool].sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) || rank(a) - rank(b));
    const ids = sorted.slice(0, Math.max(0, n)).map((q) => q.id);
    ids.forEach((id) => used.set(id, (used.get(id) ?? 0) + 1));
    return ids;
  };
  const covered: PlanQuestion[] = [];

  const days: PlanDay[] = [];
  for (let d = 0; d < studyDays; d++) {
    const ls = dayLessons[d];
    const budget = Math.max(3, Math.floor((minutes - ls.length * LESSON_MINUTES) / QUESTION_MINUTES));
    const items: PlanItem[] = ls.map((l) => ({ kind: "lesson", ...l }));
    const own = qs.filter((q) => ls.some((l) => l.module === q.module && l.lesson === q.lesson));
    let ids = take(own, budget);
    if (ids.length < budget) {
      const review = (covered.length ? covered : qs).filter((q) => !ids.includes(q.id));
      ids = ids.concat(take(review, budget - ids.length));
    }
    covered.push(...own);
    if (ids.length) items.push({ kind: "set", ids, title: ls.length ? "Questions" : "Review mix" });
    days.push({ date: addDays(o.start, d), items });
  }
  if (N >= 3) {
    const budget = Math.max(3, Math.floor((minutes * 0.5) / QUESTION_MINUTES));
    const ids = take(covered.length ? covered : qs, budget);
    const items: PlanItem[] = [];
    if (ids.length) items.push({ kind: "set", ids, title: "Final review" });
    items.push({ kind: "mock", title: "Mock interview" });
    days.push({ date: addDays(o.start, N - 1), items });
  }
  return { created: o.now ?? Date.now(), interview: addDays(o.start, N), level: o.level, minutes, days, checked: {} };
}

export const planItemCount = (p: InterviewPlan) => p.days.reduce((a, d) => a + d.items.length, 0);
