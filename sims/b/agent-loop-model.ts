// Pure model of the scripted agent (no React): used by the definition and the client-side view.
import { bool, num, type Params } from "../types";
import { mulberry32 } from "./lib";

export const SYSTEM_TOKENS = 900; // system prompt + tool schemas + the user's message
export const THOUGHT_TOKENS = 60; // output per LLM call (thought + tool call)
export const OBS_TOKENS = 120; // tool result appended to the context
export const VERIFY_CATCH = 0.9;
export const LOUD_SHARE = 0.6;
const PRICE_IN = 3e-6, PRICE_OUT = 15e-6;
export const RUNS = 500;

export type Kind = "think" | "call" | "obs" | "error" | "verify" | "answer" | "fail";
export type TraceItem = { step: number; kind: Kind; text: string };

const TOOLS = [
  { id: "order", think: "I need the order first.", call: "get_order(id=4417)", ok: "{status: shipped, promised: Oct 20, tracking: PG-88213}", bad: "{status: shipped, promised: Oct 29, tracking: PG-10077}  ← another customer's order", badNote: "wrong order" },
  { id: "track", think: "Check the carrier to see if it is late.", call: "track_package(PG-88213)", ok: "{delivered: false, eta: Oct 27}  → 7 days late", bad: "{delivered: true}  ← stale cache", badNote: "stale tracking" },
  { id: "refund", think: "It is late: refund the $6.90 shipping fee.", call: "issue_refund(order=4417, amount=6.90)", ok: "{refund_id: R-5521, status: created}", bad: "{status: ok}  ← but no refund was written", badNote: "refund not created" },
] as const;

export function runAgent(maxSteps: number, f: number, verify: boolean, seed: number) {
  const rnd = mulberry32(seed * 2654435761);
  const trace: TraceItem[] = [];
  let steps = 0, tokIn = 0, tokOut = 0, ctx = SYSTEM_TOKENS;
  let wrong = false, budget = false, skipRefund = false;
  const llm = () => {
    steps++;
    tokIn += ctx;
    tokOut += THOUGHT_TOKENS;
    ctx += THOUGHT_TOKENS;
  };
  for (const tool of TOOLS) {
    if (budget) break;
    if (tool.id === "refund" && skipRefund) continue;
    let done = false;
    while (!done) {
      if (steps >= maxSteps) { budget = true; break; }
      llm();
      trace.push({ step: steps, kind: "think", text: tool.think }, { step: steps, kind: "call", text: tool.call });
      ctx += OBS_TOKENS;
      let corrupt = false;
      if (rnd() < f) {
        if (rnd() < LOUD_SHARE) {
          trace.push({ step: steps, kind: "error", text: rnd() < 0.5 ? "Error 503: upstream timeout" : "Error 500: internal error" });
          continue; // retry on the next step
        }
        corrupt = true;
        trace.push({ step: steps, kind: "obs", text: tool.bad });
      } else trace.push({ step: steps, kind: "obs", text: tool.ok });
      if (verify) {
        if (steps >= maxSteps) { budget = true; wrong = wrong || corrupt; break; }
        llm();
        ctx += OBS_TOKENS / 2;
        if (corrupt && rnd() < VERIFY_CATCH) {
          trace.push({ step: steps, kind: "verify", text: `Check failed (${tool.badNote}): retry.` });
          continue;
        }
        trace.push({ step: steps, kind: "verify", text: corrupt ? "Check passed (missed the problem)." : "Check passed." });
      }
      if (corrupt) {
        wrong = true;
        if (tool.id === "track") skipRefund = true;
      }
      done = true;
    }
  }
  if (!budget) {
    if (steps >= maxSteps) budget = true;
    else {
      llm();
      trace.push({ step: steps, kind: "answer", text: skipRefund ? "“Your order was delivered.” (it was not)" : wrong ? "“Done: refund issued for order 4417.” (based on bad data)" : "“Your order is 7 days late; I refunded the $6.90 shipping fee (R-5521).”" });
    }
  }
  if (budget) trace.push({ step: steps, kind: "fail", text: `Step budget of ${maxSteps} exhausted before an answer.` });
  const success = !budget && !wrong ? 1 : 0;
  return { trace, success, steps, tokensUsed: tokIn + tokOut, cost: tokIn * PRICE_IN + tokOut * PRICE_OUT, tokIn, tokOut };
}

export function params(p: Params) {
  return [num(p, "maxSteps"), num(p, "toolFailureRate"), bool(p, "verify")] as const;
}

export function successRate(maxSteps: number, f: number, verify: boolean) {
  let s = 0;
  for (let i = 1; i <= RUNS; i++) s += runAgent(maxSteps, f, verify, 1000 + i).success;
  return s / RUNS;
}

export function compute(p: Params) {
  const [ms, f, v] = params(p);
  const run = runAgent(ms, f, v, num(p, "seed"));
  return { success: run.success, steps: run.steps, tokensUsed: run.tokensUsed, cost: run.cost, successRate: successRate(ms, f, v) };
}
