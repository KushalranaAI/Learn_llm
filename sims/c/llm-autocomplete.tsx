// "An LLM is a very good autocomplete": generate a continuation one token at a time from hand-made next-token
// distributions. Params: prompt (preset), temperature (re-weights the logits; T = 0 is greedy), speed (animation only).
// Metrics: tokens (generated so far), avgProb (mean probability of the drawn tokens), entropyBits (current step).
import type { SimDef } from "../types";
import { PRESETS, compute, generate } from "./autocomplete-model";
import { entropyBits, round, softmax } from "./lib";
import View from "./llm-autocomplete.view";

const defaults = { prompt: "capital", temperature: 1, speed: 1 };
const d = generate({ prompt: "capital", T: 1, seed: 1 });
const dm = compute(defaults);
const z1 = PRESETS.capital.steps[0].map((c) => c[1]);
const p1 = softmax(z1);
const Z = z1.reduce((s, z) => s + Math.exp(z - z1[0]), 0);
const words = d.chosen.map((k, i) => d.steps[i][k][0]).join("");

export const llmAutocomplete: SimDef = {
  id: "llm-autocomplete",
  title: "An LLM is a very good autocomplete",
  summary: "Watch a model write one token at a time: score the candidates, turn scores into probabilities, draw one, append it, repeat.",
  module: "model-foundations",
  tags: ["next-token prediction", "autoregressive", "probability", "temperature", "entropy"],
  params: [
    { key: "prompt", label: "Prompt", kind: "select", options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })) },
    { key: "temperature", label: "Temperature T", kind: "range", min: 0, max: 2, step: 0.05, help: "0 = always the top token; higher = more surprising picks" },
    { key: "speed", label: "Animation speed", kind: "range", min: 0.5, max: 3, step: 0.25, unit: "×" },
  ],
  defaults,
  metrics: [
    { key: "tokens", label: "Tokens generated", format: "int" },
    { key: "avgProb", label: "Avg. probability of picks", format: "pct" },
    { key: "entropyBits", label: "Entropy (this step)", format: "num", help: "bits of uncertainty" },
  ],
  compute,
  View,
  math: `A language model computes one thing: a probability for every possible next token given the text so far,
$$P(x_{t+1} \\mid x_1, \\dots, x_t).$$
It produces a **logit** (score) $z_i$ per candidate and turns scores into probabilities with a softmax at temperature $T$:
$$p_i = \\frac{e^{z_i/T}}{\\sum_j e^{z_j/T}}.$$
One token is drawn, appended, and the longer text goes back in. Repeating this is all "writing" is. Here each step has five hand-made candidates (a real model scores its whole vocabulary of ~100,000 tokens).

**Worked example (defaults, step 1).** Logits for " Paris", " Lyon", " Marseille", " Nice", " Rome" are $6.0, 2.3, 1.8, 1.1, 0.5$. At $T = 1$:
$$p(\\text{Paris}) = \\frac{1}{1 + e^{-3.7} + e^{-4.2} + e^{-4.9} + e^{-5.5}} = \\frac{1}{${round(Z, 4)}} = ${round(p1[0], 3)}.$$
The **entropy** $H = -\\sum_i p_i \\log_2 p_i$ of this step is ${round(entropyBits(p1), 3)} bits (near 0 = sure, $\\log_2 5 \\approx 2.32$ = no idea).
With the default seed the model writes "${words.trim()}"; the average probability of its ${dm.tokens} picks is ${round(dm.avgProb, 3)}, and the last step's entropy is ${round(dm.entropyBits, 3)} bits.
Lower $T$ divides by a small number, stretching the gaps between logits (more predictable); higher $T$ flattens them (more surprising, more mistakes such as " Lyon").`,
  explain: (_p, m) =>
    m.tokens === 0
      ? "Nothing generated yet: press Play and watch each token get scored, drawn and appended."
      : `${m.tokens} tokens so far; on average the model picked tokens it gave ${(m.avgProb * 100).toFixed(0)}% probability, and the current step has ${m.entropyBits.toFixed(2)} bits of uncertainty.`,
};
