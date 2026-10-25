// Shared pure helpers for group A sims: seeded randomness, maths, and hardware / model presets.
// Everything here is deterministic so sims stay testable and labs can check goals.

/* ---------------- randomness ---------------- */

/** mulberry32: tiny seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = (Math.floor(seed) >>> 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller from a seeded uniform source. */
export function gaussian(rand: () => number): () => number {
  return () => {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

/* ---------------- maths ---------------- */

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));
export const logspace = (a: number, b: number, n: number) => linspace(Math.log(a), Math.log(b), n).map(Math.exp);
export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
export const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export function softmax(logits: number[]): number[] {
  const m = Math.max(...logits.filter((v) => v > -Infinity));
  const e = logits.map((v) => (v === -Infinity ? 0 : Math.exp(v - m)));
  const s = sum(e) || 1;
  return e.map((v) => v / s);
}

/** Shannon entropy in bits. */
export const entropyBits = (p: number[]) => Math.max(0, -sum(p.map((v) => (v > 0 ? v * Math.log2(v) : 0))));

export const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
export const norm = (a: number[]) => Math.sqrt(dot(a, a));
export const cosine = (a: number[], b: number[]) => dot(a, b) / (norm(a) * norm(b) || 1);

/** Pick evenly spaced indices (always includes first and last) to thin a long series for charts. */
export function thin<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  return Array.from({ length: n }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (n - 1))]);
}

/** Cache results of an expensive pure function by its params (compute and View share one run). */
export function memo<A, R>(fn: (a: A) => R, size = 16): (a: A) => R {
  const cache = new Map<string, R>();
  return (a: A) => {
    const k = JSON.stringify(a);
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const r = fn(a);
    cache.set(k, r);
    if (cache.size > size) cache.delete(cache.keys().next().value as string);
    return r;
  };
}

/** Compact human number: 6.74e9 -> "6.74B". */
export function human(n: number, d = 2): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${round(n / 1e12, d)}T`;
  if (a >= 1e9) return `${round(n / 1e9, d)}B`;
  if (a >= 1e6) return `${round(n / 1e6, d)}M`;
  if (a >= 1e3) return `${round(n / 1e3, d)}K`;
  return `${round(n, d)}`;
}

export const GB = 1024 ** 3;

/* ---------------- hardware presets ---------------- */

export type Gpu = {
  id: string;
  label: string;
  /** dense BF16 tensor-core peak, FLOP/s */
  flops: number;
  /** dense FP8 peak, FLOP/s (same as bf16 when not supported) */
  flopsFp8: number;
  /** HBM / GDDR bandwidth, bytes/s */
  bw: number;
  /** memory, GB (GiB used throughout for simplicity) */
  memGB: number;
  /** typical on-demand cloud price, $/GPU-hour (varies a lot by provider) */
  price: number;
};

// Datasheet numbers (dense, no sparsity).
export const GPUS: Record<string, Gpu> = {
  l4: { id: "l4", label: "NVIDIA L4 24 GB", flops: 121e12, flopsFp8: 242e12, bw: 300e9, memGB: 24, price: 0.8 },
  a100: { id: "a100", label: "A100 80 GB SXM", flops: 312e12, flopsFp8: 312e12, bw: 2.0e12, memGB: 80, price: 1.8 },
  h100: { id: "h100", label: "H100 80 GB SXM", flops: 989e12, flopsFp8: 1979e12, bw: 3.35e12, memGB: 80, price: 2.5 },
  h200: { id: "h200", label: "H200 141 GB", flops: 989e12, flopsFp8: 1979e12, bw: 4.8e12, memGB: 141, price: 3.5 },
  b200: { id: "b200", label: "B200 180 GB", flops: 2250e12, flopsFp8: 4500e12, bw: 8.0e12, memGB: 180, price: 5.5 },
};
export const GPU_OPTIONS = Object.values(GPUS).map((g) => ({ value: g.id, label: g.label }));

/** Fraction of peak a well-tuned kernel actually reaches (documented assumptions, not measurements). */
export const COMPUTE_EFF = 0.6;
export const BW_EFF = 0.8;

/* ---------------- model presets ---------------- */

export type Model = {
  id: string;
  label: string;
  layers: number;
  d: number;
  heads: number;
  kvHeads: number;
  headDim: number;
  ffn: number;
  vocab: number;
  tied: boolean;
};

export const MODELS: Record<string, Model> = {
  "llama3-1b": { id: "llama3-1b", label: "Llama-3.2-1B", layers: 16, d: 2048, heads: 32, kvHeads: 8, headDim: 64, ffn: 8192, vocab: 128256, tied: true },
  "llama2-7b": { id: "llama2-7b", label: "Llama-2-7B (MHA)", layers: 32, d: 4096, heads: 32, kvHeads: 32, headDim: 128, ffn: 11008, vocab: 32000, tied: false },
  "mistral-7b": { id: "mistral-7b", label: "Mistral-7B (GQA 8)", layers: 32, d: 4096, heads: 32, kvHeads: 8, headDim: 128, ffn: 14336, vocab: 32000, tied: false },
  "llama3-8b": { id: "llama3-8b", label: "Llama-3-8B (GQA 8)", layers: 32, d: 4096, heads: 32, kvHeads: 8, headDim: 128, ffn: 14336, vocab: 128256, tied: false },
  "llama2-13b": { id: "llama2-13b", label: "Llama-2-13B (MHA)", layers: 40, d: 5120, heads: 40, kvHeads: 40, headDim: 128, ffn: 13824, vocab: 32000, tied: false },
  "llama3-70b": { id: "llama3-70b", label: "Llama-3-70B (GQA 8)", layers: 80, d: 8192, heads: 64, kvHeads: 8, headDim: 128, ffn: 28672, vocab: 128256, tied: false },
};
export const MODEL_OPTIONS = Object.values(MODELS).map((m) => ({ value: m.id, label: m.label }));

/** The linear layers of one transformer block (SwiGLU MLP), as [name, d_in, d_out]. */
export function blockMatrices(m: Model): [string, number, number][] {
  const q = m.heads * m.headDim, kv = m.kvHeads * m.headDim;
  return [
    ["q", m.d, q],
    ["k", m.d, kv],
    ["v", m.d, kv],
    ["o", q, m.d],
    ["gate", m.d, m.ffn],
    ["up", m.d, m.ffn],
    ["down", m.ffn, m.d],
  ];
}

/** Exact parameter count (no biases): blocks + 2 RMSNorms per block + final norm + embeddings (+ untied LM head). */
export function paramCount(m: Model): number {
  const block = blockMatrices(m).reduce((s, [, a, b]) => s + a * b, 0) + 2 * m.d;
  return m.layers * block + m.d + m.vocab * m.d * (m.tied ? 1 : 2);
}

/** KV-cache bytes per token: 2 (K and V) · layers · kv heads · head dim · bytes per element. */
export const kvBytesPerToken = (m: Model, bytes = 2, kvHeads = m.kvHeads) => 2 * m.layers * kvHeads * m.headDim * bytes;

/** Smallest power-of-two tensor-parallel group whose memory holds the weights with ~40% left for KV cache. */
export function tpSize(m: Model, g: Gpu, wBytes = 2): number {
  const w = (paramCount(m) * wBytes) / GB;
  let tp = 1;
  while (tp < 8 && w > 0.6 * g.memGB * tp) tp *= 2;
  return tp;
}

/** Roofline time of one step: whichever of compute and memory traffic takes longer. */
export function rooflineSeconds(flops: number, bytes: number, g: Gpu, tp = 1) {
  const tc = flops / (tp * g.flops * COMPUTE_EFF);
  const tm = bytes / (tp * g.bw * BW_EFF);
  return { t: Math.max(tc, tm), tc, tm };
}

/** One decode step for `batch` sequences at average context `ctx`: every weight read once, plus each sequence's KV cache. */
export function decodeStep(m: Model, g: Gpu, batch: number, ctx: number, tp = 1, wBytes = 2) {
  const N = paramCount(m);
  const flops = batch * (2 * N + 4 * m.layers * ctx * m.heads * m.headDim);
  const bytes = N * wBytes + batch * ctx * kvBytesPerToken(m);
  return rooflineSeconds(flops, bytes, g, tp);
}

/** Prefill of `tokens` prompt tokens (per sequence `perSeq`): compute-bound matmuls plus causal attention. */
export function prefill(m: Model, g: Gpu, tokens: number, perSeq = tokens, tp = 1, wBytes = 2) {
  const N = paramCount(m);
  const flops = 2 * N * tokens + 2 * m.layers * perSeq * tokens * m.heads * m.headDim;
  const bytes = N * wBytes + tokens * kvBytesPerToken(m);
  return rooflineSeconds(flops, bytes, g, tp);
}
