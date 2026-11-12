"use client";
// A quick check. Pick an answer, say how sure you are, then see whether you were right. Saying how sure you are
// before the reveal is what makes a confident mistake memorable (the hypercorrection effect), and it feeds the
// calibration chart on My progress. Every first answer joins spaced review; see lib/progress.ts.
import { createContext, useContext, useState } from "react";
import ExplainButton from "@/components/ai/ExplainButton";
import MiniMarkdown from "@/components/MiniMarkdown";
import Icon from "@/components/ui/Icon";
import { hashText } from "@/lib/hash";
import { type Confidence, type QuizData, recordCheck, useProgress } from "@/lib/progress";

export { hashText };

export const TopicContext = createContext<{ id: string; title: string } | null>(null);

const CONF: { id: Confidence; label: string }[] = [
  { id: "sure", label: "Sure" },
  { id: "think", label: "Think so" },
  { id: "guess", label: "Guessing" },
];

export function QuizCard({
  quiz,
  onAnswer,
  label = "Quick check",
  resetKey,
  icon = "target",
}: {
  quiz: QuizData;
  onAnswer?: (ok: boolean, conf: Confidence) => void;
  label?: string;
  resetKey?: string;
  icon?: "target" | "repeat" | "refresh";
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [conf, setConf] = useState<Confidence | null>(null);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setPicked(null);
    setConf(null);
  }
  const revealed = picked !== null && conf !== null;
  const ok = picked === quiz.answer;
  return (
    <div className="quiz">
      <div className="quiz-head">
        <Icon name={icon} size={15} /> {label}
      </div>
      <MiniMarkdown className="quiz-q">{quiz.q}</MiniMarkdown>
      <div className="quiz-options" role="radiogroup">
        {quiz.options.map((o, i) => {
          const state = !revealed ? (picked === i ? "picked" : "") : i === quiz.answer ? "right" : i === picked ? "wrong" : "dim";
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={picked === i}
              className={`quiz-option ${state}`}
              disabled={revealed}
              onClick={() => setPicked(i)}
            >
              <span className="quiz-letter">{String.fromCharCode(65 + i)}</span>
              <MiniMarkdown>{o}</MiniMarkdown>
              {state === "right" && <Icon name="check" size={16} />}
              {state === "wrong" && <Icon name="x" size={16} />}
            </button>
          );
        })}
      </div>
      {picked !== null && !revealed && (
        <div className="quiz-conf" role="group" aria-label="How sure are you?">
          <span>How sure are you?</span>
          {CONF.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip-btn"
              onClick={() => {
                setConf(c.id);
                onAnswer?.(picked === quiz.answer, c.id);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      {revealed && (
        <div className={`quiz-feedback ${ok ? "right" : "wrong"}`}>
          <b>{ok ? (conf === "guess" ? "Right, though you were guessing." : "Right.") : conf === "sure" ? "Not quite, and you were sure: this one will come back soon." : "Not quite."}</b>
          {quiz.explain && <MiniMarkdown>{quiz.explain}</MiniMarkdown>}
          {/* optional AI tutor (only shown when configured); the answer is already revealed here */}
          <ExplainButton
            prompt={() =>
              [
                `Explain this quick check. Question: ${quiz.q}`,
                "Options:",
                ...quiz.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`),
                `The correct answer is ${String.fromCharCode(65 + quiz.answer)}. I picked ${String.fromCharCode(65 + (picked ?? 0))}.`,
                ok ? "Why is it right, and why are the others wrong?" : "Why is my pick wrong and the correct one right? Address the misconception behind my choice.",
              ].join("\n")
            }
          />
        </div>
      )}
    </div>
  );
}

/** A quiz inside a topic: records the first answer and schedules it for spaced review. */
export default function Quiz({ raw, label, icon, topicOverride }: { raw: string; label?: string; icon?: "target" | "refresh"; topicOverride?: { id: string; title: string } }) {
  const ctx = useContext(TopicContext);
  const topic = topicOverride ?? ctx;
  const progress = useProgress();
  let quiz: QuizData;
  try {
    quiz = JSON.parse(raw);
    if (!Array.isArray(quiz.options) || typeof quiz.answer !== "number") throw new Error("bad quiz");
  } catch {
    return <pre className="callout warn">Invalid quiz block</pre>;
  }
  const id = `${topic?.id ?? "x"}#${hashText(quiz.q)}`;
  const prior = progress.checks[id];
  const item = progress.reviews[id];
  return (
    <div>
      <QuizCard
        quiz={quiz}
        label={label}
        icon={icon}
        onAnswer={(ok, conf) => topic && recordCheck(id, ok, { id, topic: topic.id, topicTitle: topic.title, quiz }, conf)}
      />
      {prior && item && !item.retired && (
        <p className="muted small quiz-note">
          <Icon name="repeat" size={13} /> In your review deck: it comes back in {Math.max(1, Math.round((item.due - Date.now()) / 86_400_000))} day{Math.round((item.due - Date.now()) / 86_400_000) === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
