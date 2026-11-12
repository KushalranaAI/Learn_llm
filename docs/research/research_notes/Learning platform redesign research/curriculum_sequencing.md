# Curriculum Sequencing, Prerequisite Mapping and Self-Regulated Learning for Self-Taught Technical Learners

Scope: how to order and connect modules and lessons so knowledge lasts and stays connected, and how to support learners with no teacher. Applied to "Learn LLM". Current order: 01 How LLMs work, 02 Build from scratch (PyTorch), 03 Training and adaptation, 04 Fine-tuning in practice, 05 Inference and serving, 06 Prompt and context, 07 Evaluation. Planned: post-training from scratch. The platform is free, self-paced and local-first, with no teacher and no accounts.

Research budget note: about 16 tool calls. Several effect sizes come from secondary summaries or abstracts and are flagged where that applies. Opinion and inference are kept in the "Inferences" subsections.

---

## 1. Sequencing theory and evidence (Gagné, Reigeluth, Bruner, 4C/ID, mastery learning, knowledge spaces, knowledge graphs)

### Takeaway
All of these frameworks agree on two rules: respect prerequisite dependencies, and move from simple to complex. They disagree about the unit being sequenced. Gagné sequences atomic skills along a prerequisite chain. Reigeluth and 4C/ID sequence whole, simplified versions of the real task ("epitome" or "task classes"), making each pass more complex. The strongest evidence for complex technical skills supports whole-task sequencing (4C/ID, d about 0.79) combined with mastery gating (about 0.5 SD). Adaptive systems (ALEKS, Math Academy) put both into practice as an explicit prerequisite graph with a "ready to learn" frontier.

### Cited Findings
- **Gagné learning hierarchies.** A learning hierarchy "shows the learning-prerequisite relations among the components of a subject matter". Designers have widely used task-analysis procedures based on Gagné's (1968, 1977) cumulative learning theory. — [Reigeluth, Merrill & Bunderson, via METU OCW](https://ocw.metu.edu.tr/mod/resource/view.php?id=4412)
- Reigeluth argues that learning hierarchies "represent a very incomplete basis for organizing a whole course". Elaboration theory still keeps "learning prerequisite sequences" as one of its 7 components. — [METU OCW reading](https://ocw.metu.edu.tr/mod/resource/view.php?id=4412); [Elaboration Theory summary, Cortland](https://web.cortland.edu/frieda/id/IDtheories/15.html)
- **Reigeluth elaboration theory.** Developed in the late 1970s, it sequences simple to complex. It starts with an "epitome", a simplified version of the whole content domain (Reigeluth 1980), and each cycle of elaboration adds complexity until the learner reaches the terminal procedure. — [IU Chapter 18 summary](https://idtheory.sitehost.iu.edu/chapter_18_summary.html); [Cortland summary](https://web.cortland.edu/frieda/id/IDtheories/15.html); [TECFA summary](https://tecfa.unige.ch/themes/sa2/act-app-dos2-fic-elaborat.htm)
- Critique: Wilson & Merrill (1980) argue that hierarchy analysis and elaboration-theory analysis both produce simple-to-complex sequencing, so looking for prerequisite relations inside elaboration-theory sequences may be largely redundant. — [Mory & Cole critical review](https://typeset.io/pdf/a-critical-review-of-elaboration-theory-s77tdeqkg2.pdf)
- **4C/ID (van Merriënboer).** It has four components. (1) Learning tasks are authentic whole tasks (projects, cases, problems), grouped into task classes ordered simple to complex. (2) Supportive information covers the non-routine parts: problem solving, reasoning and mental models. (3) Procedural information is just-in-time, step-by-step "how to" for the routine parts. (4) Part-task practice is repetition of routine skills until they are automatic. — [Designing Instruction for Complex Learning, EdTech Books](https://edtechbooks.org/docx/3258); [SWOV](https://swov.nl/en/publicatie/four-component-instructional-design-model); [UNITAR learning wiki](https://learningwiki.unitar.org/index.php/4C/ID)
- **4C/ID meta-analysis.** Costa, Miranda & Melo (Learning Environments Research, 2022; online 2021) report a large effect on performance, d = 0.79. The effect held across academic areas, study designs and outcome types. Education level was a significant moderator, and the authors recommend 4C/ID especially for higher education. Caveat: taken from the abstract, and confidence intervals and heterogeneity were not checked. — [ISCTE repository](https://repositorio.iscte-iul.pt/handle/10071/23015); [ISCTE publication page](https://ciencia.iscte-iul.pt/publications/the-four-component-instructional-design-model-4cid-a-meta-analysis-on-use-and-effect/81383?lang=en)
- **Mastery learning.** Kulik, Kulik & Bangert-Drowns (1990, Review of Educational Research 60(2)) meta-analysed 108 controlled evaluations and found positive achievement effects of about 0.5 SD (reported as 0.52 in a secondary summary). Weaker students gained most (about 50th to 70th percentile, also from a secondary summary). Slavin published a dissenting critique in the same issue, and other syntheses report pooled effects from 0.04 to 0.60. — [Justin Skycak, Brief History of Mastery Learning](https://justinmath.com/a-brief-history-of-mastery-learning/); [Academia.edu copy](https://www.academia.edu/81783373/Effectiveness_of_Mastery_Learning_Programs_A_Meta_Analysis); [EduCaixa technical appendix](https://educaixa.org/es/-/apendice-tecnico-mastery-learning)
- **Knowledge space theory (Doignon & Falmagne, 1985).** The *outer fringe* of a knowledge state is the set of items the learner is "ready to learn": items not yet known that can be added and still give a valid state. The *inner fringe* is what was most recently learned or is shakiest. In a learning space the two fringes fully determine the state (Falmagne & Doignon 2011, Thm 4.1.7). ALEKS uses the fringes to choose what to teach and assess, and reported ALEKS data indicates high success when learners attempt outer-fringe items. — [Wikipedia: Knowledge space](https://en.wikipedia.org/wiki/Knowledge_space); [Eppstein et al., "Learning Sequences" arXiv](https://arxiv.org/pdf/0803.4030)
- **Math Academy knowledge graph.** Math Academy uses two graphs. The *prerequisite* graph controls what may be learned next. A separate *encompassing* graph records which advanced topics exercise simpler ones. "Encompassed topics are usually prerequisites, but prerequisites are often not fully encompassed." Domain experts set these links by hand, with weights from 0 to 1. — [Skycak, Individualized Spaced Repetition in Hierarchical Knowledge Structures](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)

### Inferences
- For a course teaching a complex technical skill, the evidence favours **4C/ID-style whole-task sequencing** over strict bottom-up hierarchies. Gagné-style prerequisite analysis is still useful *inside* each lesson and for building the dependency graph the UI shows.
- A local-first platform with no accounts can still keep a lightweight knowledge space: a static prerequisite DAG in content JSON, plus per-lesson mastery flags in localStorage. That is enough to compute a "ready to learn" outer fringe and to suggest "next up" and "review this" items.
- Mastery gating should be **soft**: a "check yourself" quiz with a threshold and a recommendation, not a lock. Self-taught adults skip around, and hard locks would frustrate them. The 0.5 SD effect depends on corrective feedback loops, which the platform has to supply through quizzes, explanations and retry. Section 4 covers that; this is opinion based on the mastery-learning mechanism.

### Gaps
- No direct evidence was found on Bruner's spiral curriculum effect sizes. It is mostly a design principle and was not verified with a source in this pass.
- No published Khan Academy research on how well its knowledge map / mastery system works was retrieved.
- 4C/ID meta-analysis details (k, CI, heterogeneity) were not verified from the full text.

---

## 2. Connecting lessons so earlier material is remembered (spiral revisits, cumulative review, interleaving, encompassing problems, advance organizers)

### Takeaway
Retrieval practice (g of about 0.5 to 0.7) and spacing are the best-supported mechanisms. Interleaving helps moderately (g = 0.42), and mostly when the topics are similar but easy to confuse. Math Academy's "encompassing" idea, where advanced tasks count as implicit review of their components, is the most practical way to keep review load manageable in a deep prerequisite chain. Advance organizers have a modest, well-replicated benefit.

### Cited Findings
- **Practice testing.** Adesope, Trevisan & Sundararajan (2017, RER 87(3)) found that practice tests beat restudying and every other comparison condition. Benefits were largest with a 1 to 6 day lag before the final test. Mixed-format and multiple-choice practice tests gave larger effects. Feedback gave a slightly larger but not significant benefit. A later review quotes g = 0.70 for one comparison. Counts disagree between summaries (118 vs 188 articles; 272 effect sizes). — [WSU PDF](https://education.wsu.edu/documents/2018/01/rethinking-use-tests.pdf/); [WSU record](https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/Rethinking-the-Use-of-Tests-A/99900601154801842)
- **Spaced retrieval.** A meta-analysis in Educational Psychology Review reports a strong benefit of spaced over massed retrieval practice, g = 0.74. — [Springer, Educ Psychol Rev 2020](https://link.springer.com/10.1007/s10648-020-09572-8)
- **Interleaving.** Brunmair & Richter (2019, Psychological Bulletin 145(11)) analysed 59 studies with 238 effect sizes. Overall g = 0.42, with g = 0.34 for maths tasks. Results for expository texts were inconclusive, and word-based studies were negative. Interleaving helped more when categories were similar to each other, items within a category varied more, and material was more complex. — [PubMed](https://pubmed.ncbi.nlm.nih.gov/31556629/); [author PDF](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf)
- **Encompassing / FIRe (Math Academy).** When a learner passes a review on an advanced topic, positive credit flows down to the topics it encompasses as "implicit repetitions". A failure sends negative credit up to the topics that depend on it. Credit is discounted by the encompassing weight and by how early the repetition comes. For slower learners on a given topic, implicit credit is discarded and explicit review is forced, because weaker students transfer less well from simple to hard topics. "Spaced repetition compression" picks tasks that knock out several due reviews at once. Skycak argues that without this, a learner doing about 3 new topics a day would face dozens of reviews daily. (This is the vendor's own design write-up, not a peer-reviewed evaluation.) — [Skycak](https://www.justinmath.com/individualized-spaced-repetition-in-hierarchical-knowledge-structures/)
- **Advance organizers (Ausubel).** Luiten, Ames & Ackerson (1980, AERJ 17:211–218) meta-analysed 135 studies and found advance organizers facilitate learning and retention. Aural organizers had about twice the effect of written ones, and the benefit was similar at all ability levels, with no special advantage for low-ability learners. Ausubel's original organizers were 200–500-word prose passages read before the new material. — [ITDL journal review](https://itdl.org/Journal/Jun_09/article01.htm); [Springer article citing it](https://link.springer.com/article/10.1007/BF02296573); [CORE PDF](https://core.ac.uk/download/144155196.pdf)
- **Elaboration theory "synthesizers".** Elaboration theory includes summarizers and synthesizers as components: periodic reviews that tie new content back to the epitome. — [Cortland summary](https://web.cortland.edu/frieda/id/IDtheories/15.html)

### Inferences
- **Encompassing fits Learn LLM naturally.** The "build" modules exercise the "how it works" concepts. For example, writing causal self-attention exercises softmax, dot products, masking and the shapes from Module 01. Writing a sampling loop exercises temperature and top-p. Tagging each build lesson with `encompasses: [lessonIds with weight]` lets a completed build lesson refresh the theory concepts' review clocks, and makes the module 01 → 02 link explicit.
- **Cumulative review quizzes.** Each lesson-end quiz should include 1 or 2 retrieval items from earlier modules, chosen from the prerequisites of that lesson. Each module should end with a mixed review of its own and earlier content. A 1–6 day lag works best, so a "review due" queue (localStorage) on the dashboard is well supported.
- **Interleave confusable pairs** where the material is similar: LoRA vs full fine-tuning vs QLoRA; DPO vs PPO vs GRPO; KV cache vs prompt caching; top-k vs top-p vs temperature; RMSNorm vs LayerNorm. Brunmair & Richter suggest this is where interleaving pays off. Interleaving unrelated topics (prompting vs MoE) adds little.
- **Advance organizer at the top of each module:** a short "epitome" map showing where this module sits in the whole LLM lifecycle (data → pretrain → post-train → serve → prompt → evaluate), recalled at the start of each module. Short narrated or animated versions may beat text, given the aural vs written finding (weak inference).

### Gaps
- No primary source was fetched for Cepeda et al. (2006) on optimal spacing gaps.
- No controlled evaluation of Math Academy's FIRe against standard spaced repetition was found. Evidence is design rationale only.
- No studies were found on concept maps in self-paced programming or ML courses specifically.

---

## 3. Project-based and capstone design for technical skills

### Takeaway
Novices learn poorly from unguided projects (Kirschner, Sweller & Clark, 2006). "Struggle first, then instruction" (productive failure) does help, g = 0.37–0.58, but only when it is designed carefully and followed by explicit instruction. The approach that reconciles them is 4C/ID: **whole tasks from day one, but heavily scaffolded** (worked examples → completion tasks → independent), with scaffolding faded within each task class. fast.ai's top-down "working model first" is a practitioner version of this; its effect is claimed rather than measured.

### Cited Findings
- **Kirschner, Sweller & Clark (2006).** Minimally guided instruction is ineffective for novices. Unguided problem solving overloads working memory and blocks schema formation. The worked example is "the epitome of strongly guided instruction". — [Classroom EUMETSAT copy](https://classroom.eumetsat.int/mod/resource/view.php?id=4547)
- **Productive failure.** Sinha & Kapur (2021, RER) meta-analysed 53 studies with 166 comparisons of problem-solving-before-instruction (PS-I) vs instruction-first (I-PS). PS-I effects were larger when the design followed productive-failure principles closely (Hedges' g 0.37–0.58). It compares orderings *of guidance*, not guidance vs no guidance. — [X-MOL record](https://www.x-mol.com/paper/1406031499744456704); [OUCI record](https://ouci.dntb.gov.ua/works/4KnMgZq7)
- **4C/ID learning tasks** are authentic whole tasks with support that fades within each task class. Procedural information is given just in time. — [EdTech Books](https://edtechbooks.org/docx/3258)
- **fast.ai top-down.** "I start by showing how to use a complete, working, very usable, state-of-the-art deep learning network… [then] dig deeper gradually". "We always teach through examples… rather than starting with algebraic symbol manipulation". Learners build and deploy a model by the end of lesson 2, and the "from-scratch model" lesson is lesson 5. — [course.fast.ai](https://course.fast.ai/)
- **Karpathy Zero to Hero** is entirely build-first. Every lecture is "building" something (micrograd → makemore → GPT → tokenizer), and concepts are introduced exactly when the code needs them. — [karpathy.ai/zero-to-hero](https://karpathy.ai/zero-to-hero.html)
- **CS336** is built around 5 large build assignments (basics → systems → scaling → data → alignment/RL). Each one is a whole-task milestone with a working artifact. — [CS336 Spring 2025](http://cs336.stanford.edu/spring2025/)

### Inferences
- For Learn LLM, a "project" should be a **scaffolded whole task with checkpoints**, not an open-ended brief. For example, "train a tiny GPT" becomes the following, with each checkpoint having an auto-checkable expected output (shapes, loss below X after N steps, sample text that is not gibberish):
  1. a worked notebook with everything filled in;
  2. a completion version with blanks for attention and the training loop;
  3. an independent version with only a spec and tests.
  This is the 4C/ID fading pattern and fits a local-first platform (inference from 4C/ID + KSC).
- Use **productive failure sparingly and on purpose**: for example, "predict what happens to generations if you remove the causal mask, then run it" before explaining masking. Keep it short and always follow it with an explanation.
- **Capstones per module:** each module ends in one integrative task that encompasses its lessons (e.g., Module 04: fine-tune a small model with LoRA, then DPO, then evaluate against the base). This doubles as cumulative review (Section 2).

### Gaps
- No controlled study was found comparing fast.ai-style top-down against bottom-up teaching in ML specifically. Top-down claims are practitioner opinion.
- No data was found on completion or dropout for "build from scratch" curricula (Karpathy, Raschka).

---

## 4. Self-regulated learning and MOOC dropout (Zimmerman, planning, nudges, Kizilcec et al.)

### Takeaway
SRL strategies (self-evaluation, task strategies, self-efficacy, time management) correlate with achievement. Large-scale RCTs, however, show that one-off nudges such as plan-making prompts have **near-zero average effects on MOOC completion**, despite promising small studies. The effects are real but heterogeneous and short-lived. A self-paced platform should build SRL support *into the routine*: visible progress, a review queue, short self-checks and an optional weekly plan with a specific time of day. It should not expect a single onboarding prompt to fix attrition.

### Cited Findings
- **Zimmerman's cyclical model:** forethought (task analysis, goal setting, self-efficacy and motivation beliefs) → performance (strategy use, self-monitoring) → self-reflection (self-evaluation, attributions). The phases are interdependent. — [Wong et al. 2019 SRL in online environments, IJHCI](https://informahealthcare.com/doi/abs/10.1080/10447318.2018.1543084)
- Broadbent & Poon (2015) is cited as finding SRL strategies significantly associated with online academic success, and as suggesting that rehearsal, elaboration and organization add little online. The full article was not retrieved. — [Wong et al. 2019](https://informahealthcare.com/doi/abs/10.1080/10447318.2018.1543084); [Frontiers 2018 meta-analysis citing it](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02434/full)
- In a K-12 Chinese meta-analysis (offline, so it is weaker evidence for this context), self-evaluation (d = 0.717), self-efficacy (d = 0.699) and task strategies (d = 0.600) had the largest associations with achievement. Metacognitive monitoring was d = 0.388 and goal orientation d = 0.092. The performance and self-reflection phases outweighed forethought. Only 4 of 59 studies were interventions. — [Frontiers in Psychology 2018](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02434/full)
- Kizilcec et al. (2017) found that strategic planning predicted attainment of personal course goals. — [cited in Frontiers 2018](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.02434/full)
- **Kizilcec et al. 2020 (PNAS).** About 250,000 learners in about 250 MOOCs (Harvard, MIT, Stanford) over 2.5 years. Plan-making had **no significant effect on overall completion**: activity rose for 1–2 weeks and then faded. Self-regulation prompts raised early engagement but not completion. Value-relevance writing helped learners in developing countries only in courses with a global achievement gap, and hurt elsewhere. An algorithm for targeting interventions did no better than giving everyone the same one. Earlier small studies (Yeomans & Reich) had reported +29% completion from planning prompts. — [Cornell Chronicle](https://news.cornell.edu/node/319503); [EdSurge](https://edsurge.com/news/2020-06-17-massive-study-of-online-teaching-ends-with-surprising-and-deflating-result); [ScienceDaily](https://www.sciencedaily.com/releases/2020/06/200615152116.htm)
- **Replication (Andor, Fels, Renz).** Four RCTs on openHPI/openSAP found an overall null effect of planning prompts, ruling out effects beyond [-7%, +3%]. One course showed +19%. — [Rzepka/Andor et al. PDF](https://rem.rc.iseg.ulisboa.pt/lese/5e3/files/Papers/planning-prompts_Rzepka.pdf)
- **Plan content matters.** An analysis of 650 learner plans across 15 MOOCs (Cho et al., LAK 2024) found that plans naming a **time of day** predicted completion, but only 25% of learners wrote one. — [Imperial Spiral](https://spiral.imperial.ac.uk/entities/publication/9ab8818b-ce2d-4b26-8ca4-d7cff15ef324)
- **MOOC attrition context.** Reich & Ruipérez-Valiente (Science, 2019; edX HarvardX/MITx 2012–2018) report that low completion rates had not improved in six years. Second-year retention fell from 38% to 7% across cohorts. The specific 3.13% completion figure that circulates could not be verified here. — [Postprint PDF](https://webs.um.es/jruiperez/papers/journals/2019_Science_MOOCPivot_postprint.pdf); [Harvard Magazine](https://www.harvardmagazine.com/2019/01/mooc); [Picciano excerpt](https://apicciano.commons.gc.cuny.edu/?p=22044)

### Inferences
- Since one-shot nudges wash out, SRL support should be **persistent and built into the interface**. This fits a local-first platform with no accounts, because everything can live in localStorage:
  - **Forethought:** an optional "my goal" picker that personalises the path (understand LLMs / build one / fine-tune for work / ship an app), plus a weekly plan with a specific day and time (the Cho et al. finding). Offer .ics calendar export instead of reminders, since there are no accounts or email.
  - **Performance:** a progress map on the prerequisite graph, a visible "review due" queue, and short self-checks inside lessons.
  - **Reflection:** an end-of-lesson confidence rating set against quiz score (calibration feedback), plus a one-line learning journal ("what clicked / what's fuzzy"), exportable as Markdown.
- Self-evaluation and task strategies had the largest associations, so the "check yourself" loop with explanations is probably worth more than goal-setting screens (inference from correlational data).
- Value-relevance prompts can backfire for some groups, so avoid generic motivational messaging. Tie relevance to the learner's chosen goal instead.

### Gaps
- No direct RCT evidence was retrieved on learning journals or calibration prompts in self-paced technical courses.
- Broadbent & Poon (2015) effect sizes were not verified from the primary source.
- No evidence was found on streaks/gamification in self-paced coding education. Not searched.

---

## 5. How existing ML/LLM curricula are ordered

### Takeaway
There are three families. (a) **Build-first, bottom-up from code** (Karpathy, Raschka, CS336): implement the transformer early, and treat post-training/alignment as the last stage. (b) **Use-first, top-down** (fast.ai, Hugging Face course): use a pretrained model immediately and go "under the hood" later. (c) **Roadmaps** (Labonne): split "Scientist" (architecture → pretrain → SFT → preference alignment → evaluation → quantization) from "Engineer" (running LLMs/prompting → RAG → agents → inference optimization → deploy → security). None of them puts a whole "theory only" module before any code. Evaluation is placed late everywhere, usually directly after post-training.

### Cited Findings
- **Karpathy Zero to Hero:** (1) micrograd/backprop → (2) bigram LM (makemore) → (3) MLP LM → (4) activations/gradients/BatchNorm → (5) manual backprop → (6) WaveNet → (7) build GPT from scratch → (8) build the GPT tokenizer. The tokenizer comes *after* GPT. Prerequisites are solid Python and intro maths. Every lecture is a build. — [karpathy.ai](https://karpathy.ai/zero-to-hero.html)
- **Raschka, Build a Large Language Model (From Scratch):** Ch1 understanding LLMs (conceptual overview) → Ch2 text data/tokenization → Ch3 attention in code → Ch4 GPT model → Ch5 pretraining → Ch6 fine-tune for classification → Ch7 instruction fine-tuning. Appendices: A PyTorch intro, D training-loop extras, E LoRA. Bonus material covers KV cache (Ch4), Llama/Qwen3/MoE conversion (Ch5) and DPO (Ch7). Conceptual explanation is interleaved with code in each chapter. — [GitHub rasbt/LLMs-from-scratch](https://github.com/rasbt/LLMs-from-scratch)
- **Stanford CS336 (Spring 2025):** Assignments are A1 basics (tokenizer, Transformer, optimizer, train LM) → A2 systems (profiling, FlashAttention2 in Triton, distributed) → A3 scaling laws → A4 data (Common Crawl filtering and dedup) → A5 alignment and reasoning RL (SFT + RL, optional DPO). Lectures: tokenization/PyTorch (1–2), architecture/MoE (3–4), GPUs/kernels/parallelism (5–8), scaling (9, 11), **inference (10)**, **evaluation (12)**, data (13–14), SFT/RLHF (15), RL (16–17). — [cs336.stanford.edu](http://cs336.stanford.edu/spring2025/)
- **Labonne LLM Course:** Fundamentals (optional): maths, Python, neural nets, NLP. **Scientist:** architecture → pre-training → post-training datasets → SFT → preference alignment → **evaluation** → quantization → new trends. **Engineer:** running LLMs (includes **prompt engineering**) → vector storage → RAG → advanced RAG → agents → **inference optimization** → deploying → securing. — [GitHub mlabonne/llm-course](https://github.com/mlabonne/llm-course)
- **Hugging Face LLM course:** Ch1–4 Transformers library (how transformers work, use Hub models, fine-tune, share) → Ch5–8 Datasets/Tokenizers, classic NLP tasks → Ch9 demos → Ch10–12 advanced fine-tuning, dataset curation, reasoning models. Prerequisites: good Python, ideally an intro DL course (e.g., fast.ai); PyTorch is not required. — [HF LLM course](https://huggingface.co/learn/llm-course/chapter1/1)
- **fast.ai Part 1:** getting started → deployment → neural net foundations → NLP → from-scratch model → random forests → collaborative filtering → convolutions. Deployment comes in lesson 2, before foundations. — [course.fast.ai](https://course.fast.ai/)

### Inferences
- **Learn LLM is unusual** in having a full theory-only module (01, 8 lessons) before any building, followed by a build module (02) that covers the same concepts again in code. No reference curriculum does this. Raschka is the closest analogue: one short conceptual chapter (Ch1), then concept and code interleaved for each topic.
- Learn LLM's Module 03 "Training and adaptation" (concepts) followed by 04 "Fine-tuning in practice" (code) repeats the same theory → build split. The planned "post-training from scratch" module would make a third layer on SFT/preference/GRPO (03 concepts → 04 library practice → new module from scratch). That is a lot of overlap, but it could serve as a deliberate spiral if each pass is clearly at a different depth.
- Every reference places **evaluation directly after training/post-training** (Labonne Scientist §6, CS336 L12) or in the middle, never as the final standalone module after prompting. CS336 also puts inference among the core systems/scaling lectures, not after fine-tuning.

### Gaps
- The CS224N syllabus was not fetched in this pass.
- No completion or learning-outcome data was found comparing these curricula.

---

## 6. Concretely: theory-then-build vs interleaved, and where evaluation, inference and prompting should sit

### Takeaway
The evidence and practice both favour **interleaving each concept with building it** (4C/ID whole tasks; Raschka, Karpathy and CS336 all interleave). Separate "theory module then build module" blocks risk teaching each concept twice with a long gap between the passes, and they leave Module 01 with no hands-on retrieval. A defensible restructure: keep a *short* epitome module, merge concept and code per topic, move evaluation earlier and thread it through, and treat prompting and inference as the "use it" on-ramp or as applied branches.

### Cited Findings (supporting evidence, see sections above)
- Whole-task, simple-to-complex sequencing with just-in-time procedural information gives d of about 0.79 in higher education. — [Costa et al. via ISCTE](https://repositorio.iscte-iul.pt/handle/10071/23015)
- Reigeluth's epitome: start with a simplified whole and elaborate. — [IU summary](https://idtheory.sitehost.iu.edu/chapter_18_summary.html)
- Retrieval practice and spacing are best with a 1–6 day lag. — [Adesope et al.](https://education.wsu.edu/documents/2018/01/rethinking-use-tests.pdf/)
- Unguided novice work is ineffective, and guided struggle-first can help. — [Kirschner et al.](https://classroom.eumetsat.int/mod/resource/view.php?id=4547); [Sinha & Kapur](https://www.x-mol.com/paper/1406031499744456704)
- Curricula place evaluation right after (post-)training, and inference among core systems topics. — [Labonne](https://github.com/mlabonne/llm-course); [CS336](http://cs336.stanford.edu/spring2025/)
- Use-first on-ramps (fast.ai deploys by lesson 2; HF uses Hub models in Ch1–4; Labonne's Engineer track begins with "Running LLMs" and prompting). — [fast.ai](https://course.fast.ai/); [HF](https://huggingface.co/learn/llm-course/chapter1/1); [Labonne](https://github.com/mlabonne/llm-course)

### Inferences (recommendation; opinion grounded in the evidence above)
1. **Shrink Module 01 into an epitome / advance organizer.** Make it 1–3 short lessons giving the whole pipeline at an intuitive level (tokens → embeddings → attention → next-token sampling → limits), with interactive visualisations and a "use a real model now" moment (in-browser or API sampling demo: change the temperature, see the tokens). This works as Ausubel's organizer and Reigeluth's epitome, and gives fast.ai-style early payoff.
2. **Merge theory and build per concept** (Modules 01 + 02 becoming one spiral). Each topic gets intuition → visual or simulation → code it → check. Order: tokenization (BPE in code) → embeddings → attention (concept + code) → transformer block → train tiny GPT → sampling → KV cache → modern architecture (RMSNorm/RoPE/SwiGLU) → scaling the loop → MoE. Keep a *no-code track flag* so learners who only want concepts can skip the code checkpoints. That preserves the current 01 audience without a separate module. Each code lesson "encompasses" its concept lesson (Section 2).
3. **Same treatment for 03/04 and the planned post-training module.** Organise by stage (pretraining data & scaling → SFT → preference/RL → PEFT/LoRA → distillation), with three depth tiers inside each: concept → library practice (TRL/PEFT) → from-scratch. This is a deliberate spiral rather than three separate modules covering the same names. If they stay separate, add explicit bridging summaries ("you met DPO conceptually in 03.5; here you run it; next module you implement the loss") and cross-module review items.
4. **Move evaluation earlier and thread it through.** Introduce basic evaluation (held-out loss/perplexity, sample inspection) in the tiny-GPT build. Introduce task evals and LLM-as-judge right after SFT/preference tuning, since every fine-tuning capstone should end with "evaluate against the base model". Keep a later dedicated evaluation module for advanced material (benchmarks and contamination, eval design, agent evals). This matches Labonne and CS336 placement and gives evaluation many spaced revisits.
5. **Prompting and context as an early applied branch.** Prompting needs only the epitome (tokens, context window, sampling), not the build modules. Offer it as a parallel branch that is unlocked after the epitome in the prerequisite DAG, so application-focused learners get value quickly (Labonne's Engineer track starts here). Its advanced parts (caching, long-context limits) should then link back to KV cache and attention.
6. **Inference and serving after the build and architecture lessons.** It depends on KV cache, attention cost and quantization, so it fits after modern architecture (CS336 puts inference among systems/scaling). It can come before or alongside fine-tuning, because fine-tuning does not depend on it. Make it a branch in the DAG rather than a fixed position.
7. **Use a DAG, not a line.** Show the curriculum as a skill map with a recommended path and goal-based paths (Understand / Build / Fine-tune / Apply). Use the knowledge-space "ready to learn" frontier for "next up". Store everything locally.

### Gaps
- No controlled study directly compares "theory module then build module" against interleaved concept-and-code for ML curricula. The recommendation extrapolates from 4C/ID, retrieval-practice and spacing research and from expert curricula ordering.
- No evidence on the best length for an epitome module in technical self-study.
