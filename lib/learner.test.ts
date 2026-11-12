import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { getMap, getModules, getOutline } from "./content";
import { calibration, lessonInfo, lessonLayers, prunedEdges, readyToLearn } from "./learner";
import { INTERVALS, MASTERY_WINS, nextReview, type Progress, type ReviewItem, reviewSession, upgradeProgress } from "./progress";

const empty = (): Progress => ({ done: {}, visited: {}, last: null, days: {}, checks: {}, reviews: {}, known: {}, labs: {}, simsTried: {} });
const DAY = 86_400_000;

describe("course map", () => {
  const map = getMap();
  const lessons = getModules().flatMap((m) => m.lessons.map((l) => `${m.slug}/${l.slug}`));

  it("lists every module and lesson exactly once, and nothing that does not exist", () => {
    expect(Object.keys(map.modules).sort()).toEqual(getModules().map((m) => m.slug).sort());
    expect(Object.keys(map.lessons).sort()).toEqual([...lessons].sort());
  });

  it("only points at real lessons and modules", () => {
    for (const [id, reqs] of Object.entries(map.lessons)) for (const r of reqs) expect(lessons, `${id} requires ${r}`).toContain(r);
    for (const [id, m] of Object.entries(map.modules)) for (const r of m.requires) expect(Object.keys(map.modules), `${id} requires ${r}`).toContain(r);
    for (const g of map.goals) for (const m of g.modules) expect(Object.keys(map.modules), `goal ${g.id}`).toContain(m);
  });

  it("has no prerequisite cycles", () => {
    const state: Record<string, 0 | 1 | 2> = {};
    const visit = (id: string, path: string[]) => {
      if (state[id] === 2) return;
      expect(state[id], `cycle: ${[...path, id].join(" → ")}`).not.toBe(1);
      state[id] = 1;
      for (const r of map.lessons[id] ?? []) visit(r, [...path, id]);
      state[id] = 2;
    };
    for (const id of lessons) visit(id, []);
  });

  it("never asks a lesson to build on a later lesson of the same module", () => {
    for (const m of getModules())
      for (const l of m.lessons)
        for (const r of map.lessons[`${m.slug}/${l.slug}`] ?? []) {
          const [rm, rl] = r.split("/");
          if (rm === m.slug) expect(m.lessons.find((x) => x.slug === rl)!.order, `${l.slug} → ${rl}`).toBeLessThan(l.order);
        }
  });

  it("keeps the no-code path whole: theory lessons never build on code lessons", () => {
    for (const [id, reqs] of Object.entries(map.lessons))
      if (!map.practice.includes(id)) for (const r of reqs) expect(map.practice, `${id} builds on code lesson ${r}`).not.toContain(r);
    for (const id of map.practice) expect(lessons, id).toContain(id);
  });

  it("gives every module two dimensions of room on the roadmap without overlaps", () => {
    const cells = Object.values(map.modules).map((m) => `${m.col},${m.row}`);
    expect(new Set(cells).size).toBe(cells.length);
  });
});

describe("topic frontmatter", () => {
  it("parses as YAML in every topic (quote titles that contain a colon)", () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const bad = walk(path.join(process.cwd(), "content", "modules"))
      .filter((f) => /^\d+-.+\.md$/.test(path.basename(f)))
      .filter((f) => {
        try {
          return !matter(fs.readFileSync(f, "utf8") + "\n").data.title;
        } catch {
          return true;
        }
      });
    expect(bad).toEqual([]);
  });
});

describe("outline and layout", () => {
  const outline = getOutline();
  it("collects quiz ids for lessons that have quick checks", () => {
    const attention = outline.find((m) => m.slug === "model-foundations")!.lessons.find((l) => l.slug === "attention")!;
    expect(attention.quizIds.length).toBeGreaterThan(3);
    expect(attention.quizIds[0]).toMatch(/^model-foundations\/attention\/[a-z0-9-]+#[a-z0-9]+$/);
  });
  it("lays out each module's lessons in layers with pruned edges", () => {
    for (const m of outline) {
      const layers = lessonLayers(m);
      expect(layers).toHaveLength(m.lessons.length);
      for (const [from, to] of prunedEdges(m)) {
        const a = layers.find((x) => x.slug === from)!, b = layers.find((x) => x.slug === to)!;
        expect(a.depth, `${m.slug}: ${from} → ${to}`).toBeLessThan(b.depth);
      }
    }
  });
});

describe("lesson states", () => {
  const outline = getOutline();
  const mf = outline.find((m) => m.slug === "model-foundations")!;
  const what = mf.lessons.find((l) => l.slug === "what-is-an-llm")!;
  const tok = mf.lessons.find((l) => l.slug === "tokenization")!;

  it("starts ready at the root and 'later' downstream, and finishing unlocks the next suggestion", () => {
    const p = empty();
    expect(lessonInfo(p, outline, mf, what).state).toBe("ready");
    expect(lessonInfo(p, outline, mf, tok).state).toBe("later");
    for (const t of what.topics) p.done[`model-foundations/what-is-an-llm/${t.slug}`] = 1;
    expect(lessonInfo(p, outline, mf, what).state).toBe("complete");
    expect(lessonInfo(p, outline, mf, tok).state).toBe("ready");
    expect(readyToLearn(p, outline).map((x) => x.lesson.slug)).toContain("tokenization");
  });

  it("treats 'I know this' as finished, and mastery needs delayed recall", () => {
    const p = empty();
    p.skipped = { "model-foundations/what-is-an-llm": 1 };
    expect(lessonInfo(p, outline, mf, tok).state).toBe("ready");
    for (const t of tok.topics) p.done[`model-foundations/tokenization/${t.slug}`] = 1;
    expect(lessonInfo(p, outline, mf, tok).state).toBe("complete");
    for (const id of tok.quizIds)
      p.reviews[id] = { id, topic: id.split("#")[0], topicTitle: "", quiz: { q: "", options: [], answer: 0 }, box: 3, due: Date.now() + DAY, misses: 0, wins: MASTERY_WINS };
    expect(lessonInfo(p, outline, mf, tok).state).toBe("mastered");
  });
});

describe("moved lessons keep their progress", () => {
  it("renames old ids on load and is idempotent", () => {
    const p = empty();
    p.done["build-from-scratch/attention-in-code/one-attention-head"] = 1;
    p.done["training-and-adaptation/peft-lora/why-peft"] = 2;
    p.done["training-and-adaptation/scaling-laws/power-laws"] = 3;
    p.last = "build-from-scratch/train-a-tiny-gpt/the-gpt-model";
    p.skipped = { "training-and-adaptation/preference-tuning": 4 };
    p.reviews["training-and-adaptation/instruction-tuning/chat-templates#abc"] = { id: "training-and-adaptation/instruction-tuning/chat-templates#abc", topic: "training-and-adaptation/instruction-tuning/chat-templates", topicTitle: "", quiz: { q: "", options: [], answer: 0 }, box: 1, due: 0, misses: 0 };
    const u = upgradeProgress(p);
    expect(Object.keys(u.done).sort()).toEqual(["fine-tuning/peft-lora/why-peft", "model-foundations/attention-in-code/one-attention-head", "training-and-adaptation/scaling-laws/power-laws"]);
    expect(u.last).toBe("model-foundations/train-a-tiny-gpt/the-gpt-model");
    expect(Object.keys(u.skipped!)).toEqual(["fine-tuning/preference-tuning"]);
    const r = Object.values(u.reviews)[0];
    expect(r.id).toBe("fine-tuning/instruction-tuning/chat-templates#abc");
    expect(r.topic).toBe("fine-tuning/instruction-tuning/chat-templates");
    expect(upgradeProgress(u)).toBe(u);
  });
});

describe("review scheduling", () => {
  const item: ReviewItem = { id: "a", topic: "m/l/t", topicTitle: "", quiz: { q: "", options: [], answer: 0 }, box: 0, due: 0, misses: 0, wins: 0 };
  const now = Date.UTC(2026, 10, 12, 9);

  it("moves right answers out, counts at most one win per day, and retires after the last box", () => {
    const a = nextReview(item, true, "sure", now);
    expect(a.box).toBe(1);
    expect(a.due).toBe(now + INTERVALS[1] * DAY);
    expect(a.wins).toBe(1);
    expect(nextReview(a, true, "sure", now + 1000).wins).toBe(1); // same day
    let it = a;
    for (let d = 1; d < 10; d++) it = nextReview(it, true, "sure", now + d * DAY);
    expect(it.retired).toBeTruthy();
  });

  it("brings a confident mistake back in minutes and a guess moves less", () => {
    const miss = nextReview({ ...item, box: 3 }, false, "sure", now);
    expect(miss.box).toBe(0);
    expect(miss.confErr).toBe(true);
    expect(miss.due - now).toBeLessThan(DAY);
    expect(nextReview({ ...item, box: 2 }, true, "guess", now).box).toBe(2);
  });

  it("caps a session and puts confident mistakes first", () => {
    const p = empty();
    for (let i = 0; i < 30; i++) p.reviews[`x${i}`] = { ...item, id: `x${i}`, topic: `m/l${i % 3}/t`, due: now - i * 1000 };
    p.reviews.x29 = { ...p.reviews.x29, confErr: true };
    const s = reviewSession(p, now);
    expect(s).toHaveLength(20);
    expect(s[0].id).toBe("x29");
  });

  it("computes calibration from recorded answers", () => {
    const p = empty();
    p.answers = [[1, true, "sure"], [2, false, "sure"], [3, true, "guess"]];
    expect(calibration(p).sure).toEqual({ n: 2, ok: 1 });
  });
});
