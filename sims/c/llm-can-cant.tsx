// "What LLMs are good and bad at": sort ten task cards into "Good at" or "Needs tools or grounding".
// Params: seed (deal order). The learner's choices are stored in the undeclared param `answers` (see can-cant-data.ts).
// Metrics: placed, correct, score (correct ÷ 10).
import type { SimDef } from "../types";
import { CARDS, N, compute } from "./can-cant-data";
import View from "./llm-can-cant.view";

const defaults = { seed: 1 };
const good = CARDS.filter((c) => c.right === "g").length;

export const llmCanCant: SimDef = {
  id: "llm-can-cant",
  title: "What LLMs are good and bad at",
  summary: "Sort ten everyday tasks: which can a plain LLM do well, and which need a tool or the right documents?",
  module: "model-foundations",
  tags: ["capabilities", "limits", "hallucination", "tools", "RAG"],
  params: [{ key: "seed", label: "Deal", kind: "range", min: 1, max: 20, step: 1, help: "Shuffles the order of the cards" }],
  defaults,
  metrics: [
    { key: "placed", label: "Cards sorted", format: "int" },
    { key: "correct", label: "Correct", format: "int" },
    { key: "score", label: "Score", format: "pct" },
  ],
  compute,
  View,
  math: `A plain LLM computes $P(\\text{next token} \\mid \\text{text so far})$ from patterns in its training data. That gives a simple test for any task:

1. **Is everything it needs in the prompt or in common knowledge?** Then producing likely, fluent text is exactly the job (summarise, translate, explain, write, common code).
2. **Does it need exact computation, fresh facts, or text it never saw?** Then the most *likely-sounding* answer is not necessarily the *true* one, so give it a **tool** (calculator, code, search) or **grounding** (the documents in its context).

**Scoring.** With $c$ cards correct out of $N = ${N}$, score $= c / N$. This deck has ${good} "good at" and ${N - good} "needs tools" cards, so always answering "good at" scores $${good}/${N} = ${(good / N) * 100}\\%$: no better than a coin flip.

**Why exact arithmetic slips, in numbers.** $48{,}213 \\times 9{,}071 = 437{,}340{,}123$. The model emits that answer a few digits per token; if it gets each of, say, 4 tokens right with probability 0.95, the whole number is right only $0.95^4 \\approx 81\\%$ of the time. A calculator is right 100% of the time.`,
  explain: (_p, m) =>
    m.placed === 0
      ? "Sort each card: is it something a plain LLM does well, or does it need a tool or grounding?"
      : m.placed < N
        ? `${m.correct} of ${m.placed} sorted cards are right so far (${N - m.placed} to go).`
        : `Done: ${m.correct}/${N}. ${m.correct === N ? "Perfect sorting." : "Click a red card to take it back and read why."}`,
};
