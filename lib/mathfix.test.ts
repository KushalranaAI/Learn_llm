import { describe, expect, it } from "vitest";
import { fixMath } from "./mathfix";

describe("fixMath", () => {
  it("leaves prose currency escapes alone", () => {
    expect(fixMath("It costs \\$3 per 1M tokens and \\$15 for output.")).toBe("It costs \\$3 per 1M tokens and \\$15 for output.");
  });
  it("rewrites a dollar inside inline maths", () => {
    expect(fixMath("so $1.5 \\times 1.16 \\approx \\$1.74$ a day")).toBe("so $1.5 \\times 1.16 \\approx \\mathdollar 1.74$ a day");
  });
  it("rewrites a dollar inside display maths and keeps the prose after it", () => {
    const md = "$$\n\\text{cost} = \\$3 \\times 2\n$$\n\nThen \\$5 more.";
    expect(fixMath(md)).toBe("$$\n\\text{cost} = \\mathdollar 3 \\times 2\n$$\n\nThen \\$5 more.");
  });
  it("does not touch fenced or inline code", () => {
    const md = "```python\nprice = '\\$3'\n```\n\nUse `\\$x` here and \\$4.";
    expect(fixMath(md)).toBe(md);
  });
  it("keeps a LaTeX line break and unrelated maths unchanged", () => {
    expect(fixMath("$a \\\\ b$ and \\$2")).toBe("$a \\\\ b$ and \\$2");
    expect(fixMath("plain $x^2$ text")).toBe("plain $x^2$ text");
  });
  it("closes inline maths at a blank line", () => {
    expect(fixMath("a $ b\n\nprice \\$9")).toBe("a $ b\n\nprice \\$9");
  });
});
