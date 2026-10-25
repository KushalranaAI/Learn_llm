// Words -> tokens -> money for one request and for a day / month of traffic.
// Params: systemTokens 0–10000, inputWords 0–50000, outputWords 1–10000, language (english | spanish | german | hindi | code | json),
// inputPrice 0.05–75 $/1M (log), outputPrice 0.1–150 $/1M (log), requestsPerDay 1–1,000,000 (log).
// Metrics: inputTokens, outputTokens, costPerRequest (usd), costPerDay (usd), costPerMonth (usd, 30 days).
import { StackBar } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, HBars } from "./viz";
import { round } from "./lib";

// Rough tokens per whitespace-separated word for a GPT-4-class BPE tokenizer (illustrative averages; measure your own data).
export const TOKENS_PER_WORD: Record<string, { label: string; r: number }> = {
  english: { label: "English prose", r: 1.3 },
  spanish: { label: "Spanish", r: 1.5 },
  german: { label: "German", r: 1.6 },
  hindi: { label: "Hindi (Devanagari)", r: 2.6 },
  code: { label: "Source code", r: 2.5 },
  json: { label: "JSON", r: 3.0 },
};

function compute(p: Params) {
  const r = (TOKENS_PER_WORD[str(p, "language")] ?? TOKENS_PER_WORD.english).r;
  const inputTokens = Math.round(num(p, "systemTokens") + num(p, "inputWords") * r);
  const outputTokens = Math.round(num(p, "outputWords") * r);
  const costPerRequest = (inputTokens * num(p, "inputPrice") + outputTokens * num(p, "outputPrice")) / 1e6;
  const costPerDay = costPerRequest * num(p, "requestsPerDay");
  return { inputTokens, outputTokens, costPerRequest, costPerDay, costPerMonth: costPerDay * 30 };
}

function View({ params, metrics }: SimViewProps) {
  const sys = num(params, "systemTokens"), pin = num(params, "inputPrice") / 1e6, pout = num(params, "outputPrice") / 1e6;
  const user = metrics.inputTokens - sys;
  const lang = str(params, "language");
  const keys = Object.keys(TOKENS_PER_WORD);
  return (
    <>
      <Caption>Where one request&apos;s money goes</Caption>
      <StackBar
        format="usd"
        parts={[
          { label: "system prompt", value: sys * pin, color: "var(--purple)" },
          { label: "user input", value: user * pin, color: "var(--blue)" },
          { label: "output", value: metrics.outputTokens * pout, color: "var(--accent)" },
        ]}
      />
      <Caption>The same request in other languages / formats (tokens per request, input + output)</Caption>
      <HBars
        highlight={keys.indexOf(lang)}
        format="int"
        bars={keys.map((k) => {
          const m = compute({ ...params, language: k });
          return { label: TOKENS_PER_WORD[k].label, value: m.inputTokens + m.outputTokens, note: `${(m.inputTokens + m.outputTokens).toLocaleString("en-US")} tok · $${round(m.costPerMonth, 0).toLocaleString("en-US")}/mo` };
        })}
      />
    </>
  );
}

const D = { systemTokens: 400, inputWords: 600, outputWords: 250, language: "english", inputPrice: 3, outputPrice: 15, requestsPerDay: 10000 };
const dm = compute(D);

export const tokenCost: SimDef = {
  id: "token-cost",
  title: "Tokens are the bill: words to tokens to dollars",
  summary: "Turn prompt and answer length into tokens and cost per request, per day and per month, and see how language and format change the count.",
  module: "model-foundations",
  tags: ["tokens", "cost", "pricing", "context", "budget"],
  params: [
    { key: "systemTokens", label: "System prompt", kind: "range", min: 0, max: 10000, step: 50, unit: "tokens" },
    { key: "inputWords", label: "User input", kind: "range", min: 0, max: 50000, step: 10, unit: "words" },
    { key: "outputWords", label: "Answer length", kind: "range", min: 1, max: 10000, step: 1, unit: "words", log: true },
    { key: "language", label: "Language / format", kind: "select", options: Object.entries(TOKENS_PER_WORD).map(([value, v]) => ({ value, label: `${v.label} (~${v.r} tok/word)` })) },
    { key: "inputPrice", label: "Input price", kind: "range", min: 0.05, max: 75, step: 0.05, unit: "$/1M", log: true },
    { key: "outputPrice", label: "Output price", kind: "range", min: 0.1, max: 150, step: 0.1, unit: "$/1M", log: true },
    { key: "requestsPerDay", label: "Requests per day", kind: "range", min: 1, max: 1000000, step: 1, log: true },
  ],
  defaults: D,
  metrics: [
    { key: "inputTokens", label: "Input tokens", format: "int" },
    { key: "outputTokens", label: "Output tokens", format: "int" },
    { key: "costPerRequest", label: "Cost / request", format: "usd" },
    { key: "costPerDay", label: "Cost / day", format: "usd" },
    { key: "costPerMonth", label: "Cost / month", format: "usd" },
  ],
  compute,
  View,
  math: `APIs bill **tokens**, not words, and output tokens usually cost 3–5× more than input tokens (they are generated one at a time).

Let $r$ be tokens per word for the language/format, $S$ the system-prompt tokens, $W_{in}$ and $W_{out}$ the words in and out, $p_{in}$ and $p_{out}$ prices per million tokens, $R$ requests per day:

$$T_{in} = S + r\\,W_{in}, \\qquad T_{out} = r\\,W_{out}$$
$$\\text{cost/request} = \\frac{T_{in}\\,p_{in} + T_{out}\\,p_{out}}{10^6}, \\qquad \\text{cost/day} = R\\cdot\\text{cost/request},\\qquad \\text{cost/month} = 30\\cdot\\text{cost/day}$$

The ratios $r$ are rough averages for GPT-4-class BPE tokenizers: English ≈ 1.3 tokens/word (≈ 0.75 words or ≈ 4 characters per token); languages and scripts that were rarer in the tokenizer's training data split into more pieces, and code/JSON spend tokens on punctuation and whitespace. Measure your own traffic with the real tokenizer before budgeting.

**Defaults.** $T_{in} = 400 + 1.3\\times 600 = ${dm.inputTokens}$, $T_{out} = 1.3\\times 250 = ${dm.outputTokens}$ (rounded).
Cost per request $= (${dm.inputTokens}\\times 3 + ${dm.outputTokens}\\times 15)/10^6$ = USD ${round(dm.costPerRequest, 6)}.
At ${D.requestsPerDay.toLocaleString("en-US")} requests/day: USD ${round(dm.costPerDay, 2)} per day, USD ${round(dm.costPerMonth, 2)} per month. Output is ${Math.round(((dm.outputTokens * 15) / (dm.inputTokens * 3 + dm.outputTokens * 15)) * 100)}% of the bill despite being ${Math.round((dm.outputTokens / (dm.inputTokens + dm.outputTokens)) * 100)}% of the tokens.`,
  explain: (p, m) => {
    const outShare = (m.outputTokens * num(p, "outputPrice")) / (m.inputTokens * num(p, "inputPrice") + m.outputTokens * num(p, "outputPrice") || 1);
    return `${m.inputTokens.toLocaleString("en-US")} tokens in and ${m.outputTokens.toLocaleString("en-US")} out cost $${m.costPerRequest.toPrecision(3)} per request; output is ${Math.round(outShare * 100)}% of that, so ${outShare > 0.5 ? "capping answer length saves the most" : "trimming the prompt (or caching it) saves the most"}.`;
  },
};
