// A tiny external store backed by browser storage, readable with useSyncExternalStore.
// Everything the learner owns (progress, notes, AI settings, API keys) lives in their own browser - never on a server.
import { useSyncExternalStore } from "react";

export type Store<T> = {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  server: T;
};

export function createStore<T>(o: {
  read(): string | null;
  parse(raw: string | null): T;
  write(value: T): void;
  server: T;
}): Store<T> {
  let raw: string | null | undefined;
  let snap: T = o.server;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  function read(): string | null {
    try {
      return o.read();
    } catch {
      return null; // storage blocked: fall back to in-memory state
    }
  }

  function get(): T {
    if (typeof window === "undefined") return o.server;
    const r = read();
    if (r !== raw) {
      raw = r;
      snap = o.parse(r);
    }
    return snap;
  }

  return {
    server: o.server,
    get,
    set(next) {
      const value = typeof next === "function" ? (next as (p: T) => T)(get()) : next;
      try {
        o.write(value);
      } catch {
        /* storage unavailable: the value only lives until reload */
      }
      raw = read();
      snap = value;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = () => listener();
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

/** A JSON object in localStorage. Unknown/missing fields fall back to `fallback`. */
export function jsonStore<T extends object>(key: string, fallback: T, migrate?: () => Partial<T> | null): Store<T> {
  return createStore<T>({
    server: fallback,
    read: () => localStorage.getItem(key),
    parse(raw) {
      if (raw) {
        try {
          return { ...fallback, ...JSON.parse(raw) };
        } catch {
          return fallback;
        }
      }
      const migrated = migrate?.();
      return migrated ? { ...fallback, ...migrated } : fallback;
    },
    write: (v) => localStorage.setItem(key, JSON.stringify(v)),
  });
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, () => store.server);
}
