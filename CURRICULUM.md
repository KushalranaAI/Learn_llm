# LLM Engineering 1 → 100: curriculum map

Scope: **how LLMs work and how they are built**: foundations, training, post-training and fine-tuning, inference,
prompting and evaluating models. Applications built *on top of* LLMs (RAG, agents, tool use, production systems,
system design) belong to the separate AI Engineering path and are deliberately out of scope here.

The prerequisite graph and roadmap layout live in `content/map.json` (see docs/REDESIGN.md). This file is the single source of truth for slugs. Folders are `content/modules/NN-<module-slug>/NN-<lesson-slug>/NN-<topic-slug>.md`.
Topic lists are a guide: a lesson has 5–8 topics; adjust topic titles if it teaches better, but keep module and lesson slugs.

Every lesson's `lesson.json` lists the sims and labs it uses. Ids below are the catalogue; use only these.

---

## 01 · model-foundations: How LLMs Work, Built from Scratch
Each idea, then its code: from a single neuron to tokens, embeddings and attention, then the same pieces in PyTorch, a tiny GPT trained end to end, sampling and the KV cache, the modern architecture (RMSNorm, RoPE, SwiGLU) and mixture of experts. Code lessons are optional for concept-only learners.

| # | lesson slug | title | topics | sims | labs |
|---|---|---|---|---|---|
| 00 | what-is-an-llm | What Is an LLM? | 5 | llm-autocomplete, llm-timeline, transformer-flow, training-stages, llm-can-cant | — |
| 01 | how-networks-learn | How a Network Learns: Loss and Gradient Descent | 8 | neuron, gradient-descent, backprop-flow, xor-training | train-a-tiny-network |
| 02 | tokenization | Tokenization: From Text to Token IDs | 7 | bpe-tokenizer, token-cost | token-budget |
| 03 | embeddings | Embeddings: Meaning as Geometry | 6 | embedding-space | — |
| 04 | attention | Attention: How Tokens Read Their Context | 6 | attention-heatmap | attention-by-hand |
| 05 | transformer-block | The Transformer Block, Layer by Layer | 6 | transformer-params | — |
| 06 | run-it-yourself | Run It Yourself: Laptop CPU, Free Colab or a Short GPU Rental (code) | 5 | transformer-params, training-memory | — |
| 07 | attention-in-code | From Equations to PyTorch: Attention and the Transformer Block (code) | 6 | attention-heatmap, transformer-params, transformer-flow | — |
| 08 | sampling | Next-Token Prediction and Sampling | 6 | sampling | tune-the-sampler |
| 09 | train-a-tiny-gpt | Train a Tiny GPT End to End (code) | 7 | transformer-params, sampling, gradient-descent | — |
| 10 | context-and-kv-cache | Context Windows, Prefill and the KV Cache | 6 | kv-cache-memory, context-position | fit-the-kv-cache |
| 11 | modern-architecture | Modernising the Architecture: RMSNorm, RoPE, SwiGLU and the KV Cache (code) | 6 | attention-heatmap, transformer-params, latency-breakdown, kv-cache-memory | fit-the-kv-cache |
| 12 | scaling-the-training-loop | Scaling Up the Training Loop (code) | 6 | bpe-tokenizer, training-memory, lr-schedule | plan-a-training-run |
| 13 | mixture-of-experts | Mixture of Experts: More Parameters, Same Compute (code) | 6 | roofline | — |
| 14 | limits | Hallucination and the Limits of Next-Token Prediction | 6 | sampling | — |

## 02 · training-and-adaptation: Pretraining and Scale
How base models are made and what it costs: pretraining data, scaling laws and compute budgets, memory, precision and parallelism, distillation into small models, and multimodal inputs.

| # | lesson slug | title | topics | sims | labs |
|---|---|---|---|---|---|
| 01 | pretraining-data | Pretraining Data: What Models Learn From | 6 | — | — |
| 02 | scaling-laws | Scaling Laws and Compute Budgets | 6 | scaling-laws | plan-a-training-run |
| 03 | training-at-scale | Training at Scale: Memory, Precision and Parallelism | 6 | training-memory, lr-schedule | — |
| 04 | distillation | Distillation and Small Models | 5 | — | — |
| 05 | multimodal | Multimodal Models: Images, Audio and Text | 5 | — | — |

## 03 · fine-tuning: Fine-Tuning and Alignment
Turning a base model into a useful one, concept first, then hands-on on a laptop CPU, free Colab or a rented GPU: instruction tuning, LoRA and QLoRA, preference tuning (RLHF, DPO, KTO, ORPO, SimPO), GRPO with verifiable rewards, and fine-tuning embedding models.

| # | lesson slug | title | topics | sims | labs |
|---|---|---|---|---|---|
| 01 | instruction-tuning | Instruction Tuning (SFT) | 6 | — | — |
| 02 | peft-lora | Parameter-Efficient Fine-Tuning: LoRA and QLoRA | 5 | lora-params | lora-budget |
| 03 | preference-tuning | Preference Tuning: RLHF and DPO | 6 | preference-loss | — |
| 04 | start-here | When to Fine-Tune and How Big a Run You Need | 2 | lora-params, token-cost | lora-budget |
| 05 | run-fine-tuning-yourself | Set Up Your Fine-Tuning Environment: CPU, Free Colab or a Rented GPU (code) | 5 | quantization, lora-params | lora-budget |
| 06 | sft-with-lora-step-by-step | Supervised Fine-Tuning with LoRA, Step by Step (code) | 6 | lora-params, lr-schedule | lora-budget |
| 07 | preference-optimization-methods | Preference Optimization in Practice: RLHF, DPO, IPO, KTO, ORPO and SimPO (code) | 7 | preference-loss, training-memory, judge-agreement | — |
| 08 | grpo-hands-on | GRPO Hands-On: Teaching a Small Model to Reason with Verifiable Rewards (code) | 5 | kv-cache-memory, pass-at-k | — |
| 09 | fine-tuning-embedding-models | Fine-Tuning Embedding Models (code) | 6 | embedding-space | — |

## 04 · post-training: Post-Training from Scratch
The alignment pipeline in plain PyTorch, on the tiny model you built: supervised fine-tuning with masked labels, a reward model trained on preference pairs, RLHF with PPO, and GRPO. Every step is code you can read and run on a laptop.

| # | lesson slug | title | topics | sims | labs |
|---|---|---|---|---|---|
| 01 | sft-from-scratch | SFT from Scratch (code) | 6 | sampling | — |
| 02 | reward-models | Reward Models from Scratch (code) | 2 | — | — |
| 03 | rlhf-with-ppo | RLHF with PPO from Scratch (code) | 6 | training-memory, sampling | — |
| 04 | grpo-from-scratch | GRPO from Scratch (code) | 5 | training-memory, sampling | — |

## 05 · evaluation: Evaluation and Experimentation
Deciding what good means, measuring it with metrics and judges you can trust, comparing systems with honest statistics, and watching quality once real users arrive.

| # | lesson slug | title | topics | sims | labs |
|---|---|---|---|---|---|
| 01 | success-criteria | Success Criteria: Deciding What Good Means | 6 | — | — |
| 02 | reference-scoring | Scoring Against References: Exact, Lexical and Semantic | 6 | metric-compare | — |
| 03 | llm-as-judge | Using a Model as a Judge | 5 | judge-agreement | — |
| 04 | comparing-systems | Comparing Systems You Can Trust: Samples, Variance and Significance | 6 | ab-significance | is-it-really-better |
| 05 | error-analysis | Error Analysis: Finding What Goes Wrong | 5 | eval-gate | — |
| 06 | benchmarks-and-leaderboards | Benchmarks and Leaderboards: Reading Public Numbers Critically | 6 | benchmark-contamination, arena-elo, ab-significance | build-an-eval-suite |

## 06 · inference-and-serving: Inference and Serving (branch after model-foundations)
Where the time and money go when a model answers, and how to spend less of both: latency metrics, the roofline, batching, quantization, caching, speculative decoding and capacity planning.

| # | lesson slug | title | topics | sims | labs |
|---|---|---|---|---|---|
| 01 | measuring-inference | Measuring Inference: TTFT, TPOT, Throughput and Goodput | 6 | latency-breakdown | — |
| 02 | memory-and-compute | Where the Time Goes: Memory Bandwidth, Compute and the Roofline | 6 | roofline | — |
| 03 | batching | Batching and Scheduling | 6 | llm-batching | serve-a-chat-model |
| 04 | quantization | Precision and Quantization | 6 | quantization, roofline | shrink-the-model |
| 05 | caching | Caching Repeated Work: Prefix and Prompt Caches | 3 | prompt-cache | — |
| 06 | speculative-and-parallel | Speculative Decoding and Model Parallelism | 6 | speculative-decoding, roofline, llm-batching | — |

## 07 · prompt-and-context: Prompt and Context Engineering (branch after model-foundations)
Getting reliable behaviour from a model through what you put in its context: templates and roles, few-shot examples, structured outputs, context budgets, tool schemas, regression tests and defences against prompt injection.

| # | lesson slug | title | topics | sims | labs |
|---|---|---|---|---|---|
| 01 | prompt-anatomy | Anatomy of a Prompt: Roles, Templates and Instruction Hierarchy | 6 | token-cost | — |
| 02 | few-shot-and-structured | Few-Shot Examples and Structured Outputs | 6 | constrained-decoding | — |
| 03 | context-selection | Choosing Context: Selection, Ordering and Compression | 6 | context-position | — |

Applications built on top of LLMs (RAG, agents, production systems, system design) are covered by the sibling paths: **RAG in 30 Days** and the **AI Engineer Path** (see the Roadmap page, "Which path should I take?").

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
