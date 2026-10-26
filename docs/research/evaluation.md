# Research notes: evaluating LLMs and agentic applications

All sources accessed 2026-10-26 unless noted. One bullet per claim. Where a number moves quickly (leaderboard scores) the
notes describe the trend instead. These notes back the lessons in `content/modules/05-evaluation/07..09` and
`content/modules/07-agents/09..10`.

## A. Capability benchmarks and their limits

### Static knowledge and reasoning sets
- MMLU covers 57 subjects (elementary maths, US history, computer science, law, ...); at publication most models were near chance and the largest GPT-3 was ~20 points above chance. https://arxiv.org/abs/2009.03300
- "Are We Done with MMLU?" estimates ~6.49% of MMLU questions are flawed (57% of analysed Virology questions); releases MMLU-Redux with 5,700 re-annotated questions; scores on Redux differ significantly from MMLU. https://arxiv.org/abs/2406.04127
- MMLU-Pro raises choices from 4 to 10; models score 16-33% lower than on MMLU; prompt-style sensitivity falls from 4-5% (MMLU) to ~2% across 24 prompt styles. https://arxiv.org/abs/2406.01574
- GPQA: 448 multiple-choice questions written by domain experts; experts ~65% (74% excluding mistakes they identified in hindsight); skilled non-experts with web access ~34%; strongest GPT-4 baseline ~39%. https://arxiv.org/abs/2311.12022
- MATH: 12,500 competition mathematics problems; at publication even large Transformers scored poorly. https://arxiv.org/abs/2103.03874
- Humanity's Last Exam: 2,500 questions across dozens of subjects; multiple-choice and short-answer, automatically gradable; questions have verifiable answers not quickly found by internet retrieval; at release frontier models showed low accuracy and poor calibration. https://arxiv.org/abs/2501.14249 (secondary summaries give 2,700 or ~3,000; the paper's abstract says 2,500)
- ARC-AGI (Chollet, 2019) frames intelligence as skill-acquisition efficiency on novel tasks using only core-knowledge priors; "easy for humans, hard for AI". https://arcprize.org/arc-agi
- ARC-AGI-2 (2025): every task solved by at least two humans in two or fewer attempts in a 400+ person study; from ARC-AGI-2 on, all reporting includes an efficiency (cost) metric. https://arcprize.org/arc-agi/2/
- ARC-AGI-3 is interactive: agents explore game-like environments, infer goals, and are scored against human efficiency. https://arcprize.org/arc-agi/3/

### Code benchmarks
- Codex paper introduces HumanEval and pass@k with an unbiased estimator; Codex solved 28.8% with one sample and 70.2% with 100 samples per problem. https://arxiv.org/abs/2107.03374 (HumanEval has 164 hand-written problems, per the paper body / openai/human-eval repo)
- LiveCodeBench continuously collects new contest problems (LeetCode, AtCoder, CodeForces) so models can be scored only on problems released after their training cutoff; also covers self-repair, code execution and test-output prediction. https://arxiv.org/abs/2403.07974

### Maths competitions as fresh sets
- MathArena evaluates on newly released competitions immediately; reports strong signs of contamination on AIME 2024; first proof-writing evaluation (top models slightly under 40% on IMO 2025 at time of writing). https://arxiv.org/abs/2505.23281

### Contamination and how it is detected
- GSM1k (a fresh GSM8k-style set): accuracy drops of up to 8% for some models; several families show systematic overfitting; a model's probability of generating GSM8k examples correlates with its GSM8k-GSM1k gap; many frontier models show little overfitting. https://arxiv.org/abs/2405.00332
- Guided-instruction detection: prompt with dataset name, split and a prefix of an instance; near-verbatim completion flags contamination; 92-100% agreement with human experts on seven datasets. https://arxiv.org/abs/2308.08493
- Exchangeability test: a contaminated model assigns higher likelihood to a benchmark's canonical example order than to shuffled orders; provable contamination for black-box models; works for ~1,000-example test sets. https://arxiv.org/abs/2310.17623
- OpenAI (2026-02-23) stopped reporting SWE-bench Verified: in an audited subset (27.6% of problems that models often failed) at least 59.4% had tests that reject functionally correct solutions, and frontier models showed signs of training exposure; state of the art had moved from 74.9% to 80.9% in six months. Recommends SWE-bench Pro. https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ (page returns 403 to automated fetch; content corroborated by search snippets and secondary coverage: https://decrypt.co/359012/openai-benchmark-measure-ai-coding-supremacy-contaminated)
- Evaluation incentives: binary grading that gives no credit for "I don't know" rewards guessing; proposed fix is to change the scoring of mainstream benchmarks. https://arxiv.org/abs/2509.04664

### Statistics of evaluation
- Treat questions as a sample from a super-population; report standard error (95% CI = mean ± 1.96·SEM); cluster SEs when questions share a source (clustered SEs can be >3x naive); resample answers to reduce within-question variance (Inspect `epochs`); use paired differences (frontier models' per-question scores correlate 0.3-0.7); do power analysis. https://www.anthropic.com/research/statistical-approach-to-model-evals (2024-11-19) and https://arxiv.org/abs/2411.00640

### Leaderboards and arenas
- Chatbot Arena: crowdsourced pairwise battles; >240K votes at time of paper; crowd votes agree well with expert raters. https://arxiv.org/abs/2403.04132
- LMSYS (2023-12-07) moved from online Elo to a centrally fitted Bradley-Terry model because models are static and the full history is available; CIs from bootstrapping the BT MLE; ties count half. https://lmsys.org/blog/2023-12-07-leaderboard/
- Style control (2024-08-29): adds style covariates (token length, number of markdown headers, bold, list elements; normalised differences) to the BT logistic regression; length is the dominant style effect. https://lmsys.org/blog/2024-08-29-style-control/
- LMArena open-sourced its ranking code as Arena-Rank. https://news.lmarena.ai/arena-rank
- "The Leaderboard Illusion" (2025): undisclosed private testing lets some providers test many variants and publish the best (27 private Llama-4 variants identified); data access is unequal (Google ~19.2%, OpenAI ~20.4% of Arena data vs ~29.7% for 83 open-weight models combined); extra Arena data gives up to 112% relative gains on the Arena distribution. https://arxiv.org/abs/2504.20879
- MT-Bench / LLM-as-judge: position, verbosity and self-enhancement biases; GPT-4 judge agreement with humans >80%, similar to human-human agreement. https://arxiv.org/abs/2306.05685

### Holistic evaluation
- HELM: 42 scenarios (16 core), 7 metrics (accuracy, calibration, robustness, fairness, bias, toxicity, efficiency), 30 models; core-scenario coverage per model rose from 17.9% to 96.0%. https://arxiv.org/abs/2211.09110

## B. Agent benchmarks

- SWE-bench: 2,294 issues + PRs from 12 Python repos; model edits the codebase; at publication Claude 2 resolved 1.96%. https://arxiv.org/abs/2310.06770
- Resolution: patch must apply and all FAIL_TO_PASS (fail before, pass after) and PASS_TO_PASS (pass before and after) tests pass; harness runs in containers. https://www.swebench.com/ and secondary explainers (search, 2026-10-26)
- SWE-bench Verified (2024-08-13, with OpenAI): 500 human-validated instances; 93 professional developers reviewed 1,699 samples for underspecified issues, unfair tests and environment problems; GPT-4o resolved 33.2% at launch. https://www.swebench.com/verified.html ; https://openai.com/index/introducing-swe-bench-verified/ (403 to fetch; snippets)
- swebench.com "Bash Only" setting runs every model in the same minimal mini-SWE-agent loop; release 1.x vs 2.x results are not comparable (tool calling vs text-parsed actions) -- a direct example of scaffold effects. https://www.swebench.com/verified.html
- SWE-bench Pro: 1,865 problems from 41 actively maintained repos (public, held-out, commercial splits); long-horizon multi-file tasks; v1 abstract reported best pass@1 below 25% (GPT-5 23.3%), v2 abstract "below 45%" -- version matters. https://arxiv.org/abs/2509.16941
- tau-bench: agent + LM-simulated user + domain API tools + policy; success = final database state equals annotated goal state; introduces pass^k; gpt-4o-class agents <50% success and pass^8 <25% in retail. https://arxiv.org/abs/2406.12045
- tau2-bench: dual-control (agent and user both act on shared state), telecom domain, compositional task generator; performance drops sharply from no-user to dual-control. https://arxiv.org/abs/2506.07982
- GAIA: 466 questions; humans 92% vs GPT-4 with plugins 15% at publication. https://arxiv.org/abs/2311.12983
- WebArena: 812 tasks on self-hosted sites (shopping, forum, GitLab, CMS + tools); functional-correctness evaluation; best GPT-4 agent 14.41% vs humans 78.24% at publication. https://arxiv.org/abs/2307.13854
- OSWorld: 369 tasks in real desktop VMs with execution-based checks; humans >72.36%, best model 12.24% at publication; an audited OSWorld-Verified revision now exists and top reported scores have risen steeply (trackers cluster near the top) -- describe as trend. https://arxiv.org/abs/2404.07972
- Terminal-Bench 2.0: 89 hard command-line tasks, each with its own environment, human-written solution and tests; frontier agents scored below 65% at release (Jan 2026); runs on the Harbor harness. https://arxiv.org/abs/2601.11868 ; https://tbench.ai/docs
- BFCL (Berkeley Function Calling Leaderboard): AST-based checks (v1), multi-turn (v3), agentic (v4); overall = unweighted average of categories. https://gorilla.cs.berkeley.edu/leaderboard.html
- "AI Agents That Matter": accuracy-only reporting yields needlessly costly agents; jointly optimise cost and accuracy; distinguish model-developer vs app-developer needs; use proper holdouts; standardise to fix reproducibility. https://arxiv.org/abs/2407.01502
- HAL (Princeton): third-party, cost-aware agent leaderboard showing accuracy and cost with a Pareto frontier across 9 benchmarks; now focusing on reliability measurement. https://hal.cs.princeton.edu/
- METR: 50% task-completion time horizon = length (in human time) of tasks a model completes with 50% success; doubled roughly every seven months since 2019 (possibly faster in 2024). https://arxiv.org/abs/2503.14499

## C. Evaluating LLM applications in practice

- Anthropic "Demystifying evals for AI agents" (2026-01-09): vocabulary (task, trial, grader, transcript, outcome, harness, agent harness); three grader types with trade-offs (code / model / human); capability evals (start low, hill to climb) vs regression evals (near 100%); pass@k vs pass^k (75% per trial -> ~42% pass^3); start with 20-50 tasks from real failures; unambiguous tasks with reference solutions (0% across many trials usually means a broken task); balanced sets (should and should-not); isolated clean environments per trial; grade outcomes not paths; read transcripts; watch for saturation. https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Hamel Husain & Shreya Shankar evals FAQ (updated 2026-09): error analysis first (open coding -> axial coding -> counts; continue to theoretical saturation); ~100 diverse traces; binary pass/fail over Likert; one domain-expert "benevolent dictator"; one judge per failure mode; validate judges on 100-200 labelled examples with train/dev/test splits and report TPR/TNR; prefer code assertions when a rule works; generic off-the-shelf metrics give false confidence; writing evaluators before observing failures is generally not recommended; keep a random sample in each review batch. https://hamel.dev/blog/posts/evals-faq/
- "Who Validates the Validators?": criteria drift -- people need criteria to grade outputs but grading outputs changes their criteria; EvalGen aligns assertions/LLM graders with user grades. https://arxiv.org/abs/2404.12272
- Eugene Yan on LLM evaluators (2024-08): direct scoring for objective criteria, pairwise for subjective; evaluate the evaluator with precision/recall on the defect class and Cohen's kappa; correlation can hide weak defect detection; test for position/verbosity/self-enhancement bias. https://eugeneyan.com/writing/llm-evaluators/
- Panel of smaller judges (PoLL) from disjoint families beat a single large judge across six datasets and cost >7x less. https://arxiv.org/abs/2404.18796
- Agent-as-a-Judge: an agentic judge with access to the workspace on DevAI (55 tasks, 365 requirements) was as reliable as human evaluation and outperformed LLM-as-a-judge. https://arxiv.org/abs/2410.10934

### Tooling (neutral descriptions)
- OpenAI Evals: open-source framework + registry; model-graded evals from YAML/JSON templates; README points to evals in the OpenAI dashboard. https://github.com/openai/evals
- Inspect (UK AI Security Institute + Meridian Labs): Task = dataset + solver + scorer; built-in ReAct agent, MCP and bash/python tools; sandboxes (Docker, Kubernetes, ...); 200+ prebuilt evals; log viewer. https://inspect.aisi.org.uk/
- promptfoo: open-source CLI/library for evaluating and red-teaming prompts, models and RAG; runs in CI (GitHub Action). https://www.promptfoo.dev/docs/intro/
- DeepEval: open-source, pytest/Vitest-style test cases, 0-1 metrics with thresholds, G-Eval custom criteria, task-completion metric over traces. https://deepeval.com/docs/getting-started
- RAGAS: RAG metrics (faithfulness, context precision/recall, ...) plus agent metrics (tool call accuracy, tool call F1, agent goal accuracy, topic adherence). https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/
- LangSmith: datasets/examples, experiments, evaluators; offline (with references) vs online (live runs, reference-free) evaluation; human annotation queues, code checks, LLM-as-judge, pairwise. https://docs.langchain.com/langsmith/evaluation-concepts
- Braintrust: hosted observability + evals/experiments platform. https://www.braintrust.dev/docs
- Arize Phoenix: open-source (Elastic License 2.0) tracing on OpenTelemetry, LLM evals, versioned datasets, experiments. https://github.com/Arize-ai/phoenix

## D. Evaluating agentic applications (synthesis of the above)
- Success = outcome in the environment (DB state, tests pass), as in tau-bench, WebArena, OSWorld, SWE-bench. (sources above)
- Reliability: pass^k (tau-bench) vs pass@k (Codex). Report both.
- Trajectory: tool-call accuracy/F1 (RAGAS), ordering/policy constraints, agent-as-judge over traces.
- Simulated users: tau-bench, tau2-bench (dual control).
- Cost: cost-aware reporting (AI Agents That Matter, HAL, ARC-AGI-2 efficiency metric).
- Safety: AgentDojo (97 tasks, 629 security test cases) measures utility, utility under attack and attack success for prompt injection in tool-using agents. https://arxiv.org/abs/2406.13352

## E. Safety and red-team evaluation
- HarmBench: standardised automated red-teaming evaluation; 18 methods vs 33 target LLMs/defences; adversarial training method. https://arxiv.org/abs/2402.04249
- StrongREJECT: many jailbreak evaluations overstate success; jailbreaks that bypass safety training often degrade capability, so score how useful/specific the harmful response is, not just compliance. https://arxiv.org/abs/2402.10260
- XSTest: 250 safe prompts (10 types) that should be answered + 200 unsafe contrast prompts; measures exaggerated safety (over-refusal). https://arxiv.org/abs/2308.01263
- Anthropic RSP: version 3.4 effective 2026-07-08 (v3.0 rewrite 2026-02-24); capability thresholds (CBRN, autonomous AI R&D) trigger ASL safeguards; documented elicitation shortfalls (e.g. not using best-of-N, chain-of-thought); evaluation interval six months; public Risk Reports. https://www.anthropic.com/responsible-scaling-policy
- OpenAI Preparedness Framework v2 (2025-04-15): Tracked Categories = biological and chemical, cybersecurity, AI self-improvement; High and Critical thresholds; Research Categories include long-range autonomy, sandbagging, autonomous replication, undermining safeguards, nuclear/radiological. https://cdn.openai.com/pdf/18a02b5d-6b67-4cec-ab64-68cdfbddebcd/preparedness-framework-v2.pdf
- Google DeepMind Frontier Safety Framework v3 (2025-09-22; 3.1 on 2026-04-17): Critical Capability Levels, early-warning evaluations, harmful manipulation CCL, misalignment/instrumental reasoning, ML R&D; Tracked Capability Levels added in 3.1. https://deepmind.google/discover/blog/strengthening-our-frontier-safety-framework/

## Things that are uncertain or move quickly
- Leaderboard scores on Arena, OSWorld-Verified, Terminal-Bench, SWE-bench Pro: change monthly; lessons describe trends only.
- OpenAI's SWE-bench Pro audit (reported mid-2026 by secondary sources, ~30% of tasks broken) not verified against a primary source; not used in lessons.
- WebArena "current best" figures on third-party trackers not verified; not used.
