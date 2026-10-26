"use client";
// Shared AI state: is the tutor panel open, which view, and what the learner is asking about.
// Any component can call useAI().ask({...}) - the panel picks it up. Ported from Machine Learning 1 → 100.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type AskRequest = {
  prompt?: string; // text to put in (or send from) the composer
  quote?: string; // excerpt the question is about
  send?: boolean; // send immediately instead of waiting for the learner
};

type View = "chat" | "settings";
type Ctx = {
  open: boolean;
  /** panel width in px (drag the edge to change), and whether it is expanded to a wide reading size */
  width: number;
  expanded: boolean;
  setWidth(w: number): void;
  toggleExpanded(): void;
  view: View;
  request: (AskRequest & { id: number }) | null;
  openPanel(view?: View): void;
  closePanel(): void;
  togglePanel(): void;
  setView(v: View): void;
  ask(req: AskRequest): void;
};

export const DEFAULT_WIDTH = 420;
export const MIN_WIDTH = 340;
export const MAX_WIDTH = 1000;
export const EXPANDED_WIDTH = 820;

const AICtx = createContext<Ctx | null>(null);

export function useAI(): Ctx {
  const c = useContext(AICtx);
  if (!c) throw new Error("useAI must be used inside <AIProvider>");
  return c;
}
/** For components that may render outside the provider (tests, SSR smoke renders): null there. */
export const useAIOptional = () => useContext(AICtx);

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  },
};

export function AIProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [width, setWidthState] = useState(DEFAULT_WIDTH);
  const [expanded, setExpanded] = useState(false);
  const [request, setRequest] = useState<Ctx["request"]>(null);
  const counter = useRef(0);

  // remember panel size across visits (it always starts closed: the tutor never opens on its own)
  useEffect(() => {
    const w = Number(store.get("llm100-ai-width"));
    if (w >= MIN_WIDTH && w <= MAX_WIDTH) setWidthState(w);
    setExpanded(store.get("llm100-ai-expanded") === "1");
  }, []);

  const setWidth = useCallback((w: number) => {
    const next = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));
    setWidthState(next);
    setExpanded(false);
    store.set("llm100-ai-width", String(next));
    store.set("llm100-ai-expanded", "0");
  }, []);
  const toggleExpanded = useCallback(() => {
    setExpanded((e) => {
      store.set("llm100-ai-expanded", e ? "0" : "1");
      return !e;
    });
  }, []);

  const openPanel = useCallback((v?: View) => {
    if (v) setView(v);
    setOpen(true);
  }, []);
  const ask = useCallback((req: AskRequest) => {
    setView("chat");
    setOpen(true);
    setRequest({ ...req, id: ++counter.current });
  }, []);

  // Ctrl/Cmd + / toggles the tutor from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      open,
      width,
      expanded,
      setWidth,
      toggleExpanded,
      view,
      request,
      openPanel,
      closePanel: () => setOpen(false),
      togglePanel: () => setOpen((o) => !o),
      setView,
      ask,
    }),
    [open, width, expanded, setWidth, toggleExpanded, view, request, openPanel, ask],
  );
  return <AICtx.Provider value={value}>{children}</AICtx.Provider>;
}
