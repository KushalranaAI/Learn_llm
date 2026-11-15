// "Which path should I take?": the three LLM-stage paths, in order, with the current one marked, and where they sit
// in the Learn in Public family (from the shared registry, design/roadmaps.js).
import { LEARNING_PATHS, PATH_ORDER_NOTE, type PathId } from "@/lib/paths";
import { FAMILY, ROADMAPS, STAGES } from "@/app/design/roadmaps.js";

const STAGE = STAGES.find((s) => s.id === "llm")!;
const BEFORE = ROADMAPS.filter((r) => STAGES.findIndex((s) => s.id === r.stage) < STAGES.indexOf(STAGE));
const ALONGSIDE = ROADMAPS.filter((r) => r.stage === "systems");
const names = (list: typeof ROADMAPS) => list.map((r) => r.name).join(", ").replace(/, ([^,]*)$/, " and $1");

export default function PathGuide({ current }: { current: PathId }) {
  return (
    <section className="pathguide" aria-label="Learning paths">
      <p className="eyebrow">{FAMILY.name} · stage {STAGE.n} of {STAGES.length}: {STAGE.title}</p>
      <h2>Which path should I take?</h2>
      <p className="muted">{PATH_ORDER_NOTE}</p>
      <ol className="pathguide-grid">
        {LEARNING_PATHS.map((p, i) => {
          const here = p.id === current;
          return (
            <li key={p.id} className={`pathguide-card${here ? " here" : ""}`}>
              <span className="pathguide-num" aria-hidden="true">{i + 1}</span>
              <b>{p.title}</b>
              {here && <span className="pathguide-here">You are here</span>}
              <p>{p.what}</p>
              <p className="muted small"><strong>Start here if:</strong> {p.startIf}</p>
              <p className="muted small"><strong>Then:</strong> {p.then}</p>
              {!here && <a className="btn sm" href={p.href} target="_blank" rel="noreferrer">Open {p.title}</a>}
            </li>
          );
        })}
      </ol>
      <p className="pathguide-family muted small">
        These are stage {STAGE.n} of <a href={FAMILY.hub}>{FAMILY.name}</a>, {ROADMAPS.length} free roadmaps by {FAMILY.author}.
        {" "}Before them: {names(BEFORE)}. Alongside them: {names(ALONGSIDE)}, for the systems around your models.{" "}
        <a href={FAMILY.hub}>See every roadmap</a>
      </p>
    </section>
  );
}
