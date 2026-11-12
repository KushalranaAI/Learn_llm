// All labs, in curriculum order.
import { attentionByHand } from "./attention-by-hand";
import { buildAnEvalSuite } from "./build-an-eval-suite";
import { fitTheKvCache } from "./fit-the-kv-cache";
import { isItReallyBetter } from "./is-it-really-better";
import { loraBudget } from "./lora-budget";
import { planATrainingRun } from "./plan-a-training-run";
import { serveAChatModel } from "./serve-a-chat-model";
import { shrinkTheModel } from "./shrink-the-model";
import { tokenBudget } from "./token-budget";
import { trainATinyNetwork } from "./train-a-tiny-network";
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
  // evaluation
  isItReallyBetter,
  buildAnEvalSuite,
  // inference-and-serving
  serveAChatModel,
  shrinkTheModel,
];
export const getLab = (slug: string) => LABS.find((l) => l.slug === slug);
