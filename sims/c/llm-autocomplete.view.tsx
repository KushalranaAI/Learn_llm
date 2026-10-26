"use client";
// Token-by-token generation: candidate bars grow, the drawn token lights up, then flies into the text.
import { useEffect } from "react";
import { num, type SimViewProps } from "../types";
import { SimStyle, Transport, useLocalPlayback } from "./anim";
import { atOf, genOf } from "./autocomplete-model";

const show = (t: string) => t.replace(/\n/g, "↵");

export default function AutocompleteView({ params, setParam }: SimViewProps) {
  const g = genOf(params);
  const n = g.steps.length;
  const speed = Math.max(0.25, num(params, "speed") || 1);
  const seed = Number(params.seed ?? 1);
  const key = `${params.prompt}|${params.temperature}|${seed}`;
  // ticks: 2k = bars for step k are rising; 2k+1 = the drawn token is highlighted; 2n = finished
  const pb = useLocalPlayback(2 * n, (i) => (i % 2 === 0 ? 1000 : 650) / speed, key, true);
  const t = pb.index;
  const done = Math.floor(t / 2);
  const picking = t % 2 === 1 || t === 2 * n;
  const cur = Math.min(done, n - 1);

  // keep the metric tiles in step with the animation
  useEffect(() => {
    if (atOf(params, n) !== done || params.at === undefined) setParam("at", done);
  }, [done, params, n, setParam]);

  const cands = g.steps[cur];
  const probs = g.probs[cur];
  const order = cands.map((_, i) => i).sort((a, b) => probs[b] - probs[a]);
  const pick = g.chosen[cur];

  return (
    <div className="sc" ref={pb.rootRef}>
      <SimStyle />
      <div className="sc-card" style={{ fontSize: "1.02rem", lineHeight: 1.7, minHeight: 92, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }} aria-live="polite">
        <div className="sc-label" style={{ marginBottom: 4 }}>Text so far</div>
        <span className="sc-mono" style={{ color: "var(--text-2)" }}>{g.text}</span>
        {g.chosen.slice(0, done).map((k, i) => (
          <span
            key={`${key}-${i}`}
            className={`sc-mono ${i === done - 1 && !pb.reduced ? "sc-fly" : ""}`}
            style={{ display: "inline-block", whiteSpace: "pre", color: "var(--accent-strong)", background: "var(--accent-soft)", borderRadius: 5, padding: "0 1px" }}
            title={`p = ${(g.pChosen[i] * 100).toFixed(1)}%`}
          >
            {g.steps[i][k][0].replace(/\n/g, "↵\n")}
          </span>
        ))}
        {done < n && <span className="sc-caret" aria-hidden="true" />}
      </div>

      <div className="sc-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="sc-label">{done >= n ? `Last step (${n} of ${n})` : `Next token? step ${done + 1} of ${n}`}</span>
          <span className="sc-count">P(next token | text so far)</span>
        </div>
        <div key={`${key}-${cur}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {order.map((i, r) => {
            const isPick = picking && i === pick;
            const dim = picking && !isPick;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(64px, 28%) minmax(0, 1fr) 54px", gap: 8, alignItems: "center", opacity: dim ? 0.5 : 1, transition: "opacity .3s" }}>
                <span className="sc-chip" style={{ background: isPick ? "var(--accent)" : "var(--panel-3)", color: isPick ? "var(--on-accent)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", transition: "background .3s, color .3s" }}>
                  {show(cands[i][0]).replace(/^ /, "␣")}
                </span>
                <span style={{ height: 14, background: "var(--panel-3)", borderRadius: 99, overflow: "hidden" }}>
                  <span
                    className="sc-grow"
                    style={{ display: "block", height: "100%", width: `${Math.max(1.5, probs[i] * 100)}%`, borderRadius: 99, background: isPick ? "var(--accent)" : "var(--info)", animationDelay: `${r * 70}ms`, transition: "background .3s" }}
                  />
                </span>
                <span className="sc-mono" style={{ fontSize: "0.8rem", textAlign: "right", color: isPick ? "var(--accent-strong)" : "var(--text-2)" }}>
                  {(probs[i] * 100).toFixed(probs[i] < 0.1 ? 1 : 0)}%
                </span>
              </div>
            );
          })}
        </div>
        <div className="sc-cap" style={{ marginTop: 8, minHeight: "1.5em" }}>
          {picking ? (
            <>Drew <b className="sc-mono">{show(cands[pick][0]).trim() || "␣"}</b> ({(probs[pick] * 100).toFixed(1)}%) and appended it. Then the whole text goes back in.</>
          ) : (
            <>The model scores every possible next token. Here are the top 5.</>
          )}
        </div>
      </div>

      <Transport
        pb={pb}
        index={done}
        last={n}
        label="tokens"
        extra={
          <button type="button" className="sc-btn" onClick={() => setParam("seed", seed + 1)} title="Draw again with a new random seed">
            <span aria-hidden="true" className="sc-ico">⚄</span>Resample
          </button>
        }
      />
    </div>
  );
}
