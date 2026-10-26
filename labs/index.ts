// All labs, in curriculum order.
import { attentionByHand } from "./attention-by-hand";
import { buildAnEvalSuite } from "./build-an-eval-suite";
import { capacityPlan } from "./capacity-plan";
import { chunkItRight } from "./chunk-it-right";
import { designSupportBot } from "./design-support-bot";
import { evaluateAnAgent } from "./evaluate-an-agent";
import { fitTheKvCache } from "./fit-the-kv-cache";
import { fixTheRagBot } from "./fix-the-rag-bot";
import { isItReallyBetter } from "./is-it-really-better";
import { loraBudget } from "./lora-budget";
import { makeTheAgentReliable } from "./make-the-agent-reliable";
import { planATrainingRun } from "./plan-a-training-run";
import { routeTheTraffic } from "./route-the-traffic";
import { serveAChatModel } from "./serve-a-chat-model";
import { shrinkTheModel } from "./shrink-the-model";
import { stopTheInjection } from "./stop-the-injection";
import { tokenBudget } from "./token-budget";
import { trainATinyNetwork } from "./train-a-tiny-network";
import { tuneTheIndex } from "./tune-the-index";
import { tuneTheSampler } from "./tune-the-sampler";
import type { Lab } from "./types";

export const LABS: Lab[] = [
  // model-foundations
  trainATinyNetwork,
  tokenBudget,
  attentionByHand,
  tuneTheSampler,
  fitTheKvCache,
  // training-and-adaptation
  planATrainingRun,
  loraBudget,
  // inference-and-serving
  serveAChatModel,
  shrinkTheModel,
  capacityPlan,
  // prompt-and-context
  stopTheInjection,
  // evaluation
  isItReallyBetter,
  buildAnEvalSuite,
  // retrieval-and-rag
  tuneTheIndex,
  chunkItRight,
  fixTheRagBot,
  // agents
  makeTheAgentReliable,
  evaluateAnAgent,
  // production-systems
  routeTheTraffic,
  // llm-system-design
  designSupportBot,
];
export const getLab = (slug: string) => LABS.find((l) => l.slug === slug);
