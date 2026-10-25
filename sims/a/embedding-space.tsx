// Toy word vectors: cosine similarity, nearest neighbours and analogy arithmetic (king − man + woman ≈ queen).
// Params: mode (neighbours | analogy), a, b, c (word selects; analogy is a − b + c, neighbours uses a and compares a with b).
// Metrics: topSim (cosine between the target vector and its best match, inputs excluded), cosAB (cosine(a, b)),
// topIsExpected (1 when the best match is the "textbook" answer for a preset analogy, else 0; for neighbours always 1).
import { Scatter } from "../ui";
import { str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, HBars } from "./viz";
import { cosine, dot, mulberry32, norm, round } from "./lib";

export const DIMS = ["royalty", "male↔female", "youth", "person", "animal", "fruit"];

// Hand-designed 6-D vectors (gender axis: + male, − female), plus a tiny seeded jitter so nothing is exactly parallel.
const BASE: Record<string, number[]> = {
  king: [0.92, 0.85, 0.1, 0.9, 0, 0],
  queen: [0.9, -0.82, 0.12, 0.9, 0, 0],
  man: [0.05, 0.8, 0.15, 0.95, 0, 0],
  woman: [0.06, -0.78, 0.18, 0.95, 0, 0],
  prince: [0.8, 0.82, 0.65, 0.9, 0, 0],
  princess: [0.78, -0.8, 0.66, 0.9, 0, 0],
  boy: [0.02, 0.75, 0.85, 0.9, 0, 0],
  girl: [0.03, -0.76, 0.86, 0.9, 0, 0],
  dog: [0, 0.1, 0.2, 0.05, 0.9, 0],
  puppy: [0, 0.1, 0.85, 0.05, 0.88, 0],
  cat: [0, -0.1, 0.2, 0.05, 0.9, 0],
  kitten: [0, -0.1, 0.85, 0.05, 0.88, 0],
  apple: [0, 0, 0.1, 0, 0.02, 0.95],
  banana: [0.02, 0, 0.05, 0, 0, 0.92],
  orange: [0, 0, 0.08, 0.02, 0, 0.9],
};
const rand = mulberry32(42);
export const VEC: Record<string, number[]> = Object.fromEntries(Object.entries(BASE).map(([w, v]) => [w, v.map((x) => +(x + (rand() - 0.5) * 0.08).toFixed(3))]));
export const WORDS = Object.keys(VEC);

const EXPECTED: Record<string, string> = {
  "king-man+woman": "queen", "queen-woman+man": "king", "prince-boy+girl": "princess", "boy-man+woman": "girl",
  "puppy-dog+cat": "kitten", "kitten-cat+dog": "puppy", "prince-king+queen": "princess", "man-king+queen": "woman",
};

function target(p: Params): number[] {
  const a = VEC[str(p, "a")] ?? VEC.king;
  if (str(p, "mode") !== "analogy") return a;
  const b = VEC[str(p, "b")] ?? VEC.man, c = VEC[str(p, "c")] ?? VEC.woman;
  return a.map((v, i) => v - b[i] + c[i]);
}

export function ranked(p: Params) {
  const t = target(p);
  const skip = str(p, "mode") === "analogy" ? [str(p, "a"), str(p, "b"), str(p, "c")] : [str(p, "a")];
  return WORDS.filter((w) => !skip.includes(w)).map((w) => ({ w, s: cosine(t, VEC[w]) })).sort((x, y) => y.s - x.s);
}

function compute(p: Params) {
  const r = ranked(p);
  const key = `${str(p, "a")}-${str(p, "b")}+${str(p, "c")}`;
  const exp = EXPECTED[key];
  return {
    topSim: r[0]?.s ?? 0,
    cosAB: cosine(VEC[str(p, "a")] ?? VEC.king, VEC[str(p, "b")] ?? VEC.man),
    topIsExpected: str(p, "mode") !== "analogy" ? 1 : exp ? (r[0]?.w === exp ? 1 : 0) : 0,
  };
}

/** 2-D PCA of all word vectors (power iteration with deflation; deterministic). */
function pca2() {
  const X = WORDS.map((w) => VEC[w]);
  const n = X.length, d = X[0].length;
  const mean = Array.from({ length: d }, (_, j) => X.reduce((s, x) => s + x[j], 0) / n);
  const Xc = X.map((x) => x.map((v, j) => v - mean[j]));
  const cov = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => Xc.reduce((s, x) => s + x[i] * x[j], 0) / n));
  const comps: number[][] = [];
  for (let k = 0; k < 2; k++) {
    let v = Array.from({ length: d }, (_, i) => 1 / (i + 1 + k));
    for (let it = 0; it < 200; it++) {
      let u = cov.map((row) => dot(row, v));
      for (const c of comps) { const pr = dot(u, c); u = u.map((x, i) => x - pr * c[i]); }
      const nn = norm(u) || 1;
      v = u.map((x) => x / nn);
    }
    comps.push(v);
  }
  return (v: number[]) => comps.map((c) => dot(v.map((x, j) => x - mean[j]), c));
}
const project = pca2();

function View({ params }: SimViewProps) {
  const r = ranked(params);
  const a = str(params, "a"), b = str(params, "b"), c = str(params, "c");
  const analogy = str(params, "mode") === "analogy";
  const t = project(target(params));
  const P = (w: string) => project(VEC[w]);
  const special = analogy ? [a, b, c] : [a, b];
  const pts = WORDS.map((w) => {
    const [x, y] = P(w);
    return { x, y, label: w, color: w === r[0].w ? "var(--green)" : special.includes(w) ? "var(--accent)" : "var(--muted)", r: w === r[0].w || special.includes(w) ? 6 : 4 };
  });
  if (analogy) pts.push({ x: t[0], y: t[1], label: `${a}−${b}+${c}`, color: "var(--blue)", r: 5 });
  const lines = analogy
    ? [
        { x1: P(b)[0], y1: P(b)[1], x2: P(c)[0], y2: P(c)[1], color: "var(--accent)" },
        { x1: P(a)[0], y1: P(a)[1], x2: t[0], y2: t[1], color: "var(--blue)", dashed: true },
      ]
    : [{ x1: P(a)[0], y1: P(a)[1], x2: P(b)[0], y2: P(b)[1], color: "var(--accent)", dashed: true }];
  return (
    <>
      <Caption>All {WORDS.length} words projected from {DIMS.length}-D to 2-D (PCA). {analogy ? `Orange arrow: ${b} → ${c}. The same offset from ${a} (blue, dashed) lands near ${r[0].w}.` : `Dashed: ${a} ↔ ${b}.`}</Caption>
      <Scatter points={pts} lines={lines} height={280} />
      <Caption>{analogy ? `Nearest words to ${a} − ${b} + ${c} (cosine)` : `Nearest neighbours of ${a} (cosine)`}</Caption>
      <HBars bars={r.slice(0, 6).map((x, i) => ({ label: x.w, value: Math.max(0, x.s), note: x.s.toFixed(3), color: i === 0 ? "var(--green)" : "var(--blue)" }))} max={1} />
    </>
  );
}

const D = { mode: "analogy", a: "king", b: "man", c: "woman" };
const dr = ranked(D);
const dm = compute(D);
const vf = (v: number[]) => `(${v.map((x) => round(x, 2)).join(", ")})`;
const tgt = target(D);
const opts = WORDS.map((w) => ({ value: w, label: w }));

export const embeddingSpace: SimDef = {
  id: "embedding-space",
  title: "Embeddings: meaning as directions in space",
  summary: "Explore toy word vectors: measure cosine similarity, find nearest neighbours and do analogy arithmetic like king − man + woman.",
  module: "model-foundations",
  tags: ["embeddings", "cosine similarity", "vectors", "analogy", "nearest neighbours"],
  params: [
    { key: "mode", label: "Mode", kind: "select", options: [{ value: "analogy", label: "Analogy: a − b + c" }, { value: "neighbours", label: "Neighbours of a (compare a, b)" }] },
    { key: "a", label: "Word a", kind: "select", options: opts },
    { key: "b", label: "Word b", kind: "select", options: opts },
    { key: "c", label: "Word c", kind: "select", options: opts, help: "used in analogy mode" },
  ],
  defaults: D,
  metrics: [
    { key: "topSim", label: "Best-match cosine", format: "num" },
    { key: "cosAB", label: "cos(a, b)", format: "num" },
    { key: "topIsExpected", label: "Textbook answer (1 = yes)", format: "int" },
  ],
  compute,
  View,
  math: `An embedding maps each token to a vector $\\mathbf v \\in \\mathbb R^d$ so that related meanings point in similar directions. Real models learn $d$ = 768–8192 dimensions from data; here $d = ${DIMS.length}$ hand-designed axes (${DIMS.join(", ")}) so you can read them.

**Cosine similarity** compares directions, ignoring length:
$$\\cos(\\mathbf a,\\mathbf b) = \\frac{\\mathbf a\\cdot\\mathbf b}{\\lVert\\mathbf a\\rVert\\,\\lVert\\mathbf b\\rVert} = \\frac{\\sum_i a_i b_i}{\\sqrt{\\sum_i a_i^2}\\sqrt{\\sum_i b_i^2}} \\in [-1, 1]$$

**Nearest neighbours**: rank every other word $w$ by $\\cos(\\mathbf a, \\mathbf v_w)$.

**Analogies**: if a relation (male → female) is a roughly constant offset, then $\\mathbf v_{king} - \\mathbf v_{man} + \\mathbf v_{woman}$ should land near $\\mathbf v_{queen}$. We search all words except the three inputs (as word2vec evaluation does).

**Defaults.** $\\mathbf v_{king} = ${vf(VEC.king)}$, $\\mathbf v_{man} = ${vf(VEC.man)}$, $\\mathbf v_{woman} = ${vf(VEC.woman)}$, so
$$\\mathbf t = \\mathbf v_{king} - \\mathbf v_{man} + \\mathbf v_{woman} = ${vf(tgt)}$$
Its best match is **${dr[0].w}** with cosine ${round(dm.topSim, 3)} (runner-up: ${dr[1].w}, ${round(dr[1].s, 3)}). $\\cos(king, man) = ${round(dm.cosAB, 3)}$: they share the male and person axes but differ in royalty.

The 2-D picture is a PCA projection (the two directions of largest variance), so distances in it are only approximate; the cosines are computed in the full space.`,
  explain: (p, m) => {
    const r = ranked(p);
    return str(p, "mode") === "analogy"
      ? `${str(p, "a")} − ${str(p, "b")} + ${str(p, "c")} lands closest to "${r[0].w}" (cosine ${m.topSim.toFixed(3)}): the offset ${str(p, "b")} → ${str(p, "c")} acts like a direction for that relation.`
      : `"${str(p, "a")}"'s nearest neighbour is "${r[0].w}" (cosine ${m.topSim.toFixed(3)}); cos(${str(p, "a")}, ${str(p, "b")}) = ${m.cosAB.toFixed(3)}.`;
  },
};
