"use client";
// Pick an input and watch it flow through a small network (used by the XOR simulation).
import { useState } from "react";
import NeuralNetDiagram, { type NNLayer } from "./nn-diagram";

export default function NetProbe({
  inputs,
  run,
  caption,
}: {
  inputs: [number, number][];
  run: (x: number, y: number) => { layers: NNLayer[]; weights: number[][][] };
  caption?: string;
}) {
  const [k, setK] = useState(1);
  const [x, y] = inputs[k];
  const net = run(x, y);
  return (
    <div className="nn-probe">
      <div className="row" style={{ gap: 6 }}>
        <span className="muted small">Feed an input:</span>
        {inputs.map(([a, b], i) => (
          <button key={i} type="button" className={`filter ${i === k ? "on" : ""}`} onClick={() => setK(i)} aria-pressed={i === k}>
            ({a}, {b})
          </button>
        ))}
      </div>
      <NeuralNetDiagram layers={net.layers} weights={net.weights} range={[-1, 1]} height={250} caption={caption} />
    </div>
  );
}
