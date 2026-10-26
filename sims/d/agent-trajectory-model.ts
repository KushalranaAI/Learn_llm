// Pure model for agent-trajectory: a scripted refund agent (look up order → check policy → issue refund → reply)
// with injected faults, graded step by step by a judge of adjustable strictness. No React.
import { bool, num, type Params } from "../types";
import { mulberry32 } from "../b/lib";

export const OPTIMAL = 4;
export const P_WRONG_TOOL = 0.05;
export const P_BAD_ARGS = 0.06;
export const P_REDUNDANT = 0.1;
export const P_REPLY_MINOR = 0.15;
export const LOUD = 0.6;
export const VERIFY_CATCH = 0.9;
/** verification runs on a small checker model at a tenth of the price */
export const VERIFY_PRICE_SCALE = 0.1;
export const PRICE = { inPerM: 3, outPerM: 15, tool: 0.0005 };
export const CTX0 = 1500, CTX_STEP = 300, OUT = 150, OUT_VERIFY = 60;
export const RUNS = 400;

/** What really happened at a step (hidden from the judge). */
export type Truth = "ok" | "env" | "minor" | "major";

export interface Step {
  n: number;
  kind: "tool" | "verify" | "reply";
  tool: string;
  args: string;
  obs: string;
  truth: Truth;
  /** tool calls only: right tool with valid arguments */
  callValid: boolean | null;
  /** the judge's verdict */
  pass: boolean;
  note: string;
  cost: number;
}

export interface Run {
  steps: Step[];
  finished: boolean;
  trueSuccess: boolean;
  judgedSuccess: boolean;
  cost: number;
  outOfBudget: boolean;
}

const PLAN = [
  { tool: "lookup_order", args: `{"order_id": "A-4417"}`, obs: `delivered 12 days ago · headphones · paid $89.00`, bad: `{"order": 4417}`, wrong: "search_faq", silent: `delivered · headphones · paid $98.00 (wrong record)` },
  { tool: "check_policy", args: `{"topic": "refund", "days": 12}`, obs: `refunds within 30 days, full amount`, bad: `{"topic": "refund", "days": "twelve"}`, wrong: "lookup_order", silent: `store credit only (stale policy cache)` },
  { tool: "issue_refund", args: `{"order_id": "A-4417", "amount": 89.00}`, obs: `refund R-2291 created`, bad: `{"order_id": "A-4417"}`, wrong: "send_email", silent: `refund R-2291 created (to an old card)` },
] as const;

const judgePass = (truth: Truth, u: number, strict: number) =>
  truth === "ok" || truth === "env" ? true : truth === "minor" ? u >= strict : u < 0.5 * (1 - strict) ** 2;

export function runAgent(toolErrorRate: number, maxSteps: number, verify: boolean, strict: number, seed: number): Run {
  const rnd = mulberry32(seed * 2654435761 + 12345);
  const steps: Step[] = [];
  let i = 0;
  let corrupted = false;
  let replyMinor = false;
  const cost = (out: number, tool: boolean, scale: number) => {
    const ctx = CTX0 + CTX_STEP * steps.length;
    return (scale * (ctx * PRICE.inPerM + out * PRICE.outPerM)) / 1e6 + (tool ? PRICE.tool : 0);
  };
  const push = (s: Omit<Step, "n" | "pass" | "cost">, uJudge: number, out = OUT) => {
    const c = cost(out, s.kind === "tool", s.kind === "verify" ? VERIFY_PRICE_SCALE : 1);
    steps.push({ ...s, n: steps.length + 1, pass: judgePass(s.truth, uJudge, strict), cost: c });
  };
  while (i < 4 && steps.length < maxSteps) {
    // a fixed number of draws per step keeps runs comparable across settings (common random numbers)
    const [uWrong, uArgs, uErr, uLoud, uRed, uJudge, uVerify, uJudge2] = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];
    if (i === 3) {
      replyMinor = uRed < P_REPLY_MINOR;
      const truth: Truth = corrupted ? "major" : replyMinor ? "minor" : "ok";
      push({
        kind: "reply", tool: "reply", args: "", callValid: null, truth,
        obs: corrupted ? `"I've refunded $98.00…" (wrong amount)` : replyMinor ? `"Your refund is on its way!" (no amount or reference)` : `"Refunded $89.00, reference R-2291, 3-5 days."`,
        note: corrupted ? "answer built on bad tool data" : replyMinor ? "vague reply" : "complete answer",
      }, uJudge);
      i++;
      break;
    }
    const s = PLAN[i];
    if (uWrong < P_WRONG_TOOL) {
      push({ kind: "tool", tool: s.wrong, args: s.args, obs: "irrelevant result", truth: "major", callValid: false, note: "wrong tool" }, uJudge);
      continue;
    }
    if (uArgs < P_BAD_ARGS) {
      push({ kind: "tool", tool: s.tool, args: s.bad, obs: "400 invalid arguments", truth: "major", callValid: false, note: "invalid arguments" }, uJudge);
      continue;
    }
    // writing the refund from corrupted data is the agent's mistake even though the call itself is well formed
    const usesBadData = i === 2 && corrupted;
    if (uErr < toolErrorRate) {
      if (uLoud < LOUD) {
        push({ kind: "tool", tool: s.tool, args: s.args, obs: "503 timeout, retrying", truth: "env", callValid: true, note: "tool outage (not the agent's fault)" }, uJudge);
        continue;
      }
      push({ kind: "tool", tool: s.tool, args: s.args, obs: s.silent, truth: usesBadData ? "major" : "ok", callValid: true, note: usesBadData ? "refund from bad data" : "tool silently returned bad data" }, uJudge);
      corrupted = true;
    } else {
      push({
        kind: "tool", tool: s.tool, args: usesBadData ? `{"order_id": "A-4417", "amount": 98.00}` : s.args, obs: usesBadData ? "refund R-2291 created ($98.00)" : s.obs,
        truth: usesBadData ? "major" : "ok", callValid: true, note: usesBadData ? "refund amount from bad data" : "correct",
      }, uJudge);
    }
    if (verify && steps.length < maxSteps) {
      const caught = corrupted && uVerify < VERIFY_CATCH;
      push({ kind: "verify", tool: "verify", args: "", obs: caught ? "mismatch with source of truth → redo" : "consistent", truth: "ok", callValid: null, note: caught ? "caught bad data" : corrupted ? "missed bad data" : "checked" }, uJudge2, OUT_VERIFY);
      if (caught) { corrupted = false; continue; }
    }
    i++;
    if (i === 1 && uRed < P_REDUNDANT && steps.length < maxSteps) {
      push({ kind: "tool", tool: "lookup_order", args: PLAN[0].args, obs: "same result again", truth: "minor", callValid: true, note: "redundant call" }, uJudge2);
    }
  }
  const finished = i >= 4;
  const trueSuccess = finished && !corrupted && !replyMinor;
  const last = steps[steps.length - 1];
  const judgedSuccess = finished && !!last && last.kind === "reply" && last.pass;
  return { steps, finished, trueSuccess, judgedSuccess, cost: steps.reduce((s, x) => s + x.cost, 0), outOfBudget: !finished };
}

export function settings(p: Params) {
  return { f: num(p, "toolErrorRate"), maxSteps: Math.round(num(p, "maxSteps")), verify: bool(p, "verify"), strict: num(p, "judgeStrictness") };
}

export function aggregate(p: Params) {
  const s = settings(p);
  let judged = 0, truly = 0, stepsN = 0, passN = 0, calls = 0, validCalls = 0, cost = 0, stepSum = 0, finished = 0;
  for (let k = 0; k < RUNS; k++) {
    const r = runAgent(s.f, s.maxSteps, s.verify, s.strict, 1000 + k);
    judged += r.judgedSuccess ? 1 : 0;
    truly += r.trueSuccess ? 1 : 0;
    stepsN += r.steps.length;
    passN += r.steps.filter((x) => x.pass).length;
    const tc = r.steps.filter((x) => x.callValid !== null);
    calls += tc.length;
    validCalls += tc.filter((x) => x.callValid).length;
    cost += r.cost;
    if (r.finished) { finished++; stepSum += r.steps.length; }
  }
  return {
    taskSuccess: judged / RUNS,
    trueSuccess: truly / RUNS,
    stepAccuracy: stepsN ? passN / stepsN : 0,
    toolCallAccuracy: calls ? validCalls / calls : 0,
    efficiency: finished ? OPTIMAL / (stepSum / finished) : 0,
    costPerSuccess: judged ? cost / judged : 99,
    avgCost: cost / RUNS,
  };
}

export function compute(p: Params) {
  const a = aggregate(p);
  const s = settings(p);
  const r = runAgent(s.f, s.maxSteps, s.verify, s.strict, num(p, "seed"));
  return { ...a, runSuccess: r.judgedSuccess ? 1 : 0 };
}
