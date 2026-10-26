"use client";
// A quick check. The first answer counts: a miss goes into spaced review (back tomorrow, then after 3, 7, 14, 30 days).
import { createContext, useContext, useState } from "react";
import ExplainButton from "@/components/ai/ExplainButton";
import MiniMarkdown from "@/components/MiniMarkdown";
import Icon from "@/components/ui/Icon";
import { type QuizData, recordCheck, useProgress } from "@/lib/progress";

export const TopicContext = createContext<{ id: string; title: string } | null>(null);

export function hashText(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function QuizCard({
  quiz,
  onAnswer,
  label = "Quick check",
  resetKey,
}: {
  quiz: QuizData;
  onAnswer?: (ok: boolean) => void;
  label?: string;
  resetKey?: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setPicked(null);
  }
  const answered = picked !== null;
  return (
    <div className="quiz">
      <div className="quiz-head">
        <Icon name="target" size={15} /> {label}
      </div>
      <MiniMarkdown className="quiz-q">{quiz.q}</MiniMarkdown>
      <div className="quiz-options" role="radiogroup">
        {quiz.options.map((o, i) => {
          const state = !answered ? "" : i === quiz.answer ? "right" : i === picked ? "wrong" : "dim";
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={picked === i}
              className={`quiz-option ${state}`}
              disabled={answered}
              onClick={() => {
                setPicked(i);
                onAnswer?.(i === quiz.answer);
              }}
            >
              <span className="quiz-letter">{String.fromCharCode(65 + i)}</span>
              <MiniMarkdown>{o}</MiniMarkdown>
              {state === "right" && <Icon name="check" size={16} />}
              {state === "wrong" && <Icon name="x" size={16} />}
            </button>
          );
        })}
      </div>
      {answered && (
        <div className={`quiz-feedback ${picked === quiz.answer ? "right" : "wrong"}`}>
          <b>{picked === quiz.answer ? "Right." : "Not quite."}</b>
          {quiz.explain && <MiniMarkdown>{quiz.explain}</MiniMarkdown>}
          {/* optional AI tutor (only shown when configured); the answer is already revealed here */}
          <ExplainButton
            prompt={() =>
              [
                `Explain this quick check. Question: ${quiz.q}`,
                "Options:",
                ...quiz.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`),
                `The correct answer is ${String.fromCharCode(65 + quiz.answer)}. I picked ${String.fromCharCode(65 + (picked ?? 0))}.`,
                picked === quiz.answer ? "Why is it right, and why are the others wrong?" : "Why is my pick wrong and the correct one right? Address the misconception behind my choice.",
              ].join("\n")
            }
          />
        </div>
      )}
    </div>
  );
}

/** A quiz inside a topic: records the first answer and schedules misses for review. */
export default function Quiz({ raw }: { raw: string }) {
  const topic = useContext(TopicContext);
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
  return (
    <div>
      <QuizCard
        quiz={quiz}
        onAnswer={(ok) => topic && recordCheck(id, ok, { id, topic: topic.id, topicTitle: topic.title, quiz })}
      />
      {prior && !prior.ok && progress.reviews[id] && (
        <p className="muted small quiz-note"><Icon name="repeat" size={13} /> In your review queue: it comes back on the right day until it sticks.</p>
      )}
    </div>
  );
}
