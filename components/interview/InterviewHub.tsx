"use client";
// Interview hub: Practice (flashcards + spaced repetition), Mock interview, Plan, Browse.
// Deep links: ?q=<id> opens that question in Practice, ?module= / ?section= preset the filters, ?tab=mock|plan|browse.
import "./interview.css";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { InterviewSection } from "@/lib/content";
import { isDue, LEVELS } from "@/lib/interview";
import { streak, useProgress } from "@/lib/progress";
import Icon, { type IconName } from "../ui/Icon";
import Browse from "./Browse";
import Mock from "./Mock";
import Plan from "./Plan";
import Practice, { type PracticeFilter } from "./Practice";
import { type HubModule, type HubOutline, type HubQuestion, isKnown, type PracticeQueue, ProgressRing, useCountUp } from "./shared";

type Tab = "practice" | "mock" | "plan" | "browse";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "practice", label: "Practice", icon: "layers" },
  { id: "mock", label: "Mock interview", icon: "message" },
  { id: "plan", label: "Plan", icon: "map" },
  { id: "browse", label: "Browse", icon: "list" },
];

export default function InterviewHub({ sections, modules, outline }: { sections: InterviewSection[]; modules: HubModule[]; outline: HubOutline }) {
  const sp = useSearchParams();
  const questions: HubQuestion[] = useMemo(
    () =>
      sections.flatMap((s) =>
        s.questions.map((q) => ({ id: q.id, level: q.level, q: q.q, a: q.a, module: s.module, section: s.slug, sectionTitle: s.title, lesson: s.lesson })),
      ),
    [sections],
  );
  const mods = useMemo(() => modules.filter((m) => questions.some((q) => q.module === m.slug)), [modules, questions]);

  const [tab, setTab] = useState<Tab>("practice");
  const [filter, setFilter] = useState<PracticeFilter>({ module: "all", section: "all", levels: [...LEVELS], dueOnly: false });
  const [queue, setQueue] = useState<PracticeQueue | null>(null);
  const nonce = useRef(0);

  const practise = useCallback((ids: string[], label: string) => {
    setQueue({ ids, label, nonce: ++nonce.current });
    setTab("practice");
    requestAnimationFrame(() => document.getElementById("iv-tabs")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, []);

  // deep links
  useEffect(() => {
    const q = sp.get("q");
    const m = sp.get("module");
    const s = sp.get("section");
    const t = sp.get("tab") as Tab | null;
    if (s) {
      const sec = sections.find((x) => x.slug === s);
      if (sec) setFilter((f) => ({ ...f, module: sec.module, section: sec.slug }));
    } else if (m && modules.some((x) => x.slug === m)) setFilter((f) => ({ ...f, module: m, section: "all" }));
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    if (q && questions.some((x) => x.id === q)) {
      setQueue({ ids: [q], label: "Linked question", nonce: ++nonce.current });
      setTab("practice");
    }
  }, [sp, sections, modules, questions]);

  return (
    <div className="page iv-hub">
      <Header questions={questions} modules={mods} activeModule={filter.module} onModule={(m) => { setQueue(null); setFilter((f) => ({ ...f, module: f.module === m ? "all" : m, section: "all" })); setTab("practice"); }} />
      <Tabs tab={tab} setTab={setTab} />
      <div className="iv-panel" key={tab} role="tabpanel" id={`iv-panel-${tab}`} aria-labelledby={`iv-tab-${tab}`}>
        {tab === "practice" && <Practice questions={questions} modules={mods} filter={filter} setFilter={setFilter} queue={queue} clearQueue={() => setQueue(null)} />}
        {tab === "mock" && <Mock questions={questions} modules={mods} onPractise={practise} />}
        {tab === "plan" && <Plan questions={questions} outline={outline} onStartSet={practise} onMock={() => setTab("mock")} />}
        {tab === "browse" && <Browse questions={questions} modules={mods} initialModule={filter.module} onPractise={practise} />}
      </div>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [glide, setGlide] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const b = refs.current[tab];
      if (b) setGlide({ left: b.offsetLeft, width: b.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [tab]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(n);
    refs.current[n]?.focus();
  };
  return (
    <div className="iv-tabs" role="tablist" aria-label="Interview prep" id="iv-tabs" onKeyDown={onKey} style={{ scrollMarginTop: 72 }}>
      {glide && <span className="iv-tabs-glider" style={{ left: glide.left, width: glide.width }} aria-hidden />}
      {TABS.map((t) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          id={`iv-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`iv-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className="iv-tab"
          onClick={() => setTab(t.id)}
        >
          <Icon name={t.icon} size={16} />
          <span className="lbl">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

function Stat({ icon, value, label, tone }: { icon: IconName; value: number; label: string; tone?: string }) {
  const v = useCountUp(value);
  return (
    <div className={`iv-stat ${tone ?? ""}`}>
      <span className="tile">
        <Icon name={icon} size={18} />
      </span>
      <div>
        <b aria-hidden>{Math.round(v)}</b>
        <span className="sr-only">{value}</span>
        <small>{label}</small>
      </div>
    </div>
  );
}

function Header({ questions, modules, activeModule, onModule }: { questions: HubQuestion[]; modules: HubModule[]; activeModule: string; onModule: (m: string) => void }) {
  const p = useProgress();
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), [p]);
  const known = questions.filter((q) => isKnown(p, q.id)).length;
  const due = now ? questions.filter((q) => isDue(p.iv?.[q.id], now)).length : 0;
  const perModule = modules.map((m) => {
    const qs = questions.filter((q) => q.module === m.slug);
    return { ...m, share: qs.length ? qs.filter((q) => isKnown(p, q.id)).length / qs.length : 0, n: qs.length };
  });
  return (
    <header className="iv-head stack" style={{ gap: 12 }}>
      <div className="iv-titlebar">
      <div>
        <span className="eyebrow">
          <Icon name="chats" size={14} /> Interview prep
        </span>
        <h1>Say it out loud.</h1>
      </div>
      <div className="iv-stats">
        <Stat icon="chats" value={questions.length} label="questions" />
        <Stat icon="circle-check" value={known} label="known" tone="info" />
        <Stat icon="clock" value={due} label="due today" tone="warm" />
        <Stat icon="flame" value={streak(p)} label="day streak" tone="hot" />
      </div>
      </div>
      <details className="iv-modules">
        <summary><Icon name="chart" size={14} /> Progress by module <Icon name="chevron-down" size={14} className="chev" /></summary>
      <div className="iv-rings" role="group" aria-label="Progress by module">
        {perModule.map((m) => (
          <button key={m.slug} type="button" className={`iv-ringbtn ${activeModule === m.slug ? "on" : ""}`} aria-pressed={activeModule === m.slug} title={`${m.title}: ${Math.round(m.share * 100)}% of ${m.n} known`} onClick={() => onModule(m.slug)}>
            <ProgressRing value={m.share} size={44} label={`${m.title}: ${Math.round(m.share * 100)}% known`} />
            <span>{m.title}</span>
          </button>
        ))}
      </div>
      </details>
    </header>
  );
}
