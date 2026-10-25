// Parameter count of a decoder-only transformer from its shape (Llama-style: RMSNorm, no biases, optional SwiGLU).
// Params: dModel 256–16384, layers 1–128, heads 1–128, kvHeads 1–128, ffnHidden 256–65536, vocab 1000–262144 (log),
// gated (toggle: SwiGLU 3 matrices vs plain 2-matrix MLP), tied (toggle: LM head shares the embedding matrix).
// Metrics: paramsB (total, billions), weightsGB (bf16, 2 bytes/param), embeddingShare (fraction in embeddings + LM head),
// ffnShare (fraction in MLPs), headDim (dModel / heads).
import { BarChart, StackBar } from "../ui";
import { bool, num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV, Presets } from "./viz";
import { GB, human, round } from "./lib";

export function breakdown(p: Params) {
  const d = num(p, "dModel"), L = Math.round(num(p, "layers")), h = Math.max(1, Math.round(num(p, "heads")));
  const kvh = Math.max(1, Math.min(h, Math.round(num(p, "kvHeads"))));
  const f = num(p, "ffnHidden"), V = Math.round(num(p, "vocab"));
  const hd = d / h;
  const attn = d * d /* Wq */ + 2 * d * kvh * hd /* Wk, Wv */ + d * d; /* Wo */
  const ffn = (bool(p, "gated") ? 3 : 2) * d * f;
  const norms = 2 * d;
  const embed = V * d;
  const head = bool(p, "tied") ? 0 : V * d;
  const total = L * (attn + ffn + norms) + d + embed + head;
  return { d, L, h, kvh, hd, f, V, attn, ffn, norms, embed, head, total };
}

function compute(p: Params) {
  const b = breakdown(p);
  return { paramsB: b.total / 1e9, weightsGB: (b.total * 2) / GB, embeddingShare: (b.embed + b.head) / b.total, ffnShare: (b.L * b.ffn) / b.total, headDim: b.hd };
}

const PRESETS = [
  { label: "GPT-2 small", values: { dModel: 768, layers: 12, heads: 12, kvHeads: 12, ffnHidden: 3072, vocab: 50257, gated: false, tied: true } },
  { label: "Llama-2-7B", values: { dModel: 4096, layers: 32, heads: 32, kvHeads: 32, ffnHidden: 11008, vocab: 32000, gated: true, tied: false } },
  { label: "Llama-3-8B", values: { dModel: 4096, layers: 32, heads: 32, kvHeads: 8, ffnHidden: 14336, vocab: 128256, gated: true, tied: false } },
  { label: "Llama-3-70B", values: { dModel: 8192, layers: 80, heads: 64, kvHeads: 8, ffnHidden: 28672, vocab: 128256, gated: true, tied: false } },
];

function View({ params, setParam }: SimViewProps) {
  const b = breakdown(params);
  return (
    <>
      <Presets items={PRESETS} onPick={(v) => Object.entries(v).forEach(([k, x]) => setParam(k, x))} />
      <Caption>Where the {human(b.total)} parameters live</Caption>
      <StackBar
        parts={[
          { label: "attention", value: b.L * b.attn / 1e9, color: "var(--blue)" },
          { label: "MLP", value: b.L * b.ffn / 1e9, color: "var(--accent)" },
          { label: "embeddings", value: b.embed / 1e9, color: "var(--purple)" },
          { label: "LM head", value: b.head / 1e9, color: "var(--yellow)" },
          { label: "norms", value: (b.L * b.norms + b.d) / 1e9, color: "var(--green)" },
        ]}
        format="num"
      />
      <Caption>One block (millions of parameters), × {b.L} layers</Caption>
      <BarChart
        format="num"
        bars={[
          { label: "W_Q", value: (b.d * b.d) / 1e6, color: "var(--blue)" },
          { label: "W_K", value: (b.d * b.kvh * b.hd) / 1e6, color: "var(--blue)" },
          { label: "W_V", value: (b.d * b.kvh * b.hd) / 1e6, color: "var(--blue)" },
          { label: "W_O", value: (b.d * b.d) / 1e6, color: "var(--blue)" },
          ...(bool(params, "gated") ? [{ label: "gate", value: (b.d * b.f) / 1e6, color: "var(--accent)" }] : []),
          { label: "up", value: (b.d * b.f) / 1e6, color: "var(--accent)" },
          { label: "down", value: (b.d * b.f) / 1e6, color: "var(--accent)" },
        ]}
        height={180}
      />
      <KV
        rows={[
          ["head dim d/h", round(b.hd, 2)],
          ["query heads per KV head", round(b.h / b.kvh, 2)],
          ["per block", human(b.attn + b.ffn + b.norms)],
          ["FFN ratio f/d", round(b.f / b.d, 2)],
        ]}
      />
    </>
  );
}

const D = { dModel: 4096, layers: 32, heads: 32, kvHeads: 32, ffnHidden: 11008, vocab: 32000, gated: true, tied: false };
const db = breakdown(D);
const l3 = breakdown(PRESETS[2].values);

export const transformerParams: SimDef = {
  id: "transformer-params",
  title: "Counting a transformer's parameters",
  summary: "Set width, depth, heads, FFN size and vocabulary and see exactly where the billions of parameters come from; reproduce Llama-2-7B to the parameter.",
  module: "model-foundations",
  tags: ["transformer", "parameters", "attention", "MLP", "GQA", "embeddings"],
  params: [
    { key: "dModel", label: "Width d_model", kind: "range", min: 256, max: 16384, step: 128 },
    { key: "layers", label: "Layers L", kind: "range", min: 1, max: 128, step: 1 },
    { key: "heads", label: "Query heads h", kind: "range", min: 1, max: 128, step: 1 },
    { key: "kvHeads", label: "KV heads", kind: "range", min: 1, max: 128, step: 1, help: "= h for MHA, < h for GQA, 1 for MQA (capped at h)" },
    { key: "ffnHidden", label: "FFN hidden f", kind: "range", min: 256, max: 65536, step: 256 },
    { key: "vocab", label: "Vocabulary V", kind: "range", min: 1000, max: 262144, step: 1, log: true },
    { key: "gated", label: "Gated MLP (SwiGLU)", kind: "toggle" },
    { key: "tied", label: "Tie LM head to embeddings", kind: "toggle" },
  ],
  defaults: D,
  metrics: [
    { key: "paramsB", label: "Parameters (B)", format: "num" },
    { key: "weightsGB", label: "Weights in bf16", format: "gb" },
    { key: "embeddingShare", label: "In embeddings + head", format: "pct" },
    { key: "ffnShare", label: "In MLPs", format: "pct" },
    { key: "headDim", label: "Head dim", format: "num" },
  ],
  compute,
  View,
  math: `A Llama-style block has no biases, so every parameter is a matrix entry (plus two RMSNorm gain vectors). With width $d$, $h$ query heads, $h_{kv}$ key/value heads, head dim $d_h = d/h$, FFN width $f$, vocabulary $V$ and $L$ layers:

| part | parameters |
|---|---|
| $W_Q$, $W_O$ | $d\\cdot d$ each |
| $W_K$, $W_V$ | $d\\cdot h_{kv} d_h$ each (smaller under GQA) |
| MLP | $3df$ gated (gate, up, down) or $2df$ plain |
| norms | $2d$ per block, $+d$ final |
| embeddings | $Vd$ |
| LM head | $Vd$ (0 if tied) |

$$N = L\\big(2d^2 + 2d\\,h_{kv}d_h + 3df + 2d\\big) + d + Vd\\,(2 - \\text{tied})$$

Memory for the weights alone is $2N$ bytes in bf16. Rule of thumb: for plain MHA with $f = 4d$, $N \\approx 12 L d^2$.

**Defaults = Llama-2-7B** ($d$ = 4096, $L$ = 32, $h = h_{kv}$ = 32, $f$ = 11008, $V$ = 32000, untied):
attention $4\\cdot 4096^2 = ${human(db.attn, 3)}$, MLP $3\\cdot 4096\\cdot 11008 = ${human(db.ffn, 3)}$ per block; $32$ blocks $= ${human(db.L * (db.attn + db.ffn + db.norms), 3)}$; embeddings + head $2\\cdot 32000\\cdot 4096 = ${human(db.embed + db.head, 3)}$.
Total $N = ${db.total.toLocaleString("en-US")}$ ≈ ${round(db.total / 1e9, 2)} B, exactly Meta's published 6.74 B, i.e. ${round((db.total * 2) / GB, 1)} GiB in bf16.

**Llama-3-8B** keeps $d$ and $L$ but uses GQA ($h_{kv} = 8$ shrinks $W_K, W_V$ 4×), $f$ = 14336 and $V$ = 128256: ${round(l3.total / 1e9, 2)} B, of which ${round(((l3.embed + l3.head) / l3.total) * 100, 1)}% is embeddings + head.`,
  explain: (_p, m) =>
    `${m.paramsB.toFixed(2)} B parameters (${m.weightsGB.toFixed(1)} GB in bf16): ${Math.round(m.ffnShare * 100)}% in the MLPs, ${Math.round(m.embeddingShare * 100)}% in embeddings and the output head${m.embeddingShare > 0.2 ? ", a big share, typical of small models with large vocabularies" : ""}.`,
};
