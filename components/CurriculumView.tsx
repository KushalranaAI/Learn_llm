"use client";
// The roadmap. Built from the research in docs/research/reports/Learning platform redesign research.md:
// - a recommended path you can leave freely: prerequisites are hints, never locks;
// - two zoom levels of 7–12 nodes each (modules, then one module's lessons); topics stay in the lesson outline;
// - five lesson states plus a separate "due for review" count; mastery needs delayed recall, not page views;
// - goal paths are filters over the same map, and "Ready to learn" is the fringe of what you can do next.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Goal, Outline } from "@/lib/content";
import { type LessonInfo, type LessonState, lessonLayers, moduleStats, prunedEdges, readyToLearn } from "@/lib/learner";
import { dueReviews, type Progress, setSkipped, useProgress } from "@/lib/progress";
import Icon, { type IconName } from "./ui/Icon";

const EMPTY: Progress = { done: {}, visited: {}, last: null, days: {}, checks: {}, reviews: {}, known: {}, labs: {}, simsTried: {} };
const pad = (n: number) => String(n).padStart(2, "0");
const GOAL_KEY = "llm100-goal";

export const STATE: Record<LessonState, { label: string; icon: IconName }> = {
  later: { label: "Builds on earlier lessons", icon: "circle" },
  ready: { label: "Ready to start", icon: "play" },
  started: { label: "In progress", icon: "activity" },
  complete: { label: "Finished", icon: "circle-check" },
  mastered: { label: "Mastered", icon: "trophy" },
};

// module map geometry (px): five columns, three rows (branches above and below the spine)
const MW = 188, MH = 126, MGX = 36, MGY = 30;
// lesson map geometry: layers top to bottom
const LW = 236, LH = 106, LGX = 22, LGY = 38;

export default function CurriculumView({ outline, goals }: { outline: Outline; goals: Goal[] }) {
  const p = useProgress();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const prog = mounted ? p : EMPTY;

  const [goal, setGoalState] = useState("all");
  useEffect(() => {
    try {
      const g = localStorage.getItem(GOAL_KEY);
      if (g && goals.some((x) => x.id === g)) setGoalState(g);
    } catch {}
  }, [goals]);
  const setGoal = (g: string) => {
    setGoalState(g);
    try { localStorage.setItem(GOAL_KEY, g); } catch {}
  };
  const goalDef = goals.find((g) => g.id === goal);
  const goalModules = goalDef?.modules ?? [];
  const noCode = !!goalDef?.noCode;
  const inGoal = (slug: string) => !goalModules.length || goalModules.includes(slug);

  const stats = useMemo(() => Object.fromEntries(outline.map((m) => [m.slug, moduleStats(prog, outline, m)])), [prog, outline]);
  const ready = useMemo(() => readyToLearn(prog, outline, goalModules, 3, noCode), [prog, outline, goalModules, noCode]);
  const due = mounted ? dueReviews(prog).length : 0;
  const lastLesson = prog.last ? prog.last.split("/").slice(0, 2).join("/") : null;

  // default selection: the module you were last in, else the first unfinished one on your path
  const [sel, setSel] = useState<string | null>(null);
  const fallback = (lastLesson && lastLesson.split("/")[0]) || outline.find((m) => inGoal(m.slug) && stats[m.slug].ratio < 1)?.slug || outline[0]?.slug;
  const selected = outline.find((m) => m.slug === (sel ?? fallback)) ?? outline[0];

  const totalTopics = outline.reduce((a, m) => a + stats[m.slug].topics, 0);
  const doneTopics = outline.reduce((a, m) => a + stats[m.slug].done, 0);
  const lessonsDone = outline.reduce((a, m) => a + stats[m.slug].complete, 0);
  const lessonsMastered = outline.reduce((a, m) => a + stats[m.slug].mastered, 0);
  const lessonsTotal = outline.reduce((a, m) => a + m.lessons.length, 0);

  return (
    <div className="page wide">
      <p className="eyebrow">Roadmap</p>
      <h1>Your path through how LLMs are built.</h1>
      <p className="lead">
        A recommended route from a single neuron to a fine-tuned, evaluated model, with branches you can take when you like. Nothing is locked: a lesson that
        builds on something you haven&apos;t done just says so.
      </p>

      <div className="goal-row" role="radiogroup" aria-label="Your goal">
        {goals.map((g) => (
          <button key={g.id} type="button" role="radio" aria-checked={goal === g.id} className={`goal-chip ${goal === g.id ? "on" : ""}`} onClick={() => setGoal(g.id)} title={g.text}>
            {g.title}
          </button>
        ))}
        <span className="muted small goal-text">{goals.find((g) => g.id === goal)?.text}</span>
      </div>

      <div className="next-strip">
        <div className="card next-card">
          <span className="eyebrow" style={{ margin: 0 }}>Ready to learn</span>
          {ready.length === 0 && <p className="muted small">Everything on this path is started or finished. Pick any lesson below, or review.</p>}
          {ready.map((x) => (
            <Link key={x.id} href={`/learn/${x.id}`} className="next-row">
              <span className="lesson-id">{x.module.order}.{x.lesson.order}</span>
              <span className="grow">{x.lesson.title}</span>
              <span className="muted small mono">{x.lesson.minutes} min</span>
              <Icon name="arrow-right" size={14} />
            </Link>
          ))}
        </div>
        <Link href="/review" className="card next-card review-card">
          <span className="eyebrow" style={{ margin: 0 }}>Review</span>
          <b className="big-number">{due}</b>
          <span className="muted small">{due ? "checks due today" : "nothing due right now"}</span>
        </Link>
        <div className="card next-card">
          <span className="eyebrow" style={{ margin: 0 }}>Overall</span>
          <div className="meter" style={{ marginTop: 10 }}><span style={{ width: `${(doneTopics / Math.max(1, totalTopics)) * 100}%` }} /></div>
          <span className="muted small">{doneTopics} of {totalTopics} topics · {lessonsDone} of {lessonsTotal} lessons finished · {lessonsMastered} mastered</span>
        </div>
      </div>

      <section aria-label="Modules">
        <div className="section-title"><h2>Modules</h2><span className="muted small">The solid line is the recommended path; dashed lines are branches.</span></div>
        <ModuleMap outline={outline} stats={stats} selected={selected.slug} onPick={setSel} inGoal={inGoal} />
      </section>

      <section aria-label={`Lessons in ${selected.title}`} style={{ marginTop: 34 }}>
        <div className="section-title">
          <div>
            <p className="eyebrow" style={{ margin: 0 }}>Module {pad(selected.order)}</p>
            <h2 style={{ margin: "4px 0 0" }}>{selected.title}</h2>
            <p className="muted" style={{ margin: "6px 0 0", maxWidth: 760 }}>{selected.summary}</p>
          </div>
          <Link href={`/learn/${selected.slug}`} className="btn sm">Open module <Icon name="arrow-right" size={14} /></Link>
        </div>
        <LessonMap module={selected} infos={stats[selected.slug].infos} outline={outline} current={lastLesson} noCode={noCode} />
        <Legend />
      </section>
    </div>
  );
}

function ModuleMap({ outline, stats, selected, onPick, inGoal }: {
  outline: Outline;
  stats: Record<string, ReturnType<typeof moduleStats>>;
  selected: string;
  onPick: (slug: string) => void;
  inGoal: (slug: string) => boolean;
}) {
  const pos = (m: Outline[number]) => ({ x: m.map.col * (MW + MGX), y: m.map.row * (MH + MGY) });
  const cols = Math.max(...outline.map((m) => m.map.col)) + 1;
  const rows = Math.max(...outline.map((m) => m.map.row)) + 1;
  const W = cols * MW + (cols - 1) * MGX, H = rows * MH + (rows - 1) * MGY;
  const spine = outline.filter((m) => !m.map.branch).sort((a, b) => a.map.col - b.map.col);
  const edges: { d: string; branch: boolean }[] = [];
  spine.slice(1).forEach((m, i) => {
    const a = pos(spine[i]), b = pos(m);
    edges.push({ d: `M${a.x + MW} ${a.y + MH / 2} L${b.x} ${b.y + MH / 2}`, branch: false });
  });
  for (const m of outline.filter((x) => x.map.branch))
    for (const r of m.map.requires) {
      const from = outline.find((x) => x.slug === r);
      if (!from) continue;
      const a = pos(from), b = pos(m);
      const down = b.y > a.y;
      const ax = a.x + MW / 2, ay = down ? a.y + MH : a.y, bx = b.x + MW / 2, by = down ? b.y : b.y + MH;
      edges.push({ d: `M${ax} ${ay} C${ax} ${(ay + by) / 2}, ${bx} ${(ay + by) / 2}, ${bx} ${by}`, branch: true });
    }

  return (
    <>
      <div className="map-scroll module-map-wrap">
        <div className="module-map" style={{ width: W, height: H }}>
          <svg width={W} height={H} className="map-edges" aria-hidden="true">
            {edges.map((e, i) => <path key={i} d={e.d} className={e.branch ? "edge branch" : "edge"} />)}
          </svg>
          {outline.map((m) => <ModuleNode key={m.slug} m={m} s={stats[m.slug]} style={{ left: pos(m).x, top: pos(m).y, width: MW, height: MH }} selected={selected === m.slug} dim={!inGoal(m.slug)} onPick={onPick} />)}
        </div>
      </div>
      {/* phones: the same modules as a list, spine first */}
      <div className="module-list">
        {[...spine, ...outline.filter((x) => x.map.branch)].map((m) => <ModuleNode key={m.slug} m={m} s={stats[m.slug]} selected={selected === m.slug} dim={!inGoal(m.slug)} onPick={onPick} />)}
      </div>
    </>
  );
}

function ModuleNode({ m, s, style, selected, dim, onPick }: {
  m: Outline[number];
  s: ReturnType<typeof moduleStats>;
  style?: React.CSSProperties;
  selected: boolean;
  dim: boolean;
  onPick: (slug: string) => void;
}) {
  const done = s.ratio >= 1;
  return (
    <button
      type="button"
      className={`mnode ${selected ? "sel" : ""} ${dim ? "dim" : ""} ${done ? "done" : s.started ? "started" : ""} ${m.map.branch ? "branch" : ""}`}
      style={style}
      onClick={() => onPick(m.slug)}
      aria-pressed={selected}
    >
      <span className="mnode-top">
        <span className="mono muted">{pad(m.order)}</span>
        {m.map.branch && <span className="mnode-tag">branch</span>}
        {s.due > 0 && <span className="due-dot" title={`${s.due} due for review`}>{s.due}</span>}
        {done && <Icon name="circle-check" size={15} className="accent-text" />}
      </span>
      <b className="mnode-title">{m.title}</b>
      <span className="mnode-bar"><i style={{ width: `${s.ratio * 100}%` }} /></span>
      <span className="muted small">{s.complete}/{m.lessons.length} lessons{s.mastered ? ` · ${s.mastered} mastered` : ""}</span>
    </button>
  );
}

function LessonMap({ module, infos, outline, current, noCode }: { module: Outline[number]; infos: LessonInfo[]; outline: Outline; current: string | null; noCode: boolean }) {
  const layers = lessonLayers(module);
  const perRow: Record<number, number> = {};
  layers.forEach((l) => (perRow[l.depth] = Math.max(perRow[l.depth] ?? 0, l.row + 1)));
  const widest = Math.max(...Object.values(perRow));
  const depth = Math.max(...layers.map((l) => l.depth)) + 1;
  const W = widest * LW + (widest - 1) * LGX, H = depth * LH + (depth - 1) * LGY;
  const at = (slug: string) => {
    const l = layers.find((x) => x.slug === slug)!;
    const n = perRow[l.depth];
    const rowW = n * LW + (n - 1) * LGX;
    return { x: (W - rowW) / 2 + l.row * (LW + LGX), y: l.depth * (LH + LGY) };
  };
  const edges = prunedEdges(module).map(([from, to]) => {
    const a = at(from), b = at(to);
    const ax = a.x + LW / 2, ay = a.y + LH, bx = b.x + LW / 2, by = b.y;
    return `M${ax} ${ay} C${ax} ${ay + LGY / 1.4}, ${bx} ${by - LGY / 1.4}, ${bx} ${by}`;
  });
  const title = (id: string) => {
    const [m, l] = id.split("/");
    return outline.find((x) => x.slug === m)?.lessons.find((x) => x.slug === l)?.title ?? id;
  };

  return (
    <>
      <div className="map-scroll lesson-map-wrap">
        <div className="lesson-map" style={{ width: W, height: H }}>
          <svg width={W} height={H} className="map-edges" aria-hidden="true">
            {edges.map((d, i) => <path key={i} d={d} className="edge" />)}
          </svg>
          {infos.map((x) => <LessonNode key={x.id} x={x} optional={noCode && x.lesson.practice} style={{ left: at(x.lesson.slug).x, top: at(x.lesson.slug).y, width: LW, height: LH }} current={current === x.id} title={title} />)}
        </div>
      </div>
      <div className="lesson-list">
        {[...infos].sort((a, b) => layers.find((l) => l.slug === a.lesson.slug)!.depth - layers.find((l) => l.slug === b.lesson.slug)!.depth || a.lesson.order - b.lesson.order)
          .map((x) => <LessonNode key={x.id} x={x} optional={noCode && x.lesson.practice} current={current === x.id} title={title} />)}
      </div>
    </>
  );
}

function LessonNode({ x, style, current, title, optional = false }: { x: LessonInfo; style?: React.CSSProperties; current: boolean; title: (id: string) => string; optional?: boolean }) {
  const st = STATE[x.state];
  const outside = x.missing.filter((r) => !r.startsWith(`${x.module.slug}/`));
  const tip = [st.label, x.missing.length ? `Builds on: ${x.missing.map(title).join(", ")}` : "", x.due ? `${x.due} due for review` : ""].filter(Boolean).join(" · ");
  return (
    <div className={`lnode s-${x.state} ${current ? "current" : ""} ${optional ? "optional" : ""}`} style={style} title={optional ? `Code lesson: optional on this goal · ${tip}` : tip}>
      <Link href={`/learn/${x.id}`} className="lnode-link">
        <span className="lnode-top">
          <Icon name={st.icon} size={14} className="lnode-state" label={st.label} />
          <span className="lesson-id">{x.module.order}.{x.lesson.order}</span>
          <span className="lnode-kinds">
            {x.lesson.sims > 0 && <Icon name="activity" size={12} label="simulation" />}
            {x.lesson.labs > 0 && <Icon name="beaker" size={12} label="lab" />}
            {(x.lesson.code || x.lesson.practice) && <Icon name="code" size={12} label="code" />}
          </span>
          {x.due > 0 && <span className="due-dot" title={`${x.due} due for review`}>{x.due}</span>}
        </span>
        {optional && <span className="lnode-optional">optional · code</span>}
        <b className="lnode-title">{x.lesson.title}</b>
        <span className="lnode-meta muted small">
          {x.state === "started" ? `${x.done}/${x.total} topics` : `${x.lesson.minutes} min`}
          {outside.length > 0 && x.state === "later" ? ` · builds on ${title(outside[0])}${outside.length > 1 ? ` +${outside.length - 1}` : ""}` : ""}
        </span>
      </Link>
      {(x.state === "later" || x.state === "ready") && (
        <button type="button" className="lnode-skip" onClick={() => setSkipped(x.id, true)} title="Count this lesson as finished">I know this</button>
      )}
      {x.skipped && (
        <button type="button" className="lnode-skip" onClick={() => setSkipped(x.id, false)} title="Undo">Undo skip</button>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="map-legend">
      {(Object.keys(STATE) as LessonState[]).map((k) => (
        <span key={k} className={`legend-item s-${k}`}><Icon name={STATE[k].icon} size={13} /> {STATE[k].label}</span>
      ))}
      <span className="legend-item"><span className="due-dot">3</span> due for review</span>
      <span className="legend-item muted"><Icon name="activity" size={12} /> simulation <Icon name="beaker" size={12} /> lab <Icon name="code" size={12} /> code</span>
    </div>
  );
}
