// Chunking a document for retrieval: fixed windows vs sentence packing vs heading-aware packing, with overlap.
// Metric keys: chunks, avgChunkTokens, splitFacts (of 6 key facts, how many no single chunk contains whole),
//              indexTokens (tokens stored, overlap counted twice), overheadPct (indexTokens / document tokens − 1).
// Tokens are approximated as words.
import { C } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, SvgBox, Pill } from "./viz";
import { box, mono } from "./styles";
import { DOC, FACTS } from "./chunk-doc";
import { big, pc, r } from "./lib";

type Unit = { start: number; end: number; heading: boolean; section: number };

/** Parse once: global word list, sentence/heading units, section titles, fact word ranges. */
function parse() {
  const words: string[] = [];
  const units: Unit[] = [];
  const sections: { title: string; start: number }[] = [];
  for (const line of DOC.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("## ")) {
      const w = t.slice(3).split(/\s+/);
      sections.push({ title: t.slice(3), start: words.length });
      units.push({ start: words.length, end: words.length + w.length, heading: true, section: sections.length - 1 });
      words.push(...w);
      continue;
    }
    for (const s of t.split(/(?<=[.!?])\s+/)) {
      const w = s.split(/\s+/).filter(Boolean);
      units.push({ start: words.length, end: words.length + w.length, heading: false, section: sections.length - 1 });
      words.push(...w);
    }
  }
  const facts = FACTS.map((f) => {
    const fw = f.text.split(/\s+/);
    let at = -1;
    for (let i = 0; i + fw.length <= words.length && at < 0; i++) if (fw.every((w, j) => words[i + j] === w)) at = i;
    return { ...f, start: at, end: at + fw.length };
  });
  return { words, units, sections, facts };
}
const P = parse();
export const DOC_TOKENS = P.words.length;

export type Chunk = { start: number; end: number };

function packUnits(units: Unit[], size: number, overlap: number, out: Chunk[]) {
  let i = 0;
  const len = (u: Unit) => u.end - u.start;
  while (i < units.length) {
    let j = i, count = 0;
    while (j < units.length && (count + len(units[j]) <= size || j === i)) count += len(units[j++]);
    out.push({ start: units[i].start, end: units[j - 1].end });
    if (j >= units.length) break;
    let back = j, ov = 0;
    while (back - 1 > i && !units[back - 1].heading && ov + len(units[back - 1]) <= overlap) ov += len(units[--back]);
    i = back;
  }
}

export function makeChunks(strategy: string, size: number, overlap: number): Chunk[] {
  const W = P.words.length;
  const ov = Math.min(overlap, size - 1);
  const out: Chunk[] = [];
  if (strategy === "fixed") {
    const stride = Math.max(1, size - ov);
    for (let s = 0; s < W; s += stride) {
      out.push({ start: s, end: Math.min(W, s + size) });
      if (s + size >= W) break;
    }
  } else if (strategy === "sentence") {
    packUnits(P.units, size, ov, out);
  } else {
    P.sections.forEach((_, si) => packUnits(P.units.filter((u) => u.section === si), size, ov, out));
  }
  return out;
}

function model(p: Params) {
  const chunks = makeChunks(str(p, "strategy"), num(p, "chunkSize"), num(p, "overlap"));
  const facts = P.facts.map((f) => ({ ...f, intact: chunks.some((c) => c.start <= f.start && c.end >= f.end), touching: chunks.map((c, i) => (c.start < f.end && c.end > f.start ? i : -1)).filter((i) => i >= 0) }));
  const indexTokens = chunks.reduce((a, c) => a + c.end - c.start, 0);
  return { chunks, facts, indexTokens, W: P.words.length };
}

function compute(p: Params) {
  const m = model(p);
  return {
    chunks: m.chunks.length,
    avgChunkTokens: m.indexTokens / m.chunks.length,
    splitFacts: m.facts.filter((f) => !f.intact).length,
    indexTokens: m.indexTokens,
    overheadPct: m.indexTokens / m.W - 1,
  };
}

const TONES = [C.accent, C.green, C.blue, C.purple, C.yellow, C.red];

function View({ params }: SimViewProps) {
  const m = model(params);
  const W = m.W;
  return (
    <>
      <Caption>The document as a line of {big(W)} tokens: chunks (two lanes so overlaps show), headings (ticks) and key facts</Caption>
      <SvgBox height={118} label="chunk map">
        {(w) => {
          const pad = 6;
          const sx = (i: number) => pad + (i / W) * (w - 2 * pad);
          return (
            <>
              {P.sections.map((s) => (
                <g key={s.start}>
                  <line x1={sx(s.start)} x2={sx(s.start)} y1={0} y2={62} stroke={C.muted} strokeDasharray="2 2" />
                </g>
              ))}
              {m.chunks.map((c, i) => (
                <rect key={i} x={sx(c.start)} y={6 + (i % 2) * 24} width={Math.max(1.5, sx(c.end) - sx(c.start) - 1)} height={20} rx={4} fill={TONES[i % TONES.length]} fillOpacity={0.55} />
              ))}
              {m.facts.map((f, i) => (
                <g key={f.id}>
                  <rect x={sx(f.start)} y={70 + (i % 2) * 12} width={Math.max(3, sx(f.end) - sx(f.start))} height={9} rx={3} fill={f.intact ? C.green : C.red} />
                </g>
              ))}
              {m.chunks.slice(1).map((c, i) => (
                <line key={`b${i}`} x1={sx(c.start)} x2={sx(c.start)} y1={66} y2={96} stroke="var(--text)" strokeOpacity={0.25} />
              ))}
              <text x={pad} y={112} className="axis">start</text>
              <text x={w - pad} y={112} textAnchor="end" className="axis">end</text>
            </>
          );
        }}
      </SvgBox>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {m.facts.map((f) => (
          <Pill key={f.id} color={f.intact ? C.green : C.red}>{f.intact ? "✓" : "✂"} {f.label}{f.intact ? "" : ` (chunks ${f.touching.map((t) => t + 1).join("+")})`}</Pill>
        ))}
      </div>
      <Caption>Chunks ({m.chunks.length})</Caption>
      <div style={{ ...box, maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, fontSize: "0.78rem" }}>
        {m.chunks.map((c, i) => {
          const txt = P.words.slice(c.start, c.end);
          const inside = m.facts.filter((f) => f.touching.includes(i));
          return (
            <div key={i} style={{ borderLeft: `4px solid ${TONES[i % TONES.length]}`, paddingLeft: 8 }}>
              <span style={{ ...mono, color: "var(--muted)" }}>#{i + 1} · {c.end - c.start} tok · </span>
              <span>{txt.slice(0, 12).join(" ")}{txt.length > 18 ? " … " + txt.slice(-6).join(" ") : " " + txt.slice(12).join(" ")}</span>
              {inside.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  {inside.map((f) => {
                    const whole = c.start <= f.start && c.end >= f.end;
                    return <Pill key={f.id} color={whole ? C.green : C.red}>{whole ? "whole" : "part"}: {f.label}</Pill>;
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

const defaults = { strategy: "fixed", chunkSize: 120, overlap: 0 };
const d = model(defaults);
const dm = compute(defaults);
const dh = compute({ strategy: "heading", chunkSize: 120, overlap: 0 });
const dh150 = compute({ strategy: "heading", chunkSize: 150, overlap: 0 });
const dov = compute({ strategy: "fixed", chunkSize: 120, overlap: 20 });

export const chunking: SimDef = {
  id: "chunking",
  title: "Chunking a document: size, overlap and boundaries",
  summary: "Split a 1,400-word admin guide into chunks three ways and see which of six key facts get cut in half, how many chunks you store and how much overlap inflates the index.",
  module: "retrieval-and-rag",
  tags: ["chunking", "overlap", "indexing", "RAG"],
  params: [
    { key: "strategy", label: "Strategy", kind: "select", options: [{ value: "fixed", label: "Fixed windows" }, { value: "sentence", label: "Sentence packing" }, { value: "heading", label: "Heading-aware" }] },
    { key: "chunkSize", label: "Chunk size", kind: "range", min: 30, max: 600, step: 10, unit: "tok" },
    { key: "overlap", label: "Overlap", kind: "range", min: 0, max: 150, step: 5, unit: "tok" },
  ],
  defaults,
  metrics: [
    { key: "chunks", label: "Chunks", format: "int" },
    { key: "avgChunkTokens", label: "Avg tokens / chunk", format: "num" },
    { key: "splitFacts", label: "Facts split (of 6)", format: "int" },
    { key: "indexTokens", label: "Tokens indexed", format: "int" },
    { key: "overheadPct", label: "Overlap overhead", format: "pct" },
  ],
  compute,
  View,
  math: `The document has $W = ${big(d.W)}$ tokens (≈ words here). Let $s$ be the chunk size and $o$ the overlap.

**Fixed windows** start every $s - o$ tokens, so
$$n_{chunks} = \\left\\lceil \\frac{W - s}{s - o} \\right\\rceil + 1, \\qquad \\text{indexed tokens} \\approx W\\,\\frac{s}{s-o}$$
Boundaries ignore sentences. A fact of $L \\le s$ tokens at a random position is split (no chunk holds all of it) with probability about $\\min\\big(1, (L - o)^+/(s - o)\\big)$: bigger chunks and more overlap cut fewer facts, and $o \\ge L$ guarantees none are cut.

**Sentence packing** adds whole sentences while the chunk stays $\\le s$, then starts the next chunk with trailing sentences totalling $\\le o$ tokens. **Heading-aware** does the same but never lets a chunk cross a \`##\` heading, so each chunk stays on one topic (and is easier to cite).

A fact is **split** if no single chunk contains it whole: then a retriever can only return half the answer.

**Worked example (defaults: fixed, $s = 120$, $o = 0$)**: $n = \\lceil (${d.W} - 120)/120 \\rceil + 1 = ${dm.chunks}$ chunks, average ${r(dm.avgChunkTokens, 1)} tokens, ${big(dm.indexTokens)} tokens indexed (overhead ${pc(dm.overheadPct)}). ${dm.splitFacts} of 6 facts are cut: ${d.facts.filter((f) => !f.intact).map((f) => `*${f.label}*`).join(", ") || "none"}.
Adding $o = 20$ overlap gives ${dov.chunks} chunks, ${dov.splitFacts} split facts and ${pc(dov.overheadPct)} more tokens to embed and store. Heading-aware packing at $s = 120$ gives ${dh.chunks} chunks with ${dh.splitFacts} split (a two-sentence fact can still be cut between its sentences); at $s = 150$ it keeps whole sections together: ${dh150.chunks} chunks, ${dh150.splitFacts} split. Overlap is not monotone: shifting boundaries can rescue one fact and cut another.`,
  explain: (_p, m) =>
    m.splitFacts > 0
      ? `${m.splitFacts} of 6 key facts straddle a chunk boundary, so no single retrieved chunk can answer those questions. Try sentence or heading boundaries, or add overlap${m.overheadPct > 0.005 ? ` (already +${(m.overheadPct * 100).toFixed(0)}% index size)` : ""}.`
      : `Every key fact sits whole inside some chunk, using ${m.chunks} chunks and ${Math.round(m.indexTokens).toLocaleString("en-US")} indexed tokens (${(m.overheadPct * 100).toFixed(0)}% overlap overhead).`,
};
