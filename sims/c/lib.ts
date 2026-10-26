// Shared pure helpers for group C sims (the "What is an LLM?" opener). Deterministic, no React.

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

/** Small stable string hash (FNV-1a) so a preset name can seed the generator. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = sum(e) || 1;
  return e.map((v) => v / s);
}

/** Softmax at temperature T; T near 0 is greedy (all mass on the largest logit). */
export function softmaxT(z: number[], T: number): number[] {
  if (T <= 0.01) {
    const k = z.indexOf(Math.max(...z));
    return z.map((_, i) => (i === k ? 1 : 0));
  }
  return softmax(z.map((v) => v / T));
}

/** Shannon entropy in bits. */
export const entropyBits = (p: number[]) => Math.max(0, -sum(p.map((v) => (v > 0 ? v * Math.log2(v) : 0))));

/** Index drawn from distribution p using a uniform number u in [0, 1). */
export function drawIndex(p: number[], u: number): number {
  let c = 0;
  for (let i = 0; i < p.length; i++) {
    c += p[i];
    if (u < c) return i;
  }
  for (let i = p.length - 1; i >= 0; i--) if (p[i] > 0) return i;
  return 0;
}

/** Cache results of a pure function by its argument (compute and View share one run). */
export function memo<A, R>(fn: (a: A) => R, size = 24): (a: A) => R {
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

/** 175e9 -> "175B", 117e6 -> "117M". */
export function human(n: number): string {
  const a = Math.abs(n);
  const r = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(0) : (+x.toFixed(2)).toString());
  if (a >= 1e12) return `${r(n / 1e12)}T`;
  if (a >= 1e9) return `${r(n / 1e9)}B`;
  if (a >= 1e6) return `${r(n / 1e6)}M`;
  if (a >= 1e3) return `${r(n / 1e3)}K`;
  return `${n}`;
}
