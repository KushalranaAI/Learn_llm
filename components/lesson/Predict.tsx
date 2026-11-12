"use client";
// ```predict: commit to a prediction before the explanation or the simulation shows the answer. Predicting first
// is what turns watching into learning (Crouch et al. 2004: watching a demo alone did no better than not seeing it).
// Format: {"q": "...", "options": ["..", ".."], "answer": 1, "reveal": "markdown shown after the pick"}
// `answer` is optional: leave it out for open predictions ("which way will the curve bend?") that the
// simulation below settles.
import { useContext } from "react";
import MiniMarkdown from "@/components/MiniMarkdown";
import Icon from "@/components/ui/Icon";
import { hashText } from "@/lib/hash";
import { recordPrediction, useProgress } from "@/lib/progress";
import { TopicContext } from "./Quiz";

type P = { q: string; options: string[]; answer?: number; reveal?: string };

export default function Predict({ raw }: { raw: string }) {
  const topic = useContext(TopicContext);
  const p = useProgress();
  let d: P;
  try {
    d = JSON.parse(raw);
    if (!Array.isArray(d.options)) throw new Error();
  } catch {
    return <pre className="callout warn">Invalid predict block</pre>;
  }
  const id = `${topic?.id ?? "x"}#p${hashText(d.q)}`;
  const pick = p.predictions?.[id]?.pick;
  const done = pick !== undefined;
  return (
    <div className="predict">
      <div className="quiz-head"><Icon name="lightbulb" size={15} /> Predict first</div>
      <MiniMarkdown className="quiz-q">{d.q}</MiniMarkdown>
      <div className="quiz-options">
        {d.options.map((o, i) => {
          const state = !done ? "" : d.answer === undefined ? (i === pick ? "picked" : "dim") : i === d.answer ? "right" : i === pick ? "wrong" : "dim";
          return (
            <button key={i} type="button" className={`quiz-option ${state}`} disabled={done} onClick={() => recordPrediction(id, i)}>
              <span className="quiz-letter">{String.fromCharCode(65 + i)}</span>
              <MiniMarkdown>{o}</MiniMarkdown>
              <span />
            </button>
          );
        })}
      </div>
      {!done && <p className="muted small" style={{ margin: "10px 2px 0" }}>Commit to an answer. A wrong guess here costs nothing and makes the explanation stick.</p>}
      {done && (
        <div className="quiz-feedback neutral">
          <b>{d.answer === undefined ? `You predicted ${String.fromCharCode(65 + pick)}. Now check it below.` : pick === d.answer ? "Your prediction was right." : `You predicted ${String.fromCharCode(65 + pick)}; it is ${String.fromCharCode(65 + d.answer)}.`}</b>
          {d.reveal && <MiniMarkdown>{d.reveal}</MiniMarkdown>}
        </div>
      )}
    </div>
  );
}
