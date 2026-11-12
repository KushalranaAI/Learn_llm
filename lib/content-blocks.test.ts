// Every interactive block in the course content parses and is answerable: quick checks, predictions and code drills.
// A broken block renders as a warning box in the middle of a lesson, so catch it here instead.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const topics = walk(path.join(process.cwd(), "content", "modules")).filter((f) => /^\d+-.+\.md$/.test(path.basename(f)));
const blocks = (kind: string) =>
  topics.flatMap((f) => [...fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n").matchAll(new RegExp("^```" + kind + "\\n([\\s\\S]*?)\\n```$", "gm"))].map((m) => ({ f: path.relative(process.cwd(), f), raw: m[1] })));

describe("content blocks", () => {
  it("quick checks have options, a valid answer and an explanation", () => {
    const bad = blocks("quiz").filter(({ raw }) => {
      try {
        const q = JSON.parse(raw);
        return !(Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length && q.explain);
      } catch {
        return true;
      }
    });
    expect(bad.map((b) => b.f)).toEqual([]);
  });

  it("predictions have options and, when given, a valid answer", () => {
    const bad = blocks("predict").filter(({ raw }) => {
      try {
        const p = JSON.parse(raw);
        return !(Array.isArray(p.options) && p.options.length >= 2 && (p.answer === undefined || (p.answer >= 0 && p.answer < p.options.length)));
      } catch {
        return true;
      }
    });
    expect(bad.map((b) => b.f)).toEqual([]);
  });

  it("put-in-order drills have 3–12 distinct lines (duplicates would make the order ambiguous)", () => {
    const bad = blocks("parsons").filter(({ raw }) => {
      try {
        const d = JSON.parse(raw);
        return !(Array.isArray(d.lines) && d.lines.length >= 3 && d.lines.length <= 12 && new Set(d.lines).size === d.lines.length);
      } catch {
        return true;
      }
    });
    expect(bad.map((b) => b.f)).toEqual([]);
  });

  it("find-the-bug drills point at a real line and explain the bug", () => {
    const bad = blocks("bughunt").filter(({ raw }) => {
      try {
        const d = JSON.parse(raw);
        return !(typeof d.code === "string" && d.bug >= 1 && d.bug <= d.code.split("\n").length && d.explain && d.q);
      } catch {
        return true;
      }
    });
    expect(bad.map((b) => b.f)).toEqual([]);
  });
});
