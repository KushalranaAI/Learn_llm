// Group A: model foundations, training, inference and serving.
import { attentionHeatmap } from "./a/attention-heatmap";
import { bpeTokenizer } from "./a/bpe-tokenizer";
import { contextPosition } from "./a/context-position";
import { embeddingSpace } from "./a/embedding-space";
import { gpuCapacity } from "./a/gpu-capacity";
import { gradientDescent } from "./a/gradient-descent";
import { kvCacheMemory } from "./a/kv-cache-memory";
import { latencyBreakdown } from "./a/latency-breakdown";
import { llmBatching } from "./a/llm-batching";
import { loraParams } from "./a/lora-params";
import { lrSchedule } from "./a/lr-schedule";
import { neuron } from "./a/neuron";
import { preferenceLoss } from "./a/preference-loss";
import { quantization } from "./a/quantization";
import { roofline } from "./a/roofline";
import { sampling } from "./a/sampling";
import { scalingLaws } from "./a/scaling-laws";
import { speculativeDecoding } from "./a/speculative-decoding";
import { tokenCost } from "./a/token-cost";
import { trainingMemory } from "./a/training-memory";
import { transformerParams } from "./a/transformer-params";
import { xorTraining } from "./a/xor-training";
import type { SimDef } from "./types";

export const SIMS_A: SimDef[] = [
  // model-foundations
  neuron, gradientDescent, xorTraining, bpeTokenizer, tokenCost, embeddingSpace, attentionHeatmap, transformerParams, sampling, kvCacheMemory, contextPosition,
  // training-and-adaptation
  scalingLaws, trainingMemory, lrSchedule, preferenceLoss, loraParams,
  // inference-and-serving
  latencyBreakdown, roofline, llmBatching, quantization, speculativeDecoding, gpuCapacity,
];
