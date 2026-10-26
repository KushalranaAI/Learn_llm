"use client";
// A neural network drawn the way it is usually taught: neurons are circles that light up with their activation and
// show the number inside; connections are lines whose colour is the weight's sign (blue +, orange -) and whose
// thickness is its size. When the values change, a forward pass sweeps through the layers, left to right.
import { useEffect, useId, useRef, useState } from "react";
import { useWidth } from "./ui";

export type NNNode = {
  /** activation shown as brightness (0..1 after scaling by `range`) and as the number inside */
  value: number;
  /** small label under/next to the neuron (x₁, h₂, y ...) */
  label?: string;
  /** text inside instead of the value (e.g. "Σ σ") */
  inner?: string;
  /** draw as a bias/constant input (dashed) */
  bias?: boolean;
};
export type NNLayer = { title?: string; nodes: NNNode[] };

const f = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

export default function NeuralNetDiagram({
  layers,
  weights,
  range = [-1, 1],
  showWeights,
  height = 260,
  caption,
  backward,
  edgeLabels,
}: {
  layers: NNLayer[];
  /** weights[l][j][i]: from neuron i in layer l to neuron j in layer l+1 */
  weights: number[][][];
  /** values mapped to brightness: range[0] = dark, range[1] = full */
  range?: [number, number];
  /** write the weight on each line (small networks) */
  showWeights?: boolean;
  height?: number;
  caption?: string;
  /** animate right → left (gradients flowing back) instead of a forward pass */
  backward?: boolean;
  /** text to write on each line instead of the weight (same shape as `weights`), e.g. gradients */
  edgeLabels?: (string | null)[][][];
}) {
  const [ref, w] = useWidth(640);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  // replay the forward pass whenever the numbers change
  const sig = JSON.stringify([layers.map((l) => l.nodes.map((n) => Math.round(n.value * 100))), weights.map((m) => m.map((r) => r.map((x) => Math.round(x * 100))))]);
  const [pass, setPass] = useState(0);
  const last = useRef(sig);
  useEffect(() => {
    if (last.current !== sig) {
      last.current = sig;
      setPass((p) => p + 1);
    }
  }, [sig]);

  const L = layers.length;
  const maxN = Math.max(...layers.map((l) => l.nodes.length));
  const padX = 46;
  const top = 26;
  const bottom = 22;
  const usableH = height - top - bottom;
  const r = Math.max(13, Math.min(26, usableH / (maxN * 2.6), (w - padX * 2) / (L * 5)));
  const x = (l: number) => (L === 1 ? w / 2 : padX + r + (l * (w - 2 * padX - 2 * r)) / (L - 1));
  const y = (l: number, i: number) => {
    const n = layers[l].nodes.length;
    const gap = Math.min(r * 3, usableH / Math.max(1, n));
    return top + usableH / 2 + (i - (n - 1) / 2) * gap;
  };
  const maxW = Math.max(1e-9, ...weights.flat(2).map(Math.abs));
  const bright = (v: number) => Math.max(0, Math.min(1, (v - range[0]) / (range[1] - range[0] || 1)));

  return (
    <figure className="nn" ref={ref} aria-label={caption ?? "Neural network diagram"}>
      <svg width={w} height={height} role="img">
        <defs>
          <radialGradient id={`g${uid}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#d9fbe9" stopOpacity="0.85" />
          </radialGradient>
        </defs>
        {/* connections */}
        {weights.map((m, l) =>
          m.map((row, j) =>
            row.map((wt, i) => {
              if (!layers[l]?.nodes[i] || !layers[l + 1]?.nodes[j] || wt === 0) return null; // exactly 0 = no connection
              const x1 = x(l) + r, y1 = y(l, i), x2 = x(l + 1) - r, y2 = y(l + 1, j);
              const a = Math.abs(wt) / maxW;
              const col = wt >= 0 ? "var(--info)" : "var(--hot)";
              return (
                <g key={`${l}-${j}-${i}`}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={col} strokeOpacity={0.18 + 0.7 * a} strokeWidth={0.6 + 3.4 * a} strokeLinecap="round" />
                  <line
                    key={`p${pass}`}
                    x1={backward ? x2 : x1}
                    y1={backward ? y2 : y1}
                    x2={backward ? x1 : x2}
                    y2={backward ? y1 : y2}
                    stroke={col}
                    strokeWidth={0.6 + 3.4 * a}
                    strokeLinecap="round"
                    className="nn-pulse"
                    pathLength={100}
                    style={{ animationDelay: `${(backward ? L - 2 - l : l) * 0.45}s` }}
                  />
                  {(showWeights || edgeLabels) && (edgeLabels ? edgeLabels[l]?.[j]?.[i] : f(wt)) && (
                    <text x={x1 + (x2 - x1) * 0.42} y={y1 + (y2 - y1) * 0.42 - 5} className="nn-w" textAnchor="middle" fill={col}>
                      {edgeLabels ? edgeLabels[l]?.[j]?.[i] : f(wt)}
                    </text>
                  )}
                </g>
              );
            }),
          ),
        )}
        {/* neurons */}
        {layers.map((layer, l) => (
          <g key={l}>
            {layer.title && <text x={l === L - 1 && L > 1 ? x(l) + r : l === 0 && L > 1 ? x(l) - r : x(l)} y={14} textAnchor={l === L - 1 && L > 1 ? "end" : l === 0 && L > 1 ? "start" : "middle"} className="nn-title">{layer.title}</text>}
            {layer.nodes.map((n, i) => {
              const b = n.bias ? 0.15 : bright(n.value);
              return (
                <g key={i} className="nn-node" style={{ animationDelay: `${l * 0.45 + 0.25}s` }} data-pass={pass}>
                  <circle cx={x(l)} cy={y(l, i)} r={r} fill="var(--bg-2)" stroke="var(--line-2)" strokeWidth={1.5} strokeDasharray={n.bias ? "3 3" : undefined} />
                  <circle key={`f${pass}`} cx={x(l)} cy={y(l, i)} r={r - 1.5} fill={`url(#g${uid})`} fillOpacity={b} className="nn-fill" style={{ animationDelay: `${(backward ? L - 1 - l : l) * 0.45 + 0.2}s` }} />
                  <text x={x(l)} y={y(l, i) + 4} textAnchor="middle" className={`nn-v ${b > 0.55 ? "dark" : ""}`} style={{ fontSize: Math.max(9, r * 0.52) }}>
                    {n.inner ?? f(n.value)}
                  </text>
                  {n.label && (
                    <text x={l === 0 ? x(l) - r - 6 : l === L - 1 ? x(l) + r + 6 : x(l)} y={l === 0 || l === L - 1 ? y(l, i) + 4 : y(l, i) + r + 13} textAnchor={l === 0 ? "end" : l === L - 1 ? "start" : "middle"} className="nn-label">
                      {n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      <figcaption className="nn-legend">
        <span><i style={{ background: "var(--info)" }} /> positive weight</span>
        <span><i style={{ background: "var(--hot)" }} /> negative weight</span>
        <span><i className="glow" /> brighter = larger activation</span>
        {caption && <span className="muted">{caption}</span>}
      </figcaption>
    </figure>
  );
}
