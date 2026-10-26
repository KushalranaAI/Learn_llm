"use client";
// Contamination: a grid of benchmark items (outlined = leaked into training), filled when answered right.
// The re-test button rephrases every item; memorised answers stop working and the true score appears.
import "./sims-d.css";
import { bool, num, type SimViewProps } from "../types";
import { SimStyle } from "../c/anim";
import { model, sampleItems } from "./benchmark-contamination-model";

export default function ContaminationView({ params, metrics, setParam }: SimViewProps) {
  const x = model(params);
  const cells = Math.min(240, x.n);
  const items = sampleItems(params, cells);
  const retest = bool(params, "retest");
  const seenN = items.filter((i) => i.seen).length;
  const right = items.filter((i) => (retest ? i.rightRetest : i.right)).length;
  const rightSeen = items.filter((i) => i.seen && (retest ? i.rightRetest : i.right)).length;
  const bar = (v: number, color: string, label: string, val: string, hidden = false) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(84px, 120px) minmax(0, 1fr) 54px", gap: 8, alignItems: "center", fontSize: "0.8rem" }}>
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <span style={{ position: "relative", height: 14, background: "var(--panel-3)", borderRadius: 7, overflow: "hidden" }}>
        <span className="sd-bar" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${hidden ? 0 : v * 100}%`, background: color, borderRadius: 7 }} />
      </span>
      <b className="sd-mono" style={{ textAlign: "right" }}>{hidden ? "?" : val}</b>
    </div>
  );
  return (
    <div className="sd sc">
      <SimStyle />
      <div className="sd-row">
        <button type="button" className="sc-btn primary" onClick={() => setParam("retest", !retest)} aria-pressed={retest}>
          <span aria-hidden="true" className="sc-ico">{retest ? "↺" : "▶"}</span>
          {retest ? "Back to the public benchmark" : "Re-test on rephrased, held-out items"}
        </button>
        <span className={`sd-badge ${retest ? "info" : "warm"}`}>{retest ? "rephrased re-test" : "public benchmark"}</span>
      </div>
      <div className="sd-card">
        <div className="sd-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <span className="sd-label">{cells} of {x.n.toLocaleString("en-US")} items · {seenN} leaked into training</span>
          <span className="sd-legend">
            <span><i style={{ background: "var(--good)" }} />answered right</span>
            <span><i style={{ background: "var(--panel-3)" }} />wrong</span>
            <span><i style={{ background: "transparent", border: "2px solid var(--warm)" }} />seen in training</span>
          </span>
        </div>
        <div className="sd-items" role="img" aria-label={`${right} of ${cells} sample items answered right; ${seenN} were seen in training`}>
          {items.map((it, i) => {
            const ok = retest ? it.rightRetest : it.right;
            const changed = it.right !== it.rightRetest;
            return <span key={i} className={`sd-item ${it.seen ? "seen" : ""} ${ok ? "right" : "wrong"} ${retest && changed ? "flip" : ""}`} style={{ transitionDelay: `${(i % 40) * 12}ms` }} />;
          })}
        </div>
        <p className="sd-cap" style={{ margin: "8px 0 0" }} aria-live="polite">
          {retest
            ? `Rephrased, the leaked items are answered right only ${seenN ? Math.round((rightSeen / seenN) * 100) : 0}% of the time, the same as unseen ones: memorisation does not transfer.`
            : `Leaked items are answered right ${seenN ? Math.round((rightSeen / seenN) * 100) : 0}% of the time from memory, against ${Math.round(x.a * 100)}% on items the model never saw.`}
        </p>
      </div>
      <div className="sd-card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {bar(metrics.reportedScore, "var(--warm)", "Reported score", `${(metrics.reportedScore * 100).toFixed(1)}%`)}
        {bar(metrics.trueScore, "var(--info)", "True ability", `${(metrics.trueScore * 100).toFixed(1)}%`, !retest)}
        {bar(Math.max(0, metrics.inflation), "var(--bad)", "Inflation", `+${(metrics.inflation * 100).toFixed(1)}`, !retest)}
        <small className="muted">
          Sampling noise on {num(params, "benchmarkSize").toLocaleString("en-US")} items is ±{(metrics.noiseMargin * 100).toFixed(1)} points (95%).{" "}
          {retest ? (metrics.inflation > metrics.noiseMargin ? "The inflation is bigger than the noise: the leaderboard gap is an artefact." : "Here the inflation is within the noise.") : "Press re-test to reveal the true score."}
        </small>
      </div>
    </div>
  );
}
