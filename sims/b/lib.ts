// Pure helpers shared by the group B simulations: seeded randomness, normal/binomial maths,
// tokenising, BM25, a deterministic toy embedding, and small formatting helpers for math text.

/* ---------------- randomness ---------------- */

/** mulberry32: a tiny, fast, seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box-Muller) from a uniform PRNG. */
export function gauss(r: () => number): number {
  const u = Math.max(1e-12, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------------- numbers ---------------- */

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const logit = (p: number) => Math.log(p / (1 - p));

/** erf, Abramowitz-Stegun 7.1.26 (|error| < 1.5e-7). */
export function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** Standard normal CDF Φ(x). */
export const normCdf = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
/** Standard normal density φ(x). */
export const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/** Inverse standard normal CDF (Acklam's rational approximation, ~1e-9 relative error). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** P(X ≤ k) for X ~ Binomial(n, p), computed with a stable term recurrence. */
export function binomCdf(k: number, n: number, p: number): number {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  let term = Math.exp(n * Math.log1p(-p)); // P(X = 0)
  let sum = term;
  for (let j = 0; j < k; j++) {
    term *= ((n - j) / (j + 1)) * (p / (1 - p));
    sum += term;
  }
  return Math.min(1, sum);
}

/** Evenly spaced values from a to b inclusive. */
export const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1));
/** Log-spaced values from a to b inclusive. */
export const logspace = (a: number, b: number, n: number) => linspace(Math.log(a), Math.log(b), n).map(Math.exp);
/** Index of the value in xs closest to v. */
export const nearestIndex = (xs: number[], v: number) => xs.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(xs[best] - v) ? i : best), 0);

/** Round for display in math text: fixed decimals without trailing noise. */
export const r = (v: number, d = 3) => {
  if (!Number.isFinite(v)) return v > 0 ? "\\infty" : "-\\infty";
  const s = v.toFixed(d);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};
/** Thousands separators for math text. */
export const big = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d });
/** Percent for math text, e.g. 0.1234 -> "12.3\%". */
export const pc = (v: number, d = 1) => `${r(v * 100, d)}\\%`;

/* ---------------- text ---------------- */

export const STOPWORDS = new Set(
  "a an the and or but if of to in on at for from by with as is are was were be been being it its this that these those i you we they he she my your our their me us do does did can could should would will shall may might must not no so than then there here what which who whom how when where why all any each into about over under after before again just also only very too up out off".split(" "),
);

/** Very light stemmer: enough to match "exports"/"exporting"/"exported" with "export". */
export function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) {
    const s = w.slice(0, -3);
    return s.length > 2 && s[s.length - 1] === s[s.length - 2] && !"ls".includes(s[s.length - 1]) ? s.slice(0, -1) : s;
  }
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -1);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Lowercase word tokens (letters and digits), no stopwords, lightly stemmed. */
export function terms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => (w.length > 1 || /\d/.test(w)) && !STOPWORDS.has(w)).map(stem);
}

/** Plain word tokens (keep everything, lowercase) for overlap metrics. */
export function words(text: string, normalise = true): string[] {
  const t = normalise ? text.toLowerCase() : text;
  return t.match(normalise ? /[a-z0-9]+/g : /[A-Za-z0-9]+|[^\sA-Za-z0-9]/g) ?? [];
}

/* ---------------- BM25 ---------------- */

export type Bm25Index = { docs: string[][]; df: Map<string, number>; avgdl: number; N: number };

export function bm25Index(texts: string[]): Bm25Index {
  const docs = texts.map(terms);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const avgdl = docs.reduce((a, d) => a + d.length, 0) / Math.max(1, docs.length);
  return { docs, df, avgdl, N: docs.length };
}

/** idf(t) = ln(1 + (N − df + 0.5) / (df + 0.5)) — the Lucene form, always positive. */
export const bm25Idf = (ix: Bm25Index, t: string) => {
  const df = ix.df.get(t) ?? 0;
  return Math.log(1 + (ix.N - df + 0.5) / (df + 0.5));
};

/** BM25 score of every document for a query. */
export function bm25Scores(ix: Bm25Index, query: string, k1 = 1.2, b = 0.75): number[] {
  const q = [...new Set(terms(query))];
  return ix.docs.map((d) => {
    const dl = d.length;
    let s = 0;
    for (const t of q) {
      let tf = 0;
      for (const w of d) if (w === t) tf++;
      if (!tf) continue;
      s += bm25Idf(ix, t) * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / ix.avgdl)));
    }
    return s;
  });
}

/* ---------------- toy dense embedding ---------------- */

/**
 * A tiny synonym map: words with the same meaning map to one "concept", so paraphrases share features.
 * Real embedding models learn this from data; here it is written down so the behaviour is explainable.
 */
const SYN: Record<string, string> = {};
const GROUPS: string[][] = [
  ["login", "log", "signin", "sign", "access", "locked", "lockout", "account", "get"],
  ["password", "passcode", "passphrase", "credential", "pin"],
  ["reset", "recover", "forgot", "forget", "forgotten", "change"],
  ["refund", "reimburse", "reimbursement", "money", "back", "repay", "chargeback"],
  ["cancel", "cancellation", "stop", "end", "terminate", "unsubscribe", "quit"],
  ["bill", "billing", "invoice", "charge", "charged", "payment", "pay", "card", "price", "cost", "plan", "subscription"],
  ["export", "download", "backup", "save", "copy"],
  ["delete", "remove", "erase", "wipe", "trash"],
  ["share", "invite", "collaborate", "collaborator", "teammate", "team", "member"],
  ["sync", "synchronise", "synchronize", "update", "devices", "device", "phone", "laptop"],
  ["offline", "internet", "connection", "network", "wifi"],
  ["slow", "lag", "laggy", "sluggish", "performance", "speed", "fast"],
  ["error", "fail", "failure", "broken", "crash", "bug", "problem", "issue", "wrong"],
  ["data", "note", "notes", "file", "files", "document", "page", "content"],
  ["privacy", "secure", "security", "encrypt", "encryption", "safe", "private"],
  ["limit", "quota", "storage", "space", "full", "maximum"],
  ["two", "2fa", "factor", "authenticator", "otp", "code", "verification"],
];
GROUPS.forEach((g) => g.forEach((w) => (SYN[stem(w)] = `#${g[0]}`)));

export const DIM = 256;

/** FNV-1a 32-bit hash. */
export function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Concept for a (stemmed) term: its synonym group, or the term itself. */
export const concept = (t: string) => SYN[t] ?? (/\d/.test(t) ? "#number" : t);

/**
 * Toy embedding: any token containing a digit (E42, 30, 2fa) becomes the single concept "#number", mimicking how
 * embedding models blur rare codes and IDs. For each content word, add weight 1 to the hashed bucket of its concept and 0.3 to each hashed
 * character trigram of the word (spelling similarity), with a ±1 sign from the hash; then L2-normalise.
 */
export function embed(text: string): Float64Array {
  const v = new Float64Array(DIM);
  for (const t of terms(text)) {
    const c = concept(t);
    const h = fnv(c);
    v[h % DIM] += h & 1 ? 1 : -1;
    if (!c.startsWith("#")) {
      const w = `<${t}>`;
      for (let i = 0; i + 3 <= w.length; i++) {
        const g = fnv(w.slice(i, i + 3));
        v[g % DIM] += (g & 2 ? 0.3 : -0.3);
      }
    }
  }
  let n = 0;
  for (let i = 0; i < DIM; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= n;
  return v;
}

export function cosine(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Ranks (1-based) of items under descending scores; ties broken by index. */
export function rankOrder(scores: number[]): number[] {
  return scores.map((s, i) => ({ s, i })).sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.i);
}

/** Reciprocal Rank Fusion: score(d) = Σ_m 1 / (k + rank_m(d)). */
export function rrf(orders: number[][], n: number, k = 60): number[] {
  const s = new Array<number>(n).fill(0);
  for (const o of orders) o.forEach((doc, idx) => (s[doc] += 1 / (k + idx + 1)));
  return s;
}
