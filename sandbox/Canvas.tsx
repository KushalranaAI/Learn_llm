"use client";
// The sandbox canvas: a React Flow board of LLM-system components with a palette.
// - FlowCanvas: controlled (graph in, graph out) - used by the sandbox page.
// - SandboxCanvas: self-contained editor (canvas + palette + inspector) that lab steps embed.
import "@xyflow/react/dist/style.css";
import "./sandbox.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { KindIcon } from "./icons";
import { ALL_KINDS, KINDS, KIND_GROUPS, nodeSubtitle, nodeTitle } from "./catalog";
import { fmtRps } from "./format";
import Inspector from "./Inspector";

export { KindIcon };
import { addNode, connect, layout, removeNode } from "./presets";
import type { Graph, NodeKind, RunResult, SandboxNode } from "./types";

// ---------------------------------------------------------------- shared context for node cards

interface CardCtx {
  result: RunResult | null;
  stale: boolean;
  nodes: SandboxNode[];
}
const Ctx = createContext<CardCtx>({ result: null, stale: false, nodes: [] });


type RFData = { node: SandboxNode };
type RFNode = Node<RFData, "llm">;

const NodeCard = memo(function NodeCard({ data, selected }: NodeProps<RFNode>) {
  const { result, stale, nodes } = useContext(Ctx);
  const n = data.node;
  const def = KINDS[n.kind];
  const r = result?.nodes[n.id];
  const tone = !r || stale ? "" : r.down || r.util > 1 ? "bad" : r.util > 0.85 || r.stats.some((s) => s.tone === "bad") ? "warn" : r.load > 0 || n.kind === "users" || n.kind === "observability" ? "ok" : "idle";
  return (
    <div className={`sbx-node ${tone} ${selected ? "selected" : ""} ${stale ? "stale" : ""}`} data-kind={n.kind}>
      {def.hasInput && <Handle type="target" position={Position.Left} className="sbx-handle" />}
      <div className="sbx-node-head">
        <span className="sbx-node-icon"><KindIcon kind={n.kind} size={17} /></span>
        <div className="sbx-node-title">
          <b>{nodeTitle(n, nodes)}</b>
          <small>{nodeSubtitle(n)}</small>
        </div>
      </div>
      {r && (
        <div className="sbx-node-stats">
          {r.stats.slice(0, 2).map((s) => (
            <span key={s.label} className={s.tone ?? ""}>
              <i>{s.label}</i> {s.value}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="sbx-handle" />
    </div>
  );
});

const nodeTypes = { llm: NodeCard };

// ---------------------------------------------------------------- palette

export function Palette({ kinds, onAdd, compact }: { kinds: NodeKind[]; onAdd: (k: NodeKind) => void; compact?: boolean }) {
  const groups = KIND_GROUPS.map((g) => ({ g, ks: kinds.filter((k) => KINDS[k].group === g) })).filter((x) => x.ks.length);
  return (
    <div className={`sbx-palette ${compact ? "compact" : ""}`} role="toolbar" aria-label="Components">
      {groups.map(({ g, ks }) => (
        <div key={g} className="sbx-palette-group">
          {!compact && <span className="sbx-palette-label">{g}</span>}
          {ks.map((k) => (
            <button
              key={k}
              type="button"
              className="sbx-palette-item"
              draggable
              title={`${KINDS[k].label}: ${KINDS[k].description} (click or drag onto the canvas)`}
              onDragStart={(e) => {
                e.dataTransfer.setData("application/llm100-node", k);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onAdd(k)}
            >
              <KindIcon kind={k} size={15} />
              <span>{KINDS[k].label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- controlled canvas

export interface FlowCanvasProps {
  graph: Graph;
  onChange: (g: Graph) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  result?: RunResult | null;
  stale?: boolean;
  /** kinds offered in the palette (default: all) */
  palette?: NodeKind[];
  /** px; default fills its container */
  height?: number;
  readOnly?: boolean;
  /** render the palette elsewhere (the full sandbox puts it in its left panel) */
  hidePalette?: boolean;
  /** receives functions to add a node at the view centre and to fit the view */
  onReady?: (api: CanvasApi) => void;
}

export interface CanvasApi {
  add: (kind: NodeKind) => void;
  fit: () => void;
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}

const edgeKey = (from: string, to: string) => `${from}->${to}`;

function FlowInner({ graph, onChange, selected, onSelect, result = null, stale = false, palette, height, readOnly, hidePalette, onReady }: FlowCanvasProps) {
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const selRef = useRef(selected);
  selRef.current = selected;
  // React Flow measures nodes; keep those measurements across re-renders of our derived nodes.
  const measured = useRef(new Map<string, { width?: number; height?: number }>());
  const [mver, bump] = useReducer((x: number) => x + 1, 0);
  const [selEdges, setSelEdges] = useState<Set<string>>(new Set());

  const nodes: RFNode[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: "llm" as const,
        position: { x: n.x ?? 0, y: n.y ?? 0 },
        data: { node: n },
        selected: n.id === selected,
        measured: measured.current.get(n.id),
        deletable: !readOnly,
        draggable: !readOnly,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, selected, readOnly, mver],
  );

  const edges: Edge[] = useMemo(() => {
    const kindOf = new Map(graph.nodes.map((n) => [n.id, n.kind]));
    const outIndex = new Map<string, number>();
    return graph.edges.map((e) => {
      const id = edgeKey(e.from, e.to);
      const i = outIndex.get(e.from) ?? 0;
      outIndex.set(e.from, i + 1);
      const role = kindOf.get(e.from) === "fallback" ? (i === 0 ? "primary" : i === 1 ? "backup" : "unused") : "";
      const rps = result && !stale ? result.edges[id] ?? 0 : null;
      const label = [role, rps !== null && rps > 0 ? `${fmtRps(rps)}/s` : ""].filter(Boolean).join(" · ");
      return {
        id,
        source: e.from,
        target: e.to,
        selected: selEdges.has(id),
        animated: rps !== null && rps > 0,
        label: label || undefined,
        className: rps !== null && rps === 0 ? "idle" : "",
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        deletable: !readOnly,
      };
    });
  }, [graph, result, stale, selEdges, readOnly]);

  const onNodesChange = useCallback(
    (changes: NodeChange<RFNode>[]) => {
      let g = graphRef.current;
      let measuredChanged = false;
      const pos = new Map<string, { x: number; y: number }>();
      let sel: string | null | undefined;
      for (const c of changes) {
        if (c.type === "dimensions" && c.dimensions) {
          measured.current.set(c.id, c.dimensions);
          measuredChanged = true;
        } else if (c.type === "position" && c.position) pos.set(c.id, c.position);
        else if (c.type === "remove" && !readOnly) {
          g = removeNode(g, c.id);
          measured.current.delete(c.id);
          if (selRef.current === c.id) sel = null;
        } else if (c.type === "select") {
          if (c.selected) sel = c.id;
          else if (sel === undefined && selRef.current === c.id) sel = null;
        }
      }
      if (pos.size) g = { nodes: g.nodes.map((n) => (pos.has(n.id) ? { ...n, x: pos.get(n.id)!.x, y: pos.get(n.id)!.y } : n)), edges: g.edges };
      if (g !== graphRef.current) onChange(g);
      if (sel !== undefined) onSelect(sel);
      if (measuredChanged) bump();
    },
    [onChange, onSelect, readOnly],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      let g = graphRef.current;
      const removed = new Set<string>();
      setSelEdges((prev) => {
        const next = new Set(prev);
        for (const c of changes) {
          if (c.type === "select") { if (c.selected) next.add(c.id); else next.delete(c.id); }
          if (c.type === "remove") next.delete(c.id);
        }
        return next;
      });
      for (const c of changes) if (c.type === "remove") removed.add(c.id);
      if (removed.size && !readOnly) {
        g = { nodes: g.nodes, edges: g.edges.filter((e) => !removed.has(edgeKey(e.from, e.to))) };
        onChange(g);
      }
    },
    [onChange, readOnly],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !c.source || !c.target || c.source === c.target) return;
      onChange(connect(graphRef.current, c.source, c.target));
    },
    [onChange, readOnly],
  );

  const add = useCallback(
    (kind: NodeKind, screen?: { x: number; y: number }) => {
      let p: { x: number; y: number };
      if (screen) p = rf.screenToFlowPosition(screen);
      else {
        const rect = wrap.current?.getBoundingClientRect();
        const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 300, y: 200 };
        p = rf.screenToFlowPosition(center);
        // nudge so repeated clicks don't stack exactly
        const k = graphRef.current.nodes.length % 5;
        p = { x: p.x - 90 + k * 18, y: p.y - 30 + k * 18 };
      }
      const { graph: g, id } = addNode(graphRef.current, kind, { x: Math.round(p.x), y: Math.round(p.y) });
      onChange(g);
      onSelect(id);
    },
    [rf, onChange, onSelect],
  );

  // Fit the view: on mount, whenever the node set is replaced (scenario load, import, reset) and when the
  // container is resized. Fitting waits until React Flow has measured every node, else it fits nothing.
  const FIT = { padding: 0.12, minZoom: 0.3, maxZoom: 1 } as const;
  const initialized = useNodesInitialized();
  const pendingFit = useRef(true);
  const idsKey = graph.nodes.map((n) => n.id).join("|");
  const lastIds = useRef<string | null>(null);
  if (lastIds.current !== idsKey) {
    const prev = lastIds.current === null ? [] : lastIds.current.split("|").filter(Boolean);
    const now = idsKey.split("|").filter(Boolean);
    const added = now.filter((id) => !prev.includes(id)).length;
    const removed = prev.filter((id) => !now.includes(id)).length;
    // A single palette add / delete keeps the learner's viewport; bigger changes refit.
    if (lastIds.current === null || added + removed > 1) pendingFit.current = true;
    lastIds.current = idsKey;
  }
  useEffect(() => {
    if (!pendingFit.current || !graph.nodes.length) return;
    if (!initialized || graph.nodes.some((n) => !measured.current.get(n.id)?.width)) return;
    pendingFit.current = false;
    const raf = requestAnimationFrame(() => rf.fitView({ ...FIT, duration: 200 }));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, idsKey, mver, rf]);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let last = "";
    const ro = new ResizeObserver(([e]) => {
      const size = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`;
      if (size === last) return;
      const firstObservation = last === "";
      last = size;
      if (firstObservation) return;
      clearTimeout(t);
      t = setTimeout(() => { if (graphRef.current.nodes.length) rf.fitView(FIT); }, 120);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rf]);

  useEffect(() => {
    onReady?.({ add: (k) => add(k), fit: () => rf.fitView({ ...FIT, duration: 200 }) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady, add, rf]);

  const ctx = useMemo(() => ({ result, stale, nodes: graph.nodes }), [result, stale, graph.nodes]);
  const kinds = palette?.length ? palette : ALL_KINDS;

  return (
    <div className="sbx-canvas" style={height ? { height } : undefined}>
      {!readOnly && !hidePalette && <Palette kinds={kinds} onAdd={(k) => add(k)} compact={!!palette?.length && palette.length <= 6} />}
      <div
        className="sbx-flow"
        ref={wrap}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/llm100-node")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(e) => {
          const k = e.dataTransfer.getData("application/llm100-node") as NodeKind;
          if (!k || !(k in KINDS)) return;
          e.preventDefault();
          add(k, { x: e.clientX - 90, y: e.clientY - 30 });
        }}
      >
        <Ctx.Provider value={ctx}>
          <ReactFlow<RFNode, Edge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={() => onSelect(null)}
            isValidConnection={(c) => c.source !== c.target}
            deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
            fitView
            fitViewOptions={FIT}
            minZoom={0.2}
            maxZoom={1.75}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={!readOnly}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </Ctx.Provider>
        {!graph.nodes.length && (
          <div className="sbx-empty">
            <Icon name="boxes" size={22} />
            <p>Click or drag components from the palette. Wire them left to right by dragging from a node&apos;s right handle.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- embeddable editor

export interface SandboxCanvasProps {
  initial: Graph;
  palette?: NodeKind[];
  onChange?: (g: Graph) => void;
  height?: number;
  /** show live stats from a run (e.g. the lab's latest evaluateDesign().run) */
  result?: RunResult | null;
  /** mark the result as out of date (the design changed since it ran) */
  stale?: boolean;
  readOnly?: boolean;
}

/** A self-contained sandbox editor for lab steps: palette, canvas and an inspector for the selected node. */
export function SandboxCanvas({ initial, palette, onChange, height = 460, result = null, stale = false, readOnly }: SandboxCanvasProps) {
  const [graph, setGraph] = useState<Graph>(() => layout(initial));
  const [selected, setSelected] = useState<string | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  // Reset when the lab hands us a different starting design.
  const initKey = JSON.stringify(initial);
  const lastInit = useRef(initKey);
  useEffect(() => {
    if (lastInit.current !== initKey) {
      lastInit.current = initKey;
      setGraph(layout(initial));
      setSelected(null);
    }
  }, [initKey, initial]);
  const update = useCallback((g: Graph) => {
    setGraph(g);
    cb.current?.(g);
  }, []);
  return (
    <div className="sbx-embed">
      <FlowCanvas graph={graph} onChange={update} selected={selected} onSelect={setSelected} result={result} stale={stale} palette={palette} height={height} readOnly={readOnly} />
      <div className="sbx-embed-side" style={{ maxHeight: height + 60 }}>
        <Inspector graph={graph} selected={selected} onChange={update} onSelect={setSelected} result={stale ? null : result} compact readOnly={readOnly} />
      </div>
    </div>
  );
}

export default SandboxCanvas;
