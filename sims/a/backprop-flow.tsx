// Backpropagation, step by step: a 2-2-1 sigmoid network on one example. Walk Forward → Loss → Backward → Update and
// watch the numbers move through the neurons, then the gradients flow back along the same connections.
// Metrics: output (y), loss, gradNorm, lossAfter (loss after one more update), iterations.
import MiniMarkdown from "@/components/MiniMarkdown";
import NeuralNetDiagram from "../nn-diagram";
import { LineChart } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";

type Net = { W1: number[][]; b1: number[]; W2: number[]; b2: number };
const sig = (z: number) => 1 / (1 + Math.exp(-z));
const INIT: Net = { W1: [[0.4, -0.3], [0.2, 0.5]], b1: [0.1, -0.1], W2: [0.7, -0.4], b2: 0.05 };
const clone = (n: Net): Net => ({ W1: n.W1.map((r) => [...r]), b1: [...n.b1], W2: [...n.W2], b2: n.b2 });

function forward(n: Net, x: number[]) {
  const zh = n.W1.map((row, j) => row[0] * x[0] + row[1] * x[1] + n.b1[j]);
  const h = zh.map(sig);
  const zo = n.W2[0] * h[0] + n.W2[1] * h[1] + n.b2;
  const y = sig(zo);
  return { zh, h, zo, y };
}

function backward(n: Net, x: number[], t: number) {
  const { h, y } = forward(n, x);
  const dOut = (y - t) * y * (1 - y); // ∂L/∂z_o for L = ½(t − y)²
  const gW2 = h.map((hj) => dOut * hj);
  const gb2 = dOut;
  const dH = h.map((hj, j) => dOut * n.W2[j] * hj * (1 - hj)); // ∂L/∂z_h
  const gW1 = dH.map((d) => [d * x[0], d * x[1]]);
  const gb1 = dH;
  return { dOut, dH, gW1, gb1, gW2, gb2 };
}

function step(n: Net, x: number[], t: number, lr: number): Net {
  const g = backward(n, x, t);
  return {
    W1: n.W1.map((row, j) => row.map((w, i) => w - lr * g.gW1[j][i])),
    b1: n.b1.map((b, j) => b - lr * g.gb1[j]),
    W2: n.W2.map((w, j) => w - lr * g.gW2[j]),
    b2: n.b2 - lr * g.gb2,
  };
}

const loss = (n: Net, x: number[], t: number) => 0.5 * (t - forward(n, x).y) ** 2;

function trained(p: Params) {
  const x = [num(p, "x1"), num(p, "x2")];
  const t = num(p, "target");
  const lr = num(p, "lr");
  const it = Math.round(num(p, "iterations"));
  let n = clone(INIT);
  const curve = [loss(n, x, t)];
  for (let k = 0; k < it; k++) {
    n = step(n, x, t, lr);
    curve.push(loss(n, x, t));
  }
  return { n, x, t, lr, it, curve };
}

function compute(p: Params) {
  const { n, x, t, lr, it } = trained(p);
  const g = backward(n, x, t);
  const all = [...g.gW1.flat(), ...g.gb1, ...g.gW2, g.gb2];
  return {
    output: forward(n, x).y,
    loss: loss(n, x, t),
    gradNorm: Math.sqrt(all.reduce((s, v) => s + v * v, 0)),
    lossAfter: loss(step(n, x, t, lr), x, t),
    iterations: it,
  };
}

const PHASES = ["forward", "loss", "backward", "update"] as const;
const PHASE_LABEL: Record<string, string> = { forward: "1 · Forward", loss: "2 · Loss", backward: "3 · Backward", update: "4 · Update" };
const g4 = (v: number) => (Math.abs(v) < 0.001 && v !== 0 ? v.toExponential(1) : v.toFixed(3));

function View({ params, setParam }: SimViewProps) {
  const { n, x, t, lr, it, curve } = trained(params);
  const phase = str(params, "phase");
  const fw = forward(n, x);
  const g = backward(n, x, t);
  const next = step(n, x, t, lr);
  const L = 0.5 * (t - fw.y) ** 2;

  const nodesFwd = [
    { title: "input", nodes: [{ value: x[0], label: "x₁" }, { value: x[1], label: "x₂" }] },
    { title: "hidden (σ)", nodes: fw.h.map((v, j) => ({ value: v, label: `h${j + 1}` })) },
    { title: phase === "loss" ? `output · target ${t}` : "output (σ)", nodes: [{ value: fw.y, label: phase === "loss" ? `L = ${g4(L)}` : "y" }] },
  ];
  const nodesBack = [
    { title: "input", nodes: [{ value: x[0], label: "x₁" }, { value: x[1], label: "x₂" }] },
    { title: "δ hidden", nodes: g.dH.map((d, j) => ({ value: d, inner: g4(d), label: `δh${j + 1}` })) },
    { title: "δ output", nodes: [{ value: g.dOut, inner: g4(g.dOut), label: "δ" }] },
  ];

  let diagram;
  if (phase === "backward") {
    diagram = (
      <NeuralNetDiagram
        layers={nodesBack}
        weights={[g.gW1, [g.gW2]]}
        edgeLabels={[g.gW1.map((r) => r.map((v) => `∂ ${g4(v)}`)), [g.gW2.map((v) => `∂ ${g4(v)}`)]]}
        range={[-0.05, 0.05]}
        backward
        height={250}
        caption="gradients flow backwards along the same connections"
      />
    );
  } else if (phase === "update") {
    diagram = (
      <NeuralNetDiagram
        layers={nodesFwd}
        weights={[next.W1, [next.W2]]}
        edgeLabels={[n.W1.map((r, j) => r.map((w, i) => `${w.toFixed(2)}→${next.W1[j][i].toFixed(2)}`)), [n.W2.map((w, j) => `${w.toFixed(2)}→${next.W2[j].toFixed(2)}`)]]}
        range={[0, 1]}
        height={250}
        caption={`every weight moves by −η × its gradient (η = ${lr})`}
      />
    );
  } else {
    diagram = <NeuralNetDiagram layers={nodesFwd} weights={[n.W1, [n.W2]]} showWeights range={[0, 1]} height={250} caption={phase === "loss" ? "compare the output with the target" : "activations flow forwards"} />;
  }

  const j = 0; // the worked weight: hidden neuron 1 → output
  const maths: Record<string, string> = {
    forward: `$h_1 = \\sigma(${n.W1[0][0].toFixed(2)}\\cdot${x[0]} + ${n.W1[0][1].toFixed(2)}\\cdot${x[1]} + ${n.b1[0].toFixed(2)}) = \\sigma(${g4(fw.zh[0])}) = ${g4(fw.h[0])}$

$y = \\sigma(w_{1}h_1 + w_{2}h_2 + b) = \\sigma(${g4(fw.zo)}) = ${g4(fw.y)}$`,
    loss: `$L = \\tfrac12 (t - y)^2 = \\tfrac12 (${t} - ${g4(fw.y)})^2 = ${g4(L)}$

One number for how wrong the network is. Training makes it smaller.`,
    backward: `Chain rule, for the weight from $h_1$ to the output:

$\\dfrac{\\partial L}{\\partial w_{1}} = \\underbrace{(y - t)}_{${g4(fw.y - t)}} \\cdot \\underbrace{y(1-y)}_{${g4(fw.y * (1 - fw.y))}} \\cdot \\underbrace{h_1}_{${g4(fw.h[j])}} = ${g4(g.gW2[j])}$

Each hidden neuron gets $\\delta_h = \\delta \\cdot w \\cdot h(1-h)$: the blame passed back to it.`,
    update: `$w_{1} \\leftarrow w_{1} - \\eta \\, \\dfrac{\\partial L}{\\partial w_{1}} = ${n.W2[j].toFixed(3)} - ${lr} \\times ${g4(g.gW2[j])} = ${next.W2[j].toFixed(3)}$

Loss after this update: ${g4(loss(next, x, t))} (was ${g4(L)}).`,
  };

  const k = PHASES.indexOf(phase as (typeof PHASES)[number]);
  return (
    <>
      <div className="bp-steps" role="tablist" aria-label="Training step">
        {PHASES.map((ph) => (
          <button key={ph} type="button" role="tab" aria-selected={ph === phase} className={`bp-step ${ph === phase ? "on" : ""}`} onClick={() => setParam("phase", ph)}>
            {PHASE_LABEL[ph]}
          </button>
        ))}
        <button
          type="button"
          className="btn primary sm bp-next"
          onClick={() => {
            if (phase === "update") {
              setParam("iterations", Math.min(200, it + 1));
              setParam("phase", "forward");
            } else setParam("phase", PHASES[k + 1]);
          }}
        >
          {phase === "update" ? "Apply & next round" : "Next step"} →
        </button>
      </div>
      {diagram}
      <div className="bp-math"><MiniMarkdown>{maths[phase] ?? ""}</MiniMarkdown></div>
      {curve.length > 1 && (
        <LineChart x={curve.map((_, i) => i)} series={[{ name: "loss", values: curve }]} xLabel="training round" height={150} marker={curve.length - 1} />
      )}
    </>
  );
}

const D = { phase: "forward", x1: 1, x2: 0.5, target: 1, lr: 1, iterations: 0 };
const d = compute(D);

export const backpropFlow: SimDef = {
  id: "backprop-flow",
  title: "Backpropagation, step by step",
  summary: "Walk one example through a tiny network: forward pass, loss, gradients flowing backwards, and the weight update.",
  module: "model-foundations",
  tags: ["backpropagation", "chain rule", "gradient", "neurons"],
  params: [
    {
      key: "phase",
      label: "Step",
      kind: "select",
      options: PHASES.map((p) => ({ value: p, label: PHASE_LABEL[p] })),
    },
    { key: "x1", label: "Input x₁", kind: "range", min: -2, max: 2, step: 0.1 },
    { key: "x2", label: "Input x₂", kind: "range", min: -2, max: 2, step: 0.1 },
    { key: "target", label: "Target t", kind: "range", min: 0, max: 1, step: 0.05 },
    { key: "lr", label: "Learning rate η", kind: "range", min: 0.05, max: 5, step: 0.05 },
    { key: "iterations", label: "Rounds already trained", kind: "range", min: 0, max: 200, step: 1 },
  ],
  defaults: D,
  metrics: [
    { key: "output", label: "Output y", format: "num" },
    { key: "loss", label: "Loss L", format: "num" },
    { key: "gradNorm", label: "Gradient size", format: "num", help: "length of the vector of all 9 gradients" },
    { key: "lossAfter", label: "Loss after next update", format: "num" },
  ],
  compute,
  View,
  math: `A 2-2-1 network with sigmoid neurons, one training example $(x, t)$ and loss $L = \\tfrac12 (t - y)^2$.

**Forward:** $h_j = \\sigma\\big(\\sum_i W_{ji} x_i + b_j\\big)$, $\\; y = \\sigma\\big(\\sum_j w_j h_j + b\\big)$.

**Backward (chain rule):** $\\delta = (y - t)\\,y(1-y)$, $\\; \\dfrac{\\partial L}{\\partial w_j} = \\delta\\, h_j$, $\\; \\delta_{h_j} = \\delta\\, w_j\\, h_j(1-h_j)$, $\\; \\dfrac{\\partial L}{\\partial W_{ji}} = \\delta_{h_j} x_i$.

**Update:** every parameter moves by $-\\eta \\times$ its gradient.

With the defaults ($x = (1, 0.5)$, $t = 1$, $\\eta = 1$): $y = ${g4(d.output)}$, $L = ${g4(d.loss)}$, and one update brings the loss to $${g4(d.lossAfter)}$.`,
  explain: (p, m) =>
    str(p, "phase") === "backward"
      ? `The output was ${m.output.toFixed(3)} but should be ${num(p, "target")}; each connection's gradient says how much the loss would change if that weight moved.`
      : `Loss ${m.loss.toFixed(4)} now, ${m.lossAfter.toFixed(4)} after one more update: training is just repeating forward → loss → backward → update.`,
};
