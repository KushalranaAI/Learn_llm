// BM25 vs dense (toy embedding) vs hybrid (Reciprocal Rank Fusion) over a 12-document help centre.
// Metric keys: recallAtK, mrr (for the chosen preset; NaN for custom queries), meanRecallAtK, meanMrr (over all presets).
import { TokenStrip, C } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, Columns, Pill } from "./viz";
import { box, mono } from "./styles";
import { bm25Idf, bm25Index, bm25Scores, concept, cosine, embed, r, rankOrder, rrf, terms } from "./lib";

export const DOCS: { title: string; body: string }[] = [
  { title: "Reset your password", body: "If you forgot your password, open the sign-in page and choose Forgot password. We email a reset link that works for 30 minutes. Choose a new password with at least 10 characters." },
  { title: "Two-factor authentication", body: "Turn on two-factor authentication in Settings > Security. Scan the QR code with an authenticator app and enter the six-digit code. Keep your backup codes somewhere safe; support cannot bypass 2FA." },
  { title: "Locked out of your account", body: "After five failed sign-in attempts your account is locked for 15 minutes. If you still cannot log in, use password reset or contact support with your account email." },
  { title: "Refund policy", body: "Annual plans can be refunded in full within 30 days of purchase. Monthly plans are not refunded, but you keep access until the end of the billing period. Refunds go to the original card in 5 to 10 business days." },
  { title: "Cancel your subscription", body: "To cancel, go to Settings > Billing and choose Cancel plan. Your notes stay available on the Free plan. You can resubscribe at any time." },
  { title: "Update payment method", body: "Change the card used for billing in Settings > Billing > Payment method. Invoices are emailed on the first day of each billing cycle and can be downloaded as PDF." },
  { title: "Export your notes", body: "Export all notes as Markdown or PDF from File > Export. Large workspaces are exported in the background and we email a download link. Exports include attachments up to 2 GB." },
  { title: "Sync troubleshooting", body: "If notes are not syncing between devices, check that every device is signed in to the same workspace and is online. Sync error E42 means the local database is out of date: update the app and restart it." },
  { title: "Offline mode", body: "Quillnote works without an internet connection. Edits made offline are stored on the device and sync automatically when the connection returns. Error E17 means the app could not reach the server; your edits are safe. Conflicts are saved as a copy of the note." },
  { title: "Sharing and collaboration", body: "Invite teammates from the Share button. Editors can change a note, viewers can only read and comment. Free workspaces allow up to three members." },
  { title: "Storage limits", body: "The Free plan includes 1 GB of storage and the Pro plan 100 GB. When storage is full you can still read notes but cannot upload attachments." },
  { title: "Delete your account", body: "Deleting your account permanently erases all notes after a 14-day grace period. Export your notes first. During the grace period you can restore the account from the sign-in page." },
];

export const PRESETS: { id: string; q: string; rel: number[]; note: string }[] = [
  { id: "forgot", q: "forgot password reset link", rel: [0], note: "keywords match the document" },
  { id: "e42", q: "what is E42", rel: [7], note: "an exact code: keyword search shines" },
  { id: "getin", q: "I can't get into my account", rel: [2, 0], note: "paraphrase: no 'locked' or 'password'" },
  { id: "money", q: "how do I get my money back", rel: [3], note: "paraphrase of 'refund'" },
  { id: "stop", q: "stop paying for the subscription", rel: [4], note: "synonyms: stop = cancel" },
  { id: "wifi", q: "does it work without wifi", rel: [8], note: "wifi is never mentioned" },
];

const TEXTS = DOCS.map((d) => `${d.title}. ${d.body}`);
const IX = bm25Index(TEXTS);
const DOC_VECS = TEXTS.map(embed);

export type Ranked = { doc: number; score: number }[];

export function rankAll(query: string, k1: number, b: number) {
  const bs = bm25Scores(IX, query, k1, b);
  const bm25 = rankOrder(bs).filter((i) => bs[i] > 0).map((doc) => ({ doc, score: bs[doc] }));
  const qv = embed(query);
  const ds = DOC_VECS.map((v) => cosine(qv, v));
  const dense = rankOrder(ds).map((doc) => ({ doc, score: ds[doc] }));
  const fs = rrf([bm25.map((x) => x.doc), dense.map((x) => x.doc)], DOCS.length, 60);
  const hybrid = rankOrder(fs).filter((i) => fs[i] > 0).map((doc) => ({ doc, score: fs[doc] }));
  return { bm25, dense, hybrid };
}

export function evalRanking(list: Ranked, rel: number[], k: number) {
  const top = list.slice(0, k).map((x) => x.doc);
  const recall = rel.filter((d) => top.includes(d)).length / rel.length;
  const first = list.findIndex((x) => rel.includes(x.doc));
  return { recall, mrr: first >= 0 ? 1 / (first + 1) : 0 };
}

type Method = "bm25" | "dense" | "hybrid";

function compute(p: Params) {
  const k = num(p, "k"), k1 = num(p, "k1"), b = num(p, "b");
  const method = str(p, "method") as Method;
  const preset = PRESETS.find((x) => x.id === str(p, "preset"));
  const q = preset ? preset.q : str(p, "query");
  const all = PRESETS.map((pr) => evalRanking(rankAll(pr.q, k1, b)[method], pr.rel, k));
  const cur = preset ? evalRanking(rankAll(q, k1, b)[method], preset.rel, k) : { recall: NaN, mrr: NaN };
  return {
    recallAtK: cur.recall,
    mrr: cur.mrr,
    meanRecallAtK: all.reduce((a, x) => a + x.recall, 0) / all.length,
    meanMrr: all.reduce((a, x) => a + x.mrr, 0) / all.length,
  };
}

function View({ params }: SimViewProps) {
  const k = num(params, "k");
  const method = str(params, "method");
  const preset = PRESETS.find((x) => x.id === str(params, "preset"));
  const q = preset ? preset.q : str(params, "query");
  const res = rankAll(q, num(params, "k1"), num(params, "b"));
  const rel = preset?.rel ?? [];
  const qt = terms(q);
  const cols: { id: Method; name: string; fmtS: (s: number) => string }[] = [
    { id: "bm25", name: "BM25", fmtS: (s) => s.toFixed(2) },
    { id: "dense", name: "Dense (cosine)", fmtS: (s) => s.toFixed(3) },
    { id: "hybrid", name: "Hybrid (RRF)", fmtS: (s) => s.toFixed(4) },
  ];
  return (
    <>
      <Caption>Query terms after tokenising (idf for BM25 · concept for the embedding)</Caption>
      <div style={box}>
        <TokenStrip tokens={qt.map((t, i) => ({ text: `${t} · ${bm25Idf(IX, t).toFixed(1)}${concept(t).startsWith("#") ? ` · ${concept(t)}` : ""}`, tone: i }))} />
        {preset && <small className="muted">Relevant: {preset.rel.map((i) => DOCS[i].title).join(", ")} ({preset.note})</small>}
      </div>
      <Columns min={180}>
        {cols.map((c) => {
          const list = res[c.id].slice(0, Math.max(k, 3));
          return (
            <div key={c.id} style={{ ...box, borderColor: c.id === method ? "var(--accent)" : "var(--line)", borderWidth: c.id === method ? 2 : 1 }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 6 }}>{c.name}</div>
              {list.length === 0 && <small className="muted">no term matches</small>}
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.78rem", display: "flex", flexDirection: "column", gap: 3 }}>
                {list.map((x, i) => (
                  <li key={x.doc} style={{ opacity: i < k ? 1 : 0.45 }}>
                    <span style={{ color: rel.includes(x.doc) ? C.green : "var(--text)", fontWeight: rel.includes(x.doc) ? 700 : 400 }}>{DOCS[x.doc].title}</span>{" "}
                    <span style={{ ...mono, color: "var(--muted)" }}>{c.fmtS(x.score)}</span>
                  </li>
                ))}
              </ol>
              {preset && (
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(() => {
                    const e = evalRanking(res[c.id], preset.rel, k);
                    return (
                      <>
                        <Pill color={e.recall >= 1 ? C.green : e.recall > 0 ? C.yellow : C.red}>R@{k} {r(e.recall, 2)}</Pill>
                        <Pill color={C.blue}>RR {r(e.mrr, 2)}</Pill>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </Columns>
      {res[method as Method][0] && (
        <div style={box}>
          <small className="muted">Top hit ({method}):</small>{" "}
          <b style={{ fontSize: "0.85rem" }}>{DOCS[res[method as Method][0].doc].title}</b>
          <div style={{ fontSize: "0.8rem", color: "var(--text-2)" }}>{DOCS[res[method as Method][0].doc].body}</div>
        </div>
      )}
    </>
  );
}

const defaults = { preset: "e42", query: "how long do refunds take", method: "hybrid", k: 3, k1: 1.2, b: 0.75 };

function workedExample() {
  const q = PRESETS.find((x) => x.id === defaults.preset) ?? PRESETS[0];
  const res = rankAll(q.q, 1.2, 0.75);
  const t = terms(q.q);
  const rel = q.rel[0];
  const pos = (l: Ranked, doc: number) => l.findIndex((x) => x.doc === doc) + 1;
  const dTop = res.dense[0].doc;
  return { q, t, rel, dTop, rb: pos(res.bm25, rel), rd: pos(res.dense, rel), rbT: pos(res.bm25, dTop), rdT: pos(res.dense, dTop), rh: pos(res.hybrid, rel), res, m: compute(defaults), mb: compute({ ...defaults, method: "bm25" }), md: compute({ ...defaults, method: "dense" }) };
}
const W = workedExample();

export const retrievalCompare: SimDef = {
  id: "retrieval-compare",
  title: "BM25 vs embeddings vs hybrid search",
  summary: "Search a 12-article help centre three ways: keyword BM25, a toy embedding, and their Reciprocal Rank Fusion. Paraphrases beat BM25; exact codes beat embeddings; hybrid is robust to both.",
  module: "retrieval-and-rag",
  tags: ["BM25", "dense retrieval", "hybrid search", "RRF", "recall@k", "MRR"],
  params: [
    { key: "preset", label: "Query", kind: "select", options: [...PRESETS.map((x) => ({ value: x.id, label: `“${x.q}”` })), { value: "custom", label: "Custom (type below)" }] },
    { key: "query", label: "Custom query", kind: "text", help: "Used when Query = Custom (no relevance labels)" },
    { key: "method", label: "Method scored", kind: "select", options: [{ value: "bm25", label: "BM25" }, { value: "dense", label: "Dense" }, { value: "hybrid", label: "Hybrid (RRF)" }] },
    { key: "k", label: "Top k", kind: "range", min: 1, max: 10, step: 1 },
    { key: "k1", label: "BM25 k₁ (tf saturation)", kind: "range", min: 0.2, max: 3, step: 0.1 },
    { key: "b", label: "BM25 b (length normalisation)", kind: "range", min: 0, max: 1, step: 0.05 },
  ],
  defaults,
  metrics: [
    { key: "recallAtK", label: "Recall@k (this query)", format: "pct" },
    { key: "mrr", label: "Reciprocal rank", format: "num" },
    { key: "meanRecallAtK", label: "Mean recall@k (6 queries)", format: "pct" },
    { key: "meanMrr", label: "MRR (6 queries)", format: "num" },
  ],
  compute,
  View,
  math: `Documents and queries are tokenised (lowercase, stopwords removed, light stemming).

**BM25** scores document $D$ for query $Q$ with term frequency $f(t,D)$, document length $|D|$ and average length $\\overline{|D|}$:
$$\\text{BM25}(D,Q) = \\sum_{t\\in Q} \\text{idf}(t)\\,\\frac{f(t,D)\\,(k_1+1)}{f(t,D) + k_1\\left(1 - b + b\\,\\frac{|D|}{\\overline{|D|}}\\right)}, \\qquad \\text{idf}(t) = \\ln\\!\\left(1 + \\frac{N - n_t + 0.5}{n_t + 0.5}\\right)$$
$k_1$ caps how much repeating a word helps; $b$ penalises long documents. Words that never appear score 0, however close in meaning.

**Dense** retrieval embeds text into a vector and ranks by cosine $\\cos(\\mathbf q, \\mathbf d)$. The toy embedding hashes each word's *concept* (a synonym table: "money", "back" and "refund" share one) plus its character trigrams into ${256} dimensions.

**Hybrid** combines the two rankings with **Reciprocal Rank Fusion** (no score calibration needed):
$$\\text{RRF}(d) = \\sum_{m\\in\\{\\text{bm25},\\text{dense}\\}} \\frac{1}{60 + \\text{rank}_m(d)}$$

**Metrics**: recall@k $= |\\text{relevant} \\cap \\text{top}k| / |\\text{relevant}|$; reciprocal rank $= 1/\\text{rank of the first relevant doc}$, averaged over queries as MRR.

**Worked example (defaults: “${W.q.q}”, hybrid, $k=3$)**: query terms ${W.t.map((x) => `\`${x}\``).join(", ")}. BM25 matches the rare term *e42*, which appears in one document (idf $= ${r(bm25Idf(IX, "e42"), 2)}$) and ranks “${DOCS[W.rel].title}” **${W.rb}**. The toy embedding turns every code into the same \`#number\` concept, so it cannot tell *E42* from “30 days” or “E17”, ranks that document only ${W.rd} and prefers “${DOCS[W.dTop].title}”.
RRF: the relevant document gets $1/(60+${W.rb}) + 1/(60+${W.rd}) = ${r(1 / (60 + W.rb) + 1 / (60 + W.rd), 4)}$, “${DOCS[W.dTop].title}” gets ${W.rbT ? `$1/(60+${W.rbT}) + 1/(60+${W.rdT}) = ${r(1 / (60 + W.rbT) + 1 / (60 + W.rdT), 4)}$` : `$1/(60+${W.rdT}) = ${r(1 / (60 + W.rdT), 4)}$`}; the relevant one lands at hybrid rank ${W.rh}, so recall@3 $= ${r(W.m.recallAtK, 2)}$ and reciprocal rank $= ${r(W.m.mrr, 3)}$.
Over all six labelled queries, mean recall@3 is ${r(W.mb.meanRecallAtK, 3)} for BM25, ${r(W.md.meanRecallAtK, 3)} for dense and ${r(W.m.meanRecallAtK, 3)} for hybrid: each single method fails on different queries, fusion recovers most of both.`,
  explain: (p, m) =>
    Number.isNaN(m.recallAtK)
      ? `Custom query: no relevance labels, so judge the three lists yourself. Across the six labelled queries ${str(p, "method")} reaches mean recall@${num(p, "k")} = ${(m.meanRecallAtK * 100).toFixed(0)}%.`
      : `${str(p, "method")} finds ${(m.recallAtK * 100).toFixed(0)}% of the relevant documents in the top ${num(p, "k")} for this query (mean over all six: ${(m.meanRecallAtK * 100).toFixed(0)}%). Compare the columns: keyword and embedding search fail on different queries.`,
};
