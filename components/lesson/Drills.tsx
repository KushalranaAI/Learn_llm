"use client";
// Code drills that need no code runner (evidence: Parsons problems teach about as much as writing the code, in less
// time; spotting a planted bug trains the debugging eye that shape-correct-but-wrong ML code needs).
//
// ```parsons  {"title": "...", "lines": ["first line", "  second line", ...], "explain": "markdown"}
//   `lines` are in the CORRECT order (indentation included); the page shuffles them. Move lines with the arrows.
// ```bughunt  {"q": "...", "code": "line 1\nline 2\n...", "bug": 3, "explain": "markdown"}
//   `bug` is the 1-based number of the line with the bug. Click the line you think is wrong.
import { useContext, useMemo, useState } from "react";
import MiniMarkdown from "@/components/MiniMarkdown";
import Icon from "@/components/ui/Icon";
import { hashText } from "@/lib/hash";
import { recordDrill, useProgress } from "@/lib/progress";
import { TopicContext } from "./Quiz";

/** Deterministic shuffle (same order on server and client, so no hydration mismatch); never the solved order. */
function shuffled<T>(xs: T[], seedText: string): number[] {
  let seed = parseInt(hashText(seedText), 36) || 1;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const idx = xs.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (idx.every((v, i) => v === i) && idx.length > 1) idx.push(idx.shift()!);
  return idx;
}

function useDrillId(prefix: string, raw: string) {
  const topic = useContext(TopicContext);
  return `${topic?.id ?? "x"}#${prefix}${hashText(raw)}`;
}

type ParsonsData = { title?: string; lines: string[]; explain?: string };
type BugData = { q: string; code: string; bug: number; explain?: string };

export function Parsons({ raw }: { raw: string }) {
  let d: ParsonsData;
  try {
    d = JSON.parse(raw);
    if (!Array.isArray(d.lines) || d.lines.length < 3) throw new Error();
  } catch {
    return <pre className="callout warn">Invalid parsons block</pre>;
  }
  return <ParsonsInner d={d} raw={raw} />;
}

function ParsonsInner({ d, raw }: { d: ParsonsData; raw: string }) {
  const id = useDrillId("parsons", raw);
  const p = useProgress();
  const start = useMemo(() => shuffled(d.lines, raw), [d.lines, raw]);
  const [order, setOrder] = useState<number[]>(start);
  const [checked, setChecked] = useState(false);
  const solved = order.every((v, i) => v === i);
  const done = p.drills?.[id]?.ok;
  const move = (k: number, dir: -1 | 1) => {
    const j = k + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[k], next[j]] = [next[j], next[k]];
    setOrder(next);
    setChecked(false);
  };
  const check = () => {
    setChecked(true);
    recordDrill(id, solved);
  };
  return (
    <div className="drill">
      <div className="quiz-head"><Icon name="list" size={15} /> Put the lines in order</div>
      {d.title && <MiniMarkdown className="quiz-q">{d.title}</MiniMarkdown>}
      <ol className="parsons">
        {order.map((li, k) => (
          <li key={li} className={checked ? (li === k ? "ok" : "bad") : ""}>
            <code>{d.lines[li]}</code>
            <span className="parsons-move">
              <button type="button" className="icon-btn" onClick={() => move(k, -1)} disabled={k === 0} aria-label="Move line up"><Icon name="chevron-up" size={15} /></button>
              <button type="button" className="icon-btn" onClick={() => move(k, 1)} disabled={k === order.length - 1} aria-label="Move line down"><Icon name="chevron-down" size={15} /></button>
            </span>
          </li>
        ))}
      </ol>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn sm" onClick={check}>Check order</button>
        <button type="button" className="chip-btn" onClick={() => { setOrder(start); setChecked(false); }}>Reset</button>
        {done && !checked && <span className="muted small"><Icon name="circle-check" size={13} /> Solved before</span>}
      </div>
      {checked && (
        <div className={`quiz-feedback ${solved ? "right" : "wrong"}`}>
          <b>{solved ? "Right order." : `${order.filter((v, i) => v === i).length} of ${order.length} lines are in place. Lines marked red are not.`}</b>
          {solved && d.explain && <MiniMarkdown>{d.explain}</MiniMarkdown>}
        </div>
      )}
    </div>
  );
}

export function BugHunt({ raw }: { raw: string }) {
  let d: BugData;
  try {
    d = JSON.parse(raw);
    if (typeof d.code !== "string" || !(d.bug >= 1 && d.bug <= d.code.split("\n").length)) throw new Error();
  } catch {
    return <pre className="callout warn">Invalid bughunt block</pre>;
  }
  return <BugHuntInner d={d} raw={raw} />;
}

function BugHuntInner({ d, raw }: { d: BugData; raw: string }) {
  const id = useDrillId("bug", raw);
  const [pick, setPick] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const lines = d.code.split("\n");
  const found = pick === d.bug;
  const choose = (n: number) => {
    if (found) return;
    setPick(n);
    setTries((t) => t + 1);
    recordDrill(id, n === d.bug);
  };
  return (
    <div className="drill">
      <div className="quiz-head"><Icon name="search" size={15} /> Find the bug</div>
      <MiniMarkdown className="quiz-q">{d.q}</MiniMarkdown>
      <div className="bughunt" role="list">
        {lines.map((l, k) => {
          const n = k + 1;
          const state = pick === n ? (found ? "ok" : "bad") : found && n === d.bug ? "ok" : "";
          return (
            <button key={k} type="button" role="listitem" className={`bug-line ${state}`} onClick={() => choose(n)} disabled={found}>
              <span className="bug-n">{n}</span>
              <code>{l || " "}</code>
            </button>
          );
        })}
      </div>
      {pick !== null && (
        <div className={`quiz-feedback ${found ? "right" : "wrong"}`}>
          <b>{found ? (tries === 1 ? "Found it first time." : `Found it after ${tries} tries.`) : `Line ${pick} is fine. Look again: the code runs and every shape is right, so the bug is in the meaning.`}</b>
          {found && d.explain && <MiniMarkdown>{d.explain}</MiniMarkdown>}
        </div>
      )}
    </div>
  );
}
