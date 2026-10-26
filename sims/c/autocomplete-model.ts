// Pure model for llm-autocomplete: hand-made next-token candidates per step, re-weighted by temperature and sampled
// with a seeded generator. Each step's five candidates fill the same grammatical slot, so any draw still reads as text.
import { num, str, type Params } from "../types";
import { clamp, drawIndex, entropyBits, hash, memo, mulberry32, softmaxT, sum } from "./lib";

export type Cand = [token: string, logit: number];

export const PRESETS: Record<string, { label: string; text: string; steps: Cand[][] }> = {
  capital: {
    label: "The capital of France is",
    text: "The capital of France is",
    steps: [
      [[" Paris", 6.0], [" Lyon", 2.3], [" Marseille", 1.8], [" Nice", 1.1], [" Rome", 0.5]],
      [[",", 4.4], [" —", 2.4], [";", 1.0], [":", 0.8], [" –", 0.3]],
      [[" a", 4.2], [" the", 2.4], [" one", 1.5], [" this", 0.8], [" that", 0.4]],
      [[" city", 4.6], [" place", 2.1], [" capital", 1.5], [" metropolis", 0.9], [" town", 0.5]],
      [[" of", 3.8], [" with", 3.0], [" for", 1.6], [" beyond", 0.6], [" without", 0.5]],
      [[" lights", 3.4], [" art", 3.1], [" museums", 2.8], [" cafés", 1.8], [" bridges", 1.2]],
      [[".", 5.0], ["!", 1.4], [",", 1.3], [" and", 1.0], [" too", 0.6]],
    ],
  },
  story: {
    label: "Once upon a time, there was a",
    text: "Once upon a time, there was a",
    steps: [
      [[" little", 3.8], [" young", 3.4], [" curious", 2.4], [" lonely", 1.8], [" tiny", 1.4]],
      [[" fox", 3.0], [" girl", 2.9], [" dragon", 2.4], [" robot", 2.0], [" king", 1.9]],
      [[" who", 4.6], [" that", 2.6], [" which", 1.0], [" and", 0.6], [" but", 0.2]],
      [[" lived", 4.4], [" dreamed", 2.6], [" wandered", 1.9], [" slept", 1.3], [" danced", 1.0]],
      [[" in", 4.0], [" near", 2.5], [" under", 1.6], [" beside", 1.4], [" inside", 1.0]],
      [[" a", 3.6], [" the", 3.3], [" one", 1.0], [" every", 0.6], [" that", 0.5]],
      [[" forest", 3.4], [" castle", 3.0], [" village", 2.6], [" cloud", 1.4], [" teapot", 0.6]],
    ],
  },
  code: {
    label: "def add(a, b):",
    text: "def add(a, b):\n   ",
    steps: [
      [[" return", 6.0], [" result", 2.2], [' """', 1.8], [" #", 1.2], [" pass", 0.5]],
      [[" a", 6.2], [" (", 1.8], [" b", 1.6], [" sum", 1.2], [" int", 0.6]],
      [[" +", 6.5], [" -", 1.6], [" *", 1.2], [",", 1.0], [" ==", 0.4]],
      [[" b", 7.0], [" a", 1.2], [" 1", 1.0], [" c", 0.6], [" 0", 0.4]],
      [["\n", 5.0], ["  #", 1.4], [";", 0.8], [" ", 0.4], ["\n\n", 1.8]],
    ],
  },
  translate: {
    label: "Translate to French: the black cat sleeps",
    text: "English: the black cat sleeps\nFrench:",
    steps: [
      [[" le", 5.5], [" Le", 3.4], [" un", 1.4], [" ce", 0.8], [" la", 1.2]],
      [[" chat", 6.5], [" chaton", 1.8], [" minou", 1.2], [" félin", 0.6], [" cat", 0.3]],
      [[" noir", 6.0], [" sombre", 1.6], [" noire", 1.4], [" foncé", 0.8], [" black", 0.4]],
      [[" dort", 6.0], [" sommeille", 2.0], [" dormait", 1.4], [" ronronne", 1.0], [" sleeps", 0.3]],
      [[".", 5.0], ["\n", 2.6], [" profondément", 1.0], ["!", 0.8], [" ici", 0.6]],
    ],
  },
};

export type Generation = {
  text: string;
  steps: Cand[][];
  /** per step: distribution after temperature */
  probs: number[][];
  chosen: number[];
  pChosen: number[];
  entropy: number[];
};

export const generate = memo(({ prompt, T, seed }: { prompt: string; T: number; seed: number }): Generation => {
  const P = PRESETS[prompt] ?? PRESETS.capital;
  const rand = mulberry32(hash(prompt) ^ Math.imul(Math.round(seed), 2654435761));
  const probs: number[][] = [], chosen: number[] = [], pChosen: number[] = [], entropy: number[] = [];
  for (const step of P.steps) {
    const p = softmaxT(step.map((c) => c[1]), T);
    const k = drawIndex(p, rand());
    probs.push(p);
    chosen.push(k);
    pChosen.push(p[k]);
    entropy.push(entropyBits(p));
  }
  return { text: P.text, steps: P.steps, probs, chosen, pChosen, entropy };
});

export const genOf = (p: Params) => generate({ prompt: str(p, "prompt"), T: num(p, "temperature"), seed: Number(p.seed ?? 1) });

/** How many tokens have been generated so far (the View writes `at` as it animates; default = all). */
export const atOf = (p: Params, n: number) => clamp(Math.round(Number(p.at ?? n)), 0, n);

export function compute(p: Params) {
  const g = genOf(p);
  const n = g.steps.length;
  const at = atOf(p, n);
  const cur = Math.min(at, n - 1);
  return {
    tokens: at,
    avgProb: at > 0 ? sum(g.pChosen.slice(0, at)) / at : 0,
    entropyBits: g.entropy[cur],
  };
}
