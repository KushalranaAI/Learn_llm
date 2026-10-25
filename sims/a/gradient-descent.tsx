// Gradient descent on a 2-D loss surface.
// Params: surface (bowl | ravine | twoMinima), lr 0.001–2.5 (log), momentum 0–0.95, steps 1–200, startX/startY −2.5–2.5.
// Metrics: finalLoss, distToMin (distance to the nearest minimum), stepsToConverge (first step with loss within 1e-3
// of the minimum, Infinity if never), diverged (1 if the iterate blew up or ended with higher loss than it started, else 0).
import { LineChart } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, Field2D, PlayBar, usePlayer } from "./viz";
import { memo, round } from "./lib";

type Surface = { label: string; f: (x: number, y: number) => number; g: (x: number, y: number) => [number, number]; minima: [number, number][]; fmin: number; formula: string; maxLr: string };

const SURFACES: Record<string, Surface> = {
  bowl: {
    label: "Round bowl",
    f: (x, y) => 0.5 * (x * x + y * y),
    g: (x, y) => [x, y],
    minima: [[0, 0]],
    fmin: 0,
    formula: "L(x,y)=\\tfrac12(x^2+y^2)",
    maxLr: "\\eta < 2/\\lambda_{\\max} = 2",
  },
  ravine: {
    label: "Narrow ravine (κ = 10)",
    f: (x, y) => 0.5 * (x * x + 10 * y * y),
    g: (x, y) => [x, 10 * y],
    minima: [[0, 0]],
    fmin: 0,
    formula: "L(x,y)=\\tfrac12(x^2+10y^2)",
    maxLr: "\\eta < 2/\\lambda_{\\max} = 0.2",
  },
  twoMinima: {
    label: "Two valleys",
    f: (x, y) => (x * x - 1) ** 2 + 0.5 * y * y,
    g: (x, y) => [4 * x * (x * x - 1), y],
    minima: [[-1, 0], [1, 0]],
    fmin: 0,
    formula: "L(x,y)=(x^2-1)^2+\\tfrac12 y^2",
    maxLr: "\\eta < 2/8 = 0.25 \\text{ near a minimum}",
  },
};

const BLOWUP = 1e4;

export const runGD = memo((p: Params) => {
  const s = SURFACES[str(p, "surface")] ?? SURFACES.bowl;
  const lr = num(p, "lr"), mu = num(p, "momentum"), steps = Math.round(num(p, "steps"));
  let x = num(p, "startX"), y = num(p, "startY"), vx = 0, vy = 0;
  const path: [number, number][] = [[x, y]];
  const loss: number[] = [s.f(x, y)];
  let diverged = 0;
  for (let k = 0; k < steps; k++) {
    if (diverged) {
      path.push([x, y]);
      loss.push(loss[loss.length - 1]);
      continue;
    }
    const [gx, gy] = s.g(x, y);
    vx = mu * vx - lr * gx;
    vy = mu * vy - lr * gy;
    x += vx;
    y += vy;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > BLOWUP || Math.abs(y) > BLOWUP) {
      diverged = 1;
      x = Math.max(-BLOWUP, Math.min(BLOWUP, Number.isFinite(x) ? x : BLOWUP));
      y = Math.max(-BLOWUP, Math.min(BLOWUP, Number.isFinite(y) ? y : BLOWUP));
    }
    path.push([x, y]);
    loss.push(s.f(x, y));
  }
  const conv = loss.findIndex((l) => l - s.fmin < 1e-3);
  const dist = Math.min(...s.minima.map(([a, b]) => Math.hypot(x - a, y - b)));
  // diverged: blew up, or ended higher than it started
  if (loss[loss.length - 1] > loss[0] + 1e-12) diverged = 1;
  return { path, loss, metrics: { finalLoss: loss[loss.length - 1], distToMin: dist, stepsToConverge: conv < 0 ? Infinity : conv, diverged } };
});

const compute = (p: Params) => runGD(p).metrics;

function View({ params }: SimViewProps) {
  const s = SURFACES[str(params, "surface")] ?? SURFACES.bowl;
  const { path, loss } = runGD(params);
  const player = usePlayer(path.length - 1);
  const shown = path.slice(0, player.t + 1);
  const top = Math.log1p(s.f(2.5, 2.5));
  const yMaxLoss = Math.max(1e-6, Math.min(Math.max(...loss), s.f(2.5, 2.5) * 2));
  return (
    <>
      <Caption>Loss surface (darker = lower loss). The white trail is the optimiser; it starts at the large dot&apos;s first position.</Caption>
      <Field2D
        x0={-2.5} x1={2.5} y0={-2.5} y1={2.5} nx={44} ny={44} aspect={0.62}
        label="loss surface with optimisation path"
        cell={(x, y) => ({ fill: "var(--blue)", opacity: 0.08 + 0.7 * (1 - Math.min(1, Math.log1p(s.f(x, y)) / top)) })}
        paths={[{ pts: shown, color: "var(--accent)", dots: true }]}
        points={s.minima.map(([a, b]) => ({ x: a, y: b, ring: true, color: "var(--green)", r: 6 }))}
      />
      <PlayBar {...player} max={path.length - 1} />
      <LineChart
        x={loss.map((_, i) => i)}
        series={[{ name: "loss", values: loss }]}
        yMax={yMaxLoss}
        xLabel="step"
        yLabel="loss"
        marker={player.t}
        height={170}
      />
    </>
  );
}

const D = { surface: "ravine", lr: 0.15, momentum: 0, steps: 40, startX: -2.2, startY: 1.5 };
const dm = runGD(D).metrics;
const d0 = runGD({ ...D, steps: 1 }).path[1];

export const gradientDescent: SimDef = {
  id: "gradient-descent",
  title: "Gradient descent: walking downhill on the loss",
  summary: "Pick a learning rate and momentum and watch the optimiser crawl, converge, zig-zag or blow up on a 2-D loss surface.",
  module: "model-foundations",
  tags: ["gradient descent", "learning rate", "momentum", "optimisation", "loss"],
  params: [
    { key: "surface", label: "Loss surface", kind: "select", options: Object.entries(SURFACES).map(([value, s]) => ({ value, label: s.label })) },
    { key: "lr", label: "Learning rate η", kind: "range", min: 0.001, max: 2.5, step: 0.001, log: true },
    { key: "momentum", label: "Momentum μ", kind: "range", min: 0, max: 0.95, step: 0.05 },
    { key: "steps", label: "Steps", kind: "range", min: 1, max: 200, step: 1 },
    { key: "startX", label: "Start x", kind: "range", min: -2.5, max: 2.5, step: 0.1 },
    { key: "startY", label: "Start y", kind: "range", min: -2.5, max: 2.5, step: 0.1 },
  ],
  defaults: D,
  metrics: [
    { key: "finalLoss", label: "Final loss", format: "num" },
    { key: "distToMin", label: "Distance to minimum", format: "num" },
    { key: "stepsToConverge", label: "Steps to converge", format: "int", help: "first step with loss within 0.001 of the minimum" },
    { key: "diverged", label: "Diverged (1 = yes)", format: "int", help: "blew up, or ended higher than it started" },
  ],
  compute,
  View,
  math: `Gradient descent repeatedly steps **against the gradient** $\\nabla L$, scaled by the learning rate $\\eta$. With momentum $\\mu$ it keeps a velocity $v$:

$$v_{k+1} = \\mu\\,v_k - \\eta\\,\\nabla L(\\theta_k), \\qquad \\theta_{k+1} = \\theta_k + v_{k+1}$$

($\\mu = 0$ is plain gradient descent: $\\theta_{k+1} = \\theta_k - \\eta\\nabla L$.)

**Why there is a maximum learning rate.** On a quadratic $L = \\tfrac12\\sum_i \\lambda_i\\theta_i^2$ each coordinate evolves as $\\theta_i \\leftarrow (1-\\eta\\lambda_i)\\theta_i$. It shrinks only if $|1-\\eta\\lambda_i|<1$, i.e. $\\eta < 2/\\lambda_i$. The steepest direction ($\\lambda_{\\max}$) sets the limit, the flattest ($\\lambda_{\\min}$) sets the speed: progress per step there is only $\\eta\\lambda_{\\min}$. The ratio $\\kappa = \\lambda_{\\max}/\\lambda_{\\min}$ (the *condition number*) is why ravines are slow: a learning rate small enough not to bounce across the steep walls crawls along the floor.

| surface | $L$ | stable when |
|---|---|---|
| Round bowl | $${SURFACES.bowl.formula}$ | $${SURFACES.bowl.maxLr}$ |
| Narrow ravine | $${SURFACES.ravine.formula}$ | $${SURFACES.ravine.maxLr}$ |
| Two valleys | $${SURFACES.twoMinima.formula}$ | $${SURFACES.twoMinima.maxLr}$ |

**Worked example (defaults).** Ravine, start $(-2.2, 1.5)$, $\\eta = 0.15$. The gradient is $(x, 10y) = (-2.2, 15)$, so step 1 lands at $(-2.2 + 0.15\\cdot 2.2,\\; 1.5 - 0.15\\cdot 15) = (${round(d0[0], 3)}, ${round(d0[1], 3)})$. The $y$ factor is $1 - 0.15\\cdot 10 = -0.5$: it flips sign each step (zig-zag) but shrinks. The $x$ factor is $0.85$, so after 40 steps $x \\approx -2.2\\cdot 0.85^{40} \\approx ${round(-2.2 * 0.85 ** 40, 4)}$. Final loss $= ${round(dm.finalLoss, 6)}$, converged (within $10^{-3}$) at step ${dm.stepsToConverge}.

Try $\\eta = 0.21$ on the ravine: $|1 - 0.21\\cdot 10| = 1.1 > 1$ and it diverges.`,
  explain: (p, m) => {
    if (m.diverged) return `The learning rate ${num(p, "lr")} is past the stability limit for this surface: each step overshoots further than the last, so the loss explodes.`;
    if (Number.isFinite(m.stepsToConverge)) return `Converged in ${m.stepsToConverge} steps (loss within 0.001 of the minimum). ${num(p, "momentum") > 0 ? "Momentum builds speed along the flat direction." : "Try momentum to speed up the flat direction."}`;
    return `Not converged after ${num(p, "steps")} steps: final loss ${m.finalLoss.toFixed(4)}. Either the learning rate is too small or the iterate is bouncing across a steep direction.`;
  },
};
