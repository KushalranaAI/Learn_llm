// Lab: a SaaS help-centre assistant. Chunk counts and overlap overhead by hand, then find chunking that keeps key facts whole.
import type { Lab } from "./types";

const r = String.raw;

export const chunkItRight: Lab = {
  slug: "chunk-it-right",
  module: "retrieval-and-rag",
  title: "Chunk it right",
  product: "A help-centre assistant for a notes app",
  summary: "A help-centre assistant answers wrongly when a key fact is cut in half by a chunk boundary. Compute chunk counts and overlap overhead by hand, then find chunking settings that keep every key fact intact without bloating the index.",
  difficulty: "easy",
  minutes: 25,
  tags: ["chunking", "overlap", "index size", "retrieval", "RAG", "sentence boundaries"],
  steps: [
    {
      type: "intro",
      title: "The product",
      body: r`A notes-app company wants an assistant that answers questions from its admin guide: roles, billing, security, data retention. The guide (about **1,400 words**) is split into **chunks**, each chunk is embedded, and at question time the best few chunks go into the prompt.

Chunking decides what the retriever can find:

- A chunk that is **too small** loses context: the answer depends on the sentence before.
- A chunk that is **too large** dilutes the embedding with unrelated text and wastes prompt tokens.
- A boundary that **cuts through a fact** ("the transfer takes effect after the new owner confirms ... the original owner can cancel") means no single chunk contains the whole answer. The assistant says "I couldn't find that" or, worse, guesses.

Three strategies are on offer: **fixed** windows (a number of tokens, ignoring structure), **sentence** packing (whole sentences up to a size), and **heading-aware** packing (never crossing a section heading). **Overlap** repeats the end of one chunk at the start of the next, which protects facts at boundaries at the price of a bigger index.

In this lab, a token is counted as one word to keep the arithmetic exact.`,
    },
    {
      type: "quiz",
      title: "Why does the assistant miss the transfer rule?",
      body: r`A user asks, "Can I hand my workspace to a colleague, and can I back out?" The guide says: *"Workspace owners can transfer ownership only to an existing admin, and the transfer takes effect after the new owner confirms by email. Until the confirmation arrives, the original owner keeps full control and can cancel the transfer."* With fixed 120-word chunks and no overlap, that passage straddles a chunk boundary: the first part is in one chunk and the second in the next.`,
      question: "What is the most direct explanation for the wrong answer?",
      options: [
        { text: "No single chunk contains the whole rule: each part is incomplete, so retrieval returns a fragment that lacks either the admin-only rule or the right to cancel", correct: true, why: "Right. The embedding of half a sentence matches the question weakly, and even when it is retrieved it holds only half the rule. Overlap, sentence-aware splitting or larger chunks fix this." },
        { text: "The embedding model cannot represent numbers like '30 days'", why: "Embeddings handle numbers imperfectly but the main problem here is that the rule has been cut in two before embedding even begins." },
        { text: "The LLM forgets text that appeared earlier in the prompt", why: "The failure happens at retrieval: the complete rule never reached the prompt." },
        { text: "The vector index returned too many results", why: "Returning more results might help a little, but the root cause is the broken chunk boundary, not the result count." },
      ],
    },
    {
      type: "math",
      title: "How many chunks?",
      body: r`The guide has $W = 1{,}384$ words. With **fixed** windows of size $s = 120$ and overlap $o = 20$, each new chunk starts $s - o = 100$ words after the previous one. Chunks keep being produced until one reaches the end of the document.

The number of chunks is

$$\left\lceil \frac{W - o}{s - o} \right\rceil$$`,
      question: r`How many chunks does the guide produce?`,
      answer: 14,
      tolerance: 0.01,
      hint: r`$(1384 - 20)/100 = 13.64$. Round up.`,
      solution: r`$$\left\lceil\frac{1384-20}{120-20}\right\rceil = \lceil 13.64\rceil = 14$$

Without overlap it would be $\lceil 1384/120\rceil = \lceil 11.53\rceil = 12$ chunks. Overlap adds two more chunks here, and each of the 14 repeats up to 20 words from its neighbour.`,
    },
    {
      type: "sim",
      title: "Keep facts whole, cheaply",
      body: r`The simulator splits the real guide and checks **six key facts** (ownership transfer, single sign-on, refunds, trash retention, the API rate limit, the support SLA). A fact is **split** if no chunk contains it whole. It starts with fixed 120-word chunks and no overlap: two facts are split.

Choose a strategy and size that satisfy all of these:

- **no split facts**,
- index overhead at most **10%** (stored tokens versus document tokens),
- at most **10 chunks**.`,
      sim: "chunking",
      params: { strategy: "fixed", chunkSize: 120, overlap: 0 },
      goals: [
        { metric: "splitFacts", op: "==", value: 0, label: "No key fact is split across chunks" },
        { metric: "overheadPct", op: "<=", value: 0.1, label: "Index overhead at most 10%" },
        { metric: "chunks", op: "<=", value: 10, label: "At most 10 chunks" },
      ],
      hints: [
        "Fixed windows ignore sentence and section boundaries. Overlap fixes splits but costs index size.",
        "Strategies that respect structure can avoid splits without any overlap.",
        "Heading-aware packing with a chunk size of 200 keeps every fact whole at zero overhead.",
      ],
      solution: { strategy: "heading", chunkSize: 200 },
    },
    {
      type: "math",
      title: "What does overlap cost?",
      body: r`With fixed 120-word windows and 20 words of overlap, the 14 chunks store **1,644 words** in total, because overlapping words are stored twice. The document itself is 1,384 words.`,
      question: r`What is the index overhead, $\text{stored}/\text{document} - 1$? (Three decimals.)`,
      answer: 0.188,
      tolerance: 0.02,
      hint: r`$1644/1384 = 1.188$.`,
      solution: r`$$\frac{1644}{1384} - 1 = 1.188 - 1 = 0.188$$

An 18.8% bigger index for 20 words of overlap. The rule of thumb: for a window $s$ and overlap $o$ the overhead is about $o/(s-o)$, here $20/100 = 20\%$. Overlap is cheap on a 1,400-word guide and expensive on 100 million chunks: a 20% larger vector index means 20% more RAM and 20% more embedding cost, so use as little as you can.`,
    },
    {
      type: "sim",
      title: "When you must use fixed windows",
      body: r`The ingestion pipeline handles many file types (transcripts, logs) with no headings or sentence structure, so it is stuck with **fixed windows**. Find a chunk size and overlap that leave **no split facts**, with overhead at most **20%** and at most **10 chunks**.

Notice the trade-off: bigger windows mean fewer boundaries to protect, but bigger chunks make less precise retrieval.`,
      sim: "chunking",
      params: { strategy: "fixed", chunkSize: 120, overlap: 0 },
      locked: ["strategy"],
      goals: [
        { metric: "splitFacts", op: "==", value: 0, label: "No key fact is split across chunks" },
        { metric: "overheadPct", op: "<=", value: 0.2, label: "Index overhead at most 20%" },
        { metric: "chunks", op: "<=", value: 10, label: "At most 10 chunks" },
      ],
      hints: [
        "Overlap must be at least as long as the longest fact that could straddle a boundary.",
        "A longer window also reduces the number of boundaries, which cuts the chunk count.",
        "Try a window of 300 with an overlap of 50.",
      ],
      solution: { chunkSize: 300, overlap: 50 },
    },
    {
      type: "quiz",
      title: "Choosing a chunk size",
      body: r`Teams often start with 300-500 tokens and tune. The assistant retrieves the **top 5 chunks** for each question and puts them in the prompt at \$3 per million input tokens.`,
      question: "Going from 300-token chunks to 1,000-token chunks (still top 5) has which effect?",
      options: [
        { text: "More context per hit and a higher chance the full fact is inside, but the prompt grows to 5,000 retrieved tokens, costs more, and each embedding is more diluted", correct: true, why: "Right. Bigger chunks improve fact completeness but raise cost and latency (linearly in prompt tokens) and blur what each vector represents, which can hurt ranking precision. Measure recall and answer quality on your own questions." },
        { text: "Retrieval always improves, because the model sees more text", why: "More text per chunk means fewer distinct chunks per prompt and noisier embeddings. Quality often plateaus or drops." },
        { text: "Cost is unchanged because the number of chunks retrieved is the same", why: "Cost scales with the tokens in the prompt: 5 chunks of 1,000 tokens is more than three times as much as 5 chunks of 300." },
        { text: "Chunk size has no effect on retrieval, only on storage", why: "Chunk size changes what each embedding represents, so it changes which chunks match a question." },
      ],
    },
  ],
};
