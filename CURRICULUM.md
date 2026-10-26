# LLM Engineering 1 → 100: curriculum map

The single source of truth for slugs. Folders are `content/modules/NN-<module-slug>/NN-<lesson-slug>/NN-<topic-slug>.md`.
Topic lists are a guide: a lesson has 5–8 topics; adjust topic titles if it teaches better, but keep module and lesson slugs.

Every lesson's `lesson.json` lists the sims, labs and sandbox scenarios it uses. Ids below are the catalogue; use only these.

---

## 01 · model-foundations: How LLMs Work
From a single neuron to a transformer that predicts the next token.

| # | lesson slug | title | sims to embed | lab / sandbox |
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

## 02 · training-and-adaptation: Training and Adapting Models
How models are pretrained, aligned and specialised, and what each step costs.

| # | lesson slug | title | sims | lab / sandbox |
|---|---|---|---|---|
| 01 | pretraining-data | Pretraining Data: What Models Learn From | — | — |
| 02 | scaling-laws | Scaling Laws and Compute Budgets | scaling-laws | lab: plan-a-training-run |
| 03 | training-at-scale | Training at Scale: Memory, Precision and Parallelism | training-memory, lr-schedule | — |
| 04 | instruction-tuning | Instruction Tuning (SFT) | — | — |
| 05 | preference-tuning | Preference Tuning: RLHF and DPO | preference-loss | — |
| 06 | peft-lora | Parameter-Efficient Fine-Tuning: LoRA and QLoRA | lora-params | lab: lora-budget |
| 07 | distillation | Distillation and Small Models | — | — |
| 08 | multimodal | Multimodal Models: Images, Audio and Text | — | — |

## 03 · inference-and-serving: Inference and Serving
Where the time and money go when a model answers, and how to spend less of both.

| # | lesson slug | title | sims | lab / sandbox |
|---|---|---|---|---|
| 01 | measuring-inference | Measuring Inference: TTFT, TPOT, Throughput and Goodput | latency-breakdown | — |
| 02 | memory-and-compute | Where the Time Goes: Memory Bandwidth, Compute and the Roofline | roofline | — |
| 03 | batching | Batching and Scheduling | llm-batching | lab: serve-a-chat-model, sandbox: llm-serving-basic |
| 04 | quantization | Precision and Quantization | quantization | lab: shrink-the-model |
| 05 | caching | Caching Repeated Work: Prefix, Prompt and Semantic Caches | prompt-cache | sandbox: semantic-cache |
| 06 | speculative-and-parallel | Speculative Decoding and Model Parallelism | speculative-decoding | — |
| 07 | capacity-and-cost | Capacity Planning and Cost per Request | gpu-capacity, token-cost | lab: capacity-plan |

## 04 · prompt-and-context: Prompt and Context Engineering
Getting reliable behaviour from a model through what you put in its context.

| # | lesson slug | title | sims | lab / sandbox |
|---|---|---|---|---|
| 01 | prompt-anatomy | Anatomy of a Prompt: Roles, Templates and Instruction Hierarchy | token-cost | — |
| 02 | few-shot-and-structured | Few-Shot Examples and Structured Outputs | constrained-decoding | — |
| 03 | context-selection | Choosing Context: Selection, Ordering and Compression | context-position | — |
| 04 | tools-and-functions | Tool Definitions and Function Calling | — | — |
| 05 | prompt-versioning | Versioning Prompts and Catching Regressions | ab-significance | — |
| 06 | prompt-injection | Prompt Injection and Trust Boundaries | guardrail-threshold | lab: stop-the-injection, sandbox: guarded-assistant |

## 05 · evaluation: Evaluation and Experimentation
Deciding what "good" means, measuring it, and trusting the comparison.

| # | lesson slug | title | sims | lab / sandbox |
|---|---|---|---|---|
| 01 | success-criteria | Success Criteria: Deciding What Good Means | — | — |
| 02 | reference-scoring | Scoring Against References: Exact, Lexical and Semantic | metric-compare | — |
| 03 | llm-as-judge | Using a Model as a Judge | judge-agreement | — |
| 04 | comparing-systems | Comparing Systems You Can Trust: Samples, Variance and Significance | ab-significance | lab: is-it-really-better |
| 05 | error-analysis | Error Analysis: Finding What Goes Wrong | — | — |
| 06 | online-evaluation | Online Evaluation: A/B Tests, Feedback and Drift | ab-significance | — |
| 07 | benchmarks-and-leaderboards | Benchmarks and Leaderboards: Reading Public Numbers Critically | benchmark-contamination, arena-elo, ab-significance | lab: build-an-eval-suite |
| 08 | eval-driven-development | Eval-Driven Development: Building the Evals Your Product Needs | judge-agreement, eval-gate, ab-significance, canary-rollout | lab: build-an-eval-suite, sandbox: eval-gated-release |
| 09 | safety-and-red-team-evals | Safety and Red-Team Evaluations | pass-at-k, guardrail-threshold | lab: stop-the-injection, sandbox: guarded-assistant |

## 06 · retrieval-and-rag: Retrieval and RAG
Grounding answers in your own data: retrieval, ranking, chunking and evaluation.

| # | lesson slug | title | sims | lab / sandbox |
|---|---|---|---|---|
| 01 | rag-architecture | How RAG Works: Retrieve, Then Generate | rag-pipeline | sandbox: rag-basic |
| 02 | sparse-and-dense | Term-Based (BM25) and Embedding Retrieval | retrieval-compare | — |
| 03 | vector-indexes | Vector Indexes: Exact, IVF and HNSW | hnsw-recall | lab: tune-the-index |
| 04 | hybrid-and-reranking | Hybrid Search and Reranking | retrieval-compare, rerank-depth | — |
| 05 | chunking | Chunking and Indexing Documents | chunking | lab: chunk-it-right |
| 06 | advanced-rag | Query Rewriting, Multi-Hop and Graph RAG | rag-pipeline | — |
| 07 | evaluating-rag | Evaluating RAG: Retrieval, Grounding and Failures | rag-pipeline | lab: fix-the-rag-bot, sandbox: rag-production |

## 07 · agents: Agents and Tool Use
Models that act: loops, tools, memory, failure handling and limits.

| # | lesson slug | title | sims | lab / sandbox |
|---|---|---|---|---|
| 01 | agent-loop | Agents, Tools and the Loop | agent-loop | — |
| 02 | workflows-vs-agents | Workflows or Agents: Who Decides the Next Step | agent-reliability | — |
| 03 | tools-and-mcp | Designing Tools and the Model Context Protocol (MCP) | — | — |
| 04 | memory-and-state | State, Memory and Context Over Many Steps | context-position | — |
| 05 | failures-and-recovery | When Steps Fail: Retries, Timeouts, Idempotency | retry-backoff, agent-reliability | lab: make-the-agent-reliable |
| 06 | multi-agent | Multi-Agent Systems: When More Agents Help | agent-reliability | — |
| 07 | traces-and-evaluation | Traces and Evaluating Agents | — | — |
| 08 | bounded-autonomy | Bounded Autonomy: Limits, Permissions and Sandboxes | — | sandbox: support-agent |
| 09 | agent-benchmarks | Agent Benchmarks: What the Public Numbers Mean | pass-at-k, agent-reliability | lab: evaluate-an-agent |
| 10 | evaluating-agentic-apps | Evaluating Agentic Applications End to End | agent-trajectory, pass-at-k, judge-agreement, agent-reliability | lab: evaluate-an-agent, sandbox: agent-eval-harness |

## 08 · production-systems: Production LLM Systems
Running LLM features for real users: routing, fallbacks, budgets, observability and safety.

| # | lesson slug | title | sims | lab / sandbox |
|---|---|---|---|---|
| 01 | model-routing | Choosing and Routing Models | model-cascade | lab: route-the-traffic, sandbox: model-router |
| 02 | fallbacks | Fallbacks and Graceful Degradation | fallback-availability | sandbox: provider-outage |
| 03 | budgets-and-rate-limits | Budgets, Rate Limits and Usage Controls | token-bucket | — |
| 04 | observability | Observability and Incident Analysis | — | — |
| 05 | guardrails | Guardrails and Safe Deployment | guardrail-threshold | — |
| 06 | rollouts | Shipping Changes: Shadow, Canary and Rollback | canary-rollout | — |
| 07 | privacy-and-compliance | Privacy, Security and Compliance | — | — |
| 08 | when-to-fine-tune | When to Fine-Tune, and a Production-Readiness Plan | — | — |

## 09 · llm-system-design: LLM System Design
Interview-style end-to-end designs. Each case uses the same framework and ends in a sandbox build.

| # | lesson slug | title | sims | lab / sandbox |
|---|---|---|---|---|
| 01 | design-framework | A Framework for LLM System Design | — | — |
| 02 | design-support-assistant | Design a Customer-Support Assistant | rag-pipeline | lab: design-support-bot, sandbox: support-agent |
| 03 | design-enterprise-search | Design Enterprise Search over Company Documents | retrieval-compare | sandbox: rag-production |
| 04 | design-code-assistant | Design a Code Assistant | latency-breakdown | — |
| 05 | design-document-extraction | Design a Document-Extraction Pipeline | constrained-decoding | — |
| 06 | design-voice-agent | Design a Real-Time Voice Agent | latency-breakdown | — |
| 07 | design-moderation | Design Content Moderation at Scale | guardrail-threshold | — |
| 08 | design-llm-platform | Design an Internal LLM Platform (Gateway, Routing, Cost) | model-cascade | sandbox: llm-gateway |

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
| gpu-capacity | QPS × tokens → GPUs needed at target utilisation, headroom, monthly cost |

Group B — built in `sims/b/` and registered in `sims/registry-b.ts`:

| id | what it shows |
|---|---|
| prompt-cache | shared prefix length, cache hit rate, discount → cost and TTFT saved |
| constrained-decoding | JSON schema masking: which next tokens are allowed; invalid-output rate with/without constraints |
| ab-significance | two variants' pass rates, sample size → confidence intervals, p-value, minimum detectable effect |
| metric-compare | exact match vs token F1 vs semantic similarity on example answer pairs |
| judge-agreement | LLM judge vs human labels: agreement, Cohen's κ, position/verbosity bias toggles |
| rag-pipeline | retrieval recall@k × generator faithfulness → answer accuracy; context size vs cost/latency |
| retrieval-compare | BM25 vs embedding vs hybrid (RRF) over a small built-in corpus with a user query |
| hnsw-recall | HNSW M / efSearch → recall@10 vs latency vs memory; compare with flat and IVF |
| rerank-depth | retrieve N then rerank to k: recall and latency/cost trade-off |
| chunking | chunk size & overlap over a sample document; chunks drawn; fact split detection; index size |
| agent-loop | step-through agent trace (think → tool call → observation); max steps, tool failure injection |
| agent-reliability | per-step success p over n steps: pⁿ; retries, verification, human checkpoints |
| retry-backoff | exponential backoff with jitter vs fixed retries under an outage: load and success |
| model-cascade | route easy traffic to a small model; threshold → quality, cost, latency |
| fallback-availability | primary + fallback provider availabilities, timeouts → overall availability and p99 |
| token-bucket | token-bucket rate limiting per user/tenant; burst size, refill rate vs traffic pattern |
| guardrail-threshold | classifier score threshold → precision/recall, false blocks vs missed attacks, cost |
| canary-rollout | canary % and duration vs detection probability of a regression and users affected |
| pass-at-k | per-attempt success p and attempts k → pass@k vs pass^k, optionally over tasks of varying difficulty |
| arena-elo | Bradley-Terry ratings fitted from simulated pairwise votes; vote count, true gap, intervals and rank flips |
| benchmark-contamination | contamination rate × memorisation boost → reported vs true score and inflation; benchmark size noise |
| eval-gate | CI eval gate: eval set size, true regression, threshold, noise → false-alarm and miss rates |
| agent-trajectory | scores a scripted agent trace: task success, step accuracy, tool-call accuracy, cost per success |

Group C — the animated opener, built in `sims/c/` and registered in `sims/registry-c.ts`:

| id | what it shows |
|---|---|
| llm-autocomplete | token-by-token generation: top-5 next-token bars, the drawn token flies into the text; prompt presets, temperature, resample |
| llm-timeline | animated timeline from Shannon's n-grams (1948) to tool-using agents; published parameter counts on a log chart; growth vs GPT-1 |
| transformer-flow | text → tokens → IDs → embeddings → L × (attention, MLP) → logits → softmax → next token, with a packet flowing stage by stage |
| training-stages | pretraining → SFT → preference tuning → deployment; how one prompt's answer changes per stage; illustrative data scales |
| llm-can-cant | sorting game: ten tasks into "good at" vs "needs tools or grounding", with a one-line why per card |

## Sandbox scenarios (ids)
llm-serving-basic, semantic-cache, rag-basic, rag-production, guarded-assistant, support-agent, model-router,
provider-outage, llm-gateway, eval-gated-release, agent-eval-harness (plus any others the sandbox defines).

## Labs (slugs)
train-a-tiny-network, token-budget, attention-by-hand, tune-the-sampler, fit-the-kv-cache, plan-a-training-run,
lora-budget, serve-a-chat-model, shrink-the-model, capacity-plan, stop-the-injection, is-it-really-better,
tune-the-index, chunk-it-right, fix-the-rag-bot, make-the-agent-reliable, route-the-traffic, design-support-bot,
build-an-eval-suite, evaluate-an-agent.
