// Pure model for transformer-flow: a toy pipeline text → tokens → IDs → vectors → L blocks → logits → probabilities → token.
import { num, str, type Params } from "../types";
import { clamp, entropyBits, memo, mulberry32, round, softmax } from "./lib";

export const D = 8; // toy vector size
export const VOCAB = 1000; // toy vocabulary size

export const STAGES = [
  { key: "text", label: "Text", cap: "You type text. The model never sees letters directly." },
  { key: "tokens", label: "Tokens", cap: "A tokenizer cuts the text into tokens: words or pieces of words." },
  { key: "ids", label: "Token IDs", cap: "Each token becomes a number: its row in the vocabulary." },
  { key: "embed", label: "Embeddings", cap: "Each ID looks up a learned vector: a list of numbers that carries meaning." },
  { key: "attention", label: "Attention", cap: "In every block, each token gathers information from the tokens before it." },
  { key: "mlp", label: "MLP", cap: "Then each token's vector is transformed on its own by a small neural network." },
  { key: "logits", label: "Logits", cap: "The last token's final vector is turned into one score per vocabulary token." },
  { key: "softmax", label: "Probabilities", cap: "Softmax turns the scores into probabilities that add up to 1." },
  { key: "next", label: "Next token", cap: "Pick a token, append it, and run the whole pipeline again." },
] as const;

export const SENTENCES: Record<string, { label: string; tokens: string[]; ids: number[]; cands: [string, number][] }> = {
  cat: {
    label: "The cat sat on the",
    tokens: ["The", " cat", " sat", " on", " the"],
    ids: [17, 482, 731, 59, 12],
    cands: [[" mat", 4.1], [" floor", 3.2], [" sofa", 2.7], [" roof", 1.9], [" table", 1.6]],
  },
  ml: {
    label: "I love machine",
    tokens: ["I", " love", " machine"],
    ids: [40, 655, 918],
    cands: [[" learning", 6.0], [" translation", 2.4], [" code", 1.9], [" vision", 1.5], [" tools", 1.1]],
  },
  paris: {
    label: "Paris is the capital of",
    tokens: ["Paris", " is", " the", " capital", " of"],
    ids: [903, 31, 12, 377, 68],
    cands: [[" France", 7.2], [" the", 3.1], [" fashion", 2.9], [" Europe", 2.2], [" love", 1.8]],
  },
};

/** Toy embedding for a token ID: D numbers in [-1, 1], fixed per ID. */
export const embed = (id: number) => {
  const r = mulberry32(id * 7 + 3);
  return Array.from({ length: D }, () => round(r() * 2 - 1, 2));
};

/** Parameters of the toy model (biases and norms ignored): embedding V·d, per block 4d² (attention) + 8d² (MLP, 4× wide). */
export const toyParams = (L: number) => VOCAB * D + L * 12 * D * D;

export const runFlow = memo((p: Params) => {
  const S = SENTENCES[str(p, "sentence")] ?? SENTENCES.cat;
  const L = clamp(Math.round(num(p, "layers")), 1, 4);
  const probs = softmax(S.cands.map((c) => c[1]));
  return { S, L, vectors: S.ids.map(embed), probs, top: probs.indexOf(Math.max(...probs)) };
});

/** Fixed toy MLP weights (4 → 6 → 4), seeded so every render draws the same network. */
const mlpRand = mulberry32(2024);
const W1 = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => round(mlpRand() * 2 - 1, 2)));
const B1 = Array.from({ length: 6 }, () => round(mlpRand() * 0.4 - 0.1, 2));
const W2 = Array.from({ length: 4 }, () => Array.from({ length: 6 }, () => round(mlpRand() * 2 - 1, 2)));

/**
 * One block's MLP on the last token, shrunk to fit on screen: x = first 4 numbers of the token's vector after
 * attention (the attention-weighted mix of all vectors), h = ReLU(W1·x + b1), y = W2·h.
 */
export function mlpToy(vectors: number[][]) {
  const q = vectors[vectors.length - 1];
  const att = softmax(vectors.map((k) => k.reduce((a, x, j) => a + x * q[j], 0) / Math.sqrt(D)));
  const mixed = q.map((_, j) => vectors.reduce((a, v, i) => a + att[i] * v[j], 0));
  const x = mixed.slice(0, 4).map((v) => round(v, 2));
  const h = W1.map((row, j) => round(Math.max(0, row.reduce((a, w, i) => a + w * x[i], 0) + B1[j]), 2));
  const y = W2.map((row) => round(row.reduce((a, w, i) => a + w * h[i], 0), 2));
  return { att, x, h, y, W1, W2 };
}

export const stageIndex = (p: Params) => Math.max(0, STAGES.findIndex((s) => s.key === str(p, "stage")));

export function compute(p: Params) {
  const r = runFlow(p);
  return {
    tokens: r.S.tokens.length,
    d: D,
    params: toyParams(r.L),
    topProb: r.probs[r.top],
    entropyBits: entropyBits(r.probs),
  };
}
