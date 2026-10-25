// Full fine-tuning vs LoRA vs QLoRA: trainable parameters and GPU memory.
// Params: model (lib MODELS), method (full | lora | qlora), rank 1–256 (log), targets (qv | attn | all),
// gpu (l4 | a100 | h100 | h200 | b200). Training shape fixed at sequence 2048, micro-batch 1, activation checkpointing.
// Metrics: trainableParamsM (millions), trainablePct (fraction of the model trained), memoryGB (training memory on one GPU),
// savedFileGB (size of what you save: full bf16 weights or just the adapter), fits (1 if memoryGB ≤ GPU memory).
import { BarChart, StackBar } from "../ui";
import { num, str, type Params, type SimDef, type SimViewProps } from "../types";
import { Caption, KV } from "./viz";
import { GB, GPU_OPTIONS, GPUS, MODEL_OPTIONS, MODELS, blockMatrices, paramCount, round } from "./lib";

export const TARGETS: Record<string, { label: string; mats: string[] }> = {
  qv: { label: "W_Q, W_V (original LoRA paper)", mats: ["q", "v"] },
  attn: { label: "All attention (Q, K, V, O)", mats: ["q", "k", "v", "o"] },
  all: { label: "Attention + MLP (all linear)", mats: ["q", "k", "v", "o", "gate", "up", "down"] },
};
const SEQ = 2048;
export const NF4_BYTES = (4 + 0.127) / 8; // 4-bit NF4 + double-quantised block scales (Dettmers et al. 2023)

export function lora(p: Params, override: Partial<Record<"method" | "rank", string | number>> = {}) {
  const m = MODELS[str(p, "model")] ?? MODELS["llama3-8b"];
  const g = GPUS[str(p, "gpu")] ?? GPUS.l4;
  const method = String(override.method ?? str(p, "method"));
  const r = Math.round(Number(override.rank ?? num(p, "rank")));
  const N = paramCount(m);
  const mats = blockMatrices(m);
  const linear = m.layers * mats.reduce((s, [, a, b]) => s + a * b, 0);
  const other = N - linear;
  const tg = (TARGETS[str(p, "targets")] ?? TARGETS.all).mats;
  const adapter = method === "full" ? 0 : m.layers * mats.filter(([n]) => tg.includes(n)).reduce((s, [, a, b]) => s + r * (a + b), 0);
  const trainable = method === "full" ? N : adapter;
  const base = method === "full" ? 0 : method === "qlora" ? linear * NF4_BYTES + other * 2 : N * 2;
  const states = trainable * 16; // bf16 weight + bf16 grad + fp32 master, m, v
  const act = m.layers * 2 * SEQ * m.d + 34 * SEQ * m.d + SEQ * m.vocab * 4;
  const total = base + states + act;
  return { m, g, N, r, trainable, adapter, base: base / GB, states: states / GB, act: act / GB, total: total / GB };
}

function compute(p: Params) {
  const x = lora(p);
  return { trainableParamsM: x.trainable / 1e6, trainablePct: x.trainable / x.N, memoryGB: x.total, savedFileGB: (x.trainable * 2) / GB, fits: x.total <= x.g.memGB ? 1 : 0 };
}

function View({ params, metrics }: SimViewProps) {
  const x = lora(params);
  return (
    <>
      <Caption>Training memory on one {x.g.label}: {round(x.total, 1)} GB {metrics.fits ? "(fits)" : "(does NOT fit)"}</Caption>
      <StackBar
        format="gb"
        parts={[
          { label: str(params, "method") === "qlora" ? "frozen base (NF4)" : str(params, "method") === "full" ? "frozen base" : "frozen base (bf16)", value: x.base, color: "var(--blue)" },
          { label: "trainable weights + grads + Adam", value: x.states, color: "var(--accent)" },
          { label: "activations + logits", value: x.act, color: "var(--green)" },
        ]}
      />
      <Caption>Same model and targets, three methods (red = over GPU memory)</Caption>
      <BarChart
        format="gb"
        highlight={["full", "lora", "qlora"].indexOf(str(params, "method"))}
        bars={["full", "lora", "qlora"].map((mm) => {
          const t = lora(params, { method: mm }).total;
          return { label: mm === "full" ? "Full FT" : mm === "lora" ? "LoRA" : "QLoRA", value: t, color: t <= x.g.memGB ? "var(--green)" : "var(--red)" };
        })}
        height={170}
      />
      <KV rows={[
        ["base model parameters", `${round(x.N / 1e9, 2)} B`],
        ["adapter params at this rank", `${round(lora(params, { method: "lora" }).adapter / 1e6, 2)} M`],
        ["saved file", metrics.savedFileGB < 1 ? `${round(metrics.savedFileGB * 1024, 1)} MB` : `${round(metrics.savedFileGB, 1)} GB`],
      ]} />
    </>
  );
}

const D = { model: "llama3-8b", method: "lora", rank: 16, targets: "all", gpu: "l4" };
const dx = lora(D);
const dm = compute(D);
const fullD = lora(D, { method: "full" });
const ql = lora(D, { method: "qlora" });
const l2 = lora({ ...D, model: "llama2-7b", targets: "qv", rank: 8 });

export const loraParams: SimDef = {
  id: "lora-params",
  title: "LoRA and QLoRA: training a sliver of the model",
  summary: "Compare full fine-tuning with LoRA and QLoRA: trainable parameters, GPU memory and checkpoint size as you change rank, target matrices and model.",
  module: "training-and-adaptation",
  tags: ["LoRA", "QLoRA", "fine-tuning", "PEFT", "rank", "memory"],
  params: [
    { key: "model", label: "Base model", kind: "select", options: MODEL_OPTIONS },
    { key: "method", label: "Method", kind: "select", options: [{ value: "full", label: "Full fine-tune" }, { value: "lora", label: "LoRA (bf16 base)" }, { value: "qlora", label: "QLoRA (4-bit NF4 base)" }] },
    { key: "rank", label: "LoRA rank r", kind: "range", min: 1, max: 256, step: 1, log: true },
    { key: "targets", label: "Adapted matrices", kind: "select", options: Object.entries(TARGETS).map(([value, t]) => ({ value, label: t.label })) },
    { key: "gpu", label: "GPU", kind: "select", options: GPU_OPTIONS },
  ],
  defaults: D,
  metrics: [
    { key: "trainableParamsM", label: "Trainable (M)", format: "num" },
    { key: "trainablePct", label: "Share of model", format: "pct" },
    { key: "memoryGB", label: "Training memory", format: "gb" },
    { key: "savedFileGB", label: "Saved file", format: "gb" },
    { key: "fits", label: "Fits (1 = yes)", format: "int" },
  ],
  compute,
  View,
  math: `**LoRA** (Hu et al. 2021) freezes a weight $W_0\\in\\mathbb R^{d_{out}\\times d_{in}}$ and learns a low-rank update:
$$W = W_0 + \\frac{\\alpha}{r}BA,\\qquad B\\in\\mathbb R^{d_{out}\\times r},\\; A\\in\\mathbb R^{r\\times d_{in}}$$
so each adapted matrix trains $r(d_{in} + d_{out})$ numbers instead of $d_{in}d_{out}$. ($B$ starts at 0 so training begins exactly at $W_0$; $\\alpha$ only rescales and does not change counts.) Across $L$ layers:
$$N_{LoRA} = L\\sum_{\\text{targets}} r\\,(d_{in}+d_{out})$$

**Memory** (one GPU, sequence 2048, micro-batch 1, checkpointing):
- full fine-tune: 16 bytes per parameter (bf16 weights and grads, fp32 Adam master/m/v);
- LoRA: frozen bf16 base, 2 bytes/param, plus 16 bytes per *adapter* parameter;
- QLoRA (Dettmers et al. 2023): linear layers stored in 4-bit NF4 with double-quantised scales ≈ ${round(NF4_BYTES, 3)} bytes/param (embeddings stay bf16), plus the same adapters;
- activations $\\approx 2sdL + 34sd$ bytes plus fp32 logits $4sV$ (same for all three).

**Classic check:** Llama-2-7B, $r$ = 8 on $W_Q, W_V$: $32\\cdot 2\\cdot 8\\,(4096+4096) = ${l2.trainable.toLocaleString("en-US")}$ ≈ 4.2 M trainable, ${round((l2.trainable / l2.N) * 100, 3)}% of the model.

**Defaults** (Llama-3-8B, LoRA $r$ = 16 on all 7 linear layers): per layer $16\\,[(4096+4096) + 2(4096+1024) + (4096+4096) + 2(4096+14336) + (14336+4096)] = ${(dx.adapter / 32).toLocaleString("en-US")}$, × 32 = ${round(dm.trainableParamsM, 2)} M (${round(dm.trainablePct * 100, 2)}%).
Memory: base ${round(dx.base, 2)} GB + adapter states ${round(dx.states, 2)} GB + activations ${round(dx.act, 2)} GB = ${round(dx.total, 2)} GB on a 24 GB L4: ${dm.fits ? "fits" : "does not fit"}. Full fine-tuning would need ${round(fullD.total, 0)} GB; QLoRA ${round(ql.total, 1)} GB. The adapter you save is ${round(dm.savedFileGB * 1024, 0)} MB instead of ${round((dx.N * 2) / GB, 1)} GB.`,
  explain: (p, m) =>
    `Training ${m.trainableParamsM.toFixed(1)} M parameters (${(m.trainablePct * 100).toFixed(m.trainablePct < 0.01 ? 2 : 1)}% of the model) needs ${m.memoryGB.toFixed(1)} GB: ${m.fits ? "fits" : "does not fit"} on this GPU.${!m.fits && str(p, "method") !== "qlora" ? " QLoRA's 4-bit base is the usual fix." : ""}`,
};
