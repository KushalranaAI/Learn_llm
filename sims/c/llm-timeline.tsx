// "The journey": milestones from Shannon's n-grams to tool-using agents, with published parameter counts on a log chart.
// Params: milestone (select; Play walks through them). Metrics: paramsB (selected model, billions; "–" if not published),
// growth (selected size ÷ GPT-1's 117M), largestB (largest published size up to here), year.
import type { SimDef } from "../types";
import { round } from "./lib";
import { GPT1, MILESTONES, compute } from "./timeline-data";
import View from "./llm-timeline.view";

const defaults = { milestone: "gpt3" };
const dm = compute(defaults);

export const llmTimeline: SimDef = {
  id: "llm-timeline",
  title: "The journey: from n-grams to assistants",
  summary: "Play through 75 years of language modelling and watch published model sizes climb by three orders of magnitude.",
  module: "model-foundations",
  tags: ["history", "transformer", "GPT", "scaling", "RLHF"],
  params: [
    { key: "milestone", label: "Milestone", kind: "select", options: MILESTONES.map((m) => ({ value: m.key, label: `${m.when} · ${m.name}` })) },
  ],
  defaults,
  metrics: [
    { key: "paramsB", label: "Parameters (billions)", format: "num", help: "– = not published" },
    { key: "growth", label: "Size vs GPT-1", format: "x" },
    { key: "largestB", label: "Largest so far (B)", format: "num" },
    { key: "year", label: "Year", format: "int" },
  ],
  compute,
  View,
  math: `Model sizes grew so fast that only a **logarithmic** axis can show them: each grid line is $10\\times$ the one below. On a log scale, steady multiplication looks like a straight climb.

**Growth factor** compares a model's parameter count with GPT-1's:
$$\\text{growth} = \\frac{N_{\\text{model}}}{N_{\\text{GPT-1}}} = \\frac{N_{\\text{model}}}{${GPT1 / 1e6}\\,\\text{M}}.$$

**Worked example (defaults, GPT-3).** $N = 175\\,\\text{B} = 1.75\\times10^{11}$, so
$$\\frac{1.75\\times10^{11}}{1.17\\times10^{8}} = ${round(dm.growth, 1)} \\approx 1{,}500\\times.$$
In orders of magnitude: $\\log_{10}(1.75\\times10^{11}) - \\log_{10}(1.17\\times10^{8}) = 11.24 - 8.07 \\approx 3.2$, a little over three grid lines in two years (2018 to 2020).

Not every milestone is a size story: InstructGPT's 1.3B model was preferred by people over 175B GPT-3, because of *how* it was trained (human feedback), not how big it was. Many recent models do not publish their size at all; those show "–".`,
  explain: (_p, m) =>
    Number.isFinite(m.paramsB)
      ? `This model has ${m.paramsB < 1 ? `${round(m.paramsB * 1000, 0)} million` : `${round(m.paramsB, 1)} billion`} parameters, ${round(m.growth, 1)}× GPT-1. The largest published size up to ${m.year} is ${round(m.largestB, 1)}B.`
      : m.largestB > 0
        ? `No published parameter count for this one; the largest published size up to ${m.year} is ${round(m.largestB, 1)}B parameters.`
        : `In ${m.year} the story is ideas, not size: press Play to walk forward to the transformer era.`,
};
