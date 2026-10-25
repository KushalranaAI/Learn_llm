// DPO / Bradley–Terry preference loss for one (chosen, rejected) pair.
// Params: beta 0.01–1 (log), chosenLogRatio −5–5 (log π_θ(y_w|x) − log π_ref(y_w|x)), rejectedLogRatio −5–5 (same for y_l).
// Metrics: margin (β·(Δ_w − Δ_l), the implicit reward margin), pChosen (σ(margin): modelled P(chosen ≻ rejected)),
// loss (−log σ(margin)), gradWeight (β·σ(−margin): how hard this pair still pushes the gradient).
import { LineChart } from "../ui";
import { num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, HBars } from "./viz";
import { linspace, round, sigmoid } from "./lib";

function compute(p: Params) {
  const b = num(p, "beta");
  const margin = b * (num(p, "chosenLogRatio") - num(p, "rejectedLogRatio"));
  return { margin, pChosen: sigmoid(margin), loss: Math.log1p(Math.exp(-margin)), gradWeight: b * sigmoid(-margin) };
}

const XS = linspace(-10, 10, 81).map((v) => +v.toFixed(2));

function View({ params, metrics }: SimViewProps) {
  const b = num(params, "beta");
  const dw = num(params, "chosenLogRatio"), dl = num(params, "rejectedLogRatio");
  const diff = dw - dl;
  const marker = Math.round((Math.max(-10, Math.min(10, diff)) + 10) / 0.25);
  return (
    <>
      <Caption>Implicit rewards r = β · log(π_θ / π_ref) for the two answers</Caption>
      <HBars
        bars={[
          { label: "chosen  r_w", value: Math.abs(b * dw), note: (b * dw).toFixed(3), color: b * dw >= 0 ? "var(--green)" : "var(--red)" },
          { label: "rejected r_l", value: Math.abs(b * dl), note: (b * dl).toFixed(3), color: b * dl >= 0 ? "var(--green)" : "var(--red)" },
          { label: "margin", value: Math.abs(metrics.margin), note: metrics.margin.toFixed(3), color: "var(--accent)" },
        ]}
        max={Math.max(0.5, Math.abs(b * dw), Math.abs(b * dl), Math.abs(metrics.margin))}
      />
      <Caption>Loss and P(chosen ≻ rejected) as the log-ratio gap Δ_w − Δ_l varies, for β = {b} (solid) and other β (dashed)</Caption>
      <LineChart
        x={XS}
        series={[
          { name: `loss, β=${b}`, values: XS.map((x) => Math.log1p(Math.exp(-b * x))) },
          { name: `P(chosen), β=${b}`, values: XS.map((x) => sigmoid(b * x)), color: "var(--green)" },
          { name: `loss, β=${round(b * 4, 2)}`, values: XS.map((x) => Math.log1p(Math.exp(-b * 4 * x))), dashed: true, color: "var(--muted)" },
        ]}
        yMax={2}
        xLabel="Δ_w − Δ_l  (log-ratio gap, nats)"
        marker={marker}
        height={220}
      />
    </>
  );
}

const D = { beta: 0.1, chosenLogRatio: 1, rejectedLogRatio: -1 };
const dm = compute(D);

export const preferenceLoss: SimDef = {
  id: "preference-loss",
  title: "Preference tuning: the DPO loss on one pair",
  summary: "Move the policy's log-probabilities of a chosen and a rejected answer and see the implicit reward margin, preference probability, loss and gradient strength under different β.",
  module: "training-and-adaptation",
  tags: ["DPO", "RLHF", "Bradley-Terry", "preference", "beta", "reward model"],
  params: [
    { key: "beta", label: "β (KL strength)", kind: "range", min: 0.01, max: 1, step: 0.01, log: true },
    { key: "chosenLogRatio", label: "Δ_w = log π/π_ref (chosen)", kind: "range", min: -5, max: 5, step: 0.1, help: "how much more likely the policy makes the chosen answer than the reference model does" },
    { key: "rejectedLogRatio", label: "Δ_l = log π/π_ref (rejected)", kind: "range", min: -5, max: 5, step: 0.1 },
  ],
  defaults: D,
  metrics: [
    { key: "margin", label: "Reward margin", format: "num" },
    { key: "pChosen", label: "P(chosen ≻ rejected)", format: "pct" },
    { key: "loss", label: "DPO loss", format: "num" },
    { key: "gradWeight", label: "Gradient weight", format: "num", help: "β·σ(−margin)" },
  ],
  compute,
  View,
  math: `**Bradley–Terry.** Preference data says answer $y_w$ was preferred to $y_l$ for prompt $x$. Model the probability of that judgment with a reward $r$:
$$P(y_w \\succ y_l \\mid x) = \\sigma\\big(r(x,y_w) - r(x,y_l)\\big), \\qquad \\sigma(z) = \\frac{1}{1+e^{-z}}$$
RLHF fits $r$ as a separate reward model, then optimises the policy against it with a KL penalty $\\beta\\,\\mathrm{KL}(\\pi_\\theta\\Vert\\pi_{ref})$.

**DPO** (Rafailov et al. 2023) shows the optimal KL-regularised policy implies the reward $r(x,y) = \\beta\\log\\frac{\\pi_\\theta(y|x)}{\\pi_{ref}(y|x)} + \\text{const}$, so the policy itself can be trained directly on the pairs. With $\\Delta_w = \\log\\frac{\\pi_\\theta(y_w|x)}{\\pi_{ref}(y_w|x)}$ and $\\Delta_l$ likewise:
$$m = \\beta(\\Delta_w - \\Delta_l), \\qquad \\mathcal L_{DPO} = -\\log\\sigma(m) = \\log\\big(1 + e^{-m}\\big)$$
$$\\nabla_\\theta\\mathcal L = -\\beta\\,\\sigma(-m)\\,\\big[\\nabla_\\theta\\log\\pi_\\theta(y_w|x) - \\nabla_\\theta\\log\\pi_\\theta(y_l|x)\\big]$$
The factor $\\beta\\,\\sigma(-m)$ is large while the model still gets the pair "wrong" ($m<0$) and fades once it is confidently right: pairs that are already learned stop pulling. Note the loss only sees the *gap*: it can fall even while both log-probabilities go down.

**β** sets how far the policy may drift from the reference: small β needs a big log-ratio gap for the same margin (more drift allowed); large β saturates quickly (stays close to $\\pi_{ref}$).

**Defaults** ($\\beta$ = 0.1, $\\Delta_w$ = 1, $\\Delta_l$ = −1): $m = 0.1\\cdot(1-(-1)) = ${round(dm.margin, 3)}$, $P = \\sigma(0.2) = ${round(dm.pChosen, 4)}$, loss $= \\log(1+e^{-0.2}) = ${round(dm.loss, 4)}$ (vs $\\log 2 = 0.6931$ at $m = 0$), gradient weight $0.1\\cdot\\sigma(-0.2) = ${round(dm.gradWeight, 4)}$.`,
  explain: (_p, m) =>
    m.margin < 0
      ? `The policy currently prefers the rejected answer relative to the reference (margin ${m.margin.toFixed(2)}): loss ${m.loss.toFixed(3)} and a strong gradient (${m.gradWeight.toFixed(3)}) pushes the two apart.`
      : `The model gives the chosen answer a ${Math.round(m.pChosen * 100)}% preference probability; loss ${m.loss.toFixed(3)}, gradient weight ${m.gradWeight.toFixed(3)}${m.pChosen > 0.9 ? ": this pair is nearly learned and barely pulls any more" : ""}.`,
};
