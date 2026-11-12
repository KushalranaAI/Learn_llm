// Group B: prompt and context engineering, and evaluation.
import { abSignificance } from "./b/ab-significance";
import { constrainedDecoding } from "./b/constrained-decoding";
import { judgeAgreement } from "./b/judge-agreement";
import { metricCompare } from "./b/metric-compare";
import { promptCache } from "./b/prompt-cache";
import type { SimDef } from "./types";

export const SIMS_B: SimDef[] = [promptCache, constrainedDecoding, abSignificance, metricCompare, judgeAgreement];
