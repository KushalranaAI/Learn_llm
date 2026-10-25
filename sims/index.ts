// Every simulation, by id. Group A (foundations, training, inference) and group B (prompting, evaluation, RAG,
// agents, production) register in their own files so they can grow independently.
import { SIMS_A } from "./registry-a";
import { SIMS_B } from "./registry-b";
import type { SimDef } from "./types";

export const SIMS: SimDef[] = [...SIMS_A, ...SIMS_B];
export const SIM_BY_ID: Record<string, SimDef> = Object.fromEntries(SIMS.map((s) => [s.id, s]));
export const getSim = (id: string): SimDef | undefined => SIM_BY_ID[id];
