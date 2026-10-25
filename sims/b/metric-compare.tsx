// Reference-based scoring: exact match vs token F1 vs embedding similarity on example answer pairs.
// Metric keys: exactMatch (0/1), tokenF1, precision, recall, semanticSim (cosine of toy embeddings).
import { BarChart, Heatmap, TokenStrip, C } from "../ui";
import { bool, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { box } from "./styles";
import { cosine, embed, r } from "./lib";

type Pair = { id: string; label: string; ref: string; ans: string; truth: string };
export const PAIRS: Pair[] = [
  { id: "exact", label: "Identical", ref: "Paris", ans: "Paris", truth: "correct" },
  { id: "case", label: "Case + period", ref: "Ada Lovelace", ans: "ada lovelace.", truth: "correct" },
  { id: "paraphrase", label: "Paraphrase", ref: "The refund window is 30 days.", ans: "You have 30 days to request a refund.", truth: "correct" },
  { id: "synonyms", label: "Synonyms", ref: "Reset your password from the login page.", ans: "Go to the sign-in screen and choose forgot passcode.", truth: "correct" },
  { id: "wrongday", label: "One word wrong", ref: "The meeting was moved to Thursday at 3 pm.", ans: "The meeting was moved to Tuesday at 3 pm.", truth: "wrong" },
  { id: "negation", label: "Negation", ref: "No, the free plan does not include exports.", ans: "Yes, the free plan includes exports.", truth: "wrong" },
];

const ARTICLES = new Set(["a", "an", "the"]);

/** SQuAD-style normalisation: lowercase, strip punctuation and articles. Without it: raw whitespace/punctuation split. */
export function normTokens(s: string, normalise: boolean): string[] {
  if (!normalise) return s.split(/\s+/).filter(Boolean);
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !ARTICLES.has(w));
}

export function scorePair(ref: string, ans: string, normalise: boolean) {
  const rt = normTokens(ref, normalise), at = normTokens(ans, normalise);
  const exactMatch = rt.join(" ") === at.join(" ") ? 1 : 0;
  const counts = new Map<string, number>();
  for (const t of rt) counts.set(t, (counts.get(t) ?? 0) + 1);
  let common = 0;
  const matched: boolean[] = [];
  for (const t of at) {
    const c = counts.get(t) ?? 0;
    matched.push(c > 0);
    if (c > 0) {
      common++;
      counts.set(t, c - 1);
    }
  }
  const precision = at.length ? common / at.length : 0;
  const recall = rt.length ? common / rt.length : 0;
  const tokenF1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const semanticSim = Math.max(0, cosine(embed(ref), embed(ans)));
  return { exactMatch, tokenF1, precision, recall, semanticSim, rt, at, common, matched };
}

function texts(p: Params) {
  const pr = PAIRS.find((x) => x.id === str(p, "pair"));
  return pr ? { ref: pr.ref, ans: pr.ans } : { ref: str(p, "reference"), ans: str(p, "answer") };
}

function compute(p: Params) {
  const { ref, ans } = texts(p);
  const s = scorePair(ref, ans, bool(p, "normalise"));
  return { exactMatch: s.exactMatch, tokenF1: s.tokenF1, precision: s.precision, recall: s.recall, semanticSim: s.semanticSim };
}

function View({ params }: SimViewProps) {
  const norm = bool(params, "normalise");
  const { ref, ans } = texts(params);
  const s = scorePair(ref, ans, norm);
  const refSet = new Set(s.at);
  const all = PAIRS.map((pr) => scorePair(pr.ref, pr.ans, norm));
  return (
    <>
      <Caption>Reference (green = also in the answer)</Caption>
      <div style={box}><TokenStrip tokens={s.rt.map((t) => ({ text: t, tone: refSet.has(t) ? 1 : 5 }))} /></div>
      <Caption>Answer (green = matches a reference token)</Caption>
      <div style={box}><TokenStrip tokens={s.at.map((t, i) => ({ text: t, tone: s.matched[i] ? 1 : 5 }))} /></div>
      <BarChart
        format="pct"
        yMax={1}
        height={170}
        bars={[
          { label: "exact", value: s.exactMatch, color: C.blue },
          { label: "token F1", value: s.tokenF1, color: C.accent },
          { label: "semantic", value: s.semanticSim, color: C.purple },
        ]}
      />
      <Caption>All example pairs (true verdict in brackets): no single metric gets every row right</Caption>
      <Heatmap
        rows={PAIRS.map((pr) => `${pr.label} (${pr.truth === "correct" ? "✓" : "✗"})`)}
        cols={["exact", "F1", "semantic"]}
        values={all.map((x) => [x.exactMatch, x.tokenF1, x.semanticSim])}
        max={1}
        format="num"
        cell={46}
      />
    </>
  );
}

const defaults = { pair: "paraphrase", normalise: true, reference: "The refund window is 30 days.", answer: "Refunds are accepted within 30 days." };
const d = scorePair(PAIRS[2].ref, PAIRS[2].ans, true);

export const metricCompare: SimDef = {
  id: "metric-compare",
  title: "Exact match vs token F1 vs semantic similarity",
  summary: "Score answers against a reference three ways and see where each metric is fooled: paraphrases, synonyms, a single wrong word, a negation.",
  module: "evaluation",
  tags: ["exact match", "F1", "semantic similarity", "reference-based eval"],
  params: [
    { key: "pair", label: "Example pair", kind: "select", options: [...PAIRS.map((x) => ({ value: x.id, label: x.label })), { value: "custom", label: "Custom (type below)" }] },
    { key: "normalise", label: "Normalise text", kind: "toggle", help: "Lowercase, drop punctuation and articles before comparing" },
    { key: "reference", label: "Reference (custom)", kind: "text" },
    { key: "answer", label: "Answer (custom)", kind: "text" },
  ],
  defaults,
  metrics: [
    { key: "exactMatch", label: "Exact match", format: "num" },
    { key: "tokenF1", label: "Token F1", format: "pct" },
    { key: "precision", label: "Token precision", format: "pct" },
    { key: "recall", label: "Token recall", format: "pct" },
    { key: "semanticSim", label: "Semantic similarity", format: "pct" },
  ],
  compute,
  View,
  math: `Let $R$ be the reference tokens and $A$ the answer tokens after normalisation (lowercase, no punctuation, no articles).

**Exact match**: $\\text{EM} = \\mathbb 1[A = R]$.

**Token F1** (bag of words, counting repeats at most as often as they occur in both):
$$P = \\frac{|A \\cap R|}{|A|}, \\quad Rc = \\frac{|A \\cap R|}{|R|}, \\quad F_1 = \\frac{2 P\\, Rc}{P + Rc}$$

**Semantic similarity** is the cosine of two embedding vectors, $\\cos(\\mathbf e_A, \\mathbf e_R) = \\frac{\\mathbf e_A\\cdot\\mathbf e_R}{\\lVert\\mathbf e_A\\rVert\\lVert\\mathbf e_R\\rVert}$. Here the embedding is a toy one: each content word adds a hashed feature for its *concept* (a small synonym table, so "login" and "sign-in" collide) plus hashed character trigrams, then the vector is normalised. Real embedding models learn these similarities.

**Worked example (defaults: the paraphrase pair)**: $R$ = ${d.rt.map((t) => `\`${t}\``).join(" ")} ($|R| = ${d.rt.length}$), $A$ = ${d.at.map((t) => `\`${t}\``).join(" ")} ($|A| = ${d.at.length}$).
Shared tokens: ${d.common}, so $P = ${d.common}/${d.at.length} = ${r(d.precision, 3)}$, $Rc = ${d.common}/${d.rt.length} = ${r(d.recall, 3)}$, $F_1 = ${r(d.tokenF1, 3)}$; EM $= 0$; cosine $= ${r(d.semanticSim, 3)}$.

Lexical metrics punish correct paraphrases; similarity metrics reward fluent answers that are wrong in one crucial word (try *One word wrong* and *Negation*). That is why graded evals often need a rubric or a judge.`,
  explain: (p, m) => {
    const pr = PAIRS.find((x) => x.id === str(p, "pair"));
    const f1 = (m.tokenF1 * 100).toFixed(0), sim = (m.semanticSim * 100).toFixed(0);
    if (m.exactMatch === 1) return "Exact match: every metric agrees this is right.";
    if (pr?.truth === "wrong") return `This answer is wrong, yet token F1 is ${f1}% and similarity ${sim}%: one changed word (a day, a "not") flips the meaning while most tokens still match.`;
    if (pr?.truth === "correct") return `This answer is correct, but exact match gives 0 and token F1 only ${f1}%; similarity (${sim}%) gives more credit to the paraphrase.`;
    return `Exact match ${m.exactMatch}, token F1 ${f1}%, similarity ${sim}%. Decide for yourself whether the answer is right, then see which metric agreed.`;
  },
};
