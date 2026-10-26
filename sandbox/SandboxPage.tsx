"use client";
// The full sandbox: pick a scenario, edit the design, set traffic and an incident, Run, and read the guide.
// Designs autosave to localStorage ("llm100-sandbox"), share as ?d=<base64url json>, export/import as JSON.
import "./sandbox.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExplainButton from "@/components/ai/ExplainButton";
import Icon from "@/components/ui/Icon";
import { useChatSource } from "@/lib/ai/sources";
import { type CanvasApi, FlowCanvas, Palette } from "./Canvas";
import { ALL_KINDS } from "./catalog";
import { incidentLabel, run } from "./engine";
import { applyAction, describeDesign, explain, explainTimeline, whatIfs, type Action, type Guide, type WhatIf } from "./explain";
import GuidePanel from "./GuidePanel";
import Inspector from "./Inspector";
import { STARTER, cleanGraph, layout, parseGraph } from "./presets";
import { SCENARIOS, SCENARIO_GROUPS, getScenario } from "./scenarios";
import { runTimeline, summarize, type Tick, type TimelineSummary } from "./timeline";
import type { Graph, Incident, RunResult, Traffic } from "./types";

export const STORAGE_KEY = "llm100-sandbox";

/** A panel's open/closed state, remembered per browser. Narrow screens start with panels closed. */
function usePanel(key: string, initial: boolean): [boolean, (v: boolean | ((p: boolean) => boolean)) => void] {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) setOpen(v === "1");
      else if (window.innerWidth < 1100) setOpen(false);
    } catch {
      /* storage blocked */
    }
  }, [key]);
  const set = (v: boolean | ((p: boolean) => boolean)) =>
    setOpen((prev) => {
      const n = typeof v === "function" ? v(prev) : v;
      try {
        localStorage.setItem(key, n ? "1" : "0");
      } catch {
        /* storage blocked */
      }
      return n;
    });
  return [open, set];
}

interface Saved {
  graph: Graph;
  scenario: string | null;
  incident: Incident;
  scale: number;
}

const INCIDENTS: Incident[] = [
  { type: "none" },
  { type: "providerOutage", provider: "a" },
  { type: "providerOutage", provider: "b" },
  { type: "trafficSpike", factor: 3 },
  { type: "cacheFlush" },
  { type: "injectionCampaign", attackShare: 0.2 },
  { type: "slowVectorDb", factor: 10 },
  { type: "badRollout" },
];
const SCALES = [0.25, 0.5, 1, 2, 3, 5, 10];

// ---------------------------------------------------------------- share encoding

export function encodeGraph(g: Graph): string {
  const json = JSON.stringify(cleanGraph(g));
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeGraph(s: string): Graph | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return parseGraph(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Saved>;
    const graph = parseGraph(o.graph);
    if (!graph) return null;
    return { graph, scenario: typeof o.scenario === "string" ? o.scenario : null, incident: o.incident && typeof o.incident === "object" && "type" in o.incident ? (o.incident as Incident) : { type: "none" }, scale: typeof o.scale === "number" ? o.scale : 1 };
  } catch {
    return null;
  }
}

function writeSaved(s: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, graph: cleanGraph(s.graph) }));
  } catch {
    /* storage unavailable */
  }
}

const sameIncident = (a: Incident, b: Incident) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- page

interface Ran {
  key: string;
  result: RunResult;
  guide: Guide;
  whatIfs: WhatIf[];
  ticks: Tick[] | null;
  summary: TimelineSummary | null;
  text: string | null;
}

export default function SandboxPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [graph, setGraph] = useState<Graph>(STARTER);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [incident, setIncident] = useState<Incident>({ type: "none" });
  const [scale, setScale] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [ran, setRan] = useState<Ran | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scenario = scenarioId ? getScenario(scenarioId) : undefined;
  const traffic: Traffic = useMemo(() => (scale !== 1 ? { scale } : {}), [scale]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2200);
  }, []);

  // Load: ?d= (shared design) > ?s= (scenario) > saved > starter.
  const lastLoad = useRef<string | null>(null);
  const scenarioRef = useRef(scenarioId);
  scenarioRef.current = scenarioId;
  useEffect(() => {
    const d = params.get("d");
    const s = params.get("s");
    const key = `${d ?? ""}|${s ?? ""}`;
    const first = lastLoad.current === null;
    if (!first && key === lastLoad.current) return;
    lastLoad.current = key;
    // Our own URL updates (dropping ?d=, or writing ?s= for the scenario already open) aren't new loads.
    if (!first && (!d && (!s || s === scenarioRef.current))) return;
    const shared = d ? decodeGraph(d) : null;
    const sc = s ? getScenario(s) : undefined;
    if (shared) {
      setGraph(shared);
      setScenarioId(null);
      setIncident({ type: "none" });
      router.replace("/sandbox");
    } else if (sc) {
      setGraph(sc.graph);
      setScenarioId(sc.id);
      setIncident(sc.incident ?? { type: "none" });
    } else {
      const saved = readSaved();
      if (saved) {
        setGraph(saved.graph);
        setScenarioId(saved.scenario);
        setIncident(saved.incident);
        setScale(saved.scale);
      }
    }
    setRan(null);
    setSelected(null);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // Autosave.
  useEffect(() => {
    if (loaded) writeSaved({ graph, scenario: scenarioId, incident, scale });
  }, [graph, scenarioId, incident, scale, loaded]);

  const runKey = useMemo(() => JSON.stringify([cleanGraph(graph), traffic, incident]), [graph, traffic, incident]);
  const stale = !!ran && ran.key !== runKey;

  const doRun = useCallback(
    (g: Graph = graph) => {
      const result = run(g, traffic, incident);
      const guide = explain(g, result, traffic);
      const base = incident.type === "none" ? result : run(g, traffic);
      const wi = whatIfs(g, traffic, base);
      let ticks: Tick[] | null = null;
      let summary: TimelineSummary | null = null;
      let text: string | null = null;
      if (incident.type !== "none") {
        ticks = runTimeline(g, traffic, incident);
        summary = summarize(ticks);
        text = explainTimeline(summary, incident);
      }
      setRan({ key: JSON.stringify([cleanGraph(g), traffic, incident]), result, guide, whatIfs: wi, ticks, summary, text });
    },
    [graph, traffic, incident],
  );

  // Ctrl/Cmd+Enter runs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        doRun();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doRun]);

  const onApply = (a: Action) => {
    const g = applyAction(graph, a);
    setGraph(g);
    if ("nodeId" in a && a.kind === "config") setSelected(a.nodeId);
    doRun(g);
    flash(a.label);
  };

  const loadScenario = (id: string) => {
    const sc = getScenario(id);
    if (!sc) {
      setScenarioId(null);
      return;
    }
    setGraph(sc.graph);
    setScenarioId(sc.id);
    setIncident(sc.incident ?? { type: "none" });
    setScale(1);
    setSelected(null);
    setRan(null);
    router.replace(`/sandbox?s=${sc.id}`);
  };

  const reset = () => {
    if (scenario) loadScenario(scenario.id);
    else {
      setGraph(STARTER);
      setIncident({ type: "none" });
      setScale(1);
      setSelected(null);
      setRan(null);
    }
    flash("Reset");
  };

  const clear = () => {
    setGraph({ nodes: [], edges: [] });
    setScenarioId(null);
    setSelected(null);
    setRan(null);
  };

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?d=${encodeGraph(graph)}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cleanGraph(graph), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${scenarioId ?? "llm-design"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importJson = async (f: File) => {
    try {
      const o = JSON.parse(await f.text()) as unknown;
      const g = parseGraph(o) ?? parseGraph((o as { graph?: unknown })?.graph);
      if (!g) throw new Error("bad");
      setGraph(g);
      setScenarioId(null);
      setSelected(null);
      setRan(null);
      flash("Design imported");
    } catch {
      flash("That file isn't a sandbox design");
    }
  };

  const incidentOptions = useMemo(() => {
    const list = [...INCIDENTS];
    if (!list.some((i) => sameIncident(i, incident))) list.push(incident);
    return list;
  }, [incident]);

  const [showLeft, setShowLeft] = usePanel("llm100-sbx-left", true);
  const [showRight, setShowRight] = usePanel("llm100-sbx-right", true);
  const [tab, setTab] = useState<"results" | "inspect">("results");
  const [menu, setMenu] = useState(false);
  const api = useRef<CanvasApi | null>(null);
  const onReady = useCallback((x: CanvasApi) => {
    api.current = x;
  }, []);
  const okRate = ran && !stale ? ran.result.metrics.successRate : null;
  const tone = okRate === null ? "" : okRate >= 0.99 ? "good" : okRate >= 0.95 ? "warn" : "bad";
  // What the optional AI tutor sees (lib/ai/sources.ts): the design, traffic, incident, last run and the guide's text.
  useChatSource("sandbox", {
    label: `Sandbox · ${scenario?.title ?? "your design"} · ${graph.nodes.length} components`,
    suggestions: ["Explain my last run's results", "What is the bottleneck in this design?", "How would you make this cheaper without hurting quality?", "What happens if the main provider goes down?"],
    explain: ran && !stale ? { label: "Explain this run with AI", prompt: "Explain my last sandbox run: what happened to the requests, why the metrics came out this way, and the single most useful change to make next (with its trade-off)." } : { label: "Explain this design with AI", prompt: "Explain how requests flow through my sandbox design, what each component is doing, and what I should check when I run it." },
    build: () => ({
      scenario: scenario ? { title: scenario.title, summary: scenario.summary, tryThis: scenario.tryThis } : "the learner's own design",
      design: describeDesign(graph),
      graph: cleanGraph(graph),
      traffic: `×${scale}`,
      incident: incident.type === "none" ? "none" : incidentLabel(incident),
      lastRun: ran
        ? { stale: stale ? "the design changed since this run" : false, metrics: ran.result.metrics, guide: { headline: ran.guide.headline, path: ran.guide.path, advice: ran.guide.advice.map(({ severity, problem, why, fix, tradeoff }) => ({ severity, problem, why, fix, tradeoff })) }, whatIfs: ran.whatIfs, timeline: ran.text }
        : "not run yet",
    }),
  });

  return (
    <div className={`sbx2 ${showLeft ? "" : "no-left"} ${showRight ? "" : "no-right"}`}>
      <header className="sbx2-bar">
        <button type="button" className={`icon-btn ${showLeft ? "on" : ""}`} onClick={() => setShowLeft((v) => !v)} aria-label={showLeft ? "Hide components" : "Show components"} title="Components">
          <Icon name="panel" size={17} />
        </button>
        <label className="sbx2-scenario" title={scenario?.summary}>
          <Icon name="boxes" size={15} />
          <select value={scenarioId ?? ""} onChange={(e) => (e.target.value ? loadScenario(e.target.value) : setScenarioId(null))} aria-label="Scenario">
            <option value="">Your own design</option>
            {SCENARIO_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {SCENARIOS.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <span className="sbx2-sep" />
        <label className="sbx2-field">
          <span>Traffic</span>
          <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
            {SCALES.map((x) => <option key={x} value={x}>×{x}</option>)}
          </select>
        </label>
        <label className="sbx2-field">
          <span>Incident</span>
          <select value={JSON.stringify(incident)} onChange={(e) => setIncident(JSON.parse(e.target.value) as Incident)}>
            {incidentOptions.map((i) => <option key={JSON.stringify(i)} value={JSON.stringify(i)}>{i.type === "none" ? "None" : incidentLabel(i)}</option>)}
          </select>
        </label>
        <span className="spacer" />
        <span className={`sbx2-status ${tone}`} aria-live="polite">
          {okRate !== null && ran
            ? `${(okRate * 100).toFixed(1)}% ok · p99 ${Math.round(ran.result.metrics.p99Ms).toLocaleString("en-US")} ms · $${Math.round(ran.result.metrics.costPerMonth).toLocaleString("en-US")}/mo`
            : !graph.nodes.length
              ? "Add components to start"
              : stale
                ? "Design changed: run again"
                : "Ready to run"}
        </span>
        <button
          type="button"
          className={`btn primary sbx2-run ${stale ? "pulse" : ""}`}
          onClick={() => {
            doRun();
            setTab("results");
            setShowRight(true);
          }}
          disabled={!graph.nodes.length}
          title="Run (Ctrl+Enter)"
          aria-label="Run simulation"
        >
          <Icon name="play" size={15} /> {ran ? (stale ? "Run again" : "Re-run") : "Run"}
        </button>
        <div className="sbx2-menu">
          <button type="button" className="icon-btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Design actions" title="Share, export, import">
            <Icon name="list" size={17} />
          </button>
          {menu && (
            <div className="sbx2-pop" role="menu" onMouseLeave={() => setMenu(false)}>
              <button type="button" role="menuitem" onClick={() => { share(); setMenu(false); }}><Icon name="send" size={14} /> Share link</button>
              <button type="button" role="menuitem" onClick={() => { exportJson(); setMenu(false); }}><Icon name="download" size={14} /> Export JSON</button>
              <button type="button" role="menuitem" onClick={() => { fileRef.current?.click(); setMenu(false); }}><Icon name="upload" size={14} /> Import JSON</button>
              <button type="button" role="menuitem" onClick={() => { reset(); setMenu(false); }}><Icon name="refresh" size={14} /> Reset design</button>
              <button type="button" role="menuitem" className="danger" onClick={() => { clear(); setMenu(false); }}><Icon name="trash" size={14} /> Clear canvas</button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
        </div>
        <button type="button" className={`icon-btn ${showRight ? "on" : ""}`} onClick={() => setShowRight((v) => !v)} aria-label={showRight ? "Hide results" : "Show results"} title="Results and inspector">
          <Icon name="panel" size={17} className="flip-x" />
        </button>
      </header>

      <div className="sbx2-body">
        {showLeft && (
          <aside className="sbx2-left" aria-label="Components">
            <div className="sbx2-left-head">
              <h4>Components</h4>
              <span className="muted small">click or drag</span>
            </div>
            <Palette kinds={ALL_KINDS} onAdd={(k) => api.current?.add(k)} />
            <p className="sbx2-tip"><Icon name="info" size={13} /> Drag from a node&apos;s right dot to another node to connect them. Backspace deletes.</p>
          </aside>
        )}

        <section className="sbx2-stage" aria-label="Sandbox canvas">
          <FlowCanvas
            graph={graph}
            onChange={setGraph}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              if (id) {
                setTab("inspect");
                setShowRight(true);
              }
            }}
            result={ran?.result ?? null}
            stale={stale}
            hidePalette
            onReady={onReady}
          />
          <div className="sbx2-canvas-tools">
            <button type="button" className="chip-btn" onClick={() => setGraph(layout(graph, true))} title="Arrange the nodes"><Icon name="grid" size={13} /> Tidy</button>
            <button type="button" className="chip-btn" onClick={() => api.current?.fit()} title="Fit to screen"><Icon name="expand" size={13} /> Fit</button>
          </div>
        </section>

        {showRight && (
          <aside className="sbx2-right" aria-label="Results and inspector">
            <div className="sbx2-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "results"} className={tab === "results" ? "on" : ""} onClick={() => setTab("results")}><Icon name="chart" size={14} /> Results</button>
              <button type="button" role="tab" aria-selected={tab === "inspect"} className={tab === "inspect" ? "on" : ""} onClick={() => setTab("inspect")}><Icon name="sliders" size={14} /> Inspector</button>
            </div>
            <div className="sbx2-right-body">
              {tab === "inspect" ? (
                <Inspector graph={graph} selected={selected} onChange={setGraph} onSelect={setSelected} result={stale ? null : ran?.result ?? null} />
              ) : (
                <>
                {ran && !stale && (
                  <div style={{ marginBottom: 12 }}>
                    <ExplainButton
                      label="Explain this run with AI"
                      prompt={() => `Explain the result of this LLM-system sandbox run in plain language: what limited it, why, and the single most effective fix with its trade-off.

Design: ${describeDesign(graph)}
Traffic ×${scale}, incident: ${incident.type === "none" ? "none" : incidentLabel(incident)}
Results: ${(ran.result.metrics.successRate * 100).toFixed(1)}% success, p99 ${Math.round(ran.result.metrics.p99Ms)} ms, first-token p99 ${Math.round(ran.result.metrics.ttftP99Ms)} ms, $${Math.round(ran.result.metrics.costPerMonth)}/month, quality ${ran.result.metrics.quality.toFixed(2)}, attacks leaked ${(ran.result.metrics.attacksLeaked * 100).toFixed(1)}%.`}
                    />
                  </div>
                )}
                <GuidePanel
                  intro={describeDesign(graph)}
                  tryThis={scenario?.tryThis}
                  result={ran?.result ?? null}
                  guide={ran?.guide ?? null}
                  whatIfs={ran?.whatIfs ?? []}
                  ticks={ran?.ticks ?? null}
                  timelineSummary={ran?.summary ?? null}
                  timelineText={ran?.text ?? null}
                  incident={incident}
                  stale={stale}
                  onApply={onApply}
                  onSelect={(id) => {
                    setSelected(id);
                    if (id) setTab("inspect");
                  }}
                  onRun={() => doRun()}
                />
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
