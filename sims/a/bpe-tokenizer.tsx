// Byte-pair encoding trained on your own text.
// Params: text (multiline text), merges 0–300, pretokenize (toggle: split into words first, GPT-2 style).
// Metrics: tokens (tokens for the text), chars (characters), charsPerToken (compression), vocabSize (base symbols + merges
// learned), mergesApplied (merges actually learned; training stops early when no pair repeats).
import { LineChart, TokenStrip } from "../ui";
import { bool, num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, HBars } from "./viz";
import { memo, round } from "./lib";

const PRE = / ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

export const DEFAULT_TEXT =
  "the cat sat on the mat. the dog sat on the log. then the cat and the dog sat together on the mat, and that was that.";

export const trainBpe = memo((p: Params) => {
  const text = str(p, "text");
  const maxMerges = Math.max(0, Math.round(num(p, "merges")));
  const pieces = bool(p, "pretokenize") ? text.match(PRE) ?? [] : text.length ? [text] : [];
  // unique pre-tokens with counts; each is a list of symbols
  const counts = new Map<string, number>();
  for (const w of pieces) counts.set(w, (counts.get(w) ?? 0) + 1);
  const words = [...counts.entries()].map(([w, c]) => ({ w, syms: Array.from(w), c }));
  const base = [...new Set(Array.from(text))].sort();
  const total = () => words.reduce((s, w) => s + w.syms.length * w.c, 0);
  const merges: { a: string; b: string; count: number }[] = [];
  const curve = [total()];
  for (let k = 0; k < maxMerges; k++) {
    const pc = new Map<string, number>();
    for (const w of words) for (let i = 0; i + 1 < w.syms.length; i++) {
      const key = w.syms[i] + "\u0000" + w.syms[i + 1];
      pc.set(key, (pc.get(key) ?? 0) + w.c);
    }
    let best = "", bc = 0;
    for (const [key, c] of pc) if (c > bc || (c === bc && key < best)) { best = key; bc = c; }
    if (bc < 2) break; // merging a pair seen once saves nothing worth a vocab slot
    const [a, b] = best.split("\u0000");
    for (const w of words) {
      const out: string[] = [];
      for (let i = 0; i < w.syms.length; i++) {
        if (i + 1 < w.syms.length && w.syms[i] === a && w.syms[i + 1] === b) { out.push(a + b); i++; } else out.push(w.syms[i]);
      }
      w.syms = out;
    }
    merges.push({ a, b, count: bc });
    curve.push(total());
  }
  const vocab = new Map<string, number>();
  base.forEach((s, i) => vocab.set(s, i));
  merges.forEach((m, i) => vocab.set(m.a + m.b, base.length + i));
  const seg = new Map(words.map((w) => [w.w, w.syms]));
  const tokens = pieces.flatMap((w) => seg.get(w) ?? []);
  const chars = Array.from(text).length;
  return {
    merges, curve, base,
    tokens: tokens.map((t) => ({ text: t, id: vocab.get(t) ?? -1 })),
    metrics: { tokens: tokens.length, chars, charsPerToken: tokens.length ? chars / tokens.length : 0, vocabSize: base.length + merges.length, mergesApplied: merges.length },
  };
});

const compute = (p: Params) => trainBpe(p).metrics;

const show = (s: string) => s.replace(/ /g, "␣").replace(/\n/g, "↵");

function View({ params }: SimViewProps) {
  const r = trainBpe(params);
  const lim = r.merges.slice(0, 14);
  return (
    <>
      <Caption>Your text, split into the learned tokens (subscript = token id; ids below {r.base.length} are single characters).</Caption>
      <TokenStrip tokens={r.tokens.slice(0, 400).map((t) => ({ text: t.text, id: t.id, tone: t.id }))} />
      {r.tokens.length > 400 && <span className="muted small">…first 400 of {r.tokens.length} tokens shown</span>}
      <Caption>First merges learned (most frequent adjacent pair each round, with how often it occurred)</Caption>
      {lim.length ? (
        <HBars bars={lim.map((m, i) => ({ label: `${i + 1}. ${show(m.a)} + ${show(m.b)} → ${show(m.a + m.b)}`, value: m.count, note: `×${m.count}` }))} />
      ) : (
        <span className="muted small">No merges yet: every character is its own token.</span>
      )}
      <LineChart
        x={r.curve.map((_, i) => i)}
        series={[{ name: "chars per token", values: r.curve.map((t) => (t ? r.metrics.chars / t : 0)) }]}
        xLabel="merges learned"
        yLabel="chars per token"
        marker={r.curve.length - 1}
        height={170}
      />
    </>
  );
}

const D = { text: DEFAULT_TEXT, merges: 20, pretokenize: true };
const dr = trainBpe(D);
const dm = dr.metrics;
const firstMerges = dr.merges.slice(0, 3).map((m) => `\`${show(m.a)}\` + \`${show(m.b)}\` (×${m.count})`).join(", ");

export const bpeTokenizer: SimDef = {
  id: "bpe-tokenizer",
  title: "Byte-pair encoding: learn a tokenizer from your text",
  summary: "Train BPE merges on any text and watch characters fuse into sub-word tokens as the vocabulary grows and the token count drops.",
  module: "model-foundations",
  tags: ["tokenizer", "BPE", "byte-pair encoding", "vocabulary", "compression"],
  params: [
    { key: "text", label: "Training text", kind: "text", multiline: true, help: "the tokenizer is trained on this text and then encodes it" },
    { key: "merges", label: "Merges to learn", kind: "range", min: 0, max: 300, step: 1 },
    { key: "pretokenize", label: "Split into words first", kind: "toggle", help: "GPT-2 style: merges never cross word boundaries; a leading space sticks to its word" },
  ],
  defaults: D,
  metrics: [
    { key: "tokens", label: "Tokens", format: "int" },
    { key: "chars", label: "Characters", format: "int" },
    { key: "charsPerToken", label: "Chars per token", format: "num" },
    { key: "vocabSize", label: "Vocabulary size", format: "int" },
  ],
  compute,
  View,
  math: `**Byte-pair encoding** (Sennrich et al. 2016; GPT-2 runs it on raw bytes) builds a vocabulary bottom-up:

1. Start with every distinct symbol as a token. Here the symbols are characters (a byte-level tokenizer starts from all 256 byte values, so it can encode *any* string).
2. Optionally **pre-tokenize**: split the text into word-like pieces, ${"`"} ?letters${"`"}, ${"`"} ?digits${"`"}, ${"`"} ?punctuation${"`"}, whitespace, so merges never cross words.
3. Count every adjacent pair $(a,b)$ across the corpus, weighted by how often each piece occurs: $\\text{count}(a,b) = \\sum_{w} f(w)\\,\\#\\{i: w_i=a, w_{i+1}=b\\}$.
4. Merge the most frequent pair everywhere into a new token $ab$ (ties broken alphabetically), add it to the vocabulary, repeat.

Each merge removes up to $\\text{count}(a,b)$ tokens, so the sequence shrinks fastest at the start and then flattens: common words become one token, rare words stay in pieces. After $M$ merges:

$$|V| = |V_{\\text{base}}| + M, \\qquad \\text{compression} = \\frac{\\text{characters}}{\\text{tokens}}$$

Training stops early when no pair occurs at least twice. Encoding new text replays the merges in the order they were learned.

**Defaults** (the cat/dog text, ${D.merges} merges, word split on): the first merges are ${firstMerges}. Base symbols: ${dr.base.length}, merges learned: ${dm.mergesApplied}, so $|V| = ${dm.vocabSize}$. The ${dm.chars} characters become ${dm.tokens} tokens: ${round(dm.charsPerToken, 2)} characters per token. Real English tokenizers with ~100k merges trained on terabytes reach ≈ 4 characters per token.`,
  explain: (p, m) =>
    m.mergesApplied < num(p, "merges")
      ? `Training stopped after ${m.mergesApplied} merges: no adjacent pair appears twice any more. Each token now covers ${m.charsPerToken.toFixed(2)} characters on average.`
      : `${m.mergesApplied} merges grew the vocabulary to ${m.vocabSize} and cut ${m.chars} characters to ${m.tokens} tokens (${m.charsPerToken.toFixed(2)} chars/token). More merges = bigger vocabulary, shorter sequences.`,
};
