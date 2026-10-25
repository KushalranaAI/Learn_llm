// Group B: prompt and context engineering, evaluation, retrieval and RAG, agents, production systems.
import { abSignificance } from "./b/ab-significance";
import { agentLoop } from "./b/agent-loop";
import { agentReliability } from "./b/agent-reliability";
import { canaryRollout } from "./b/canary-rollout";
import { chunking } from "./b/chunking";
import { constrainedDecoding } from "./b/constrained-decoding";
import { fallbackAvailability } from "./b/fallback-availability";
import { guardrailThreshold } from "./b/guardrail-threshold";
import { hnswRecall } from "./b/hnsw-recall";
import { judgeAgreement } from "./b/judge-agreement";
import { metricCompare } from "./b/metric-compare";
import { modelCascade } from "./b/model-cascade";
import { promptCache } from "./b/prompt-cache";
import { ragPipeline } from "./b/rag-pipeline";
import { rerankDepth } from "./b/rerank-depth";
import { retrievalCompare } from "./b/retrieval-compare";
import { retryBackoff } from "./b/retry-backoff";
import { tokenBucket } from "./b/token-bucket";
import type { SimDef } from "./types";

export const SIMS_B: SimDef[] = [
  promptCache,
  constrainedDecoding,
  abSignificance,
  metricCompare,
  judgeAgreement,
  ragPipeline,
  retrievalCompare,
  hnswRecall,
  rerankDepth,
  chunking,
  agentLoop,
  agentReliability,
  retryBackoff,
  modelCascade,
  fallbackAvailability,
  tokenBucket,
  guardrailThreshold,
  canaryRollout,
];
