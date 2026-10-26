"use client";
// What the tutor sees on /interview: the current question, and an answer only once the learner has revealed it.
// The interview screens render answers (key points, full answer) only after a reveal, so reading the page at the moment
// a question is sent never leaks a hidden answer. Kept here so the interview components need no AI code; they can
// replace this with their own useChatSource("interview", ...) call at any time.
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { registerSource } from "@/lib/ai/sources";

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const visible = (el: Element) => !el.closest('[aria-hidden="true"], [inert], [hidden]');

export function readInterviewScreen(root: ParentNode = document): { question?: string; revealedAnswer?: string } | string {
  const main = root.querySelector("main") ?? root;
  const q = [...main.querySelectorAll(".iv-q")].find(visible);
  if (q) {
    const revealed = [".iv-points", ".iv-full"].map((s) => [...main.querySelectorAll(s)].filter(visible).map(text).join("\n")).filter(Boolean).join("\n\n");
    return { question: text(q), ...(revealed ? { revealedAnswer: revealed } : {}) };
  }
  const open = main.querySelector('[aria-expanded="true"][aria-controls^="a-"]');
  if (open) {
    const answer = main.querySelector(`#${CSS.escape(open.getAttribute("aria-controls") ?? "")}`);
    return { question: text(open.querySelector("b") ?? open), ...(answer ? { revealedAnswer: text(answer) } : {}) };
  }
  return "Interview prep: browsing the question bank (no question open).";
}

export default function InterviewSource() {
  const path = usePathname();
  const on = path?.startsWith("/interview") ?? false;
  useEffect(() => {
    if (!on) return;
    return registerSource("interview", {
      label: "Interview prep",
      suggestions: ["Give me a hint for this question", "How should I structure my answer?", "What would a senior answer add?"],
      build: () => readInterviewScreen(),
    });
  }, [on]);
  return null;
}
