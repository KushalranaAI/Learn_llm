import { describe, expect, it } from "vitest";
import {
  addDays,
  buildPlan,
  daysBetween,
  intervalDays,
  isDue,
  pickMock,
  planItemCount,
  scheduleCard,
  splitKeyPoints,
  splitSentences,
  suggestGrade,
  type QRef,
} from "./interview";

const DAY = 86_400_000;

describe("splitSentences", () => {
  it("splits on sentence ends but not inside maths, decimals or abbreviations", () => {
    const s = splitSentences("The loss is $L = 0.5 \\cdot x. Y$ here. Use e.g. Adam for this. At 0.9 it is 0.105. Done!");
    expect(s).toEqual(["The loss is $L = 0.5 \\cdot x. Y$ here.", "Use e.g. Adam for this.", "At 0.9 it is 0.105.", "Done!"]);
  });
  it("keeps escaped currency and bold spans intact", () => {
    expect(splitSentences("It costs \\$1.74. **A. Big** idea. Then more.")).toEqual(["It costs \\$1.74.", "**A. Big** idea.", "Then more."]);
  });
});

describe("splitKeyPoints", () => {
  it("turns paragraphs and bullets into points", () => {
    const md = "A **loss** turns error into one number that training can minimise. Lower is better.\n\n- Mean squared error suits continuous targets well.\n- Cross-entropy suits classification over classes.";
    const pts = splitKeyPoints(md);
    expect(pts).toEqual([
      "A **loss** turns error into one number that training can minimise. Lower is better.",
      "Mean squared error suits continuous targets well.",
      "Cross-entropy suits classification over classes.",
    ]);
  });
  it("attaches display maths to the previous point and caps the count", () => {
    const md = "The gradient step updates every weight a little.\n\n$$\nw \\leftarrow w - \\eta g\n$$\n\n" + Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is long enough to stand alone.`).join(" ");
    const pts = splitKeyPoints(md, 6);
    expect(pts.length).toBe(6);
    expect(pts[0]).toContain("$$\nw \\leftarrow");
    expect(pts.join(" ")).toContain("Sentence number 11");
  });
  it("returns one point for a one-sentence answer", () => {
    expect(splitKeyPoints("Short answer.")).toEqual(["Short answer."]);
  });
});

describe("scheduleCard", () => {
  const now = 1_000_000_000_000;
  it("Again is due today, Hard tomorrow", () => {
    expect(scheduleCard(undefined, 1, now).due).toBe(now);
    expect(scheduleCard(undefined, 2, now).due).toBe(now + DAY);
  });
  it("Good walks 3 -> 7 -> 14 -> 30 days", () => {
    let c = scheduleCard(undefined, 3, now);
    const steps = [(c.due - now) / DAY];
    for (let i = 0; i < 3; i++) {
      c = scheduleCard(c, 3, now);
      steps.push((c.due - now) / DAY);
    }
    expect(steps).toEqual([3, 7, 14, 30]);
    expect(c.reps).toBe(4);
  });
  it("Easy is always longer than Good, and Again resets", () => {
    for (const box of [0, 1, 2, 3, 4, 5]) expect(intervalDays({ box, due: 0, reps: 1 }, 4)).toBeGreaterThan(intervalDays({ box, due: 0, reps: 1 }, 3));
    expect(scheduleCard({ box: 3, due: 0, reps: 5 }, 1, now).box).toBe(0);
  });
  it("isDue counts anything due by tonight", () => {
    expect(isDue(scheduleCard(undefined, 1, now), now)).toBe(true);
    expect(isDue(scheduleCard(undefined, 3, now), now)).toBe(false);
    expect(isDue(undefined, now)).toBe(false);
  });
  it("suggests a grade from coverage", () => {
    expect([0, 0.5, 0.8, 1].map(suggestGrade)).toEqual([1, 2, 3, 4]);
  });
});

describe("dates", () => {
  it("adds days across months", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(daysBetween("2026-01-30", "2026-02-02")).toBe(3);
  });
});

describe("pickMock", () => {
  const pool: QRef[] = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, level: (["junior", "mid", "senior"] as const)[i % 3], module: "m", section: `s${i % 6}` }));
  it("picks distinct questions and respects role weights", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = pickMock(pool, "junior", 12, rand);
    expect(new Set(ids).size).toBe(12);
    expect(ids.every((id) => pool.find((q) => q.id === id)!.level !== "senior")).toBe(true);
  });
  it("returns what exists when the pool is small", () => {
    expect(pickMock(pool.slice(0, 2), "mix", 8).length).toBe(2);
  });
});

describe("buildPlan", () => {
  const lessons = Array.from({ length: 10 }, (_, i) => ({ module: `m${i % 3}`, lesson: `l${i}`, title: `Lesson ${i}` }));
  const questions = lessons.flatMap((l, i) =>
    (["junior", "mid", "senior"] as const).map((level, j) => ({ id: `${l.lesson}-${j}`, level, module: l.module, lesson: l.lesson })),
  );
  it("makes one card per day ending in a mock interview", () => {
    const p = buildPlan({ start: "2026-10-26", days: 7, level: "mid", minutes: 45, lessons, questions, now: 0 });
    expect(p.days.length).toBe(7);
    expect(p.days[0].date).toBe("2026-10-26");
    expect(p.interview).toBe("2026-11-02");
    expect(p.days[6].items.some((i) => i.kind === "mock")).toBe(true);
    const allIds = p.days.flatMap((d) => d.items.flatMap((i) => (i.kind === "set" ? i.ids : [])));
    expect(allIds.every((id) => !id.endsWith("-2"))).toBe(true); // no senior questions for a mid target
    expect(planItemCount(p)).toBeGreaterThan(7);
  });
  it("squeezes into a short window by spreading lessons across modules", () => {
    const p = buildPlan({ start: "2026-10-26", days: 1, level: "senior", minutes: 20, lessons, questions });
    expect(p.days.length).toBe(1);
    expect(p.days[0].items.filter((i) => i.kind === "lesson").length).toBe(1);
  });
  it("fills lesson-free days with review", () => {
    const p = buildPlan({ start: "2026-10-26", days: 30, level: "junior", minutes: 30, lessons, questions });
    expect(p.days.length).toBe(30);
    expect(p.days.every((d) => d.items.length > 0)).toBe(true);
  });
});
