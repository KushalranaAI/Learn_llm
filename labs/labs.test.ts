import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KINDS, isKind } from "@/sandbox/catalog";
import { evaluateDesign } from "@/sandbox/engine";
import { getSim } from "@/sims";
import { goalMet, type Params } from "@/sims/types";
import { LABS } from "./index";

const EXPECTED = [
  "train-a-tiny-network", "token-budget", "attention-by-hand", "tune-the-sampler", "fit-the-kv-cache",
  "plan-a-training-run", "lora-budget",
  "serve-a-chat-model", "shrink-the-model", "capacity-plan",
  "stop-the-injection",
  "is-it-really-better",
  "tune-the-index", "chunk-it-right", "fix-the-rag-bot",
  "make-the-agent-reliable",
  "route-the-traffic",
  "design-support-bot",
];
const MODULE_OF: Record<string, string> = {
  "train-a-tiny-network": "model-foundations", "token-budget": "model-foundations", "attention-by-hand": "model-foundations",
  "tune-the-sampler": "model-foundations", "fit-the-kv-cache": "model-foundations",
  "plan-a-training-run": "training-and-adaptation", "lora-budget": "training-and-adaptation",
  "serve-a-chat-model": "inference-and-serving", "shrink-the-model": "inference-and-serving", "capacity-plan": "inference-and-serving",
  "stop-the-injection": "prompt-and-context",
  "is-it-really-better": "evaluation",
  "tune-the-index": "retrieval-and-rag", "chunk-it-right": "retrieval-and-rag", "fix-the-rag-bot": "retrieval-and-rag",
  "make-the-agent-reliable": "agents",
  "route-the-traffic": "production-systems",
  "design-support-bot": "llm-system-design",
};
const SYSTEM_LABS = ["serve-a-chat-model", "capacity-plan", "stop-the-injection", "fix-the-rag-bot", "make-the-agent-reliable", "route-the-traffic", "design-support-bot"];

describe("lab catalogue", () => {
  it("has all 18 labs, with unique slugs, in curriculum order", () => {
    const slugs = LABS.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(EXPECTED);
  });

  it("puts every lab in the right module", () => {
    for (const lab of LABS) expect(lab.module, lab.slug).toBe(MODULE_OF[lab.slug]);
  });

  it("gives each lab 5-9 steps, 15-45 minutes, a math step and a sim step", () => {
    for (const lab of LABS) {
      expect(lab.steps.length, `${lab.slug} steps`).toBeGreaterThanOrEqual(5);
      expect(lab.steps.length, `${lab.slug} steps`).toBeLessThanOrEqual(9);
      expect(lab.minutes, `${lab.slug} minutes`).toBeGreaterThanOrEqual(15);
      expect(lab.minutes, `${lab.slug} minutes`).toBeLessThanOrEqual(45);
      expect(lab.steps.some((s) => s.type === "math"), `${lab.slug} has a math step`).toBe(true);
      const sims = lab.steps.filter((s) => s.type === "sim");
      expect(sims.length, `${lab.slug} has a sim step`).toBeGreaterThanOrEqual(1);
      expect(lab.steps[0].type, `${lab.slug} starts with an intro`).toBe("intro");
      expect(lab.title && lab.product && lab.summary && lab.tags.length, `${lab.slug} text`).toBeTruthy();
    }
  });

  it("gives every systems lab one to three design steps", () => {
    for (const slug of SYSTEM_LABS) {
      const lab = LABS.find((l) => l.slug === slug)!;
      const n = lab.steps.filter((s) => s.type === "design").length;
      expect(n, `${slug} design steps`).toBeGreaterThanOrEqual(1);
      expect(n, `${slug} design steps`).toBeLessThanOrEqual(3);
    }
  });
});

describe("lab data files", () => {
  it("do not use client code or import React", () => {
    const dir = __dirname;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.startsWith("_") && !x.endsWith(".test.ts"))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/["']use client["']/);
      expect(src, f).not.toMatch(/from ["']react["']/);
      expect(src, f).not.toMatch(/\\`/); // an escaped backtick inside String.raw shows a stray backslash
    }
  });
});

for (const lab of LABS) {
  describe(`lab ${lab.slug}`, () => {
    lab.steps.forEach((step, i) => {
      const where = `step ${i + 1} (${step.type}) "${"title" in step ? step.title : ""}"`;
      if ("body" in step) {
        it(`${where}: has a title and body`, () => {
          expect(step.title.length).toBeGreaterThan(2);
          expect(step.body.length).toBeGreaterThan(40);
        });
      }

      if (step.type === "quiz") {
        it(`${where}: exactly one correct option, every option explained`, () => {
          expect(step.options.length).toBeGreaterThanOrEqual(3);
          expect(step.options.filter((o) => o.correct).length).toBe(1);
          for (const o of step.options) expect(o.why.length, o.text).toBeGreaterThan(10);
          expect(step.question.length).toBeGreaterThan(10);
        });
      }

      if (step.type === "math") {
        it(`${where}: answer is finite and tolerance is sensible`, () => {
          expect(Number.isFinite(step.answer)).toBe(true);
          expect(step.answer).not.toBe(0);
          expect(step.tolerance).toBeGreaterThan(0);
          expect(step.tolerance).toBeLessThanOrEqual(0.2);
          expect(step.hint.length).toBeGreaterThan(5);
          expect(step.solution).toMatch(/\$/); // worked solution uses KaTeX
        });
      }

      if (step.type === "sim") {
        it(`${where}: solution meets every goal and the start does not`, () => {
          const def = getSim(step.sim);
          expect(def, `unknown sim ${step.sim}`).toBeTruthy();
          if (!def) return;
          const keys = new Set(def.params.map((p) => p.key));
          for (const k of [...(step.locked ?? []), ...(step.hidden ?? [])]) expect(keys.has(k), `locked/hidden key ${k} not in ${step.sim}`).toBe(true);
          for (const k of [...Object.keys(step.params ?? {}), ...Object.keys(step.solution)]) expect(keys.has(k), `param ${k} not in ${step.sim}`).toBe(true);
          for (const k of Object.keys(step.solution)) expect(step.locked ?? [], `solution changes locked key ${k}`).not.toContain(k);
          for (const g of step.goals) expect(def.metrics.some((m) => m.key === g.metric), `goal metric ${g.metric} not in ${step.sim}`).toBe(true);
          expect(step.goals.length).toBeGreaterThanOrEqual(2);
          expect(step.goals.length).toBeLessThanOrEqual(4);
          expect(step.hints.length).toBeGreaterThanOrEqual(2);

          const start: Params = { ...def.defaults, ...step.params };
          const solved: Params = { ...def.defaults, ...step.params, ...step.solution };
          const sm = def.compute(solved);
          expect(step.goals.filter((g) => !goalMet(g, sm)).map((g) => `${g.label} (got ${sm[g.metric]})`)).toEqual([]);
          const m0 = def.compute(start);
          expect(step.goals.every((g) => goalMet(g, m0)), "the starting params already meet every goal").toBe(false);
        });
      }

      if (step.type === "design") {
        it(`${where}: solution passes, starter fails, palette is valid`, () => {
          const ev = evaluateDesign(step.solution, step.test);
          expect(ev.results.filter((r) => !r.pass).map((r) => `${r.label}: ${r.detail}`)).toEqual([]);
          if (step.starter) {
            expect(evaluateDesign(step.starter, step.test).pass, "the starter already passes").toBe(false);
          }
          for (const c of step.test.constraints) expect(c.type).toBeTruthy();
          expect(step.test.constraints.length).toBeGreaterThanOrEqual(2);
          expect(step.hints.length).toBeGreaterThanOrEqual(2);
          for (const c of step.test.constraints) {
            if (c.type === "requires" || c.type === "forbids") expect(isKind(c.kind), c.kind).toBe(true);
          }
          const palette = step.palette ?? [];
          for (const k of palette) expect(k in KINDS, `unknown palette kind ${k}`).toBe(true);
          if (palette.length) {
            for (const n of step.solution.nodes) {
              if (n.kind === "users") continue;
              expect(palette, `solution uses ${n.kind} which is not in the palette`).toContain(n.kind);
            }
          }
          // wired edges refer to real nodes
          for (const g of [step.solution, step.starter].filter(Boolean)) {
            const ids = new Set(g!.nodes.map((n) => n.id));
            for (const e of g!.edges) expect(ids.has(e.from) && ids.has(e.to), `${e.from}->${e.to}`).toBe(true);
          }
        });
      }
    });
  });
}
