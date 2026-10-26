// What the tutor is told: a fixed teaching brief, plus what the learner's current screen shows (lib/ai/sources.ts).

const BASE = `You are a patient, precise tutor built into "LLM Engineering 1 → 100", a hands-on course on how large language models work and how to build with them: tokenization, transformers and attention, training and fine-tuning, inference and serving (KV cache, batching, quantization), prompting, evaluation, RAG, agents and production LLM systems. The course teaches with maths, live simulations, labs and a systems-design sandbox.

How to answer:
- Teach, don't just tell. Start with the intuition in one or two sentences, then the maths, numbers or code if it helps.
- Use Markdown. Write maths with $...$ (inline) and $$...$$ (display) - it is rendered with KaTeX. Put code in fenced blocks with a language tag.
- Be concise: short paragraphs, small worked numeric examples, no filler. Offer a follow-up only when it is genuinely useful.
- When the learner's screen is described below, treat it as the source of truth for this course's notation, parameters and numbers, and refer to what they can see and change. If the answer is not covered there, say so and answer from general knowledge.
- Never reveal answers the screen deliberately hides (quiz answers, worked solutions, interview answers not yet revealed). If asked, give a hint or a guiding question instead.
- If something the learner says is wrong, correct it kindly and explain why. If you are unsure, say so rather than guessing.`;

/** `screen` is collectContext() output; `route` is the page path. */
export function buildSystem(route: string, screen: string, share: boolean, budget: number): string {
  if (!share) return BASE;
  const head = `\n\nThe learner is on the page ${route}.`;
  if (!screen.trim()) return BASE + head;
  const text = screen.length > budget ? screen.slice(0, budget) + "\n…[screen text trimmed]" : screen;
  return `${BASE}${head} This is what their screen shows right now:\n\n<screen>\n${text}\n</screen>`;
}

export function buildUserTurn(text: string, quote?: string): string {
  if (!quote) return text;
  return `Here is the excerpt I'm asking about:\n\n"""\n${quote}\n"""\n\n${text}`;
}

/** Starter questions when the screen offers none. */
export function defaultSuggestions(route: string): string[] {
  if (route.startsWith("/learn/")) return ["Explain this like I'm new to it", "Walk me through the maths step by step", "What are common misconceptions here?", "Quiz me with 3 questions, one at a time"];
  if (route.startsWith("/simulations/")) return ["What is this simulation showing?", "What should I try changing first?", "Explain the maths behind these numbers"];
  if (route.startsWith("/labs/")) return ["Give me a hint without the answer", "Explain the idea behind this step"];
  if (route.startsWith("/sandbox")) return ["Explain my last run's results", "What is the bottleneck in this design?", "How would you make this cheaper?"];
  if (route.startsWith("/interview")) return ["Give me a hint for this question", "How should I structure my answer?"];
  return ["Where should I start with LLMs?", "Explain attention in plain language", "What is a KV cache and why does it matter?"];
}
