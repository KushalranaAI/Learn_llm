// Saved tutor conversations, one thread per page (topic, simulation, lab, sandbox …). Browser-local, trimmed so storage stays small.
import { jsonStore } from "../localstore";

export type Msg = { role: "user" | "assistant"; content: string; quote?: string };
export type Chats = { threads: Record<string, Msg[]> };

export const chatStore = jsonStore<Chats>("llm100-ai-chats", { threads: {} });

const MAX_THREADS = 30;
const MAX_MESSAGES = 40;

export function saveThread(key: string, messages: Msg[]) {
  chatStore.set((c) => {
    const threads = { ...c.threads };
    delete threads[key]; // re-insert so the newest thread is last
    if (messages.length) threads[key] = messages.slice(-MAX_MESSAGES);
    const keys = Object.keys(threads);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_THREADS))) delete threads[old];
    return { threads };
  });
}

export function clearChats() {
  chatStore.set({ threads: {} });
}
