// Group D: LLM evaluation (pass@k vs pass^k, arena ratings, benchmark contamination, CI eval gates).
import { arenaElo } from "./d/arena-elo";
import { benchmarkContamination } from "./d/benchmark-contamination";
import { evalGate } from "./d/eval-gate";
import { passAtK } from "./d/pass-at-k";
import type { SimDef } from "./types";

export const SIMS_D: SimDef[] = [passAtK, arenaElo, benchmarkContamination, evalGate];
