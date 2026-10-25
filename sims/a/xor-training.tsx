// A real 2-H-1 MLP trained on XOR with full-batch gradient descent from a seeded initialisation.
// Params: hidden 1–8, act (tanh | sigmoid), lr 0.01–5 (log), epochs 10–3000, seed 1–50, data (points4 | cloud: 80 noisy points).
// Metrics: finalLoss (mean binary cross-entropy), accuracy (fraction of training points classified right),
// paramCount (4H + 1), epochsToSolve (first epoch at 100% accuracy, Infinity if never).
import { LineChart } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, Field2D, PlayBar, usePlayer } from "./viz";
import { gaussian, memo, mulberry32, round, sigmoid, thin } from "./lib";

type Net = { W1: number[][]; b1: number[]; W2: number[]; b2: number };
type Pt = { x: number; y: number; t: number };

const ACTS: Record<string, { f: (z: number) => number; df: (a: number) => number }> = {
  tanh: { f: Math.tanh, df: (a) => 1 - a * a },
  sigmoid: { f: sigmoid, df: (a) => a * (1 - a) },
};

/** XOR in ±1 coordinates: label 1 when the signs differ. */
export function xorData(kind: string, seed: number): Pt[] {
  const corners: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  if (kind !== "cloud") return corners.map(([x, y]) => ({ x, y, t: x * y < 0 ? 1 : 0 }));
  const r = mulberry32(seed * 7919 + 13), g = gaussian(r);
  const pts: Pt[] = [];
  for (let i = 0; i < 80; i++) {
    const [cx, cy] = corners[i % 4];
    const x = cx + 0.35 * g(), y = cy + 0.35 * g();
    pts.push({ x, y, t: cx * cy < 0 ? 1 : 0 });
  }
  return pts;
}

function forward(n: Net, act: (z: number) => number, x: number, y: number) {
  const h = n.b1.map((b, j) => act(n.W1[j][0] * x + n.W1[j][1] * y + b));
  const out = sigmoid(h.reduce((s, v, j) => s + n.W2[j] * v, n.b2));
  return { h, out };
}

const clone = (n: Net): Net => ({ W1: n.W1.map((r) => [...r]), b1: [...n.b1], W2: [...n.W2], b2: n.b2 });

export const trainXor = memo((p: Params) => {
  const H = Math.max(1, Math.round(num(p, "hidden")));
  const A = ACTS[str(p, "act")] ?? ACTS.tanh;
  const lr = num(p, "lr"), epochs = Math.round(num(p, "epochs")), seed = Math.round(num(p, "seed"));
  const data = xorData(str(p, "data"), seed);
  const r = mulberry32(seed);
  const u = () => 2 * r() - 1;
  // uniform(-1, 1) init: big enough to break symmetry between hidden units
  const net: Net = { W1: Array.from({ length: H }, () => [u(), u()]), b1: Array.from({ length: H }, () => u() * 0.5), W2: Array.from({ length: H }, u), b2: 0 };
  const losses: number[] = [];
  const accs: number[] = [];
  const snaps: { epoch: number; net: Net }[] = [{ epoch: 0, net: clone(net) }];
  const snapEvery = Math.max(1, Math.round(epochs / 60));
  const n = data.length;
  const evalNet = () => {
    let L = 0, correct = 0;
    for (const d of data) {
      const o = Math.min(1 - 1e-12, Math.max(1e-12, forward(net, A.f, d.x, d.y).out));
      L += -(d.t * Math.log(o) + (1 - d.t) * Math.log(1 - o));
      if ((o >= 0.5 ? 1 : 0) === d.t) correct++;
    }
    return [L / n, correct / n];
  };
  // flat typed arrays for speed; same maths as forward() above
  const isTanh = A === ACTS.tanh;
  const wa = Float64Array.from(net.W1.map((w) => w[0])), wb = Float64Array.from(net.W1.map((w) => w[1]));
  const bb = Float64Array.from(net.b1), vv = Float64Array.from(net.W2);
  let c = net.b2;
  const h = new Float64Array(H), ga = new Float64Array(H), gb = new Float64Array(H), gbb = new Float64Array(H), gv = new Float64Array(H);
  const xs = Float64Array.from(data.map((d) => d.x)), ys = Float64Array.from(data.map((d) => d.y)), ts = Float64Array.from(data.map((d) => d.t));
  const sync = () => {
    for (let j = 0; j < H; j++) { net.W1[j][0] = wa[j]; net.W1[j][1] = wb[j]; net.b1[j] = bb[j]; net.W2[j] = vv[j]; }
    net.b2 = c;
  };
  for (let e = 0; e < epochs; e++) {
    ga.fill(0); gb.fill(0); gbb.fill(0); gv.fill(0);
    let gc = 0, L = 0, correct = 0;
    for (let i = 0; i < n; i++) {
      const x = xs[i], y = ys[i], t = ts[i];
      let z = c;
      for (let j = 0; j < H; j++) {
        const a = wa[j] * x + wb[j] * y + bb[j];
        const hj = isTanh ? Math.tanh(a) : 1 / (1 + Math.exp(-a));
        h[j] = hj;
        z += vv[j] * hj;
      }
      const out = 1 / (1 + Math.exp(-z));
      const o = Math.min(1 - 1e-12, Math.max(1e-12, out));
      L -= t * Math.log(o) + (1 - t) * Math.log(1 - o);
      if ((out >= 0.5 ? 1 : 0) === t) correct++;
      const dz = (out - t) / n; // dL/dz for sigmoid + BCE
      gc += dz;
      for (let j = 0; j < H; j++) {
        const hj = h[j];
        gv[j] += dz * hj;
        const dh = dz * vv[j] * (isTanh ? 1 - hj * hj : hj * (1 - hj));
        ga[j] += dh * x;
        gb[j] += dh * y;
        gbb[j] += dh;
      }
    }
    losses.push(L / n);
    accs.push(correct / n);
    for (let j = 0; j < H; j++) {
      wa[j] -= lr * ga[j];
      wb[j] -= lr * gb[j];
      bb[j] -= lr * gbb[j];
      vv[j] -= lr * gv[j];
    }
    c -= lr * gc;
    if ((e + 1) % snapEvery === 0 || e === epochs - 1) { sync(); snaps.push({ epoch: e + 1, net: clone(net) }); }
  }
  sync();
  const [finalLoss, accuracy] = evalNet();
  losses.push(finalLoss);
  accs.push(accuracy);
  const solved = accs.findIndex((a) => a === 1);
  return {
    data, losses, snaps, net, act: A.f,
    metrics: { finalLoss, accuracy, paramCount: 4 * H + 1, epochsToSolve: solved < 0 ? Infinity : solved },
  };
});

const compute = (p: Params) => trainXor(p).metrics;

function View({ params }: SimViewProps) {
  const res = trainXor(params);
  const player = usePlayer(res.snaps.length - 1, 60);
  const snap = res.snaps[player.t];
  const H = Math.round(num(params, "hidden"));
  const lossX = thin(res.losses.map((_, i) => i), 160);
  const lossY = thin(res.losses, 160);
  const markIdx = lossX.findIndex((e) => e >= snap.epoch);
  return (
    <>
      <Caption>Decision boundary at epoch {snap.epoch}: blue = network says 1 (signs differ), red = says 0. Dots are training points, coloured by their true label.</Caption>
      <Field2D
        x0={-2} x1={2} y0={-2} y1={2} nx={40} ny={40} aspect={0.75}
        label="XOR decision boundary"
        cell={(x, y) => {
          const o = forward(snap.net, res.act, x, y).out;
          return { fill: o >= 0.5 ? "var(--blue)" : "var(--red)", opacity: 0.08 + 0.55 * Math.abs(o - 0.5) * 2 };
        }}
        points={res.data.map((d) => ({ x: d.x, y: d.y, color: d.t ? "var(--blue)" : "var(--red)", r: res.data.length > 10 ? 3.5 : 7 }))}
      />
      <PlayBar {...player} max={res.snaps.length - 1} label="snapshot" />
      <LineChart x={lossX} series={[{ name: "loss (binary cross-entropy)", values: lossY }]} xLabel="epoch" yLabel="loss" marker={markIdx < 0 ? undefined : markIdx} height={170} />
    </>
  );
}

const D = { hidden: 4, act: "tanh", lr: 0.5, epochs: 1000, seed: 1, data: "points4" };
const dm = trainXor(D).metrics;
const d1 = trainXor({ ...D, hidden: 1 }).metrics;

export const xorTraining: SimDef = {
  id: "xor-training",
  title: "Training a tiny network on XOR",
  summary: "Train a real 2-H-1 neural network on XOR and watch the decision boundary bend; see why one hidden unit can never solve it.",
  module: "model-foundations",
  tags: ["MLP", "backpropagation", "XOR", "hidden layer", "decision boundary"],
  params: [
    { key: "hidden", label: "Hidden units H", kind: "range", min: 1, max: 8, step: 1 },
    { key: "act", label: "Hidden activation", kind: "select", options: [{ value: "tanh", label: "tanh" }, { value: "sigmoid", label: "Sigmoid" }] },
    { key: "lr", label: "Learning rate η", kind: "range", min: 0.01, max: 5, step: 0.01, log: true },
    { key: "epochs", label: "Epochs", kind: "range", min: 10, max: 3000, step: 10 },
    { key: "seed", label: "Init seed", kind: "range", min: 1, max: 50, step: 1, help: "different random starting weights" },
    { key: "data", label: "Data", kind: "select", options: [{ value: "points4", label: "4 XOR corners" }, { value: "cloud", label: "Noisy cloud (80 pts)" }] },
  ],
  defaults: D,
  metrics: [
    { key: "finalLoss", label: "Final loss", format: "num" },
    { key: "accuracy", label: "Accuracy", format: "pct" },
    { key: "epochsToSolve", label: "Epochs to 100%", format: "int" },
    { key: "paramCount", label: "Parameters", format: "int" },
  ],
  compute,
  View,
  math: `**Data.** XOR in $\\pm1$ coordinates: $(x_1, x_2)\\in\\{-1,1\\}^2$, target $t = 1$ when the signs differ. No single straight line separates the two classes.

**Network** with $H$ hidden units and activation $\\phi$ (tanh or sigmoid):

$$h_j = \\phi(w_{j1}x_1 + w_{j2}x_2 + b_j),\\qquad \\hat y = \\sigma\\Big(\\sum_{j=1}^{H} v_j h_j + c\\Big)$$

It has $2H + H + H + 1 = 4H+1$ parameters (H = ${D.hidden} gives ${dm.paramCount}).

**Loss**: mean binary cross-entropy over the $n$ points, $\\;L = -\\tfrac1n\\sum_i \\big[t_i\\log\\hat y_i + (1-t_i)\\log(1-\\hat y_i)\\big]$.

**Backpropagation** (chain rule, one point):
$$\\frac{\\partial L}{\\partial z_{\\text{out}}} = \\frac{\\hat y - t}{n},\\quad \\frac{\\partial L}{\\partial v_j} = \\frac{\\partial L}{\\partial z_{\\text{out}}} h_j,\\quad \\frac{\\partial L}{\\partial w_{jk}} = \\frac{\\partial L}{\\partial z_{\\text{out}}}\\,v_j\\,\\phi'(\\cdot)\\,x_k$$
with $\\phi' = 1-h^2$ for tanh and $h(1-h)$ for sigmoid. Every epoch sums these over all points and steps $\\theta \\leftarrow \\theta - \\eta\\,\\nabla_\\theta L$. Weights start uniform in $[-1,1]$ from the seed.

**Why $H=1$ fails.** With one hidden unit the output is a monotone function of one linear projection $w\\cdot x + b$, so its 0.5-contour is a straight line: at best 3 of 4 points are right (75%). Two hidden units can carve a band; more units make it easy to find.

**Defaults** (H = ${D.hidden}, tanh, $\\eta$ = ${D.lr}, ${D.epochs} epochs, seed ${D.seed}): final loss ${round(dm.finalLoss, 4)}, accuracy ${round(dm.accuracy * 100, 1)}%, 100% first reached at epoch ${dm.epochsToSolve}. With H = 1 the same run ends at ${round(d1.accuracy * 100, 0)}% (loss ${round(d1.finalLoss, 3)}).`,
  explain: (p, m) => {
    const H = num(p, "hidden");
    if (H === 1) return `One hidden unit draws one straight boundary, so XOR cannot be solved: accuracy is stuck at ${Math.round(m.accuracy * 100)}% no matter how long you train.`;
    if (m.accuracy === 1) return `Solved: ${H} hidden units bend the boundary around the two classes (first 100% at epoch ${m.epochsToSolve}). The loss keeps falling as the network grows more confident.`;
    return `Not solved yet (${Math.round(m.accuracy * 100)}% correct). Train longer, raise the learning rate, or try another seed: small networks can stall in a bad starting point.`;
  },
};
