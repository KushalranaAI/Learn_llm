// What the learner knows, derived from their progress and the course map. Pure functions (no React, no storage),
// shared by the roadmap, the home screen, lesson pages and tests.
//
// Lesson states, from the research report (docs/research/reports):
//   later       → not started, and something it builds on is not finished yet (a hint, never a lock)
//   ready       → not started, everything it builds on is finished or skipped
//   started     → some topics opened or finished
//   complete    → every topic finished (or "I know this")
//   mastered    → complete, and most of its quick checks were recalled correctly on separate later days
// plus an orthogonal "due" count: review items from this lesson that are due now.
import type { Outline } from "./content";
import { isMastered, type Progress } from "./progress";

export type LessonState = "later" | "ready" | "started" | "complete" | "mastered";
export type OutlineModule = Outline[number];
export type OutlineLesson = OutlineModule["lessons"][number];

/** Share of a lesson's quick checks that must be mastered for the lesson to count as mastered. */
export const LESSON_MASTERY = 0.8;

export const lessonKey = (m: string, l: string) => `${m}/${l}`;

export type LessonInfo = {
  id: string;
  module: OutlineModule;
  lesson: OutlineLesson;
  state: LessonState;
  done: number;
  total: number;
  skipped: boolean;
  due: number;
  mastered: number;
  checks: number;
  /** prerequisites that are not finished yet */
  missing: string[];
};

function finished(p: Progress, outline: Outline, id: string): boolean {
  if (p.skipped?.[id]) return true;
  const [m, l] = id.split("/");
  const lesson = outline.find((x) => x.slug === m)?.lessons.find((x) => x.slug === l);
  return !!lesson && lesson.topics.length > 0 && lesson.topics.every((t) => p.done[`${id}/${t.slug}`]);
}

export function lessonInfo(p: Progress, outline: Outline, module: OutlineModule, lesson: OutlineLesson, now = Date.now()): LessonInfo {
  const id = lessonKey(module.slug, lesson.slug);
  const total = lesson.topics.length;
  const done = lesson.topics.filter((t) => p.done[`${id}/${t.slug}`]).length;
  const touched = done > 0 || lesson.topics.some((t) => p.visited[`${id}/${t.slug}`]);
  const skipped = !!p.skipped?.[id];
  const items = lesson.quizIds.map((q) => p.reviews[q]);
  const mastered = items.filter(isMastered).length;
  const due = items.filter((r) => r && !r.retired && r.due <= now).length;
  const missing = lesson.requires.filter((r) => !finished(p, outline, r));
  const complete = skipped || (total > 0 && done === total);
  let state: LessonState;
  if (complete) state = lesson.quizIds.length > 0 && mastered / lesson.quizIds.length >= LESSON_MASTERY ? "mastered" : "complete";
  else if (touched) state = "started";
  else state = missing.length ? "later" : "ready";
  return { id, module, lesson, state, done, total, skipped, due, mastered, checks: lesson.quizIds.length, missing };
}

export function allLessons(p: Progress, outline: Outline, now = Date.now()): LessonInfo[] {
  return outline.flatMap((m) => m.lessons.map((l) => lessonInfo(p, outline, m, l, now)));
}

/** Progress for a module against a fixed denominator (its topics), so adding modules never shrinks it. */
export function moduleStats(p: Progress, outline: Outline, module: OutlineModule, now = Date.now()) {
  const infos = module.lessons.map((l) => lessonInfo(p, outline, module, l, now));
  const topics = infos.reduce((a, x) => a + x.total, 0);
  const done = infos.reduce((a, x) => a + (x.skipped ? x.total : x.done), 0);
  return {
    infos,
    topics,
    done,
    ratio: topics ? done / topics : 0,
    complete: infos.filter((x) => x.state === "complete" || x.state === "mastered").length,
    mastered: infos.filter((x) => x.state === "mastered").length,
    due: infos.reduce((a, x) => a + x.due, 0),
    started: infos.some((x) => x.state !== "later" && x.state !== "ready"),
  };
}

/**
 * The "ready to learn" fringe: lessons not started whose prerequisites are all finished, in course order,
 * optionally limited to the modules of a goal path.
 */
export function readyToLearn(p: Progress, outline: Outline, modules?: string[], limit = 3, noCode = false): LessonInfo[] {
  return allLessons(p, outline)
    .filter((x) => x.state === "ready" && (!modules?.length || modules.includes(x.module.slug)) && !(noCode && x.lesson.practice))
    .slice(0, limit);
}

/** Layered layout of a module's lessons: depth = longest chain of in-module prerequisites. */
export function lessonLayers(module: OutlineModule): { slug: string; depth: number; row: number }[] {
  const inModule = new Set(module.lessons.map((l) => l.slug));
  const reqs = (slug: string) =>
    module.lessons
      .find((l) => l.slug === slug)!
      .requires.map((r) => r.split("/"))
      .filter(([m, l]) => m === module.slug && inModule.has(l))
      .map(([, l]) => l);
  const depth: Record<string, number> = {};
  const visit = (slug: string, seen: Set<string>): number => {
    if (depth[slug] !== undefined) return depth[slug];
    if (seen.has(slug)) return 0; // a cycle would be a content bug; the map test catches it
    seen.add(slug);
    const d = Math.max(-1, ...reqs(slug).map((r) => visit(r, seen))) + 1;
    depth[slug] = d;
    return d;
  };
  module.lessons.forEach((l) => visit(l.slug, new Set()));
  const rows: Record<number, number> = {};
  return module.lessons.map((l) => {
    const d = depth[l.slug];
    const row = rows[d] ?? 0;
    rows[d] = row + 1;
    return { slug: l.slug, depth: d, row };
  });
}

/** In-module prerequisite edges after removing ones implied by a longer path (Exercism-style pruning). */
export function prunedEdges(module: OutlineModule): [string, string][] {
  const direct: Record<string, string[]> = {};
  for (const l of module.lessons)
    direct[l.slug] = l.requires.filter((r) => r.startsWith(`${module.slug}/`)).map((r) => r.split("/")[1]);
  const reaches = (from: string, to: string, skipDirect: boolean): boolean => {
    const stack = (direct[from] ?? []).filter((x) => !(skipDirect && x === to));
    const seen = new Set<string>();
    while (stack.length) {
      const x = stack.pop()!;
      if (x === to) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(direct[x] ?? []));
    }
    return false;
  };
  const edges: [string, string][] = [];
  for (const [to, froms] of Object.entries(direct)) for (const from of froms) if (!reaches(to, from, true)) edges.push([from, to]);
  return edges;
}

/** Confidence vs accuracy from every recorded answer (first answers and reviews). */
export function calibration(p: Progress) {
  const rows: Record<"sure" | "think" | "guess", { n: number; ok: number }> = { sure: { n: 0, ok: 0 }, think: { n: 0, ok: 0 }, guess: { n: 0, ok: 0 } };
  for (const [, ok, conf] of p.answers ?? []) {
    if (!conf) continue;
    rows[conf].n++;
    if (ok) rows[conf].ok++;
  }
  return rows;
}
