"use client";
// Inspector: edit the selected component's config (with help text), see its live numbers, rename,
// duplicate, delete, and swap a fallback's primary/backup.
import Icon from "@/components/ui/Icon";
import { KINDS, nodeSubtitle, nodeTitle, resolveConfig, type FieldDef } from "./catalog";
import { fmtMs, fmtRps, fmtUsd, pct } from "./format";
import { KindIcon } from "./icons";
import { removeNode, setConfig, swapOutputs, uniqueId } from "./presets";
import type { ConfigValue, Graph, RunResult } from "./types";

export interface InspectorProps {
  graph: Graph;
  selected: string | null;
  onChange: (g: Graph) => void;
  onSelect: (id: string | null) => void;
  result?: RunResult | null;
  compact?: boolean;
  readOnly?: boolean;
}

function fmtField(f: FieldDef, v: ConfigValue): string {
  if (f.type !== "number") return String(v);
  const n = Number(v);
  if (f.percent) return pct(n, n < 0.1 && n > 0 ? 1 : 0);
  if (f.unit === "ms") return fmtMs(n);
  if (f.unit === "$") return fmtUsd(n);
  if (f.unit === "rps") return `${fmtRps(n)} rps`;
  if (f.step < 1) return String(Math.round(n * 1000) / 1000);
  return Math.round(n).toLocaleString("en-US");
}

const SLIDER = 1000;
function toSlider(f: Extract<FieldDef, { type: "number" }>, v: number): number {
  if (f.log && f.min > 0) return (Math.log(v / f.min) / Math.log(f.max / f.min)) * SLIDER;
  return ((v - f.min) / (f.max - f.min)) * SLIDER;
}
function fromSlider(f: Extract<FieldDef, { type: "number" }>, s: number): number {
  const t = s / SLIDER;
  const raw = f.log && f.min > 0 ? f.min * Math.pow(f.max / f.min, t) : f.min + t * (f.max - f.min);
  // Round to the field's step, and to 2 significant figures on log sliders so values stay readable.
  let v = Math.round(raw / f.step) * f.step;
  if (f.log && v >= 10) {
    const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    v = Math.round(v / mag) * mag;
  }
  return Math.min(f.max, Math.max(f.min, Number(v.toFixed(6))));
}

function Field({ f, value, onSet, disabled }: { f: FieldDef; value: ConfigValue; onSet: (v: ConfigValue) => void; disabled?: boolean }) {
  const id = `sbx-f-${f.key}`;
  if (f.type === "boolean")
    return (
      <div className="control sbx-field" title={f.help}>
        <span className="control-label">
          <label htmlFor={id}>{f.label}</label>
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={value === true}
            className={`switch ${value === true ? "on" : ""}`}
            style={{ marginLeft: "auto" }}
            onClick={() => onSet(!(value === true))}
            disabled={disabled}
          >
            <i />
          </button>
        </span>
        <small className="sbx-help">{f.help}</small>
      </div>
    );
  if (f.type === "select")
    return (
      <div className="control sbx-field">
        <label className="control-label" htmlFor={id}>{f.label}</label>
        <select id={id} value={String(value)} onChange={(e) => onSet(e.target.value)} disabled={disabled}>
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <small className="sbx-help">{f.help}</small>
      </div>
    );
  const n = Number(value);
  return (
    <div className="control sbx-field">
      <label className="control-label" htmlFor={id}>
        {f.label}
        <b>{fmtField(f, n)}</b>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={SLIDER}
        step={1}
        value={Math.round(toSlider(f, n))}
        onChange={(e) => onSet(fromSlider(f, Number(e.target.value)))}
        disabled={disabled}
        aria-valuetext={fmtField(f, n)}
      />
      <small className="sbx-help">{f.help}</small>
    </div>
  );
}

export default function Inspector({ graph, selected, onChange, onSelect, result, compact, readOnly }: InspectorProps) {
  const node = graph.nodes.find((n) => n.id === selected);
  if (!node) {
    return (
      <div className={`sbx-inspector is-empty ${compact ? "compact" : ""}`}>
        <div className="sbx-insp-head">
          <span className="sbx-node-icon"><Icon name="sliders" size={17} /></span>
          <div>
            <b>Inspector</b>
            <small>Select a component to edit it.</small>
          </div>
        </div>
        {!compact && (
          <ul className="sbx-hints">
            <li><b>Add</b> components by clicking or dragging them from the palette.</li>
            <li><b>Connect</b> by dragging from a node&apos;s right handle to another node&apos;s left handle. Requests flow left to right.</li>
            <li><b>Delete</b> a selected node or edge with Backspace.</li>
            <li><b>Run</b> to push traffic through the design and see what happens.</li>
          </ul>
        )}
        {compact && graph.nodes.length > 0 && (
          <div className="sbx-insp-list">
            {graph.nodes.map((n) => (
              <button key={n.id} type="button" className="chip-btn" onClick={() => onSelect(n.id)}>
                <KindIcon kind={n.kind} size={13} /> {nodeTitle(n, graph.nodes)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
  const def = KINDS[node.kind];
  const cfg = resolveConfig(node);
  const r = result?.nodes[node.id];
  const issues = result?.issues.filter((i) => i.nodeId === node.id) ?? [];
  const outs = graph.edges.filter((e) => e.from === node.id);
  const set = (k: string, v: ConfigValue) => onChange(setConfig(graph, node.id, { [k]: v }));

  const duplicate = () => {
    const id = uniqueId(graph, node.kind);
    const copy = { ...node, id, label: undefined, x: (node.x ?? 0) + 40, y: (node.y ?? 0) + 110, config: { ...(node.config ?? {}) } };
    const ins = graph.edges.filter((e) => e.to === node.id).map((e) => ({ from: e.from, to: id }));
    const outsCopy = outs.map((e) => ({ from: id, to: e.to }));
    onChange({ nodes: [...graph.nodes, copy], edges: [...graph.edges, ...ins, ...outsCopy] });
    onSelect(id);
  };

  return (
    <div className={`sbx-inspector ${compact ? "compact" : ""}`}>
      <div className="sbx-insp-head">
        <span className="sbx-node-icon"><KindIcon kind={node.kind} size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <b>{nodeTitle(node, graph.nodes)}</b>
          <small>{def.label} · {nodeSubtitle(node)}</small>
        </div>
        <button type="button" className="chip-btn sbx-close" aria-label="Close inspector" onClick={() => onSelect(null)}>
          <Icon name="x" size={14} />
        </button>
      </div>
      <p className="sbx-insp-help">{def.help}</p>

      {r && (
        <div className="sbx-insp-stats">
          <div><span>Load</span><b>{fmtRps(r.load)}/s</b></div>
          {r.capacity !== null && <div><span>Capacity</span><b>{fmtRps(r.capacity)}/s</b></div>}
          {r.capacity !== null && <div className={r.util > 1 ? "bad" : r.util > 0.85 ? "warn" : ""}><span>Utilisation</span><b>{pct(Math.min(r.util, 99.99))}</b></div>}
          {r.latencyMs > 0 && <div><span>Adds</span><b>{fmtMs(r.latencyMs)}</b></div>}
          {r.dropped > 0.0005 && <div className="bad"><span>Failing</span><b>{fmtRps(r.dropped)}/s</b></div>}
          {r.blocked > 0.0005 && <div><span>Blocked</span><b>{fmtRps(r.blocked)}/s</b></div>}
          {r.costPerMonth > 0 && <div><span>Cost</span><b>{fmtUsd(r.costPerMonth)}/mo</b></div>}
          {r.stats.map((s) => (
            <div key={s.label} className={s.tone ?? ""}><span>{s.label}</span><b>{s.value}</b></div>
          ))}
        </div>
      )}
      {issues.map((i) => (
        <p key={i.text} className={`sbx-issue ${i.severity}`}><Icon name={i.severity === "info" ? "info" : "alert"} size={14} /> {i.text}</p>
      ))}

      {!readOnly && (
        <label className="control sbx-field">
          <span className="control-label">Name</span>
          <input type="text" value={node.label ?? ""} placeholder={nodeTitle({ ...node, label: undefined }, graph.nodes)} onChange={(e) => onChange({ nodes: graph.nodes.map((n) => (n.id === node.id ? { ...n, label: e.target.value || undefined } : n)), edges: graph.edges })} />
        </label>
      )}

      <div className="sbx-fields">
        {def.fields.map((f) => <Field key={f.key} f={f} value={cfg[f.key]} onSet={(v) => set(f.key, v)} disabled={readOnly} />)}
      </div>

      {node.kind === "fallback" && (
        <div className="sbx-fallback">
          {outs.length >= 2 ? (
            <>
              <p>
                Primary: <b>{nodeTitle(graph.nodes.find((n) => n.id === outs[0].to)!, graph.nodes)}</b>
                <br />
                Backup: <b>{nodeTitle(graph.nodes.find((n) => n.id === outs[1].to)!, graph.nodes)}</b>
              </p>
              {!readOnly && <button type="button" className="btn ghost sm" onClick={() => onChange(swapOutputs(graph, node.id))}><Icon name="repeat" size={14} /> Swap primary and backup</button>}
            </>
          ) : (
            <p className="muted">Wire two outputs: the first becomes the primary, the second the backup.</p>
          )}
        </div>
      )}

      {!readOnly && (
        <div className="row sbx-insp-actions">
          <button type="button" className="btn ghost sm" onClick={duplicate}><Icon name="copy" size={14} /> Duplicate</button>
          <button type="button" className="btn ghost sm" onClick={() => { onChange(removeNode(graph, node.id)); onSelect(null); }}><Icon name="trash" size={14} /> Delete</button>
        </div>
      )}
    </div>
  );
}

