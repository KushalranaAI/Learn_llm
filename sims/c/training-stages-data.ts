// Pure data for training-stages: four stages, illustrative data scales, and how one model's answer changes at each stage.
import { str, type Params } from "../types";

export const STAGES = [
  {
    key: "pretrain", label: "Pretraining", short: "Predict the next token",
    what: "Read a huge amount of text and predict every next token.",
    data: "web pages, books, code", dataLog10: 13, dataUnit: "tokens",
    sample: [
      "…the mitochondria is the powerhouse of the [cell]",
      "for (let i = 0; i < n; i++) [{]",
      "Dear Sir or Madam, I am writing to [complain]",
    ],
  },
  {
    key: "sft", label: "Supervised fine-tuning", short: "Imitate good answers",
    what: "Train on example conversations: an instruction and a good answer written by people.",
    data: "instruction → answer pairs", dataLog10: 5, dataUnit: "examples",
    sample: ["User: Give me three tips for better sleep.", "Assistant: 1. Keep a regular bedtime. 2. Avoid screens late. 3. Keep the room cool."],
  },
  {
    key: "pref", label: "Preference tuning", short: "Prefer the better answer",
    what: "People compare two answers; the model is pushed toward the preferred one (RLHF or DPO).",
    data: "answer A vs answer B comparisons", dataLog10: 5, dataUnit: "comparisons",
    sample: ["A: “Just take some pills.”", "B: “Check the label dose; see a doctor if it is severe.”  ← preferred"],
  },
  {
    key: "deploy", label: "Deployment", short: "Serve it to users",
    what: "No more training: wrap the model with a system prompt, safety checks and monitoring.",
    data: "no new training data", dataLog10: NaN, dataUnit: "",
    sample: ["system: You are a helpful assistant…", "checks: input filter → model → output filter → logs"],
  },
] as const;

export const PROMPTS: Record<string, { label: string; text: string; answers: [string, string, string, string] }> = {
  sky: {
    label: "Explain why the sky is blue.",
    text: "Explain why the sky is blue.",
    answers: [
      "Explain why the sky is blue. Explain why grass is green. Explain why the sea is salty. Homework 4, due Monday. Show your working…",
      "Sunlight scatters off air molecules, and blue light scatters more than red, so blue light reaches your eyes from every direction.",
      "Sunlight contains all colours. Air molecules scatter short wavelengths (blue) much more than long ones (red), so blue light comes at you from all over the sky. At sunset the light crosses more air, the blue is scattered away, and reds and oranges are left.",
      "Sunlight contains all colours. Air molecules scatter short wavelengths (blue) much more than long ones (red), so blue light comes at you from all over the sky. At sunset the light crosses more air, the blue is scattered away, and reds and oranges are left.",
    ],
  },
  email: {
    label: "Write a polite email declining a meeting.",
    text: "Write a polite email declining a meeting.",
    answers: [
      "Write a polite email declining a meeting. Write a polite email accepting a meeting. Write a formal letter of complaint. 25 templates for every situation…",
      "Hi Sam, I can't make the meeting on Thursday. Thanks, Alex",
      "Hi Sam,\nThank you for the invitation. Unfortunately I can't join on Thursday. Could you share the notes afterwards, or shall we find another time next week?\nBest regards,\nAlex",
      "Hi Sam,\nThank you for the invitation. Unfortunately I can't join on Thursday. Could you share the notes afterwards, or shall we find another time next week?\nBest regards,\nAlex",
    ],
  },
  headache: {
    label: "What should I take for a headache?",
    text: "What should I take for a headache?",
    answers: [
      "What should I take for a headache? I have had one for three days. Posted in Health forums › General. 14 replies. Reply #1: same here, I think it is the weather…",
      "Take two strong painkillers and you will be fine.",
      "For a mild headache, a common over-the-counter painkiller can help: follow the dose on the label. Rest and water help too. See a doctor promptly if it is sudden and severe, follows a head injury, or keeps coming back.",
      "For a mild headache, a common over-the-counter painkiller can help: follow the dose on the label. Rest and water help too. See a doctor promptly if it is sudden and severe, follows a head injury, or keeps coming back.",
    ],
  },
};

export const VERDICT = [
  "Continues the text: it has learned language and facts, not how to answer.",
  "Answers the question, in the format it was shown. Correct but blunt.",
  "Helpful, complete, careful: the answer people preferred.",
  "Same model, now behind a system prompt, filters and monitoring.",
];

export const stageOf = (p: Params) => Math.max(0, STAGES.findIndex((s) => s.key === str(p, "stage")));
export const promptOf = (p: Params) => PROMPTS[str(p, "prompt")] ?? PROMPTS.sky;

export function compute(p: Params) {
  const i = stageOf(p);
  return { stage: i + 1, dataLog10: STAGES[i].dataLog10, answerWords: promptOf(p).answers[i].split(/\s+/).length };
}
