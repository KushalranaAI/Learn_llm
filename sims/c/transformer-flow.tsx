// "What happens inside": a toy transformer pipeline, one stage at a time. Params: sentence (preset), layers (1–4),
// stage (which stage is highlighted; Play walks through them). Metrics: tokens n, vector size d, toy parameter count,
// probability of the top next token, entropy of the next-token distribution.
import type { SimDef } from "../types";
import { round } from "./lib";
import { D, SENTENCES, STAGES, VOCAB, compute, embed, runFlow, toyParams } from "./transformer-flow-model";
import View from "./transformer-flow.view";

const defaults = { sentence: "cat", layers: 2, stage: "text" };
const dm = compute(defaults);
const dr = runFlow(defaults);
const e0 = embed(SENTENCES.cat.ids[1]);

export const transformerFlow: SimDef = {
  id: "transformer-flow",
  title: "What happens inside: text in, next token out",
  summary: "Follow one sentence through a toy transformer: tokens, IDs, vectors, stacked attention + MLP blocks, scores, probabilities and the next token.",
  module: "model-foundations",
  tags: ["transformer", "tokens", "embeddings", "attention", "softmax", "pipeline"],
  params: [
    { key: "sentence", label: "Sentence", kind: "select", options: Object.entries(SENTENCES).map(([value, s]) => ({ value, label: s.label })) },
    { key: "layers", label: "Blocks shown L", kind: "range", min: 1, max: 4, step: 1, help: "Real models stack 12 to 100+ blocks" },
    { key: "stage", label: "Highlight stage", kind: "select", options: STAGES.map((s, i) => ({ value: s.key, label: `${i + 1}. ${s.label}` })) },
  ],
  defaults,
  metrics: [
    { key: "tokens", label: "Tokens n", format: "int" },
    { key: "d", label: "Vector size d", format: "int" },
    { key: "params", label: "Toy model parameters", format: "int" },
    { key: "topProb", label: "Top next-token probability", format: "pct" },
  ],
  compute,
  View,
  math: `**Shapes.** $n$ tokens become $n$ IDs, then $n$ vectors of size $d$ (an $n \\times d$ table). Every block keeps that shape: attention mixes information *between* tokens, the MLP transforms each token's vector *on its own*. Only the last token's final vector is used to score the next token.

**Toy parameter count** (biases and norms ignored, output layer shares the embedding table):
$$N = \\underbrace{V d}_{\\text{embeddings}} + L\\,(\\underbrace{4d^2}_{\\text{attention}} + \\underbrace{8d^2}_{\\text{MLP}}) = V d + 12 L d^2.$$
Defaults: $V = ${VOCAB}$, $d = ${D}$, $L = 2$: $N = ${VOCAB}\\cdot${D} + 12\\cdot2\\cdot${D}^2 = ${VOCAB * D} + ${12 * 2 * D * D} = ${toyParams(2).toLocaleString("en-US").replace(",", "{,}")}$. The same formula with $V = 50{,}257$, $d = 768$, $L = 12$ gives about 124M parameters: GPT-2 small.

**Neurons inside the MLP.** At the MLP stage the picture zooms into one block: 4 of the last token's numbers $x$ feed 6 hidden neurons $h = \\text{ReLU}(W_1 x + b_1)$, which feed a new vector $y = W_2 h$ (a real MLP is $d \\to 4d \\to d$). Brighter circle = larger activation; blue lines are positive weights, orange negative.

**Embedding.** ID ${SENTENCES.cat.ids[1]} (" cat") looks up row ${SENTENCES.cat.ids[1]} of the table: $[${e0.join(", ")}]$ (made-up numbers; real ones are learned).

**Softmax** turns the final scores $z_i$ into probabilities $p_i = e^{z_i} / \\sum_j e^{z_j}$. For "The cat sat on the" the scores are $4.1, 3.2, 2.7, 1.9, 1.6$, so
$$p(\\text{mat}) = \\frac{1}{1 + e^{-0.9} + e^{-1.4} + e^{-2.2} + e^{-2.5}} = ${round(dm.topProb, 3)}.$$
The model then appends " ${dr.S.cands[dr.top][0].trim()}" and runs the whole pipeline again for the next token.`,
  explain: (p, m) => {
    const s = STAGES[Math.max(0, STAGES.findIndex((x) => x.key === p.stage))];
    return `${s.label}: ${s.cap} This toy has ${m.tokens} tokens, vectors of size ${m.d} and ${m.params.toLocaleString("en-US")} parameters; it gives the top next token ${(m.topProb * 100).toFixed(0)}%.`;
  },
};
