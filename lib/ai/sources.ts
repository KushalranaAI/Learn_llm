// What the tutor can see. Every screen registers what it is showing with one call (System Learn's useChatSource idea):
//
//   useChatSource("sim", { label: "Simulation · KV cache", build: () => ({ params, metrics, math }) });
//
// `build` runs only when a question is sent, so it can be as detailed as it likes and always reads live state.
// Sources must never include hidden answers (quiz answers, worked solutions, interview answers before they are revealed).
import { useEffect, useRef, useSyncExternalStore } from "react";

export interface ChatSource {
  /** short label shown to the learner, e.g. "Sandbox · 5 components" */
  label: string;
  /** starter questions that make sense on this screen (read on every render of the panel, so keep them cheap) */
  suggestions?: string[];
  /** what the screen shows right now: a string (markdown) or any JSON-able object */
  build: () => unknown;
  /** optional one-click question: shows an "Explain with AI" button by the Ask AI launcher (only when AI is set up) */
  explain?: { label?: string; prompt: string };
}

const sources = new Map<string, ChatSource>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/** Called by a screen while it is mounted. The latest closure is always used, so `build` can read live state. */
export function useChatSource(key: string, source: ChatSource | null) {
  const ref = useRef(source);
  ref.current = source;
  const present = source !== null;
  const label = source?.label ?? "";
  useEffect(() => {
    if (!present) return;
    sources.set(key, {
      get label() {
        return ref.current?.label ?? "";
      },
      get suggestions() {
        return ref.current?.suggestions;
      },
      get explain() {
        return ref.current?.explain;
      },
      build: () => ref.current?.build(),
    });
    emit();
    return () => {
      sources.delete(key);
      emit();
    };
  }, [key, present]);
  // a changed label (e.g. a new lab step) should refresh the panel header
  useEffect(() => {
    if (present) emit();
  }, [label, present]);
}

/** Registers a source from outside React (used by tests and by DOM-based sources). Returns the unregister function. */
export function registerSource(key: string, source: ChatSource): () => void {
  sources.set(key, source);
  emit();
  return () => {
    if (sources.get(key) === source) sources.delete(key);
    emit();
  };
}

export const chatSources = (): ChatSource[] => [...sources.values()].filter((s) => s.label);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Re-renders when sources come and go; returns the current labelled sources. */
export function useChatSources(): ChatSource[] {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return chatSources();
}

const MAX_JSON = 20_000;
const render = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  try {
    const s = JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isInteger(x) ? Number(x.toPrecision(4)) : x), 2);
    return s.length > MAX_JSON ? s.slice(0, MAX_JSON) + "\n…" : s;
  } catch {
    return "(unavailable)";
  }
};

/** Everything the current screen says about itself, as text for the system prompt. Empty when nothing is registered. */
export function collectContext(): string {
  const parts: string[] = [];
  for (const src of sources.values()) {
    if (!src.label) continue;
    let body: string;
    try {
      body = render(src.build());
    } catch {
      body = "(unavailable)";
    }
    parts.push(`### ${src.label}\n${body}`.trim());
  }
  return parts.join("\n\n");
}

/** Topic markdown for the tutor: quick-check blocks keep their question and options but lose the answer and explanation. */
export function stripAnswers(markdown: string): string {
  return markdown.replace(/```quiz\s*\n([\s\S]*?)```/g, (_m, raw: string) => {
    try {
      const q = JSON.parse(raw) as { q?: string; options?: string[] };
      const opts = (q.options ?? []).map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join("\n");
      return `Quick check (answer hidden from the tutor):\n${q.q ?? ""}\n${opts}`;
    } catch {
      return "(quick check)";
    }
  });
}
