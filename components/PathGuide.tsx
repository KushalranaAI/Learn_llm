// "Which path should I take?": the three learning paths, in order, with the current one marked.
import { LEARNING_PATHS, PATH_ORDER_NOTE, type PathId } from "@/lib/paths";

export default function PathGuide({ current }: { current: PathId }) {
  return (
    <section className="pathguide" aria-label="Learning paths">
      <p className="eyebrow">Learning paths</p>
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
    </section>
  );
}
