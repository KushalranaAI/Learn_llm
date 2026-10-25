// Primary + fallback provider: availability multiplies out (if failures are independent), latency pays the timeout.
// Metric keys: availability, nines (−log10 of unavailability), downtimeMinPerMonth, p99Ms (successful requests),
//              fallbackShare (share of successful requests served by the fallback).
import { BarChart, LineChart, C } from "../ui";
import { bool, num, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption } from "./viz";
import { big, logspace, nearestIndex, normCdf, pc, r } from "./lib";

const S1 = 0.6, S2 = 0.5; // log-normal spreads of primary and fallback latency
const M2 = 1000; // fallback median latency (ms)
const MONTH_MIN = 30 * 24 * 60;

const lnCdf = (x: number, median: number, s: number) => (x <= 0 ? 0 : normCdf((Math.log(x) - Math.log(median)) / s));

export function availabilityModel(A1: number, A2: number, rho: number, T: number, m1: number, fallback: boolean) {
  const inTime = lnCdf(T, m1, S1);
  const w1 = A1 * inTime; // served by primary within the timeout
  const fbUpGivenDown = (1 - rho) * A2; // fallback up when the primary is down (correlated outages)
  const m2 = fallback ? (1 - A1) * fbUpGivenDown + A1 * (1 - inTime) * A2 : 0;
  const A = w1 + m2;
  const cdf = (x: number) => (A1 * lnCdf(Math.min(x, T), m1, S1) + m2 * lnCdf(x - T, M2, S2)) / A;
  let lo = 0, hi = T + 30000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) >= 0.99) hi = mid;
    else lo = mid;
  }
  return { inTime, w1, m2, A, p99: hi, fbUpGivenDown, cdf };
}

function model(p: Params, tOverride?: number) {
  return availabilityModel(num(p, "primaryAvail"), num(p, "fallbackAvail"), num(p, "correlation"), tOverride ?? num(p, "timeoutMs"), num(p, "primaryP50"), bool(p, "fallback"));
}

function compute(p: Params) {
  const m = model(p);
  return { availability: m.A, nines: -Math.log10(Math.max(1e-12, 1 - m.A)), downtimeMinPerMonth: (1 - m.A) * MONTH_MIN, p99Ms: m.p99, fallbackShare: m.A > 0 ? m.m2 / m.A : 0 };
}

function View({ params }: SimViewProps) {
  const ts = logspace(200, 10000, 41);
  const sw = ts.map((t) => model(params, t));
  const mk = nearestIndex(ts.map(Math.log), Math.log(num(params, "timeoutMs")));
  const m = model(params);
  const A1 = num(params, "primaryAvail"), A2 = num(params, "fallbackAvail");
  return (
    <>
      <Caption>Availability vs primary timeout (dashed line = current timeout)</Caption>
      <LineChart
        x={ts}
        logX
        series={[
          { name: "with fallback", values: sw.map((s) => s.A), color: C.green },
          { name: "primary only (timeouts are errors)", values: ts.map((t) => availabilityModel(A1, A2, num(params, "correlation"), t, num(params, "primaryP50"), false).A), color: C.red, dashed: true },
        ]}
        xFormat={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}`)}
        xLabel="timeout before failing over (ms, log)"
        yFormat="pct"
        yMax={1}
        marker={mk}
        height={190}
      />
      <Caption>p99 latency of successful requests vs timeout</Caption>
      <LineChart x={ts} logX series={[{ name: "p99", values: sw.map((s) => s.p99), color: C.accent }]} xFormat={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}`)} yFormat="ms" marker={mk} height={160} />
      <Caption>Downtime per month (minutes)</Caption>
      <BarChart
        format="int"
        height={150}
        bars={[
          { label: "primary", value: (1 - A1) * MONTH_MIN, color: C.red },
          { label: "fallback", value: (1 - A2) * MONTH_MIN, color: C.purple },
          { label: "combined", value: (1 - m.A) * MONTH_MIN, color: C.green },
        ]}
      />
    </>
  );
}

const defaults = { primaryAvail: 0.995, fallbackAvail: 0.99, correlation: 0.1, timeoutMs: 3000, primaryP50: 800, fallback: true };
const d = availabilityModel(0.995, 0.99, 0.1, 3000, 800, true);
const dm = compute(defaults);

export const fallbackAvailability: SimDef = {
  id: "fallback-availability",
  title: "Fallback providers: availability and the cost of waiting",
  summary: "Add a fallback model provider and see availability climb (unless outages are correlated), while the timeout you wait before failing over sets your tail latency.",
  module: "production-systems",
  tags: ["availability", "fallback", "timeouts", "p99", "SLO"],
  params: [
    { key: "primaryAvail", label: "Primary availability A₁", kind: "range", min: 0.9, max: 0.9999, step: 0.0001 },
    { key: "fallbackAvail", label: "Fallback availability A₂", kind: "range", min: 0.9, max: 0.9999, step: 0.0001 },
    { key: "correlation", label: "Outage correlation ρ", kind: "range", min: 0, max: 1, step: 0.05, help: "Chance the fallback is down too when the primary is (shared cloud region, same upstream model)" },
    { key: "timeoutMs", label: "Timeout before failover T", kind: "range", min: 200, max: 10000, step: 50, log: true, unit: "ms" },
    { key: "primaryP50", label: "Primary median latency", kind: "range", min: 200, max: 3000, step: 50, unit: "ms" },
    { key: "fallback", label: "Fallback enabled", kind: "toggle" },
  ],
  defaults,
  metrics: [
    { key: "availability", label: "Availability", format: "pct" },
    { key: "nines", label: "Nines", format: "num" },
    { key: "downtimeMinPerMonth", label: "Downtime / month", format: "num", help: "minutes" },
    { key: "p99Ms", label: "p99 latency", format: "ms" },
    { key: "fallbackShare", label: "Served by fallback", format: "pct" },
  ],
  compute,
  View,
  math: `The primary is up with probability $A_1$; its latency is log-normal, median $m_1$, spread $\\sigma_1 = ${S1}$. A request waits at most $T$ ms, then fails over to the fallback (up with $A_2$, median ${M2} ms, $\\sigma_2 = ${S2}$). A request that hangs on a down primary also costs $T$.

$P(L_1 \\le T) = \\Phi\\big(\\tfrac{\\ln T - \\ln m_1}{\\sigma_1}\\big)$. If outages are correlated with $\\rho$, the fallback is up given the primary is down with probability $(1-\\rho)A_2$. Then
$$A = \\underbrace{A_1\\,P(L_1 \\le T)}_{\\text{primary in time}} + \\underbrace{(1-A_1)(1-\\rho)A_2 + A_1 P(L_1 > T)\\,A_2}_{\\text{served by fallback}}$$
With independent failures and a generous timeout this is $\\approx 1 - (1-A_1)(1-A_2)$: unavailabilities **multiply**. Correlation $\\rho$ puts back a floor of $\\rho(1-A_1)$.

**Latency** of successful requests is a mixture: primary latency $L_1$ (below $T$), or $T + L_2$ for fallbacks. p99 solves $F(x) = 0.99$ for the mixture CDF $F(x) = \\frac{A_1\\Phi_1(\\min(x,T)) + m_{fb}\\,\\Phi_2(x - T)}{A}$. A short $T$ fails over sooner (lower tail latency) but abandons slow-but-fine primary requests.

Downtime per month $= (1 - A)\\times ${big(MONTH_MIN)}$ minutes; nines $= -\\log_{10}(1-A)$.

**Worked example (defaults: $A_1 = 0.995$, $A_2 = 0.99$, $\\rho = 0.1$, $T = 3$ s, $m_1 = 800$ ms)**: $P(L_1 \\le 3000) = \\Phi(\\ln 3.75 / 0.6) = ${r(d.inTime, 5)}$.
Primary in time: $0.995\\times${r(d.inTime, 5)} = ${r(d.w1, 5)}$. Fallback: $0.005\\times0.9\\times0.99 + 0.995\\times${r(1 - d.inTime, 5)}\\times0.99 = ${r(d.m2, 5)}$. Total $A = ${r(d.A, 5)}$ (${r(dm.nines, 2)} nines, ${r(dm.downtimeMinPerMonth, 1)} min/month vs ${r(0.005 * MONTH_MIN, 0)} for the primary alone). p99 $= ${r(d.p99, 0)}$ ms; ${pc(dm.fallbackShare, 2)} of successes came from the fallback.`,
  explain: (p, m) =>
    !bool(p, "fallback")
      ? `Primary only: ${m.downtimeMinPerMonth.toFixed(0)} minutes of errors a month, including requests that hit the timeout. Turn on the fallback to see unavailabilities multiply.`
      : `${m.nines.toFixed(1)} nines (${m.downtimeMinPerMonth.toFixed(1)} min/month down). ${num(p, "correlation") > 0.3 ? "Correlated outages limit the gain: the fallback goes down with the primary. " : ""}p99 is ${Math.round(m.p99Ms)} ms because failovers wait ${num(p, "timeoutMs")} ms first.`,
};
