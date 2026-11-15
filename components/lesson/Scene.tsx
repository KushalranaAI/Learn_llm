"use client";
// ```scene — a small, auto-playing "everyday story" that maps a real-life situation onto the technical idea.
//
//   title: A librarian finds a book
//   step: 🙋 You ask for "something cosy for a rainy evening" | Your query
//   step: 🧠 She thinks about the meaning, not the exact words | Embedding
//   takeaway: Search by meaning, not by matching words.
//
// One `step:` per line. Text before " | " is plain everyday language (start it with one emoji); the part after
// " | " is the technical term it stands for (optional). Plain text only, no markdown.
// The same file is copied into every app (Learn_llm, AI-engineering, All-in-One-RAG_tutorials); keep them identical.
import { useCallback, useEffect, useRef, useState } from "react";

type SceneStep = { icon: string; text: string; term?: string };
type SceneData = { title: string; steps: SceneStep[]; takeaway?: string };

const LEAD_EMOJI = /^(\p{Extended_Pictographic}(?:️|‍|\p{Extended_Pictographic})*)\s+/u;

export function parseScene(raw: string): SceneData {
  const data: SceneData = { title: "", steps: [] };
  for (const line of raw.split("\n")) {
    const m = /^(title|step|takeaway)\s*:\s*(.*)$/i.exec(line.trim());
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "title") data.title = value;
    else if (key === "takeaway") data.takeaway = value;
    else {
      const cut = value.lastIndexOf(" | ");
      const body = cut >= 0 ? value.slice(0, cut).trim() : value;
      const term = cut >= 0 ? value.slice(cut + 3).trim() : undefined;
      const e = LEAD_EMOJI.exec(body);
      data.steps.push({ icon: e ? e[1] : "•", text: e ? body.slice(e[0].length) : body, term: term || undefined });
    }
  }
  return data;
}

const STEP_MS = 2800;

export default function Scene({ raw }: { raw: string }) {
  const { title, steps, takeaway } = parseScene(raw);
  const n = steps.length;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const root = useRef<HTMLElement>(null);
  const started = useRef(false);

  // Start playing once, the first time the scene scrolls into view (never when the visitor prefers reduced motion).
  useEffect(() => {
    const el = root.current;
    if (!el || n < 2) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setI(n - 1);
      return;
    }
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !started.current) {
          started.current = true;
          setPlaying(true);
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [n]);

  useEffect(() => {
    if (!playing) return;
    if (i >= n - 1) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setI((v) => Math.min(v + 1, n - 1)), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, i, n]);

  const go = useCallback((to: number) => {
    started.current = true;
    setPlaying(false);
    setI(Math.max(0, Math.min(n - 1, to)));
  }, [n]);

  if (n === 0) return null;
  const done = i >= n - 1;

  return (
    <figure className="scene" ref={root} aria-label={title || "Everyday example"}>
      <figcaption className="scene-head">
        <span className="scene-eyebrow">Picture it</span>
        <b>{title}</b>
        <span className="scene-count">{i + 1} / {n}</span>
      </figcaption>
      <ol className="scene-list" style={{ ["--scene-progress" as string]: n > 1 ? `${(i / (n - 1)) * 100}%` : "100%" }}>
        {steps.map((s, j) => (
          <li key={j} className={j < i ? "done" : j === i ? "now" : "later"} aria-current={j === i ? "step" : undefined}>
            <span className="scene-icon" aria-hidden="true">{s.icon}</span>
            <div className="scene-text">
              <p>{s.text}</p>
              {s.term && <span className="scene-term"><i>In the system</i>{s.term}</span>}
            </div>
          </li>
        ))}
      </ol>
      {takeaway && done && <p className="scene-take">{takeaway}</p>}
      <div className="scene-foot">
        <button type="button" className="btn ghost sm" onClick={() => go(i - 1)} disabled={i === 0}>Back</button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            if (done) {
              started.current = true;
              setI(0);
              setPlaying(true);
            } else setPlaying((p) => !p);
          }}
        >
          {done ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="btn sm" onClick={() => go(i + 1)} disabled={done}>Next</button>
      </div>
    </figure>
  );
}
