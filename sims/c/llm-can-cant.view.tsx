"use client";
// Sorting game: deal a task card, the learner sends it to "Good at" or "Needs tools or grounding", feedback pops in.
// Play / Step sort the remaining cards correctly (a worked demo); Reset clears the board.
import { useState } from "react";
import type { SimViewProps } from "../types";
import { SimStyle, Transport, usePlayback } from "./anim";
import { CARDS, N, dealOrder, encode, parseAnswers, type Bucket } from "./can-cant-data";

const ZONE: Record<Bucket, { label: string; color: string }> = {
  g: { label: "Good at", color: "var(--accent)" },
  t: { label: "Needs tools or grounding", color: "var(--warm)" },
};

export default function CanCantView({ params, setParam }: SimViewProps) {
  const answers = parseAnswers(params);
  const order = dealOrder(Number(params.seed ?? 1));
  const placed = answers.filter((a) => a !== ".").length;
  const next = order.find((i) => answers[i] === ".");
  const [last, setLast] = useState<{ card: number; bucket: Bucket; n: number } | null>(null);

  const write = (a: string[]) => setParam("answers", encode(a));
  const place = (card: number, bucket: Bucket) => {
    const a = [...answers];
    a[card] = bucket;
    write(a);
    setLast({ card, bucket, n: (last?.n ?? 0) + 1 });
  };
  const unplace = (card: number) => {
    const a = [...answers];
    a[card] = ".";
    write(a);
    setLast(null);
  };
  // the demo: placing k cards = sort the next unplaced cards correctly until k are placed
  const setIndex = (k: number) => {
    if (k <= 0) {
      write(CARDS.map(() => "."));
      setLast(null);
      return;
    }
    const a = [...answers];
    let count = placed, lastCard = -1;
    for (const i of order) {
      if (count >= k) break;
      if (a[i] === ".") {
        a[i] = CARDS[i].right;
        count++;
        lastCard = i;
      }
    }
    write(a);
    if (lastCard >= 0) setLast({ card: lastCard, bucket: CARDS[lastCard].right, n: (last?.n ?? 0) + 1 });
  };
  const pb = usePlayback({ index: placed, setIndex, last: N, ms: 1500 });
  const correct = answers.filter((a, i) => a === CARDS[i].right).length;

  return (
    <div className="sc" ref={pb.rootRef}>
      <SimStyle />
      {/* progress pips */}
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }} aria-label={`${placed} of ${N} placed, ${correct} correct`}>
        {order.map((i) => {
          const a = answers[i];
          const ok = a !== "." && a === CARDS[i].right;
          return <span key={i} style={{ width: 18, height: 6, borderRadius: 99, background: a === "." ? "var(--panel-3)" : ok ? "var(--good)" : "var(--bad)", transition: "background .3s" }} />;
        })}
        <span className="sc-count" style={{ marginLeft: 6 }}>{correct}/{N} correct</span>
      </div>

      {/* current card */}
      {next !== undefined ? (
        <div key={`card-${next}`} className="sc-card sc-pop" style={{ textAlign: "center", padding: "16px 14px", boxShadow: "var(--shadow)", border: "1px solid var(--line-2)" }}>
          <div className="sc-label">Card {placed + 1} of {N}</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", margin: "6px 0 4px" }}>{CARDS[next].task}</div>
          <div className="sc-cap" style={{ fontStyle: "italic" }}>{CARDS[next].example}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" className="sc-btn good" onClick={() => { pb.pause(); place(next, "g"); }}>
              <span aria-hidden="true">←</span> Good at
            </button>
            <button type="button" className="sc-btn warm" onClick={() => { pb.pause(); place(next, "t"); }}>
              Needs tools or grounding <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      ) : (
        <div key="done" className="sc-card sc-pop" style={{ textAlign: "center", borderColor: "var(--accent-line)" }}>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--accent-strong)" }}>{correct}/{N}</div>
          <div className="sc-cap">The pattern: LLMs shine at working with language they can see. Exact computation, fresh facts and things they never read need a tool or the right context.</div>
        </div>
      )}

      {/* feedback */}
      <div style={{ minHeight: 46 }} aria-live="polite">
        {last && (
          <div key={`fb-${last.n}`} className="sc-in" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 12px", borderRadius: 10, background: last.bucket === CARDS[last.card].right ? "color-mix(in srgb, var(--good) 12%, transparent)" : "color-mix(in srgb, var(--bad) 12%, transparent)", fontSize: "0.85rem" }}>
            <b className="sc-pop" style={{ color: last.bucket === CARDS[last.card].right ? "var(--good)" : "var(--bad)", whiteSpace: "nowrap" }}>
              {last.bucket === CARDS[last.card].right ? "✓ Right" : `✗ It's “${ZONE[CARDS[last.card].right].label}”`}
            </b>
            <span style={{ color: "var(--text-2)" }}>{CARDS[last.card].why}</span>
          </div>
        )}
      </div>

      {/* zones */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {(["g", "t"] as Bucket[]).map((b) => (
          <div key={b} className="sc-card" style={{ borderTop: `3px solid ${ZONE[b].color}`, minHeight: 80 }}>
            <div className="sc-label" style={{ color: ZONE[b].color, marginBottom: 6 }}>{ZONE[b].label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {order.filter((i) => answers[i] === b).map((i) => {
                const ok = CARDS[i].right === b;
                return (
                  <button
                    key={i}
                    type="button"
                    className="sc-pop"
                    onClick={() => { pb.pause(); unplace(i); }}
                    title={`${CARDS[i].why} (click to take it back)`}
                    style={{ all: "unset", cursor: "pointer", fontSize: "0.76rem", padding: "3px 8px", borderRadius: 99, background: "var(--panel)", border: `1px solid ${ok ? "color-mix(in srgb, var(--good) 50%, transparent)" : "color-mix(in srgb, var(--bad) 60%, transparent)"}`, color: "var(--text-2)" }}
                  >
                    <b style={{ color: ok ? "var(--good)" : "var(--bad)" }}>{ok ? "✓" : "✗"}</b> {CARDS[i].task}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Transport pb={pb} index={placed} last={N} label="sorted" />
      <div className="sc-count" style={{ whiteSpace: "normal" }}>Play or Step sorts the remaining cards for you. Click a placed card to take it back.</div>
    </div>
  );
}
