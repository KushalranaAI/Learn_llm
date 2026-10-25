// Helpers to build sandbox graphs concisely and to edit them (pure; no React).
//
//   build(
//     { users: ["users", { rps: 30 }], gw: "gateway", llm: ["llm-api", { model: "small" }] },
//     "users > gw > llm",
//   )
//
// Wiring is a comma/newline separated list of chains "a > b > c". Nodes without x/y get an automatic
// left-to-right layout (columns = longest path from a source).
import { KINDS, defaultConfig } from "./catalog";
import type { Graph, NodeConfig, NodeKind, SandboxNode } from "./types";

export type NodeSpec = NodeKind | [NodeKind, NodeConfig?, string?];

export const COL_W = 250;
export const ROW_H = 112;
/** columns per lane before the layout wraps to a new row */
export const PER_LANE = 3;
const LANE_GAP = 24;

export function parseWiring(wiring: string): { from: string; to: string }[] {
  const edges: { from: string; to: string }[] = [];
  for (const chain of wiring.split(/[,\n;]/)) {
    const ids = chain.split(">").map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < ids.length - 1; i++) edges.push({ from: ids[i], to: ids[i + 1] });
  }
  return edges;
}

export function build(nodes: Record<string, NodeSpec>, wiring = ""): Graph {
  const list: SandboxNode[] = Object.entries(nodes).map(([id, spec]) => {
    const [kind, config, label] = typeof spec === "string" ? [spec, undefined, undefined] : spec;
    return { id, kind, ...(config ? { config: { ...config } } : {}), ...(label ? { label } : {}) };
  });
  const ids = new Set(list.map((n) => n.id));
  const edges = parseWiring(wiring);
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) throw new Error(`build(): unknown node in edge ${e.from} > ${e.to}`);
  }
  return layout({ nodes: list, edges });
}

/** Give every node without a position a layered left-to-right position. */
export function layout(g: Graph, force = false): Graph {
  const col = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const n of g.nodes) incoming.set(n.id, 0);
  for (const e of g.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  // Longest path from sources, guarding against cycles.
  const visit = (id: string, depth: number, stack: Set<string>) => {
    if (stack.has(id)) return;
    if ((col.get(id) ?? -1) >= depth) return;
    col.set(id, depth);
    stack.add(id);
    for (const e of g.edges) if (e.from === id) visit(e.to, depth + 1, stack);
    stack.delete(id);
  };
  const outgoing = new Set(g.edges.map((e) => e.from));
  const sources = g.nodes.filter((n) => n.kind === "users" || (!incoming.get(n.id) && outgoing.has(n.id)));
  for (const s of sources) visit(s.id, 0, new Set());
  // Unconnected nodes continue the reading order after the last column instead of piling into column 0.
  let nextCol = Math.max(-1, ...col.values()) + 1;
  for (const n of g.nodes) {
    if (col.has(n.id)) continue;
    const hasEdge = g.edges.some((e) => e.from === n.id || e.to === n.id);
    col.set(n.id, hasEdge ? 0 : nextCol++);
  }
  // Wrap long chains into lanes of at most PER_LANE columns (reading order), so the aspect ratio
  // stays close to the canvas instead of one very wide row.
  const laneOf = (c: number) => Math.floor(c / PER_LANE);
  const colsPerLane = new Map<number, Map<number, string[]>>();
  for (const n of g.nodes) {
    const c = col.get(n.id)!;
    const l = laneOf(c);
    const cols = colsPerLane.get(l) ?? new Map<number, string[]>();
    cols.set(c, [...(cols.get(c) ?? []), n.id]);
    colsPerLane.set(l, cols);
  }
  const laneRows = new Map<number, number>();
  for (const [l, cols] of colsPerLane) laneRows.set(l, Math.max(...[...cols.values()].map((v) => v.length)));
  const laneTop = new Map<number, number>();
  let yAcc = 0;
  for (const l of [...laneRows.keys()].sort((x, y) => x - y)) {
    laneTop.set(l, yAcc);
    yAcc += laneRows.get(l)! * ROW_H + LANE_GAP;
  }
  const slot = new Map<string, number>();
  for (const cols of colsPerLane.values()) for (const ids of cols.values()) ids.forEach((id, i) => slot.set(id, i));
  const nodes = g.nodes.map((n) => {
    if (!force && typeof n.x === "number" && typeof n.y === "number") return n;
    const c = col.get(n.id)!;
    const l = laneOf(c);
    const count = colsPerLane.get(l)!.get(c)!.length;
    const offset = ((laneRows.get(l)! - count) * ROW_H) / 2;
    return { ...n, x: (c % PER_LANE) * COL_W, y: laneTop.get(l)! + offset + slot.get(n.id)! * ROW_H };
  });
  return { nodes, edges: g.edges };
}

// ---------------------------------------------------------------- edits

export function uniqueId(g: Graph, kind: NodeKind): string {
  const base = kind.replace(/[^a-z0-9]+/g, "-");
  let i = 1;
  while (g.nodes.some((n) => n.id === `${base}-${i}`)) i++;
  return `${base}-${i}`;
}

export function addNode(g: Graph, kind: NodeKind, pos?: { x: number; y: number }, config?: NodeConfig): { graph: Graph; id: string } {
  const id = uniqueId(g, kind);
  const maxX = Math.max(0, ...g.nodes.map((n) => n.x ?? 0));
  const node: SandboxNode = { id, kind, x: pos?.x ?? maxX + COL_W, y: pos?.y ?? 0, ...(config ? { config } : {}) };
  return { graph: { nodes: [...g.nodes, node], edges: g.edges }, id };
}

export function removeNode(g: Graph, id: string): Graph {
  return { nodes: g.nodes.filter((n) => n.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id) };
}

export function connect(g: Graph, from: string, to: string): Graph {
  if (from === to || g.edges.some((e) => e.from === from && e.to === to)) return g;
  return { nodes: g.nodes, edges: [...g.edges, { from, to }] };
}

export function setConfig(g: Graph, id: string, patch: NodeConfig): Graph {
  return { nodes: g.nodes.map((n) => (n.id === id ? { ...n, config: { ...(n.config ?? {}), ...patch } } : n)), edges: g.edges };
}

/** Put a new node on all of `id`'s incoming edges (between its parents and it). */
export function insertBefore(g: Graph, id: string, kind: NodeKind, config?: NodeConfig): { graph: Graph; id: string } {
  const target = g.nodes.find((n) => n.id === id);
  const nid = uniqueId(g, kind);
  const node: SandboxNode = { id: nid, kind, x: (target?.x ?? 0) - COL_W / 2, y: (target?.y ?? 0) + ROW_H * 0.9, ...(config ? { config } : {}) };
  const edges = g.edges.map((e) => (e.to === id ? { from: e.from, to: nid } : e));
  return { graph: { nodes: [...g.nodes, node], edges: [...edges, { from: nid, to: id }] }, id: nid };
}

/** Put a new node on all of `id`'s outgoing edges (or after it, if it has none). */
export function insertAfter(g: Graph, id: string, kind: NodeKind, config?: NodeConfig): { graph: Graph; id: string } {
  const target = g.nodes.find((n) => n.id === id);
  const nid = uniqueId(g, kind);
  const node: SandboxNode = { id: nid, kind, x: (target?.x ?? 0) + COL_W / 2, y: (target?.y ?? 0) + ROW_H * 0.9, ...(config ? { config } : {}) };
  const edges = g.edges.map((e) => (e.from === id ? { from: nid, to: e.to } : e));
  return { graph: { nodes: [...g.nodes, node], edges: [{ from: id, to: nid }, ...edges] }, id: nid };
}

/** Wrap a model node in a fallback: parents → fallback → (model, new backup). */
export function addFallback(g: Graph, id: string, backup: { kind: NodeKind; config?: NodeConfig }): Graph {
  const fb = insertBefore(g, id, "fallback");
  const bid = uniqueId(fb.graph, backup.kind);
  const target = g.nodes.find((n) => n.id === id);
  const node: SandboxNode = { id: bid, kind: backup.kind, x: target?.x ?? 0, y: (target?.y ?? 0) + ROW_H * 1.2, ...(backup.config ? { config: backup.config } : {}) };
  const outs = g.edges.filter((e) => e.from === id).map((e) => ({ from: bid, to: e.to }));
  return { nodes: [...fb.graph.nodes, node], edges: [...fb.graph.edges, { from: fb.id, to: bid }, ...outs] };
}

/** Swap the order of a node's first two outgoing edges (fallback primary ↔ backup). */
export function swapOutputs(g: Graph, id: string): Graph {
  const idx = g.edges.map((e, i) => (e.from === id ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return g;
  const edges = [...g.edges];
  [edges[idx[0]], edges[idx[1]]] = [edges[idx[1]], edges[idx[0]]];
  return { nodes: g.nodes, edges };
}

/** A small default design for an empty sandbox. */
export const STARTER: Graph = build(
  { users: ["users", { rps: 10 }], llm: ["llm-api", { model: "medium" }] },
  "users > llm",
);

/** Strip a graph down to what's worth saving (no defaults). */
export function cleanGraph(g: Graph): Graph {
  return {
    nodes: g.nodes.map((n) => {
      const def = defaultConfig(n.kind);
      const config: NodeConfig = {};
      for (const [k, v] of Object.entries(n.config ?? {})) if (k in def && def[k] !== v) config[k] = v;
      return {
        id: n.id,
        kind: n.kind,
        ...(Object.keys(config).length ? { config } : {}),
        ...(n.label ? { label: n.label } : {}),
        x: Math.round(n.x ?? 0),
        y: Math.round(n.y ?? 0),
      };
    }),
    edges: g.edges.map((e) => ({ from: e.from, to: e.to })),
  };
}

/** Validate an unknown value (from JSON / URL) into a Graph, or null. */
export function parseGraph(v: unknown): Graph | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
  const nodes: SandboxNode[] = [];
  for (const raw of o.nodes) {
    if (!raw || typeof raw !== "object") return null;
    const n = raw as Record<string, unknown>;
    if (typeof n.id !== "string" || typeof n.kind !== "string" || !(n.kind in KINDS)) return null;
    const config: NodeConfig = {};
    if (n.config && typeof n.config === "object")
      for (const [k, val] of Object.entries(n.config as Record<string, unknown>))
        if (typeof val === "number" || typeof val === "string" || typeof val === "boolean") config[k] = val;
    nodes.push({
      id: n.id,
      kind: n.kind as NodeKind,
      config,
      ...(typeof n.label === "string" && n.label ? { label: n.label } : {}),
      ...(typeof n.x === "number" ? { x: n.x } : {}),
      ...(typeof n.y === "number" ? { y: n.y } : {}),
    });
  }
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (o.edges as unknown[])
    .filter((e): e is { from: string; to: string } => !!e && typeof e === "object" && typeof (e as { from?: unknown }).from === "string" && typeof (e as { to?: unknown }).to === "string")
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ from: e.from, to: e.to }));
  return layout({ nodes, edges });
}
