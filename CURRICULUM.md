# LLM Engineering 1 → 100: curriculum map

Scope: **how LLMs work and how they are built**: foundations, training, post-training and fine-tuning, inference,
prompting and evaluating models. Applications built *on top of* LLMs (RAG, agents, tool use, production systems,
system design) belong to the separate AI Engineering path and are deliberately out of scope here.

The prerequisite graph and roadmap layout live in `content/map.json` (see docs/REDESIGN.md). This file is the single source of truth for slugs. Folders are `content/modules/NN-<module-slug>/NN-<lesson-slug>/NN-<topic-slug>.md`.
Topic lists are a guide: a lesson has 5–8 topics; adjust topic titles if it teaches better, but keep module and lesson slugs.

Every lesson's `lesson.json` lists the sims and labs it uses. Ids below are the catalogue; use only these.

---

## 01 · model-foundations: How LLMs Work
From a single neuron to a transformer that predicts the next token.

| # | lesson slug | title | sims to embed | lab |
|---|---|---|---|---|
| 00 | what-is-an-llm | What Is an LLM? (animated opener, start here) | llm-autocomplete, llm-timeline, transformer-flow, training-stages, llm-can-cant | — |
| 01 | how-networks-learn | How a Network Learns: Loss and Gradient Descent | neuron, gradient-descent, xor-training | lab: train-a-tiny-network |
| 02 | tokenization | Tokenization: From Text to Token IDs | bpe-tokenizer, token-cost | lab: token-budget |
| 03 | embeddings | Embeddings: Meaning as Geometry | embedding-space | — |
| 04 | attention | Attention: How Tokens Read Their Context | attention-heatmap | lab: attention-by-hand |
| 05 | transformer-block | The Transformer Block, Layer by Layer | transformer-params | — |
| 06 | sampling | Next-Token Prediction and Sampling | sampling | lab: tune-the-sampler |
| 07 | context-and-kv-cache | Context Windows, Prefill and the KV Cache | kv-cache-memory, context-position | lab: fit-the-kv-cache |
| 08 | limits | Hallucination and the Limits of Next-Token Prediction | sampling | — |

## 02 · build-from-scratch: Build an LLM from Scratch
Working PyTorch for everything module 01 explains, following the companion repo `llm_from_scratch` (parts 1–5).

| # | lesson slug | title | llm_from_scratch | sims |
|---|---|---|---|---|
| 01 | attention-in-code | From Equations to PyTorch: Attention and the Transformer Block | part_1 | attention-heatmap, transformer-params, transformer-flow |
| 02 | train-a-tiny-gpt | Train a Tiny GPT End to End | part_2 | transformer-params, sampling, gradient-descent |
| 03 | modern-architecture | Modernising the Architecture: RMSNorm, RoPE, SwiGLU and the KV Cache | part_3 | attention-heatmap, transformer-params, latency-breakdown, kv-cache-memory · lab: fit-the-kv-cache |
| 04 | scaling-the-training-loop | Scaling Up the Training Loop | part_4 | bpe-tokenizer, training-memory, lr-schedule · lab: plan-a-training-run |
| 05 | mixture-of-experts | Mixture of Experts: More Parameters, Same Compute | part_5 | roofline |

## 03 · training-and-adaptation: Training and Adapting Models
How models are pretrained, aligned and specialised, and what each step costs.

| # | lesson slug | title | sims | lab |
|---|---|---|---|---|
| 01 | pretraining-data | Pretraining Data: What Models Learn From | — | — |
| 02 | scaling-laws | Scaling Laws and Compute Budgets | scaling-laws | lab: plan-a-training-run |
| 03 | training-at-scale | Training at Scale: Memory, Precision and Parallelism | training-memory, lr-schedule | — |
| 04 | instruction-tuning | Instruction Tuning (SFT) | — | — |
| 05 | preference-tuning | Preference Tuning: RLHF and DPO | preference-loss | — |
| 06 | peft-lora | Parameter-Efficient Fine-Tuning: LoRA and QLoRA | lora-params | lab: lora-budget |
| 07 | distillation | Distillation and Small Models | — | — |
| 08 | multimodal | Multimodal Models: Images, Audio and Text | — | — |

## 04 · fine-tuning: Fine-Tuning in Practice
Adapting a pretrained model to a task: when it beats prompting, how to size and run it, and how to tell whether it worked.
Every lesson runs on a laptop CPU, free Colab/Kaggle or a short GPU rental. Grows as the author adds lessons from real runs (template: `content/modules/04-fine-tuning/_TEMPLATE.md`).

| # | lesson slug | title | sims | lab |
|---|---|---|---|---|
| 01 | start-here | Start Here: When to Fine-Tune and How Big a Run You Need | lora-params, token-cost | lab: lora-budget |
| 02 | run-fine-tuning-yourself | Set Up Your Fine-Tuning Environment: CPU, Free Colab or a Rented GPU | quantization, lora-params | lab: lora-budget |
| 03 | sft-with-lora-step-by-step | Supervised Fine-Tuning with LoRA, Step by Step | lora-params, lr-schedule | lab: lora-budget |
| 04 | preference-optimization-methods | Preference Optimization in Practice: RLHF, DPO, IPO, KTO, ORPO and SimPO | preference-loss, training-memory, judge-agreement | — |
| 05 | grpo-hands-on | GRPO Hands-On: Teaching a Small Model to Reason with Verifiable Rewards | kv-cache-memory, pass-at-k | — |
| 06 | fine-tuning-embedding-models | Fine-Tuning Embedding Models | embedding-space | — |

## 05 · evaluation: Evaluation and Experimentation
Deciding what "good" means, measuring it, and trusting the comparison.

| # | lesson slug | title | sims | lab |
|---|---|---|---|---|
| 01 | success-criteria | Success Criteria: Deciding What Good Means | — | — |
| 02 | reference-scoring | Scoring Against References: Exact, Lexical and Semantic | metric-compare | — |
| 03 | llm-as-judge | Using a Model as a Judge | judge-agreement | — |
| 04 | comparing-systems | Comparing Systems You Can Trust: Samples, Variance and Significance | ab-significance | lab: is-it-really-better |
| 05 | error-analysis | Error Analysis: Finding What Goes Wrong | — | — |
| 06 | benchmarks-and-leaderboards | Benchmarks and Leaderboards: Reading Public Numbers Critically | benchmark-contamination, arena-elo, ab-significance | lab: build-an-eval-suite |

## 06 · inference-and-serving: (branch after module 02) Inference and Serving
Where the time and money go when a model answers, and how to spend less of both.

| # | lesson slug | title | sims | lab |
|---|---|---|---|---|
| 01 | measuring-inference | Measuring Inference: TTFT, TPOT, Throughput and Goodput | latency-breakdown | — |
| 02 | memory-and-compute | Where the Time Goes: Memory Bandwidth, Compute and the Roofline | roofline | — |
| 03 | batching | Batching and Scheduling | llm-batching | lab: serve-a-chat-model |
| 04 | quantization | Precision and Quantization | quantization | lab: shrink-the-model |
| 05 | caching | Caching Repeated Work: Prefix and Prompt Caches | prompt-cache | — |
| 06 | speculative-and-parallel | Speculative Decoding and Model Parallelism | speculative-decoding | — |

## 07 · prompt-and-context: (branch after module 01) Prompt and Context Engineering
Getting reliable behaviour from a model through what you put in its context.

| # | lesson slug | title | sims | lab |
|---|---|---|---|---|
| 01 | prompt-anatomy | Anatomy of a Prompt: Roles, Templates and Instruction Hierarchy | token-cost | — |
| 02 | few-shot-and-structured | Few-Shot Examples and Structured Outputs | constrained-decoding | — |
| 03 | context-selection | Choosing Context: Selection, Ordering and Compression | context-position | — |

## Planned module

Next steps, mapped to the hands-on PyTorch repo `llm_from_scratch` (parts 1–9). Slugs are not fixed until the
module is written.

| module | covers | llm_from_scratch |
|---|---|---|
| Post-training and alignment | SFT with masked labels, reward models (Bradley–Terry), RLHF with PPO, GRPO, DPO | parts 6–9 |

---

## Simulation catalogue (ids)

Group A — built in `sims/a/` and registered in `sims/registry-a.ts`:

| id | what it shows |
|---|---|
| neuron | weighted sum + bias + activation (done, reference example) |
| gradient-descent | 1-D/2-D loss surface; learning rate too small / right / divergent; steps animate |
| xor-training | tiny 2-4-1 MLP trained in the browser on XOR; decision boundary, loss curve, hidden size, lr, epochs |
| bpe-tokenizer | trains byte-pair merges on the user's text; shows merges, tokens, compression ratio vs number of merges |
| token-cost | words ↔ tokens ↔ cost for prompt+output, languages/code ratio, price per 1M tokens, requests per day |
| embedding-space | toy 2-D/3-D word vectors; cosine similarity, nearest neighbours, analogy arithmetic (king − man + woman) |
| attention-heatmap | Q·Kᵀ/√d → softmax over a short sentence; temperature/scale, causal mask toggle, head presets |
| transformer-params | parameter count per component from d_model, layers, heads, vocab, ffn ratio (e.g. reproduce ~7B) |
| sampling | logits → softmax with temperature, top-k, top-p; entropy; sampled continuation with seed |
| kv-cache-memory | KV bytes = 2·layers·kv_heads·head_dim·seq·batch·bytes; MHA vs GQA vs MQA; fits-in-GPU check |
| context-position | "lost in the middle": recall vs position of the fact and context length |
| scaling-laws | Chinchilla-style loss L(N,D); compute C≈6ND; compute-optimal N and D for a budget |
| training-memory | weights + grads + Adam states + activations per GPU; precision; ZeRO stages; checkpointing |
| lr-schedule | warmup + cosine/linear decay; peak lr; shows schedule and simulated loss |
| preference-loss | DPO/Bradley-Terry: probability chosen > rejected vs reward margin and β |
| lora-params | trainable params & memory: full fine-tune vs LoRA rank r on chosen matrices vs QLoRA |
| latency-breakdown | network + queue + prefill + decode; TTFT, TPOT, end-to-end for prompt/output lengths |
| roofline | arithmetic intensity vs compute-/bandwidth-bound; prefill vs decode on a chosen GPU |
| llm-batching | batch size vs replica throughput vs per-user tokens/s vs cost per 1M tokens |
| quantization | bytes per weight (fp32/bf16/int8/int4), model memory, rounding-error demo, quality proxy |
| speculative-decoding | draft length k and acceptance rate α → expected tokens per target pass and speedup |

Group B (prompting and evaluation) — built in `sims/b/` and registered in `sims/registry-b.ts`:

| id | what it shows |
|---|---|
| prompt-cache | shared prefix length, cache hit rate, discount → cost and TTFT saved |
| constrained-decoding | JSON schema masking: which next tokens are allowed; invalid-output rate with/without constraints |
| ab-significance | two variants' pass rates, sample size → confidence intervals, p-value, minimum detectable effect |
| metric-compare | exact match vs token F1 vs semantic similarity on example answer pairs |
| judge-agreement | LLM judge vs human labels: agreement, Cohen's κ, position/verbosity bias toggles |

Group D (evaluation) — built in `sims/d/` and registered in `sims/registry-d.ts`:

| id | what it shows |
|---|---|
| pass-at-k | per-attempt success p and attempts k → pass@k vs pass^k, optionally over tasks of varying difficulty |
| arena-elo | Bradley-Terry ratings fitted from simulated pairwise votes; vote count, true gap, intervals and rank flips |
| benchmark-contamination | contamination rate × memorisation boost → reported vs true score and inflation; benchmark size noise |
| eval-gate | CI eval gate: eval set size, true regression, threshold, noise → false-alarm and miss rates |

Group C — the animated opener, built in `sims/c/` and registered in `sims/registry-c.ts`:

| id | what it shows |
|---|---|
| llm-autocomplete | token-by-token generation: top-5 next-token bars, the drawn token flies into the text; prompt presets, temperature, resample |
| llm-timeline | animated timeline from Shannon's n-grams (1948) to today's models; published parameter counts on a log chart; growth vs GPT-1 |
| transformer-flow | text → tokens → IDs → embeddings → L × (attention, MLP) → logits → softmax → next token, with a packet flowing stage by stage |
| training-stages | pretraining → SFT → preference tuning → deployment; how one prompt's answer changes per stage; illustrative data scales |
| llm-can-cant | sorting game: ten tasks into "good at" vs "needs tools or grounding", with a one-line why per card |

## Labs (slugs)
train-a-tiny-network, token-budget, attention-by-hand, tune-the-sampler, fit-the-kv-cache, plan-a-training-run,
lora-budget, serve-a-chat-model, shrink-the-model, is-it-really-better, build-an-eval-suite.
