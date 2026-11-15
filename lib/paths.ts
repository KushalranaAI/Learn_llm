// The three learning paths and how they fit together. The same list (and copy) is in all three apps:
// Learn_llm (lib/paths.ts), AI-engineering (src/curriculum/paths.ts) and All-in-One-RAG_tutorials (web/lib/paths.ts).
export type PathId = "llm" | "rag" | "ai";

export interface LearningPath {
  id: PathId;
  title: string;
  /** one sentence: what you learn */
  what: string;
  /** who should start here */
  startIf: string;
  /** what you can do afterwards */
  then: string;
  href: string;
}

/** In the order a newcomer should take them. */
export const LEARNING_PATHS: LearningPath[] = [
  {
    id: "llm",
    title: "LLM Engineering 1 → 100",
    what: "How language models work and are built: a single neuron to a transformer, training, fine-tuning, inference and evaluation, with the maths and a live simulation for every topic.",
    startIf: "You want to understand what is inside a model before you build on one.",
    then: "You can read a model card, size a GPU, fine-tune a model and judge whether it got better.",
    href: "https://kushalranaai.github.io/Learn_llm/",
  },
  {
    id: "rag",
    title: "RAG in 30 Days",
    what: "Give a model your own data: embeddings, chunking, hybrid search, reranking, evaluation, then agents and MCP, with 15 projects and a Studio to design workflows.",
    startIf: "You can write Python and want a chatbot or assistant that answers from your documents.",
    then: "You can build, measure and debug a retrieval system and a multi-agent app.",
    href: "https://kushalranaai.github.io/All-in-One-RAG_tutorials/",
  },
  {
    id: "ai",
    title: "AI Engineer Path",
    what: "From writing software to shipping AI in production: agents, memory, evals, security, deployment and inference, with guided projects, simulators and a Studio sandbox.",
    startIf: "You want the whole route from software engineer to AI engineer, or you are already building and need production skills.",
    then: "You can design, secure, deploy and operate an AI system, and talk about it in an interview.",
    href: "https://kushalranaai.github.io/AI-engineering/",
  },
];

export const PATH_ORDER_NOTE =
  "New to LLMs? Take them in this order. Already building with LLMs? Go straight to the AI Engineer Path and come back to LLM Engineering 1 → 100 whenever you want to see why something works.";
