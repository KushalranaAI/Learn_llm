"use client";
// Home, in System Learn's pattern: hero with a system picture, resume/review cards, "four ways in", how a topic teaches,
// then the current module and interview prep.
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Outline } from "@/lib/content";
import { dueReviews, type Progress, streak, useProgress } from "@/lib/progress";
import { BRAND } from "@/lib/brand";
import HeroPanel from "./HeroPanel";
import Icon, { type IconName } from "./ui/Icon";

type InterviewStats = { total: number; junior: number; mid: number; senior: number; byModule: { slug: string; title: string; count: number }[] };
type PracticeStats = { sims: number; labs: number; scenarios: number };

const EMPTY: Progress = { done: {}, visited: {}, last: null, days: {}, checks: {}, reviews: {}, known: {}, labs: {}, simsTried: {} };

/** The topic to resume: the one after the last finished topic in the last-opened lesson, else the first unfinished. */
function resumePoint(outline: Outline, p: Progress) {
  const all = outline.flatMap((m) => m.lessons.flatMap((l) => l.topics.map((t, i) => ({ m, l, t, i, id: `${m.slug}/${l.slug}/${t.slug}` }))));
  if (!all.length) return null;
  const last = p.last ? all.findIndex((x) => x.id === p.last) : -1;
  if (last >= 0) {
    const here = all[last];
    if (!p.done[here.id]) return here;
    const next = all.slice(last + 1).find((x) => !p.done[x.id]);
    if (next) return next;
  }
  return all.find((x) => !p.done[x.id]) ?? all[0];
}

const WAYS: { href: string; icon: IconName; title: string; text: string }[] = [
  { href: "/curriculum", icon: "route", title: "Follow the curriculum", text: "Short topics in the order a real LLM product needs them." },
  { href: "/labs", icon: "beaker", title: "Solve a lab", text: "A real situation: predict, compute by hand, then meet the goals." },
  { href: "/sandbox", icon: "boxes", title: "Open the sandbox", text: "Wire gateways, caches, models and guardrails. Push traffic through." },
  { href: "/simulations", icon: "activity", title: "Run a simulation", text: "Attention, sampling, KV caches, batching, retrieval, agents." },
];

const HOW: { icon: IconName; title: string; text: string }[] = [
  { icon: "lightbulb", title: "Get the intuition", text: "A plain-language picture first, with the one idea that matters." },
  { icon: "sigma", title: "See the maths", text: "Every symbol defined and a worked example you can check by hand." },
  { icon: "activity", title: "Play with it", text: "A live simulation you change with sliders; the numbers follow." },
  { icon: "target", title: "Check it", text: "Quick checks you miss come back after 1, 3, 7, 14 and 30 days." },
];

export default function Dashboard({ outline, interview, practice }: { outline: Outline; interview: InterviewStats; practice: PracticeStats }) {
  const p = useProgress();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const prog = mounted ? p : EMPTY;
  const start = resumePoint(outline, prog);
  const doneCount = Object.keys(prog.done).length;
  const started = doneCount > 0 || prog.last !== null;
  const due = dueReviews(prog);
  const days = streak(prog);
  const lessons = outline.reduce((a, m) => a + m.lessons.length, 0);
  const topics = outline.reduce((a, m) => a + m.lessons.reduce((b, l) => b + l.topics.length, 0), 0);
  const currentModule = outline.find((m) => m.slug === start?.m.slug) ?? outline[0];
  const doneIn = (m: Outline[number], l: Outline[number]["lessons"][number]) => l.topics.filter((t) => prog.done[`${m.slug}/${l.slug}/${t.slug}`]).length;
  const startHref = start ? `/learn/${start.m.slug}/${start.l.slug}/${start.t.slug}` : "/curriculum";

  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Open source · by Kushal Rana · runs in your browser</p>
          <h1>Learn LLM engineering by <em>building</em> it.</h1>
          <p className="lead">
            From a single neuron to production LLM systems. Every idea comes with the maths, a live simulation, a lab and a systems sandbox where you can break things on purpose.
          </p>
          <div className="row" style={{ marginTop: 26 }}>
            <Link href={startHref} className="btn primary big">{started ? "Continue learning" : "Start learning"} <Icon name="arrow-right" size={16} /></Link>
            <Link href="/sandbox" className="btn big">Open the sandbox</Link>
          </div>
          <div className="hero-stats">
            <span><b>{outline.length}</b> modules</span>
            <span><b>{lessons}</b> lessons</span>
            <span><b>{topics}</b> topics</span>
            <span><b>{practice.labs}</b> labs</span>
            <span><b>{practice.sims}</b> simulations</span>
          </div>
        </div>
        <HeroPanel />
      </section>

      {started && start && (
        <div className="resume-row">
          <Link href={startHref} className="resume-card">
            <span className="tile"><Icon name="play" size={18} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <small>Continue · {start.l.title}</small>
              <b>{start.t.title}</b>
              <span className="meter" style={{ height: 4 }}><span style={{ width: `${(doneIn(start.m, start.l) / Math.max(1, start.l.topics.length)) * 100}%` }} /></span>
            </span>
          </Link>
          <Link href="/review" className="resume-card">
            <span className="tile"><Icon name="repeat" size={18} /></span>
            <span><small>Review</small><b>{due.length > 0 ? `${due.length} quick checks due` : "Nothing due right now"}</b><small>{Object.keys(prog.reviews).length} in your queue</small></span>
          </Link>
          <Link href="/progress" className="resume-card">
            <span className="tile"><Icon name="flame" size={18} /></span>
            <span><small>Progress</small><b>{doneCount} topics finished</b><small>{days > 0 ? `${days}-day streak` : "Finish a topic to start a streak"}</small></span>
          </Link>
        </div>
      )}

      <div className="section-title"><h2>Four ways in</h2></div>
      <div className="entry-grid">
        {WAYS.map((w) => (
          <Link key={w.href} href={w.href} className="card entry">
            <span className="tile"><Icon name={w.icon} size={18} /></span>
            <h3>{w.title}</h3>
            <p>{w.text}</p>
            <span className="entry-go">Open <Icon name="arrow-right" size={13} /></span>
          </Link>
        ))}
      </div>

      <div className="section-title"><h2>How every topic teaches</h2></div>
      <div className="how-grid">
        {HOW.map((h, i) => (
          <div key={h.title} className="how-step">
            <span className="how-num">{i + 1}</span>
            <Icon name={h.icon} size={20} className="how-icon" />
            <b>{h.title}</b>
            <p>{h.text}</p>
          </div>
        ))}
      </div>

      {currentModule && (
        <div className="grid-main" style={{ marginTop: 40 }}>
          <section className="card">
            <div className="section-title" style={{ margin: "0 0 12px" }}>
              <div>
                <p className="eyebrow" style={{ margin: 0 }}>Module {String(currentModule.order).padStart(2, "0")}</p>
                <h2 style={{ margin: "4px 0 0", fontSize: "1.25rem" }}>{currentModule.title}</h2>
                <p>{currentModule.summary}</p>
              </div>
              <Link href={`/learn/${currentModule.slug}`} className="btn sm">View module</Link>
            </div>
            <div className="list-rows">
              {currentModule.lessons.map((l) => {
                const d = doneIn(currentModule, l);
                return (
                  <Link key={l.slug} href={`/learn/${currentModule.slug}/${l.slug}`}>
                    <span className="lesson-id">{currentModule.order}.{l.order}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>{l.title}</span>
                    <span className="muted small mono">{d}/{l.topics.length}</span>
                    {d === l.topics.length && d > 0 ? <Icon name="circle-check" size={17} className="good" label="finished" /> : <Icon name="chevron-right" size={16} className="muted" />}
                  </Link>
                );
              })}
            </div>
          </section>

          <aside className="side">
            <section className="card">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                <h3 style={{ margin: 0 }}>Interview prep</h3>
                <span className="muted small">{interview.byModule.length} module{interview.byModule.length === 1 ? "" : "s"}</span>
              </div>
              <p style={{ margin: "16px 0 4px" }}><span className="big-number">{interview.total}</span> <span className="muted">questions</span></p>
              <p className="muted small">{Object.keys(prog.known).length} marked as known.</p>
              <div className="stat-row" style={{ margin: "14px 0 8px" }}>
                <div><b>{interview.junior}</b><span>Junior</span></div>
                <div><b>{interview.mid}</b><span>Mid</span></div>
                <div><b>{interview.senior}</b><span>Senior</span></div>
              </div>
              <Link href="/interview" className="btn block" style={{ width: "100%", marginTop: 6 }}>Practise questions</Link>
            </section>
          </aside>
        </div>
      )}

      <section className="card creator" aria-label="About the author">
        <span className="creator-mark" aria-hidden="true">KR</span>
        <div className="creator-body">
          <p className="eyebrow" style={{ margin: 0 }}>Built by</p>
          <h2>{BRAND.name}</h2>
          <p>{BRAND.tagline} This course is open source: read it, fork it, learn from it.</p>
          <div className="row" style={{ gap: 6, marginTop: 10 }}>
            {BRAND.links.map((l) => <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer me" className="chip-btn">{l.label}</a>)}
          </div>
        </div>
        <div className="creator-more">
          <h4>More courses</h4>
          {BRAND.projects.map((pr) => (
            <a key={pr.href} href={pr.href} target="_blank" rel="noopener noreferrer" className="creator-link">{pr.label} <Icon name="external" size={13} /></a>
          ))}
        </div>
      </section>

      <p className="muted small" style={{ marginTop: 28 }}>
        All numbers in the simulations and the sandbox are teaching approximations built from public hardware specs and standard formulas; they show how the pieces
        trade off, not the exact prices or speeds of any provider.
      </p>
    </div>
  );
}
