import { describe, expect, it } from "vitest";
import { buildSystem, buildUserTurn } from "./prompts";
import { chatSources, collectContext, registerSource, stripAnswers } from "./sources";

describe("tutor context", () => {
  it("strips quick-check answers and explanations from topic markdown", () => {
    const md = 'Intro text\n\n```quiz\n{"q":"What is 2+2?","options":["3","4"],"answer":1,"explain":"SECRET-EXPLANATION"}\n```\n\nMore';
    const out = stripAnswers(md);
    expect(out).toContain("What is 2+2?");
    expect(out).toContain("B) 4");
    expect(out).not.toContain("SECRET-EXPLANATION");
    expect(out).not.toMatch(/"answer"/);
    expect(out).toContain("Intro text");
  });

  it("collects every registered source, reads live state at send time, and unregisters", () => {
    let n = 1;
    const off = registerSource("t", { label: "Simulation · Test", build: () => ({ value: n }) });
    n = 2;
    expect(collectContext()).toContain('"value": 2');
    expect(chatSources().map((s) => s.label)).toContain("Simulation · Test");
    off();
    expect(collectContext()).not.toContain("Simulation · Test");
  });

  it("a failing source doesn't break the others", () => {
    const a = registerSource("a", { label: "A", build: () => { throw new Error("boom"); } });
    const b = registerSource("b", { label: "B", build: () => "fine" });
    const ctx = collectContext();
    expect(ctx).toContain("(unavailable)");
    expect(ctx).toContain("fine");
    a();
    b();
  });

  it("puts the screen in the system prompt only when sharing is on, trimmed to the budget", () => {
    const screen = "x".repeat(500);
    expect(buildSystem("/sandbox", screen, false, 100)).not.toContain("<screen>");
    const sys = buildSystem("/sandbox", screen, true, 100);
    expect(sys).toContain("<screen>");
    expect(sys).toContain("[screen text trimmed]");
    expect(sys).toContain("/sandbox");
    expect(buildUserTurn("Why?", "a quote")).toContain('"""\na quote\n"""');
  });
});
