import { describe, expect, it } from "vitest";
import { ALL_KINDS, KINDS, defaultConfig, resolveConfig } from "./catalog";
import { evalGateModel, evaluateDesign, run, selfHostPerf } from "./engine";
import { applyAction, explain, whatIfs } from "./explain";
import { build, cleanGraph, parseGraph } from "./presets";
import { SCENARIOS, getScenario } from "./scenarios";
import { runTimeline, summarize } from "./timeline";
import type { DesignTest, Graph, Metrics } from "./types";

const finiteMetrics = (m: Metrics) => {
  for (const [k, v] of Object.entries(m)) {
    if (v === null && k === "gpuUtil") continue;
    expect(Number.isFinite(v as number), `${k} = ${v}`).toBe(true);
  }
  for (const k of ["successRate", "quality", "cacheHitRate", "attacksBlocked", "attacksLeaked", "errors"] as const) {
    expect(m[k]).toBeGreaterThanOrEqual(0);
    expect(m[k]).toBeLessThanOrEqual(1);
  }
};

describe("catalog", () => {
  it("every kind has fields with defaults inside their ranges", () => {
    for (const k of ALL_KINDS) {
      const def = KINDS[k];
      expect(def.label).toBeTruthy();
      for (const f of def.fields) if (f.type === "number") expect(f.default >= f.min && f.default <= f.max, `${k}.${f.key}`).toBe(true);
      expect(resolveConfig({ id: "x", kind: k })).toEqual(defaultConfig(k));
    }
  });
});

describe("scenarios", () => {
  it("has the required ids, in the required groups", () => {
    for (const id of ["llm-serving-basic", "semantic-cache", "rag-basic", "rag-production", "guarded-assistant", "support-agent", "model-router", "provider-outage", "llm-gateway", "code-assistant", "doc-extraction", "voice-agent", "eval-gated-release", "agent-eval-harness"])
      expect(getScenario(id), id).toBeDefined();
    const groups = new Set(SCENARIOS.map((s) => s.group));
    for (const g of ["Basics", "Retrieval", "Agents", "Production", "Evaluation", "Case studies"]) expect(groups.has(g as never)).toBe(true);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it.each(SCENARIOS.map((s) => [s.id, s] as const))("%s runs with finite metrics (normal, incident, timeline, guide)", (_id, s) => {
    const r = run(s.graph);
    finiteMetrics(r.metrics);
    expect(r.metrics.rps).toBeGreaterThan(0);
    for (const n of Object.values(r.nodes)) expect(Number.isFinite(n.load) && Number.isFinite(n.costPerMonth)).toBe(true);
    if (s.incident) {
      finiteMetrics(run(s.graph, {}, s.incident).metrics);
      const ticks = runTimeline(s.graph, {}, s.incident);
      expect(ticks).toHaveLength(60);
      ticks.forEach((t) => finiteMetrics(t.metrics));
      const sum = summarize(ticks);
      expect(Number.isFinite(sum.worstSuccess)).toBe(true);
    }
    const g = explain(s.graph, r);
    expect(g.headline.length).toBeGreaterThan(0);
    expect(whatIfs(s.graph, {}, r)).toHaveLength(3);
  });
});

describe("engine behaviour", () => {
  const selfHost = (replicas: number): Graph =>
    build({ users: ["users", { rps: 4 }], llm: ["llm-selfhost", { model: "8B", gpu: "A10G", replicas }] }, "users > llm");

  it("doubling traffic on an under-provisioned self-host design lowers success", () => {
    const g = selfHost(2);
    const base = run(g);
    const doubled = run(g, { scale: 2 });
    expect(doubled.metrics.successRate).toBeLessThan(base.metrics.successRate - 0.1);
    expect(doubled.nodes.llm.util).toBeGreaterThan(1);
  });

  it("more replicas fix an overloaded self-hosted model", () => {
    expect(run(selfHost(1)).metrics.successRate).toBeLessThan(0.7);
    expect(run(selfHost(4)).metrics.successRate).toBeGreaterThan(0.99);
  });

  it("roofline: decode is memory-bound at batch 1, batching raises throughput, KV limits batch", () => {
    const c = resolveConfig({ id: "x", kind: "llm-selfhost", config: { model: "8B", gpu: "A10G", maxBatch: 256 } });
    const p = selfHostPerf(c, 0.1, 800, 300);
    // 16 GB of weights at 600 GB/s * 0.8 ≈ 33 ms per token
    expect(p.stepMs).toBeGreaterThan(25);
    expect(p.stepMs).toBeLessThan(45);
    expect(p.maxBatch).toBe(p.kvSeqs);
    expect(p.maxBatch).toBeLessThan(256);
    const noBatch = selfHostPerf({ ...c, batching: false }, 0.1, 800, 300);
    expect(p.capacity).toBeGreaterThan(noBatch.capacity * 10);
    const h100 = selfHostPerf({ ...c, gpu: "H100" }, 0.1, 800, 300);
    expect(h100.stepMs).toBeLessThan(p.stepMs / 3);
    const big = selfHostPerf(resolveConfig({ id: "y", kind: "llm-selfhost", config: { model: "70B", gpu: "A100" } }), 1, 800, 300);
    expect(big.tp).toBe(4);
    const int8 = selfHostPerf(resolveConfig({ id: "z", kind: "llm-selfhost", config: { model: "70B", gpu: "A100", quantization: "int8" } }), 1, 800, 300);
    expect(int8.tp).toBe(2);
  });

  it("adding a semantic cache lowers cost", () => {
    const without = build({ users: ["users", { rps: 10, repeatShare: 0.5 }], llm: ["llm-api", { model: "medium" }] }, "users > llm");
    const withCache = build({ users: ["users", { rps: 10, repeatShare: 0.5 }], cache: "semantic-cache", llm: ["llm-api", { model: "medium" }] }, "users > cache > llm");
    const a = run(without).metrics;
    const b = run(withCache).metrics;
    expect(b.costPerMonth).toBeLessThan(a.costPerMonth * 0.9);
    expect(b.cacheHitRate).toBeGreaterThan(0.2);
    expect(b.p50Ms).toBeLessThan(a.p50Ms);
  });

  it("a looser cache hits more but lowers quality (false hits)", () => {
    const g = (similarity: number) => build({ users: ["users", { rps: 10, repeatShare: 0.6 }], cache: ["semantic-cache", { similarity }], llm: "llm-api" }, "users > cache > llm");
    const tight = run(g(0.95)).metrics;
    const loose = run(g(0.75)).metrics;
    expect(loose.cacheHitRate).toBeGreaterThan(tight.cacheHitRate);
    expect(loose.quality).toBeLessThan(tight.quality);
  });

  it("a fallback on another provider raises success under an outage; same provider doesn't", () => {
    const single = build({ users: ["users", { rps: 10 }], llm: ["llm-api", { provider: "a" }] }, "users > llm");
    const fb = (p: string) => build({ users: ["users", { rps: 10 }], fb: "fallback", a: ["llm-api", { provider: "a" }], b: ["llm-api", { provider: p }] }, "users > fb > a, fb > b");
    const outage = { type: "providerOutage", provider: "a" } as const;
    expect(run(single, {}, outage).metrics.successRate).toBe(0);
    expect(run(fb("b"), {}, outage).metrics.successRate).toBeGreaterThan(0.99);
    expect(run(fb("a"), {}, outage).metrics.successRate).toBe(0);
  });

  it("an input guardrail lowers attacks leaked", () => {
    const bare = build({ users: ["users", { rps: 10, attackShare: 0.1 }], llm: "llm-api" }, "users > llm");
    const guarded = build({ users: ["users", { rps: 10, attackShare: 0.1 }], g: "input-guardrail", llm: "llm-api" }, "users > g > llm");
    const a = run(bare).metrics;
    const b = run(guarded).metrics;
    expect(a.attacksLeaked).toBeGreaterThan(0.95);
    expect(b.attacksLeaked).toBeLessThan(a.attacksLeaked * 0.3);
    expect(b.falseBlocks).toBeGreaterThan(0);
  });

  it("retrieval raises quality on grounded questions; a reranker raises it further", () => {
    const u = ["users", { rps: 5, groundedShare: 0.8 }] as const;
    const none = run(build({ users: [...u], llm: "llm-api" }, "users > llm")).metrics.quality;
    const rag = run(build({ users: [...u], r: "retriever", llm: "llm-api" }, "users > r > llm")).metrics.quality;
    const rr = run(build({ users: [...u], r: ["retriever", { topK: 40 }], rr: "reranker", llm: "llm-api" }, "users > r > rr > llm")).metrics.quality;
    expect(rag).toBeGreaterThan(none + 0.2);
    expect(rr).toBeGreaterThan(rag);
  });

  it("a router lowers cost vs. the large model alone", () => {
    const large = run(build({ users: ["users", { rps: 10 }], L: ["llm-api", { model: "large" }] }, "users > L")).metrics;
    const routed = run(build({ users: ["users", { rps: 10 }], r: "router", s: ["llm-api", { model: "small" }], L: ["llm-api", { model: "large" }] }, "users > r > s, r > L")).metrics;
    expect(routed.costPerMonth).toBeLessThan(large.costPerMonth * 0.7);
    expect(routed.quality).toBeLessThan(large.quality);
  });

  it("agent retries raise task success", () => {
    const g = (retries: number) => build({ users: ["users", { rps: 1 }], ag: ["agent", { steps: 5, stepSuccess: 0.9, retries }], llm: "llm-api", t: "tool" }, "users > ag > llm, ag > t");
    expect(run(g(1)).metrics.successRate).toBeGreaterThan(run(g(0)).metrics.successRate + 0.1);
  });

  it("a per-tenant limit protects the shared model during a spike", () => {
    const g = (limit: number) => build({ users: ["users", { rps: 40, tenants: 50, topTenantShare: 0.5 }], gw: ["gateway", { perTenantRps: limit }], llm: ["llm-api", { model: "small", rateLimitRps: 50 }] }, "users > gw > llm");
    const spike = { type: "trafficSpike", factor: 2 } as const;
    const off = run(g(0), {}, spike);
    const on = run(g(5), {}, spike);
    expect(on.nodes.llm.util).toBeLessThan(1);
    expect(off.nodes.llm.util).toBeGreaterThan(1);
  });

  it("the timeline shows an outage and recovery, and evals roll back a bad model", () => {
    const g = build({ users: ["users", { rps: 10 }], llm: "llm-api" }, "users > llm");
    const ticks = runTimeline(g, {}, { type: "providerOutage" });
    expect(ticks[5].metrics.successRate).toBeGreaterThan(0.99);
    expect(ticks[20].metrics.successRate).toBe(0);
    expect(ticks[55].metrics.successRate).toBeGreaterThan(0.99);
    const withEvals = build({ users: ["users", { rps: 10 }], llm: "llm-api", obs: "observability" }, "users > llm");
    expect(summarize(runTimeline(withEvals, {}, { type: "badRollout" })).rolledBackAt).not.toBeNull();
    expect(summarize(runTimeline(g, {}, { type: "badRollout" })).rolledBackAt).toBeNull();
  });

  it("an eval gate in front of the model keeps quality up under a bad rollout, at the cost of eval spend", () => {
    const bare = build({ users: ["users", { rps: 10 }], llm: "llm-api" }, "users > llm");
    const gated = build({ users: ["users", { rps: 10 }], gate: "eval-gate", llm: "llm-api" }, "users > gate > llm");
    const off = build({ users: ["users", { rps: 10 }], gate: "eval-gate", llm: "llm-api" }, "users > llm, gate > llm");
    const bad = { type: "badRollout" } as const;
    const normal = run(bare).metrics;
    const a = run(bare, {}, bad).metrics;
    const b = run(gated, {}, bad).metrics;
    expect(b.quality).toBeGreaterThan(a.quality + 0.15);
    expect(b.quality).toBeLessThanOrEqual(normal.quality + 1e-9);
    // off the request path in latency terms, and wired beside the path it protects just as well
    expect(run(gated).metrics.p50Ms).toBeCloseTo(normal.p50Ms, 6);
    expect(run(off, {}, bad).metrics.quality).toBeCloseTo(b.quality, 9);
    expect(run(off, {}, bad).metrics.successRate).toBeCloseTo(a.successRate, 9);
    // no effect on a normal day, except the eval bill
    expect(run(gated).metrics.quality).toBeCloseTo(normal.quality, 9);
    expect(run(gated).metrics.costPerMonth).toBeGreaterThan(normal.costPerMonth);
    // a gate that is not in front of the model protects nothing (and says so)
    const stray = build({ users: ["users", { rps: 10 }], gate: "eval-gate", llm: "llm-api" }, "users > llm");
    const rs = run(stray, {}, bad);
    expect(rs.metrics.quality).toBeCloseTo(a.quality, 9);
    expect(rs.issues.some((i) => i.nodeId === "gate")).toBe(true);
    expect(explain(stray, rs).advice.some((x) => x.nodeId === "gate")).toBe(true);
    // the guide offers to add a gate under a bad rollout, and the fix works
    const fix = explain(bare, run(bare, {}, bad)).advice.find((x) => x.action?.kind === "insertBefore" && x.action.nodeKind === "eval-gate");
    expect(fix).toBeDefined();
    expect(run(applyAction(bare, fix!.action!), {}, bad).metrics.quality).toBeGreaterThan(a.quality + 0.15);
  });

  it("a larger eval set (and a lower threshold) raises the chance of catching a bad rollout", () => {
    const rate = (evalSetSize: number, threshold = 2, judge = "llm-judge") => evalGateModel(resolveConfig({ id: "g", kind: "eval-gate", config: { evalSetSize, threshold, judge } }));
    expect(rate(2000).catchRate).toBeGreaterThan(rate(500).catchRate);
    expect(rate(500).catchRate).toBeGreaterThan(rate(50).catchRate);
    expect(rate(500, 1).catchRate).toBeGreaterThan(rate(500, 4).catchRate);
    expect(rate(500, 1).falseAlarm).toBeGreaterThan(rate(500, 4).falseAlarm);
    expect(rate(2000).monthly).toBeGreaterThan(rate(500).monthly);
    expect(rate(500, 2, "human").monthly).toBeGreaterThan(rate(500, 2, "llm-judge").monthly * 50);
    expect(rate(500, 2, "assertions").catchRate).toBeLessThan(rate(500, 2, "llm-judge").catchRate);
    const g = (evalSetSize: number) => build({ users: ["users", { rps: 10 }], gate: ["eval-gate", { evalSetSize }], llm: "llm-api" }, "users > gate > llm");
    expect(run(g(3000), {}, { type: "badRollout" }).metrics.quality).toBeGreaterThan(run(g(50), {}, { type: "badRollout" }).metrics.quality);
    // the false-alarm check reads the gate
    const fa: DesignTest = { constraints: [{ type: "gateFalseAlarms", max: 0.2 }] };
    expect(evaluateDesign(g(2000), fa).pass).toBe(true);
    expect(evaluateDesign(build({ users: "users", gate: ["eval-gate", { threshold: 0.5 }], llm: "llm-api" }, "users > gate > llm"), fa).pass).toBe(false);
    expect(evaluateDesign(build({ users: "users", llm: "llm-api" }, "users > llm"), fa).pass).toBe(false);
  });

  it("reports pass^3 for agent designs only, and checks it", () => {
    const ag = (retries: number) => build({ users: ["users", { rps: 1 }], ag: ["agent", { steps: 4, stepSuccess: 0.9, retries }], llm: "llm-api", t: "tool" }, "users > ag > llm, ag > t");
    const m = run(ag(0)).metrics;
    expect(m.taskSuccessPassK).toBeDefined();
    expect(m.taskSuccessPassK!).toBeCloseTo(run(ag(0)).nodes.ag.extra.taskSuccess ** 3, 9);
    expect(m.taskSuccessPassK!).toBeLessThan(m.successRate);
    expect(run(ag(2)).metrics.taskSuccessPassK!).toBeGreaterThan(m.taskSuccessPassK!);
    expect(run(build({ users: "users", llm: "llm-api" }, "users > llm")).metrics.taskSuccessPassK).toBeUndefined();
    const t: DesignTest = { constraints: [{ type: "taskSuccessPassK", min: 0.75 }] };
    expect(evaluateDesign(ag(0), t).pass).toBe(false);
    expect(evaluateDesign(ag(2), t).pass).toBe(true);
    expect(evaluateDesign(build({ users: "users", llm: "llm-api" }, "users > llm"), t).pass).toBe(false);
  });

  it("one-click fixes from the guide improve the design", () => {
    const g = getScenario("provider-outage")!.graph;
    const r = run(g, {}, { type: "providerOutage" });
    const fix = explain(g, r).advice.find((a) => a.action?.kind === "addFallback");
    expect(fix).toBeDefined();
    const fixed = applyAction(g, fix!.action!);
    expect(run(fixed, {}, { type: "providerOutage" }).metrics.successRate).toBeGreaterThan(0.99);
  });

  it("graphs survive a save/load round trip", () => {
    for (const s of SCENARIOS) {
      const back = parseGraph(JSON.parse(JSON.stringify(cleanGraph(s.graph))));
      expect(back).not.toBeNull();
      expect(run(back!).metrics.successRate).toBeCloseTo(run(s.graph).metrics.successRate, 6);
    }
  });
});

describe("evaluateDesign", () => {
  const api = build({ users: ["users", { rps: 10, attackShare: 0.05 }], llm: ["llm-api", { model: "medium" }] }, "users > llm");
  const guarded = build(
    { users: ["users", { rps: 10, attackShare: 0.05 }], g: ["input-guardrail", { threshold: 0.3 }], llm: ["llm-api", { model: "medium" }], o: "output-guardrail" },
    "users > g > llm > o",
  );

  it("passes a simple success + latency test", () => {
    const t: DesignTest = { constraints: [{ type: "successRate", min: 0.99 }, { type: "p99", maxMs: 8000 }, { type: "ttft", maxMs: 2000 }] };
    const e = evaluateDesign(api, t);
    expect(e.pass).toBe(true);
    expect(e.results).toHaveLength(3);
    expect(e.results.every((r) => r.label && r.detail)).toBe(true);
  });

  it("fails a cost budget, with the why in the detail", () => {
    const e = evaluateDesign(api, { constraints: [{ type: "costPerMonth", maxUsd: 1000, why: "Use a cheaper model or a cache." }] });
    expect(e.pass).toBe(false);
    expect(e.results[0].detail).toContain("cheaper model");
  });

  it("attacksLeaked: fails without guardrails, passes with them", () => {
    const t: DesignTest = { constraints: [{ type: "attacksLeaked", max: 0.02 }, { type: "requires", kind: "input-guardrail" }] };
    expect(evaluateDesign(api, t).pass).toBe(false);
    const e = evaluateDesign(guarded, t);
    expect(e.pass).toBe(true);
  });

  it("checks under an incident (per-check `under` and test-level incident)", () => {
    const fb = build({ users: ["users", { rps: 10 }], fb: "fallback", a: ["llm-api", { provider: "a" }], b: ["llm-api", { provider: "b" }] }, "users > fb > a, fb > b");
    const t: DesignTest = { constraints: [{ type: "successRate", min: 0.99, under: { type: "providerOutage", provider: "a" } }] };
    expect(evaluateDesign(fb, t).pass).toBe(true);
    expect(evaluateDesign(build({ users: ["users", { rps: 10 }], a: "llm-api" }, "users > a"), t).pass).toBe(false);
    const t2: DesignTest = { incident: { type: "providerOutage" }, constraints: [{ type: "successRate", min: 0.99 }] };
    expect(evaluateDesign(fb, t2).pass).toBe(true);
    expect(evaluateDesign(fb, t2).run.incident.type).toBe("providerOutage");
  });

  it("applies traffic overrides and checks cache hit rate, quality and GPU utilisation", () => {
    const cache = build({ users: ["users", { rps: 10 }], c: ["semantic-cache", { similarity: 0.9 }], llm: "llm-api" }, "users > c > llm");
    expect(evaluateDesign(cache, { traffic: { repeatShare: 0.6 }, constraints: [{ type: "cacheHitRate", min: 0.25 }] }).pass).toBe(true);
    expect(evaluateDesign(cache, { traffic: { repeatShare: 0.1 }, constraints: [{ type: "cacheHitRate", min: 0.25 }] }).pass).toBe(false);
    expect(evaluateDesign(api, { traffic: { groundedShare: 0.8 }, constraints: [{ type: "quality", min: 0.7 }] }).pass).toBe(false);
    const gpu = build({ users: ["users", { rps: 4 }], llm: ["llm-selfhost", { replicas: 4 }] }, "users > llm");
    expect(evaluateDesign(gpu, { constraints: [{ type: "gpuUtil", min: 0.3, max: 0.9 }, { type: "successRate", min: 0.99 }] }).pass).toBe(true);
    expect(evaluateDesign(gpu, { traffic: { scale: 2 }, constraints: [{ type: "successRate", min: 0.99 }] }).pass).toBe(false);
  });

  it("requires / forbids", () => {
    expect(evaluateDesign(api, { constraints: [{ type: "requires", kind: "semantic-cache" }] }).pass).toBe(false);
    expect(evaluateDesign(api, { constraints: [{ type: "forbids", kind: "llm-selfhost" }] }).pass).toBe(true);
    expect(evaluateDesign(guarded, { constraints: [{ type: "requires", kind: "llm-api", count: 2 }] }).pass).toBe(false);
  });
});
