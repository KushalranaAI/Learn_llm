// Pure data for llm-can-cant: task cards, the right bucket for each, and scoring of the learner's answers.
// Answers live in the (undeclared) param `answers`: one character per card in CARDS order, "g" = good at,
// "t" = needs tools or grounding, "." = not placed yet.
import type { Params } from "../types";
import { mulberry32 } from "./lib";

export type Bucket = "g" | "t";

export const CARDS: { key: string; task: string; example: string; right: Bucket; why: string }[] = [
  { key: "summarise", task: "Summarise a long email", example: "“Give me the three key points of this email.”", right: "g",
    why: "Rewriting text that is right there in the prompt is a core strength." },
  { key: "arithmetic", task: "Exact arithmetic on big numbers", example: "“What is 48,213 × 9,071?”", right: "t",
    why: "It predicts digits as tokens and long exact sums slip. A calculator or code tool gets it right." },
  { key: "news", task: "Today's news, with no tools", example: "“What happened in the markets this morning?”", right: "t",
    why: "Its knowledge stops at its training cutoff. It needs search or a news feed." },
  { key: "poem", task: "Write a short poem", example: "“A four-line poem about autumn rain.”", right: "g",
    why: "Generating fluent, varied language is exactly what it was trained to do." },
  { key: "cite", task: "Cite a source it never saw", example: "“Quote page 12 of our 2021 audit report.”", right: "t",
    why: "It will produce a plausible but invented quote. Put the real document in its context." },
  { key: "translate", task: "Translate a paragraph", example: "“Translate this paragraph into Spanish.”", right: "g",
    why: "It has seen huge amounts of parallel and multilingual text." },
  { key: "letters", task: "Count letters in a long word", example: "“How many i's are in ‘supercalifragilisticexpialidocious’?”", right: "t",
    why: "It sees tokens, not letters, so character counts are unreliable. One line of code counts exactly." },
  { key: "code", task: "Write a small function", example: "“Write a Python function that reverses a string.”", right: "g",
    why: "Common code patterns are everywhere in its training data (still run the tests)." },
  { key: "private", task: "Answer about your private documents", example: "“What does our HR policy say about leave?”", right: "t",
    why: "It never saw them. Retrieve the relevant passages and put them in the prompt (RAG)." },
  { key: "explain", task: "Explain an idea simply", example: "“Explain photosynthesis to a 10-year-old.”", right: "g",
    why: "Explaining and re-phrasing well-known ideas plays to its strengths." },
];

export const N = CARDS.length;

export function parseAnswers(p: Params): ("g" | "t" | ".")[] {
  const s = String(p.answers ?? "");
  return CARDS.map((_, i) => (s[i] === "g" || s[i] === "t" ? s[i] : ".")) as ("g" | "t" | ".")[];
}

export const encode = (a: string[]) => a.join("");

/** Deal order for a seed (Fisher–Yates with a seeded generator). */
export function dealOrder(seed: number): number[] {
  const r = mulberry32(Math.round(seed) * 97 + 11);
  const o = CARDS.map((_, i) => i);
  for (let i = o.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}

export function compute(p: Params) {
  const a = parseAnswers(p);
  const placed = a.filter((x) => x !== ".").length;
  const correct = a.filter((x, i) => x === CARDS[i].right).length;
  return { placed, correct, score: correct / N };
}
