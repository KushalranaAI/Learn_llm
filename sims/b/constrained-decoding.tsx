// Constrained decoding: a JSON schema turns into a mask over next tokens; invalid tokens get probability 0.
// Metric keys: maskedMass (probability removed at the shown step), invalidRateFree (per call, unconstrained),
//              invalidRate (per call, current mode), pAnyInvalid (at least one invalid output in N calls).
import { LineChart, TokenStrip, C } from "../ui";
import { bool, num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, Columns, HBars } from "./viz";
import { box } from "./styles";
import { logspace, nearestIndex, pc, r } from "./lib";

type Cand = { t: string; logit: number; ok: boolean; why?: string };
type Step = { id: string; label: string; ctx: string; cands: Cand[] };

/** Schema: {"name": string, "age": integer, "plan": "free" | "pro"}, no other keys, nothing after the object. */
const STEPS: Step[] = [
  { id: "start", label: "1 · first token", ctx: "", cands: [
    { t: "{", logit: 6, ok: true }, { t: " {", logit: 2, ok: true }, { t: "Sure", logit: 0.3, ok: false, why: "prose before JSON" },
    { t: "```json", logit: 0.1, ok: false, why: "markdown fence" }, { t: "Here", logit: -0.8, ok: false, why: "prose" } ] },
  { id: "name", label: "2 · value of name", ctx: '{"name": ', cands: [
    { t: '"', logit: 6.5, ok: true }, { t: "null", logit: 0.9, ok: false, why: "name must be a string" },
    { t: "'", logit: -0.2, ok: false, why: "JSON needs double quotes" }, { t: "Ada", logit: 0.0, ok: false, why: "unquoted string" } ] },
  { id: "age", label: "3 · value of age", ctx: '{"name": "Ada Lovelace", "age": ', cands: [
    { t: "36", logit: 6, ok: true }, { t: '"36"', logit: 1.3, ok: false, why: "string, schema says integer" },
    { t: "36.5", logit: -0.1, ok: false, why: "not an integer" }, { t: "null", logit: -0.3, ok: false, why: "required" }, { t: "thirty", logit: -1.1, ok: false, why: "not JSON" } ] },
  { id: "plan", label: "4 · value of plan", ctx: '{"name": "Ada Lovelace", "age": 36, "plan": "', cands: [
    { t: "pro", logit: 5.2, ok: true }, { t: "free", logit: 4.4, ok: true }, { t: "premium", logit: 0.8, ok: false, why: "not in enum" },
    { t: "Pro", logit: 0.3, ok: false, why: "enum is case-sensitive" }, { t: "team", logit: -0.7, ok: false, why: "not in enum" } ] },
  { id: "close", label: "5 · after the last field", ctx: '{"name": "Ada Lovelace", "age": 36, "plan": "pro"', cands: [
    { t: "}", logit: 6.4, ok: true }, { t: " }", logit: 2.5, ok: true }, { t: ",", logit: 1.0, ok: false, why: "extra key not allowed" }, { t: "]", logit: -1.2, ok: false, why: "wrong bracket" } ] },
  { id: "end", label: "6 · after the object", ctx: '{"name": "Ada Lovelace", "age": 36, "plan": "pro"}', cands: [
    { t: "<eos>", logit: 6.2, ok: true }, { t: "\n\nLet me know", logit: 1.1, ok: false, why: "trailing prose" }, { t: "\n```", logit: 0.6, ok: false, why: "markdown fence" } ] },
];

function softmax(xs: number[], T: number) {
  const m = Math.max(...xs);
  const e = xs.map((x) => Math.exp((x - m) / T));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

function stepProbs(s: Step, T: number) {
  const p = softmax(s.cands.map((c) => c.logit), T);
  const masked = p.reduce((a, v, i) => a + (s.cands[i].ok ? 0 : v), 0);
  const renorm = p.map((v, i) => (s.cands[i].ok ? v / (1 - masked) : 0));
  return { p, masked, renorm };
}

function model(p: Params) {
  const T = num(p, "temperature");
  const per = STEPS.map((s) => stepProbs(s, T).masked);
  const valid = per.reduce((a, m) => a * (1 - m), 1);
  const free = 1 - valid;
  const e = bool(p, "constrained") ? 0 : free;
  const N = num(p, "calls");
  return { per, free, e, N, any: 1 - Math.pow(1 - e, N) };
}

function compute(p: Params) {
  const m = model(p);
  const s = STEPS.find((x) => x.id === String(p.step)) ?? STEPS[0];
  return { maskedMass: stepProbs(s, num(p, "temperature")).masked, invalidRateFree: m.free, invalidRate: m.e, pAnyInvalid: m.any };
}

function View({ params }: SimViewProps) {
  const T = num(params, "temperature");
  const on = bool(params, "constrained");
  const s = STEPS.find((x) => x.id === String(params.step)) ?? STEPS[0];
  const { p, renorm } = stepProbs(s, T);
  const m = model(params);
  const ns = logspace(1, 100000, 41);
  const ctxTokens = (s.ctx.match(/\{|\}|"[^"]*"|:|,|\s*[^\s{}":,]+/g) ?? []).map((t, i) => ({ text: t, tone: i % 6 }));
  return (
    <>
      <Caption>Generated so far (the next token is being chosen)</Caption>
      <div style={box}>{ctxTokens.length ? <TokenStrip tokens={ctxTokens} /> : <span className="muted">(empty: first token)</span>}</div>
      <Columns min={240}>
        <div>
          <Caption>Model&apos;s raw next-token probabilities</Caption>
          <HBars
            format="pct"
            max={1}
            labelWidth={92}
            rows={s.cands.map((c, i) => ({ label: JSON.stringify(c.t).slice(1, -1), value: p[i], color: c.ok ? C.green : C.red, struck: on && !c.ok }))}
          />
        </div>
        <div>
          <Caption>{on ? "After the mask, renormalised" : "Unconstrained: what gets sampled"}</Caption>
          <HBars
            format="pct"
            max={1}
            labelWidth={92}
            rows={s.cands.map((c, i) => ({ label: JSON.stringify(c.t).slice(1, -1), value: on ? renorm[i] : p[i], color: c.ok ? C.green : C.red, struck: on && !c.ok }))}
          />
        </div>
      </Columns>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8rem", color: "var(--text-2)" }}>
        {s.cands.filter((c) => !c.ok).map((c) => (
          <li key={c.t}><code>{JSON.stringify(c.t)}</code> is invalid: {c.why}</li>
        ))}
      </ul>
      <Caption>P(at least one invalid output) over N calls</Caption>
      <LineChart
        x={ns}
        logX
        series={[
          { name: "unconstrained", values: ns.map((n) => 1 - Math.pow(1 - m.free, n)), color: C.red },
          { name: "constrained", values: ns.map(() => 0), color: C.green },
        ]}
        xFormat={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
        xLabel="calls N (log scale)"
        yFormat="pct"
        yMax={1}
        marker={nearestIndex(ns.map(Math.log), Math.log(m.N))}
        height={180}
      />
    </>
  );
}

const defaults = { step: "age", temperature: 1, constrained: true, calls: 1000 };
const d0 = model({ ...defaults, constrained: false });
const ageStep = stepProbs(STEPS[2], 1);

export const constrainedDecoding: SimDef = {
  id: "constrained-decoding",
  title: "Constrained decoding: masking tokens the schema forbids",
  summary: "Step through a JSON output token by token, see which candidates a schema mask removes, and how small per-token slips add up over many calls.",
  module: "prompt-and-context",
  tags: ["structured output", "JSON schema", "grammar", "logit mask"],
  params: [
    { key: "step", label: "Decoding step", kind: "select", options: STEPS.map((s) => ({ value: s.id, label: s.label })) },
    { key: "temperature", label: "Temperature T", kind: "range", min: 0.2, max: 2, step: 0.05 },
    { key: "constrained", label: "Apply schema mask", kind: "toggle" },
    { key: "calls", label: "Calls N", kind: "range", min: 1, max: 100000, step: 1, log: true },
  ],
  defaults,
  metrics: [
    { key: "maskedMass", label: "Mass masked (this step)", format: "pct" },
    { key: "invalidRateFree", label: "Invalid / call, unconstrained", format: "pct" },
    { key: "invalidRate", label: "Invalid / call, current", format: "pct" },
    { key: "pAnyInvalid", label: "P(≥1 invalid in N)", format: "pct" },
  ],
  compute,
  View,
  math: `At each step the model gives logits $z_t$ over candidate tokens. Sampling uses $p_t = \\operatorname{softmax}(z_t / T)$.

A schema (here \`{"name": string, "age": integer, "plan": "free"|"pro"}\`, no extra keys) defines, for every prefix, the set $V_{ok}$ of tokens that keep the output valid. **Constrained decoding** sets the logit of every other token to $-\\infty$:
$$\\tilde p_t = \\frac{p_t\\,\\mathbb 1[t \\in V_{ok}]}{\\sum_{u\\in V_{ok}} p_u} = \\frac{p_t}{1 - m}, \\qquad m = \\sum_{t \\notin V_{ok}} p_t$$
$m$ is the **masked mass**. Valid tokens keep their relative order; only the forbidden ones vanish.

**Unconstrained**, a call is valid only if every decision is valid. With masked mass $m_i$ at decision $i$:
$$e = 1 - \\prod_{i=1}^{6} (1 - m_i), \\qquad P(\\ge 1 \\text{ invalid in } N \\text{ calls}) = 1 - (1-e)^N$$
Constrained, $e = 0$ by construction (truncation at \`max_tokens\` can still cut an object short, so keep a parser check).

**Worked example (defaults, $T=1$)**: at the *age* step, $m = ${r(ageStep.masked, 4)}$ (mostly \`"36"\`, a string where an integer is required), so \`36\` is renormalised from ${pc(ageStep.p[0])} to 100%.
The six masked masses are ${d0.per.map((x) => r(x, 4)).join(", ")}, giving $e = ${r(d0.free, 4)}$ (${pc(d0.free)} of calls).
Over $N = 1{,}000$ calls: $1 - (1 - ${r(d0.free, 4)})^{1000} \\approx ${r(d0.any, 4)}$, so without the mask an invalid output is practically certain.`,
  explain: (p, m) =>
    bool(p, "constrained")
      ? `The mask removes ${(m.maskedMass * 100).toFixed(1)}% of probability at this step and every call is valid by construction; unconstrained, ${(m.invalidRateFree * 100).toFixed(1)}% of calls would break the schema.`
      : `Unconstrained, ${(m.invalidRateFree * 100).toFixed(1)}% of calls break the schema, so over ${num(p, "calls").toLocaleString("en-US")} calls the chance of at least one failure is ${(m.pAnyInvalid * 100).toFixed(1)}%.`,
};
