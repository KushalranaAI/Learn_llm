// Milestones from n-gram statistics to today's assistants. Parameter counts only where the authors published them.
import { str, type Params } from "../types";

export type Milestone = {
  key: string;
  year: number;
  /** label shown for the year, e.g. "1948–51" */
  when: string;
  name: string;
  who: string;
  line: string;
  /** published parameter count, or null when not published / not meaningful */
  params: number | null;
  paramsNote?: string;
  era: "stats" | "neural" | "transformer" | "assistant";
};

export const MILESTONES: Milestone[] = [
  { key: "shannon", year: 1948, when: "1948–51", name: "Information theory and n-grams", who: "Claude Shannon", era: "stats", params: null,
    line: "Shannon modelled English as next-letter and next-word statistics, and measured how well people guess the next letter." },
  { key: "lstm", year: 1997, when: "1997", name: "LSTM", who: "Hochreiter & Schmidhuber", era: "neural", params: null,
    line: "A recurrent network with a memory cell that can carry information across long sequences." },
  { key: "nplm", year: 2003, when: "2003", name: "Neural language model", who: "Bengio et al.", era: "neural", params: null,
    line: "A neural net learns a vector for every word and predicts the next word from the previous few." },
  { key: "word2vec", year: 2013, when: "2013", name: "word2vec", who: "Mikolov et al.", era: "neural", params: null,
    line: "Fast word vectors at scale: words used in similar contexts end up close together." },
  { key: "seq2seq", year: 2014, when: "2014", name: "Sequence to sequence", who: "Sutskever, Vinyals & Le", era: "neural", params: null,
    line: "One network reads a sentence, another writes the translation, one word at a time." },
  { key: "attention", year: 2014, when: "2014", name: "Attention for translation", who: "Bahdanau, Cho & Bengio", era: "neural", params: null,
    line: "While writing each word, the decoder learns where to look back in the source sentence." },
  { key: "transformer", year: 2017, when: "2017", name: "Transformer", who: "Vaswani et al., “Attention Is All You Need”", era: "transformer", params: 213e6, paramsNote: "big model; base was 65M",
    line: "Attention only, no recurrence: every token looks at every other in parallel, so training scales." },
  { key: "gpt1", year: 2018, when: "2018", name: "GPT-1", who: "Radford et al. (OpenAI)", era: "transformer", params: 117e6,
    line: "Pretrain a transformer to predict the next token on books, then fine-tune it for each task." },
  { key: "bert", year: 2018, when: "2018", name: "BERT", who: "Devlin et al. (Google)", era: "transformer", params: 340e6, paramsNote: "BERT-large",
    line: "A transformer encoder trained to fill in masked words, reading left and right context." },
  { key: "gpt2", year: 2019, when: "2019", name: "GPT-2", who: "Radford et al. (OpenAI)", era: "transformer", params: 1.5e9,
    line: "About 13 times bigger, trained on web text: it writes fluent paragraphs and does some tasks with no fine-tuning." },
  { key: "gpt3", year: 2020, when: "2020", name: "GPT-3", who: "Brown et al. (OpenAI)", era: "transformer", params: 175e9,
    line: "Scale again: it learns a new task from a few examples in the prompt (in-context learning)." },
  { key: "instructgpt", year: 2022, when: "Mar 2022", name: "InstructGPT (RLHF)", who: "Ouyang et al. (OpenAI)", era: "assistant", params: 1.3e9, paramsNote: "the 1.3B version",
    line: "Fine-tuned on human demonstrations and preferences: people preferred the 1.3B InstructGPT to the 175B GPT-3." },
  { key: "chatgpt", year: 2022.85, when: "Nov 2022", name: "ChatGPT", who: "OpenAI", era: "assistant", params: null, paramsNote: "size not published",
    line: "An RLHF-tuned model in a chat box. Millions of people try an LLM for the first time." },
  { key: "llama", year: 2023, when: "Feb 2023", name: "LLaMA and open weights", who: "Touvron et al. (Meta)", era: "assistant", params: 65e9, paramsNote: "largest of 7B–65B",
    line: "Smaller models trained on more tokens rival larger ones; weights shared with researchers, and open-weight models spread." },
  { key: "multimodal", year: 2023.5, when: "2023–24", name: "Multimodal models", who: "several labs", era: "assistant", params: null, paramsNote: "sizes mostly not published",
    line: "One model reads images (and later audio) as well as text." },
  { key: "agents", year: 2024.5, when: "2023–25", name: "Tool use and agents", who: "several labs", era: "assistant", params: null, paramsNote: "sizes mostly not published",
    line: "Models call tools (search, code, APIs) and loop: plan, act, check, until a task is done." },
];

export const GPT1 = 117e6;
export const indexOf = (p: Params) => Math.max(0, MILESTONES.findIndex((m) => m.key === str(p, "milestone")));

export function compute(p: Params) {
  const i = indexOf(p);
  const m = MILESTONES[i];
  const known = MILESTONES.slice(0, i + 1).map((x) => x.params ?? 0);
  const largest = Math.max(0, ...known);
  return {
    paramsB: m.params === null ? NaN : m.params / 1e9,
    largestB: largest / 1e9,
    growth: m.params === null ? NaN : m.params / GPT1,
    year: Math.floor(m.year),
  };
}
