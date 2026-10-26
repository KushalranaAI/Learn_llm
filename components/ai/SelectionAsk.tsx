"use client";
// Highlight any page text (inside [data-askable]) and a small toolbar offers to explain it or ask about it.
// Ported from Machine Learning 1 → 100. Shown only when an AI is configured.
import { useEffect, useRef, useState } from "react";
import { useConnection } from "@/lib/ai/settings";
import Icon from "../ui/Icon";
import { useAI } from "./AIProvider";
import "./ai.css";

type Pos = { x: number; y: number; text: string };

/** Selected text with math as LaTeX source (KaTeX renders every formula twice - visibly and as hidden MathML). */
function selectedText(sel: Selection): string {
  const box = document.createElement("div");
  box.appendChild(sel.getRangeAt(0).cloneContents());
  const tex = (el: Element) => el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
  box.querySelectorAll(".katex-display").forEach((el) => {
    const t = tex(el);
    el.replaceWith(t ? `\n$$${t}$$\n` : "");
  });
  box.querySelectorAll(".katex").forEach((el) => {
    const t = tex(el);
    el.replaceWith(t ? `$${t}$` : "");
  });
  box.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
  box.querySelectorAll("p, li, h1, h2, h3, h4, pre, tr").forEach((el) => el.append("\n"));
  return (box.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

export default function SelectionAsk() {
  const { ready } = useConnection();
  return ready ? <SelectionToolbar /> : null;
}

function SelectionToolbar() {
  const { ask } = useAI();
  const [pos, setPos] = useState<Pos | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const check = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel && !sel.isCollapsed && sel.rangeCount ? selectedText(sel) : "";
        const anchor = sel?.anchorNode;
        const el = anchor instanceof Element ? anchor : anchor?.parentElement;
        if (!sel || sel.isCollapsed || text.length < 3 || !el?.closest("[data-askable]") || !!el.closest("input, textarea, select, .react-flow")) {
          setPos(null);
          return;
        }
        const r = sel.getRangeAt(0).getBoundingClientRect();
        if (!r.width && !r.height) return setPos(null);
        const above = r.top > 64;
        setPos({ x: Math.min(Math.max(r.left + r.width / 2, 110), window.innerWidth - 110), y: above ? r.top - 8 : r.bottom + 44, text });
      }, 120);
    };
    const hide = () => setPos(null);
    document.addEventListener("selectionchange", check);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("selectionchange", check);
      window.removeEventListener("scroll", hide);
      clearTimeout(timer.current);
    };
  }, []);

  if (!pos) return null;
  const quote = pos.text.length > 4000 ? pos.text.slice(0, 4000) + "…" : pos.text;
  return (
    <div className="selection-ask" style={{ left: pos.x, top: pos.y }} role="toolbar" aria-label="Ask about the selected text" onMouseDown={(e) => e.preventDefault()}>
      <button type="button" onClick={() => { ask({ quote, prompt: "Explain this simply, then say why it matters.", send: true }); setPos(null); }}>
        <Icon name="sparkles" size={14} /> Explain
      </button>
      <button type="button" onClick={() => { ask({ quote, prompt: "", send: false }); setPos(null); }}>
        <Icon name="message" size={14} /> Ask…
      </button>
    </div>
  );
}
