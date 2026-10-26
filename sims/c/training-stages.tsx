// "How an LLM is made": pretraining → supervised fine-tuning → preference tuning → deployment, and how one model's
// answer to the same prompt changes at each stage. Params: stage (Play walks through), prompt (preset).
// Metrics: stage (1–4), dataLog10 (illustrative order of magnitude of that stage's data; "–" = no training),
// answerWords (length of the answer shown).
import type { SimDef } from "../types";
import { PROMPTS, STAGES, compute } from "./training-stages-data";
import View from "./training-stages.view";

const defaults = { stage: "pretrain", prompt: "sky" };

export const trainingStages: SimDef = {
  id: "training-stages",
  title: "How an LLM is made: four stages",
  summary: "Step one model through pretraining, supervised fine-tuning, preference tuning and deployment, and watch its answer to the same prompt change.",
  module: "model-foundations",
  tags: ["pretraining", "SFT", "RLHF", "DPO", "alignment", "deployment"],
  params: [
    { key: "stage", label: "Stage", kind: "select", options: STAGES.map((s, i) => ({ value: s.key, label: `${i + 1}. ${s.label}` })) },
    { key: "prompt", label: "Prompt", kind: "select", options: Object.entries(PROMPTS).map(([value, p]) => ({ value, label: p.label })) },
  ],
  defaults,
  metrics: [
    { key: "stage", label: "Stage", format: "int" },
    { key: "dataLog10", label: "Data scale, log₁₀ (illustrative)", format: "num", help: "13 ≈ 10 trillion tokens; 5 ≈ 100,000 examples" },
    { key: "answerWords", label: "Answer length (words)", format: "int" },
  ],
  compute,
  View,
  math: `Building an assistant is a **chain of stages**; each starts from the previous stage's weights:
$$\\theta_{\\text{base}} \\xrightarrow{\\text{SFT}} \\theta_{\\text{SFT}} \\xrightarrow{\\text{preferences}} \\theta_{\\text{chat}} \\xrightarrow{\\text{deploy}} \\text{product}.$$

1. **Pretraining** minimises the next-token loss $\\mathcal{L} = -\\frac{1}{n}\\sum_t \\log P_\\theta(x_{t+1} \\mid x_{\\le t})$ over trillions of tokens. The result, a **base model**, continues text; it does not know it is supposed to answer.
2. **Supervised fine-tuning (SFT)** uses the same loss, but only on the answer part of instruction → answer examples written by people.
3. **Preference tuning** shows pairs of answers where people preferred one, $y_w \\succ y_l$, and raises the probability of the preferred one (RLHF trains a reward model and optimises against it; DPO does it directly).
4. **Deployment** changes no weights: it adds a system prompt, filters and monitoring.

**Data scales (illustrative orders of magnitude, not any particular model):** pretraining $\\sim10^{13}$ tokens; SFT $\\sim10^{4}$–$10^{5}$ examples; preference tuning $\\sim10^{5}$ comparisons. So pretraining sees about $10^{13} / 10^{5} = 10^{8}$ times more data, yet the small later stages change *behaviour* the most.

**Worked example (defaults).** Stage 1 (pretraining), prompt "Explain why the sky is blue.": the base model continues the pattern with more homework questions instead of answering. Its data scale is $\\log_{10}(10^{13}) = 13$.`,
  explain: (_p, m) =>
    [
      "Base model: it has read ~10^13 tokens but only knows how to continue text, so it rambles on instead of answering.",
      "After supervised fine-tuning on ~10^5 examples it answers the question, briefly and in the format it was shown.",
      "After preference tuning on human comparisons, the answer is fuller, clearer and more careful: the one people preferred.",
      "Deployment adds no new training: the same model now runs behind a system prompt, safety filters and monitoring.",
    ][m.stage - 1] ?? "",
};
