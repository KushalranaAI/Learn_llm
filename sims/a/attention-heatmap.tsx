// Scaled dot-product attention on a short sentence with small hand-designed query/key vectors (d_k = 8).
// Params: sentence (cat | keys | fox), head (previous | subject | nouns | same | uniform), causal (toggle),
// scale 0.1–4 (multiplies the logits; 1 = the standard 1/√d_k), query 0–10 (which token's row to inspect).
// Metrics: maxWeight (largest weight in the inspected row), entropyBits (that row's entropy), argmaxPos (position it attends
// to most, 0-based), meanEntropyBits (average entropy over all rows).
import NeuralNetDiagram from "../nn-diagram";
import { Heatmap, TokenStrip, useWidth } from "../ui";
import { bool, num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, HBars } from "./viz";
import { entropyBits, memo, mulberry32, round, softmax } from "./lib";

const DK = 8;
// role features: [subject, noun, verb, det, prep, pron, adj, conj]
const ROLE: Record<string, number> = { subj: 0, noun: 1, verb: 2, det: 3, prep: 4, pron: 5, adj: 6, conj: 7 };
type Tok = { w: string; role: keyof typeof ROLE };

export const SENTENCES: Record<string, { label: string; toks: Tok[] }> = {
  cat: {
    label: "The cat sat on the mat because it was tired",
    toks: [
      { w: "The", role: "det" }, { w: "cat", role: "subj" }, { w: "sat", role: "verb" }, { w: "on", role: "prep" }, { w: "the", role: "det" },
      { w: "mat", role: "noun" }, { w: "because", role: "conj" }, { w: "it", role: "pron" }, { w: "was", role: "verb" }, { w: "tired", role: "adj" },
    ],
  },
  keys: {
    label: "The keys to the cabinet are on the table",
    toks: [
      { w: "The", role: "det" }, { w: "keys", role: "subj" }, { w: "to", role: "prep" }, { w: "the", role: "det" }, { w: "cabinet", role: "noun" },
      { w: "are", role: "verb" }, { w: "on", role: "prep" }, { w: "the", role: "det" }, { w: "table", role: "noun" },
    ],
  },
  fox: {
    label: "the quick brown fox jumps over the lazy dog",
    toks: [
      { w: "the", role: "det" }, { w: "quick", role: "adj" }, { w: "brown", role: "adj" }, { w: "fox", role: "subj" }, { w: "jumps", role: "verb" },
      { w: "over", role: "prep" }, { w: "the", role: "det" }, { w: "lazy", role: "adj" }, { w: "dog", role: "noun" },
    ],
  },
};

export const HEADS: Record<string, string> = {
  previous: "Previous token (positional)",
  subject: "Subject finder (verbs & pronouns → subject)",
  nouns: "Noun seeker (everyone → nouns)",
  same: "Same word (repeated tokens)",
  uniform: "Uniform (q = 0)",
};

const OMEGA = [2.0, 1.3, 0.7, 0.3];
const posVec = (t: number) => OMEGA.flatMap((w) => [Math.cos(w * t), Math.sin(w * t)]);
const roleVec = (r: string) => Array.from({ length: DK }, (_, i) => (i === ROLE[r] ? 1 : 0) + (r === "subj" && i === ROLE.noun ? 1 : 0));
function wordVec(w: string) {
  let h = 0;
  for (const ch of w.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = mulberry32(h);
  const v = Array.from({ length: DK }, () => r() * 2 - 1);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

/** Q and K for every token, for one head. */
export function qk(sentence: string, head: string) {
  const toks = (SENTENCES[sentence] ?? SENTENCES.cat).toks;
  const Q: number[][] = [], K: number[][] = [];
  toks.forEach((t, i) => {
    if (head === "previous") { Q.push(posVec(i - 1).map((x) => 4 * x)); K.push(posVec(i)); }
    else if (head === "subject") {
      const asks = t.role === "verb" || t.role === "pron";
      Q.push(Array.from({ length: DK }, (_, k) => (asks && k === ROLE.subj ? 9 : 0)));
      K.push(roleVec(t.role));
    } else if (head === "nouns") { Q.push(Array.from({ length: DK }, (_, k) => (k === ROLE.noun ? 6 : 0))); K.push(roleVec(t.role)); }
    else if (head === "same") { Q.push(wordVec(t.w).map((x) => 8 * x)); K.push(wordVec(t.w)); }
    else { Q.push(new Array(DK).fill(0)); K.push(roleVec(t.role)); }
  });
  return { toks, Q, K };
}

export const attend = memo((p: Params) => {
  const { toks, Q, K } = qk(str(p, "sentence"), str(p, "head"));
  const causal = bool(p, "causal"), scale = num(p, "scale");
  const n = toks.length;
  const scores = Q.map((q, i) => K.map((k, j) => (causal && j > i ? -Infinity : (scale * q.reduce((s, v, d) => s + v * k[d], 0)) / Math.sqrt(DK))));
  const W = scores.map(softmax);
  const qi = Math.max(0, Math.min(n - 1, Math.round(num(p, "query"))));
  const row = W[qi];
  const argmax = row.indexOf(Math.max(...row));
  return {
    toks, scores, W, qi,
    metrics: { maxWeight: row[argmax], entropyBits: entropyBits(row), argmaxPos: argmax, meanEntropyBits: W.reduce((s, r) => s + entropyBits(r), 0) / n },
  };
});

const compute = (p: Params) => attend(p).metrics;

function View({ params, setParam }: SimViewProps) {
  const r = attend(params);
  const [ref, w] = useWidth(480);
  const n = r.toks.length;
  const labels = r.toks.map((t, i) => `${i}:${t.w}`);
  const cell = Math.max(22, Math.min(42, Math.floor((w - 90) / n)));
  const row = r.W[r.qi];
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Caption>Click a token to inspect its row (the query).</Caption>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {r.toks.map((t, i) => (
          <button key={i} type="button" className="chip-btn" style={{ padding: "2px 8px", fontSize: "0.82rem", outline: i === r.qi ? "2px solid var(--accent)" : undefined }} onClick={() => setParam("query", i)}>
            {t.w}
          </button>
        ))}
      </div>
      <NeuralNetDiagram
        height={Math.max(260, n * 34 + 50)}
        range={[0, Math.max(...row, 1e-9)]}
        caption={`"${r.toks[r.qi].w}" reads from earlier tokens; line thickness = attention weight`}
        layers={[
          { title: "keys / values", nodes: r.toks.map((t, j) => ({ value: row[j], inner: row[j] >= 0.005 ? row[j].toFixed(2) : "·", label: t.w })) },
          { title: "query → output", nodes: r.toks.map((t, j) => ({ value: j === r.qi ? Math.max(...row) : 0, inner: j === r.qi ? "Σ" : "", label: t.w })) },
        ]}
        weights={[r.toks.map((_, q) => (q === r.qi ? row.map((v) => (v < 0.005 ? 0 : v)) : r.toks.map(() => 0)))]}
      />
      <Caption>Attention weights: row = query token, column = key token it reads from. Each row sums to 1.</Caption>
      <Heatmap rows={labels} cols={labels} values={r.W} max={1} cell={cell} showValues={cell >= 34} />
      <Caption>Row &quot;{r.toks[r.qi].w}&quot;: where this token&apos;s output comes from</Caption>
      <HBars bars={row.map((v, j) => ({ label: r.toks[j].w, value: v, note: v.toFixed(3) }))} max={1} highlight={r.metrics.argmaxPos} />
      <TokenStrip tokens={r.toks.map((t, j) => ({ text: t.w, tone: j === r.metrics.argmaxPos ? 0 : 3 }))} highlight={r.qi} />
    </div>
  );
}

const D = { sentence: "cat", head: "subject", causal: true, scale: 1, query: 7 };
const dr = attend(D);
const dm = dr.metrics;
const visible = dr.toks.slice(0, dr.qi + 1).length;

export const attentionHeatmap: SimDef = {
  id: "attention-heatmap",
  title: "Attention: who reads from whom",
  summary: "See softmax(QKᵀ/√d) as a heatmap over a sentence; switch heads, toggle the causal mask and sharpen or flatten the scores.",
  module: "model-foundations",
  tags: ["attention", "softmax", "query", "key", "causal mask", "heads"],
  params: [
    { key: "sentence", label: "Sentence", kind: "select", options: Object.entries(SENTENCES).map(([value, s]) => ({ value, label: s.label })) },
    { key: "head", label: "Head", kind: "select", options: Object.entries(HEADS).map(([value, label]) => ({ value, label })) },
    { key: "causal", label: "Causal mask", kind: "toggle", help: "a token may only read itself and earlier tokens (decoder LLMs)" },
    { key: "scale", label: "Score scale", kind: "range", min: 0.1, max: 4, step: 0.05, help: "multiplies QKᵀ/√d: high = sharp, low = flat (like 1/temperature)" },
    { key: "query", label: "Inspect token #", kind: "range", min: 0, max: 9, step: 1 },
  ],
  defaults: D,
  metrics: [
    { key: "maxWeight", label: "Top weight (row)", format: "num" },
    { key: "entropyBits", label: "Row entropy", format: "num", help: "bits; 0 = all on one token" },
    { key: "argmaxPos", label: "Attends most to #", format: "int" },
    { key: "meanEntropyBits", label: "Mean entropy (all rows)", format: "num" },
  ],
  compute,
  View,
  math: `Each token $i$ has a **query** $\\mathbf q_i$ ("what am I looking for?") and a **key** $\\mathbf k_j$ ("what do I contain?"), both in $\\mathbb R^{d_k}$ (here $d_k = ${DK}$). Attention weights are a softmax over scaled dot products:

$$s_{ij} = c\\,\\frac{\\mathbf q_i\\cdot\\mathbf k_j}{\\sqrt{d_k}}, \\qquad a_{ij} = \\frac{e^{s_{ij}}}{\\sum_{j'} e^{s_{ij'}}}, \\qquad \\mathbf o_i = \\sum_j a_{ij}\\,\\mathbf v_j$$

- $c$ is the **score scale** slider (1 = standard). Dividing by $\\sqrt{d_k}$ keeps dot products of random vectors at unit variance so the softmax doesn't saturate as $d_k$ grows.
- The **causal mask** sets $s_{ij} = -\\infty$ for $j > i$, so $a_{ij} = 0$: a token cannot read the future. That is what lets a decoder train on every position at once.
- Row entropy $H_i = -\\sum_j a_{ij}\\log_2 a_{ij}$: 0 bits = all weight on one token; $\\log_2 n$ = uniform over $n$ tokens.

**How the heads are built.** Real heads learn $\\mathbf q = W_Q\\mathbf x$, $\\mathbf k = W_K\\mathbf x$; here the vectors are hand-designed:
- *Previous token*: $\\mathbf k_j = \\mathbf p(j)$, $\\mathbf q_i = 4\\,\\mathbf p(i-1)$ with $\\mathbf p(t) = [\\cos\\omega_m t, \\sin\\omega_m t]_{m=1..4}$, so $\\mathbf q_i\\cdot\\mathbf k_j = 4\\sum_m\\cos\\omega_m(i-1-j)$ peaks at $j = i-1$ (the same trick RoPE uses: dot products depend on relative position).
- *Subject finder*: keys are one-hot role features [subject, noun, verb, det, prep, pron, adj, conj] (the subject also lights "noun"); verbs and pronouns query the subject feature with strength 9, other tokens have $\\mathbf q = 0$ (uniform).
- *Noun seeker*: every query asks for "noun" with strength 6. *Same word*: q and k are the same random unit vector per word (×8 on q). *Uniform*: $\\mathbf q = 0$ gives $a_{ij} = 1/(\\text{visible tokens})$.

**Defaults** (cat sentence, subject head, causal, $c = 1$, inspecting "it", position ${dr.qi}). "it" asks for the subject: $s = 9\\cdot 1/\\sqrt 8 = ${round(9 / Math.sqrt(8), 3)}$ on "cat", 0 on the other ${visible - 1} visible tokens. So
$$a_{\\text{it},\\text{cat}} = \\frac{e^{${round(9 / Math.sqrt(8), 3)}}}{e^{${round(9 / Math.sqrt(8), 3)}} + ${visible - 1}} = ${round(dm.maxWeight, 3)}$$
row entropy ${round(dm.entropyBits, 3)} bits, mean entropy over all rows ${round(dm.meanEntropyBits, 3)} bits.`,
  explain: (p, m) => {
    const r = attend(p);
    const q = r.toks[r.qi].w, k = r.toks[m.argmaxPos].w;
    return m.maxWeight > 0.6
      ? `"${q}" puts ${Math.round(m.maxWeight * 100)}% of its attention on "${k}": its output is mostly "${k}"'s value vector. Lower the scale to see the focus blur.`
      : `"${q}" spreads its attention (${m.entropyBits.toFixed(2)} bits of entropy, top weight ${Math.round(m.maxWeight * 100)}% on "${k}"): this head has nothing specific to look for from here.`;
  },
};
