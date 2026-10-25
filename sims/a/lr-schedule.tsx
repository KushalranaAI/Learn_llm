// Learning-rate schedules (warmup + cosine / linear / constant / WSD / inverse-sqrt) and a toy loss model driven by them.
// Loss model: in the spirit of Tissue et al. 2024 (L = L0 + A·S1^-α − C·S2, here with a saturating anneal bonus) plus a noise floor ∝ lr and an early-training
// stability limit that warmup avoids. Illustrative constants, not fitted to a real run.
// Params: schedule (cosine | linear | constant | wsd | invsqrt), peakLr 1e-5–1e-2 (log), warmupSteps 0–5000,
// totalSteps 1000–50000, minLrRatio 0–0.5.
// Metrics: finalLoss, unstableSteps (steps where lr exceeded the stability limit), finalLrRatio (last lr / peak), lrArea (Σ lr / 3e-4: the
// "forward area" S1 in reference steps).
import { LineChart } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { memo, round } from "./lib";

export const K = { ref: 3e-4, L0: 2.2, A: 8, alpha: 0.4, s0: 100, C: 0.25, S2scale: 4000, lambda: 0.999, noise: 0.03, lrMax: 3e-3, tSharp: 2000, damage: 0.6 };

type Sched = { kind: string; peak: number; W: number; T: number; lo: number };
const sched = (p: Params): Sched => ({ kind: str(p, "schedule"), peak: num(p, "peakLr"), W: num(p, "warmupSteps"), T: num(p, "totalSteps"), lo: num(p, "peakLr") * num(p, "minLrRatio") });

export function lrAt(t: number, c: Sched) {
  const { peak, W, T, lo } = c;
  if (t < W) return (peak * (t + 1)) / W;
  const frac = T > W ? Math.min(1, (t - W) / (T - W)) : 1;
  switch (c.kind) {
    case "linear": return peak - (peak - lo) * frac;
    case "constant": return peak;
    case "wsd": { const start = 0.8; return frac < start ? peak : peak - (peak - lo) * ((frac - start) / (1 - start)); }
    case "invsqrt": return peak * Math.sqrt(Math.max(1, W) / Math.max(1, t - W + Math.max(1, W)));
    default: return lo + (peak - lo) * 0.5 * (1 + Math.cos(Math.PI * frac));
  }
}

/** Runs every step (the sums need them) but records lr and loss at ~150 evenly spaced steps for the charts. */
export const runSchedule = memo((p: Params) => {
  const c = sched(p);
  const T = Math.round(c.T);
  const stride = Math.max(1, Math.ceil(T / 150));
  const steps: number[] = [], lr: number[] = [], loss: number[] = [];
  let S1 = 0, S2 = 0, m = 0, prev = 0, P = 0, cumEx = 0, unstable = 0, last = 0;
  for (let t = 0; t < T; t++) {
    const eta = lrAt(t, c);
    const r = eta / K.ref;
    S1 += r;
    if (t > 0) m = K.lambda * m + Math.max(0, prev - r); // only decreases count as annealing
    S2 += m;
    prev = r;
    const crit = t + 50 >= K.tSharp ? K.lrMax : K.lrMax * Math.sqrt((t + 50) / K.tSharp);
    const ex = eta > crit ? eta / crit - 1 : 0;
    if (ex > 0) unstable++;
    P = 0.97 * P + ex;
    cumEx += ex;
    if (t % stride === 0 || t === T - 1) {
      last = K.L0 + K.A * (S1 + K.s0) ** -K.alpha - K.C * Math.tanh(S2 / K.S2scale) + K.noise * r + 0.8 * Math.tanh(P) + K.damage * Math.tanh(cumEx / 50);
      steps.push(t);
      lr.push(eta);
      loss.push(last);
    }
  }
  return { steps, lr, loss, metrics: { finalLoss: last, unstableSteps: unstable, finalLrRatio: lr[lr.length - 1] / c.peak, lrArea: S1 } };
});

const compute = (p: Params) => runSchedule(p).metrics;

const SCHEDS = ["cosine", "linear", "constant", "wsd", "invsqrt"];

function View({ params }: SimViewProps) {
  const r = runSchedule(params);
  const others = SCHEDS.filter((s) => s !== str(params, "schedule")).slice(0, 2);
  return (
    <>
      <Caption>Learning rate over training</Caption>
      <LineChart x={r.steps} series={[{ name: "lr", values: r.lr.map((v) => v * 1e4) }]} xLabel="step" yLabel="lr ×10⁻⁴" height={160} />
      <Caption>Simulated training loss (solid: this schedule; dashed: two others with the same peak and warmup)</Caption>
      <LineChart
        x={r.steps}
        series={[
          { name: str(params, "schedule"), values: r.loss },
          ...others.map((s) => {
            const o = runSchedule({ ...params, schedule: s });
            return { name: s, values: o.loss, dashed: true };
          }),
        ]}
        yMax={Math.min(4, Math.max(...r.loss) + 0.1)}
        xLabel="step"
        yLabel="loss"
        height={200}
      />
    </>
  );
}

const D = { schedule: "cosine", peakLr: 3e-4, warmupSteps: 500, totalSteps: 20000, minLrRatio: 0.1 };
const dm = compute(D);
const constant = compute({ ...D, schedule: "constant" });
const noWarmHot = compute({ ...D, peakLr: 2e-3, warmupSteps: 0 });
const warmHot = compute({ ...D, peakLr: 2e-3, warmupSteps: 2000 });

export const lrSchedule: SimDef = {
  id: "lr-schedule",
  title: "Learning-rate schedules: warmup, decay and the final drop",
  summary: "Shape the learning rate with warmup and cosine, linear, WSD or inverse-sqrt decay and see the effect on a simulated loss curve, including early instability.",
  module: "training-and-adaptation",
  tags: ["learning rate", "warmup", "cosine decay", "WSD", "training stability"],
  params: [
    { key: "schedule", label: "Decay shape", kind: "select", options: [{ value: "cosine", label: "Cosine" }, { value: "linear", label: "Linear" }, { value: "constant", label: "Constant" }, { value: "wsd", label: "Warmup-stable-decay (last 20%)" }, { value: "invsqrt", label: "Inverse square root" }] },
    { key: "peakLr", label: "Peak learning rate", kind: "range", min: 1e-5, max: 1e-2, step: 1e-5, log: true },
    { key: "warmupSteps", label: "Warmup steps", kind: "range", min: 0, max: 5000, step: 50 },
    { key: "totalSteps", label: "Total steps", kind: "range", min: 1000, max: 50000, step: 1000 },
    { key: "minLrRatio", label: "Final lr / peak", kind: "range", min: 0, max: 0.5, step: 0.01 },
  ],
  defaults: D,
  metrics: [
    { key: "finalLoss", label: "Final loss", format: "num" },
    { key: "unstableSteps", label: "Unstable steps", format: "int", help: "lr above the stability limit" },
    { key: "finalLrRatio", label: "Final lr / peak", format: "pct" },
    { key: "lrArea", label: "LR area S₁", format: "int", help: "Σ lr / 3e-4" },
  ],
  compute,
  View,
  math: `**Schedules.** With peak $\\eta_{max}$, warmup $W$ steps, total $T$, floor $\\eta_{min} = \\rho\\,\\eta_{max}$ and decay progress $f = (t-W)/(T-W)$:
- warmup: $\\eta_t = \\eta_{max}\\,(t+1)/W$ for $t < W$
- cosine: $\\eta_{min} + (\\eta_{max}-\\eta_{min})\\tfrac12\\big(1+\\cos\\pi f\\big)$; linear: $\\eta_{max} - (\\eta_{max}-\\eta_{min}) f$
- WSD: constant until $f = 0.8$, then linear to $\\eta_{min}$; inverse-sqrt: $\\eta_{max}\\sqrt{W/(t)}$ after warmup

**Toy loss model.** Following the shape found by Tissue et al. (2024), loss depends on the *area* under the schedule and on how much the lr has recently been *annealed*. With $r_t = \\eta_t/(3\\times10^{-4})$:
$$S_1(t) = \\sum_{i\\le t} r_i, \\qquad m_t = \\lambda m_{t-1} + \\max(0,\\, r_{t-1} - r_t), \\qquad S_2(t) = \\sum_{i\\le t} m_i$$
$$L_t = L_0 + A\\,(S_1 + s_0)^{-\\alpha} - C\\tanh(S_2/S_\\star) + \\kappa\\,r_t + \\text{instability}$$
with $L_0$ = ${K.L0}, $A$ = ${K.A}, $\\alpha$ = ${K.alpha}, $s_0$ = ${K.s0}, $C$ = ${K.C}, $S_\\star$ = ${K.S2scale}, $\\lambda$ = ${K.lambda}, $\\kappa$ = ${K.noise}. More area = more progress; a high current lr adds a noise floor $\\kappa r_t$ (SGD bounces around the valley); decaying it lets the loss drop into the valley ($S_2$ only counts decreases, and its benefit saturates).

**Instability.** Early in training the loss surface is sharp, so the largest stable lr starts small: $\\eta^{crit}_t = 3\\times10^{-3}\\min\\!\\big(1, \\sqrt{(t+50)/2000}\\big)$. Steps with $\\eta_t > \\eta^{crit}_t$ count as unstable and add a decaying spike $0.8\\tanh P_t$, $P_t = 0.97P_{t-1} + (\\eta_t/\\eta^{crit}_t - 1)_+$, plus permanent damage $${K.damage}\\tanh(\\sum\\text{excess}/50)$. Warmup exists to stay under this limit.

**Defaults** (cosine, peak $3\\times10^{-4}$, warmup 500, 20k steps, floor 10%): $S_1$ = ${Math.round(dm.lrArea).toLocaleString("en-US")}, final lr ${(dm.finalLrRatio * D.peakLr).toExponential(1)}, final loss ${round(dm.finalLoss, 4)}, ${dm.unstableSteps} unstable steps. A constant lr at the same peak has more area but no anneal: final loss ${round(constant.finalLoss, 4)}. A hotter peak of $2\\times10^{-3}$ with no warmup: ${noWarmHot.unstableSteps} unstable steps and final loss ${round(noWarmHot.finalLoss, 4)}; the same peak with 2000 warmup steps: ${warmHot.unstableSteps} unstable steps and final loss ${round(warmHot.finalLoss, 4)}. (In this toy a higher *stable* peak is better, up to the $3\\times10^{-3}$ limit; real runs find the best lr by sweeping.)`,
  explain: (p, m) =>
    m.unstableSteps > 0
      ? `${m.unstableSteps} steps ran above the stability limit (loss spikes). ${num(p, "warmupSteps") < 1000 ? "Add or lengthen warmup" : "Lower the peak learning rate"}.`
      : `Stable run, final loss ${m.finalLoss.toFixed(3)}. ${m.finalLrRatio > 0.5 ? "The lr never decays much, so the loss never gets the end-of-training drop." : "Decaying the lr at the end lets the loss settle into the valley."}`,
};
