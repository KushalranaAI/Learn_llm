"use client";
// The full sandbox: pick a scenario, edit the design, set traffic and an incident, Run, and read the guide.
// Designs autosave to localStorage ("llm100-sandbox"), share as ?d=<base64url json>, export/import as JSON.
import "./sandbox.css";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { FlowCanvas } from "./Canvas";
import { incidentLabel, run } from "./engine";
import { applyAction, describeDesign, explain, explainTimeline, whatIfs, type Action, type Guide, type WhatIf } from "./explain";
import GuidePanel from "./GuidePanel";
import Inspector from "./Inspector";
import { STARTER, cleanGraph, layout, parseGraph } from "./presets";
import { SCENARIOS, SCENARIO_GROUPS, getScenario } from "./scenarios";
import { runTimeline, summarize, type Tick, type TimelineSummary } from "./timeline";
import type { Graph, Incident, RunResult, Traffic } from "./types";

export const STORAGE_KEY = "llm100-sandbox";

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

  return (
    <div className="sbx-page">
      <header className="card tight sbx-bar">
        <div className="sbx-bar-title">
          <span className="eyebrow"><Icon name="boxes" size={14} /> Sandbox</span>
          <h1>{scenario?.title ?? "Your design"}</h1>
          <p className="muted">{scenario?.summary ?? "Wire the parts of an LLM application, push traffic through it, break it on purpose."}</p>
        </div>
        <div className="sbx-bar-actions">
          <label className="control sbx-scenario">
            <span className="control-label">Scenario</span>
            <select value={scenarioId ?? ""} onChange={(e) => (e.target.value ? loadScenario(e.target.value) : setScenarioId(null))}>
              <option value="">Your own design</option>
              {SCENARIO_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {SCENARIOS.filter((s) => s.group === g).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="row sbx-file">
            <button type="button" className="chip-btn" onClick={share} title="Copy a link to this design"><Icon name="send" size={13} /> Share</button>
            <button type="button" className="chip-btn" onClick={exportJson} title="Download as JSON"><Icon name="download" size={13} /> Export</button>
            <button type="button" className="chip-btn" onClick={() => fileRef.current?.click()} title="Load a JSON design"><Icon name="upload" size={13} /> Import</button>
            <button type="button" className="chip-btn" onClick={() => setGraph(layout(graph, true))} title="Arrange nodes left to right"><Icon name="grid" size={13} /> Tidy</button>
            <button type="button" className="chip-btn" onClick={reset} title={scenario ? "Back to the scenario's starting design" : "Back to the starter design"}><Icon name="refresh" size={13} /> Reset</button>
            <button type="button" className="chip-btn" onClick={clear} title="Empty canvas"><Icon name="trash" size={13} /> Clear</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
          </div>
        </div>
      </header>

      <div className="sbx-main">
        <section className="card sbx-stage">
          <div className="sbx-runbar">
            <button type="button" className={`btn accent sm ${stale ? "pulse" : ""}`} onClick={() => doRun()} title="Run (Ctrl+Enter)" aria-label="Run simulation">
              <Icon name="play" size={14} /> {ran ? (stale ? "Run again" : "Re-run") : "Run"}
            </button>
            <label className="sbx-inline">
              <span>Traffic</span>
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                {SCALES.map((s) => <option key={s} value={s}>×{s}</option>)}
              </select>
            </label>
            <label className="sbx-inline">
              <span>Incident</span>
              <select value={JSON.stringify(incident)} onChange={(e) => setIncident(JSON.parse(e.target.value) as Incident)}>
                {incidentOptions.map((i) => <option key={JSON.stringify(i)} value={JSON.stringify(i)}>{i.type === "none" ? "None" : incidentLabel(i)}</option>)}
              </select>
            </label>
            {ran && !stale && (
              <span className="sbx-runstats">
                <span className={ran.result.metrics.successRate >= 0.99 ? "good" : ran.result.metrics.successRate >= 0.95 ? "warn" : "bad"}>
                  {(ran.result.metrics.successRate * 100).toFixed(ran.result.metrics.successRate > 0.99 ? 2 : 1)}% ok
                </span>
              </span>
            )}
          </div>
          <FlowCanvas graph={graph} onChange={setGraph} selected={selected} onSelect={setSelected} result={ran?.result ?? null} stale={stale} />
        </section>

        <aside className="sbx-side">
          <div className="card tight">
            <Inspector graph={graph} selected={selected} onChange={setGraph} onSelect={setSelected} result={stale ? null : ran?.result ?? null} />
          </div>
          <div className="card tight">
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
              onSelect={setSelected}
              onRun={() => doRun()}
            />
          </div>
        </aside>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
