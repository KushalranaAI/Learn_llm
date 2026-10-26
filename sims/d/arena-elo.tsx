// Chatbot-arena style leaderboard: random pairwise votes between models with known true strengths, a Bradley–Terry
// fit on an Elo-like scale, and analytic 95% confidence intervals.
// Metric keys: topRating (best fitted rating), ciWidth (mean 95% CI width, Elo points), rankCorrect (1 if the fitted
//              order equals the true order), meanError (mean |fitted − true|).
import type { SimDef } from "../types";
import { big, r } from "../b/lib";
import { compute, model, trueRatings, winProb } from "./arena-elo-model";
import View from "./arena-elo.view";

const defaults = { models: 4, votes: 1000, trueGap: 40, seed: 1 };
const d = compute(defaults);
const dm = model(defaults);
const d4 = compute({ ...defaults, votes: 4000 });
const t = trueRatings(4, 40);

export const arenaElo: SimDef = {
  id: "arena-elo",
  title: "Arena leaderboards: Elo ratings from pairwise votes",
  summary: "Simulate head-to-head votes between models, fit a Bradley–Terry model, and see how many votes it takes before the leaderboard order is trustworthy.",
  module: "evaluation",
  tags: ["Elo", "Bradley–Terry", "chatbot arena", "pairwise comparison", "confidence interval", "leaderboard"],
  params: [
    { key: "models", label: "Models", kind: "range", min: 3, max: 6, step: 1 },
    { key: "votes", label: "Votes", kind: "range", min: 50, max: 20000, step: 10, log: true },
    { key: "trueGap", label: "True gap between neighbours", kind: "range", min: 0, max: 200, step: 5, unit: "Elo" },
    { key: "seed", label: "Seed", kind: "range", min: 1, max: 50, step: 1 },
  ],
  defaults,
  metrics: [
    { key: "topRating", label: "Top rating", format: "int" },
    { key: "ciWidth", label: "Mean 95% CI width", format: "num", help: "Elo points" },
    { key: "rankCorrect", label: "Order correct (1 = yes)", format: "int" },
    { key: "meanError", label: "Mean rating error", format: "num", help: "Elo points from the true rating" },
  ],
  compute,
  View,
  math: `**Bradley–Terry.** Each model $i$ has a strength $\\theta_i$ and wins a head-to-head vote against $j$ with
$$P(i \\succ j) = \\frac{1}{1 + e^{-(\\theta_i - \\theta_j)}} = \\frac{1}{1 + 10^{-(R_i - R_j)/400}}, \\qquad R_i = 1000 + \\frac{400}{\\ln 10}\\,\\theta_i$$
so 400 Elo points means 10:1 odds. With the true gap of 40 points, the stronger of two neighbours wins $${r(winProb(40, 0), 3)}$ of votes.

**Fitting.** With $w_{ij}$ wins of $i$ over $j$ and $n_{ij} = w_{ij} + w_{ji}$ games (plus 0.5 pseudo-wins each way), the minorise–maximise update
$$\\pi_i \\leftarrow \\frac{\\sum_j w_{ij}}{\\sum_{j \\ne i} n_{ij} / (\\pi_i + \\pi_j)}, \\qquad \\theta_i = \\ln \\pi_i$$
converges to the maximum-likelihood strengths (re-centred so the mean rating is 1000).

**Uncertainty.** The Fisher information is a weighted Laplacian $I_{ii} = \\sum_j n_{ij} p_{ij}(1-p_{ij})$, $I_{ij} = -n_{ij} p_{ij}(1-p_{ij})$. Its pseudo-inverse is the covariance of $\\theta$, so $\\text{SE}(R_i) = \\frac{400}{\\ln 10}\\sqrt{(I^{+})_{ii}}$ and the 95% CI is $R_i \\pm 1.96\\,\\text{SE}$. SE shrinks like $1/\\sqrt{\\text{votes}}$: four times the votes halves the interval.

**Worked example (defaults: 4 models, true ratings ${t.map((x) => Math.round(x)).join(", ")}, ${big(defaults.votes)} votes, seed 1)**: each model plays about $2 \\times 1000 / 4 = 500$ games, and with $p(1-p) \\approx 0.25$, $\\text{SE} \\approx 173.7\\sqrt{(I^+)_{ii}}$. The fit gives ratings ${dm.fit.ratings.map((x) => Math.round(x)).join(", ")} with a mean CI width of ${r(d.ciWidth, 1)} points, wider than the 40-point gap between neighbours, so the order is ${d.rankCorrect ? "right this time, but not reliably" : "wrong"}. With 4,000 votes the width falls to ${r(d4.ciWidth, 1)} (about half).`,
  explain: (_p, m) =>
    m.ciWidth > Number(_p.trueGap)
      ? `The 95% intervals (about ${Math.round(m.ciWidth)} points wide) are wider than the ${_p.trueGap}-point gap between neighbours, so neighbouring ranks are a coin toss${m.rankCorrect ? " even though this seed got the order right" : ""}. Collect more votes before trusting the order.`
      : `Intervals of about ${Math.round(m.ciWidth)} points are narrower than the ${_p.trueGap}-point gaps, so the leaderboard order is ${m.rankCorrect ? "trustworthy (and correct here)" : "mostly trustworthy, though this seed still swapped a pair"}.`,
};
