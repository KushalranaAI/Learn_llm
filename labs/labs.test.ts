import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getSim } from "@/sims";
import { goalMet, type Params } from "@/sims/types";
import { LABS } from "./index";

const EXPECTED = [
  "train-a-tiny-network", "token-budget", "attention-by-hand", "tune-the-sampler", "fit-the-kv-cache",
  "plan-a-training-run", "lora-budget",
  "is-it-really-better", "build-an-eval-suite",
  "serve-a-chat-model", "shrink-the-model",
];
const MODULE_OF: Record<string, string> = {
  "train-a-tiny-network": "model-foundations", "token-budget": "model-foundations", "attention-by-hand": "model-foundations",
  "tune-the-sampler": "model-foundations", "fit-the-kv-cache": "model-foundations",
  "plan-a-training-run": "training-and-adaptation", "lora-budget": "fine-tuning",
  "serve-a-chat-model": "inference-and-serving", "shrink-the-model": "inference-and-serving",
  "is-it-really-better": "evaluation", "build-an-eval-suite": "evaluation",
};

describe("lab catalogue", () => {
  it("has all 11 labs, with unique slugs, in curriculum order", () => {
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
      expect(lab.steps.length, `${lab.slug} steps`).toBeLessThanOrEqual(lab.capstone ? 12 : 9);
      expect(lab.minutes, `${lab.slug} minutes`).toBeGreaterThanOrEqual(15);
      expect(lab.minutes, `${lab.slug} minutes`).toBeLessThanOrEqual(lab.capstone ? 150 : 45);
      expect(lab.steps.some((s) => s.type === "math" || s.type === "run"), `${lab.slug} has a math or run step`).toBe(true);
      const sims = lab.steps.filter((s) => s.type === "sim");
      if (lab.capstone) expect(lab.steps.filter((s) => s.type === "run").length, `${lab.slug} capstone run steps`).toBeGreaterThanOrEqual(2);
      else expect(sims.length, `${lab.slug} has a sim step`).toBeGreaterThanOrEqual(1);
      expect(lab.steps[0].type, `${lab.slug} starts with an intro`).toBe("intro");
      expect(lab.title && lab.product && lab.summary && lab.tags.length, `${lab.slug} text`).toBeTruthy();
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

      if (step.type === "math" || step.type === "run") {
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

    });
  });
}
