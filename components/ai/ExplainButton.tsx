"use client";
// "Explain with AI": a small button that sends one question to the tutor. Rendered only when an AI is configured,
// and it never runs on its own - the learner has to click it.
import { useConnection } from "@/lib/ai/settings";
import Icon from "../ui/Icon";
import { useAIOptional } from "./AIProvider";
import "./ai.css";

export default function ExplainButton({
  prompt,
  quote,
  label = "Explain with AI",
  hint,
  className,
}: {
  /** the question; may be a function so it is built from live state at click time */
  prompt: string | (() => string);
  quote?: string;
  label?: string;
  /** small text next to the button */
  hint?: string;
  className?: string;
}) {
  const ai = useAIOptional();
  const { ready } = useConnection();
  if (!ai || !ready) return null;
  return (
    <div className={`ai-explain ${className ?? ""}`}>
      <button
        type="button"
        className="chip-btn ai-explain-btn"
        onClick={() => ai.ask({ prompt: typeof prompt === "function" ? prompt() : prompt, quote: quote && quote.length > 6000 ? quote.slice(0, 6000) + "\n…" : quote, send: true })}
      >
        <Icon name="sparkles" size={14} /> {label}
      </button>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}
