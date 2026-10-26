// Group C: the "What is an LLM?" opener (animated, low-text sims for module 01's first lesson).
import { llmAutocomplete } from "./c/llm-autocomplete";
import { llmCanCant } from "./c/llm-can-cant";
import { llmTimeline } from "./c/llm-timeline";
import { trainingStages } from "./c/training-stages";
import { transformerFlow } from "./c/transformer-flow";
import type { SimDef } from "./types";

export const SIMS_C: SimDef[] = [llmAutocomplete, llmTimeline, transformerFlow, trainingStages, llmCanCant];
