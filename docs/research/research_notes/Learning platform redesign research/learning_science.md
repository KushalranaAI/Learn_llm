# Learning Science Evidence Base for a Self-Paced LLM-Engineering Platform

Scope: which learning techniques have strong evidence (meta-analyses, effect sizes, boundary conditions), and what they imply for a self-paced web platform that teaches how LLMs are built (maths, diagrams, simulations, quizzes, labs, code).

Effect-size quick reference (verified in this research unless marked otherwise):

| Technique | Best estimate | Source quality | Notes |
|---|---|---|---|
| Practice testing / retrieval | g ≈ 0.50 (Rowland 2014); Adesope 2017 reported larger (g ≈ 0.70 per a secondary source, unverified) | Multiple meta-analyses | Dunlosky "high utility" |
| Interleaving | g = 0.42 overall; maths g = 0.34; expository text n.s. | Brunmair & Richter 2019 meta-analysis | Depends on between-category similarity |
| Self-explanation prompts | g = 0.55 | Bisra et al. 2018 meta-analysis (64 reports) | Dunlosky "moderate" |
| Worked examples | g = 0.48 | Barbieri et al. 2023 meta-analysis | High heterogeneity (I² ≈ 94%); reverses with expertise |
| Productive failure (PS-I vs I-PS) | g = 0.87 bias-adjusted; 0.37–0.58 for high-fidelity designs (per secondary reports) | Sinha & Kapur 2021 meta-analysis | Favours I-PS for young learners and domain-general skills |
| Coherence / signalling / segmenting (Mayer) | median d = 0.86 / 0.69 / 0.67 | Mayer's own review tables | Figures differ between Mayer publications |
| Expanding vs uniform spacing | g = 0.034 difference (n.s.) | Meta-regression (author not confirmed) | Uniform as good or better long term |
| Learning styles (meshing) | No adequate evidence | Pashler et al. 2008 PSPI review | Rule out |

---

## 1. Retrieval practice / testing effect

### Takeaway
Retrieving information beats re-reading by a reliable, moderate amount (g ≈ 0.5, possibly higher). It is the best-supported technique in the literature and should be the platform's main learning activity, not something tacked on at the end.

### Cited Findings
- Dunlosky et al. (2013) rated practice testing and distributed practice as the only two "high utility" techniques. Practice testing works even when massed, but works better when spaced — [APS press release](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html); [ScienceDaily](https://www.sciencedaily.com/releases/2013/01/130110111734.htm)
- Rowland (2014) meta-analysis: typical testing-effect size g = 0.50, 95% CI [0.42, 0.58] — [Pan & Sana 2021, J Exp Psych: Applied (PDF)](https://sc-pan.github.io/pdf/PS_2021.pdf)
- Adesope, Trevisan & Sundararajan (2017), *Review of Educational Research* 87(3), 659–701, compared practice tests with non-testing conditions using 272 independent effect sizes. A PMC review reports their Hedges' g as 0.70, but this is secondary and unverified. The article count is reported as 118 in one summary and 188 in another — [PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC10409703); [WSU record](https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/Rethinking-the-Use-of-Tests-A/99900601154801842)
- Adesope moderators, per secondary summaries:
  - Mixed-format and multiple-choice practice tests gave larger effects.
  - The largest effects came with a 1–6 day lag between the practice test and the final test.
  - [TIE summary](https://www.tieonline.com/article/2232/the-benefits-of-practice-testing)
- Donoghue & Hattie (2021) meta-analysis of the ten Dunlosky techniques again found distributed practice and practice testing the most effective — [Frontiers in Education](https://www.doi.org/10.3389/feduc.2021.581216)

### Inferences
- Make retrieval the default interaction on every lesson. Use short checks every few minutes, end-of-lesson quizzes, and delayed review sessions 1–6 days later, rather than only a final quiz.
- Mixing item types (multiple choice plus short free recall, predict-the-output for code, "derive the next step" for maths) matches the moderator finding.
- Give corrective feedback after retrieval. It is widely recommended, but the feedback moderator is not verified here (see Gaps).

### Gaps
- I could not confirm Adesope's exact headline g, CI, or feedback/restudy-comparison breakdowns from the primary paper, because the WSU PDF link redirected. From memory, Adesope reports a smaller effect against restudy than against no activity. Verify at DOI 10.3102/0034654316689306 before citing.
- Most testing-effect studies use verbal and factual material. Fewer test transfer for complex procedural or mathematical skills (see successive relearning below).

---

## 2. Spacing: optimal schedules, expanding vs uniform, and modern schedulers (SM-2 / FSRS)

### Takeaway
Spacing is robust. The best gap between sessions grows with how long the learner needs to remember, but as a shrinking fraction of that period (roughly 10–20% for long retention). Expanding schedules have no reliable advantage over uniform ones for long-term retention. Modern data-fitted schedulers such as FSRS predict recall better than heuristic ones.

### Cited Findings
- Cepeda, Vul, Rohrer, Wixted & Pashler (2008), *Psychological Science*, ran 26 gap × retention-interval conditions with tests up to 1 year:
  - At any test delay, performance first rises, then slowly falls, as the gap increases (a "temporal ridgeline").
  - The optimal gap increases with test delay but falls as a proportion of it. At a 1-year delay it is about 20% of the delay or less; secondary summaries say about 10–20%.
  - [Cepeda et al. 2008 PDF](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf); [USF record](https://digitalcommons.usf.edu/psy_facpub/1766/)
- Karpicke & Roediger (2007): expanding retrieval practice helped short-term retention, but equally spaced retrieval gave better long-term retention — [WUSTL profile](https://profiles.wustl.edu/en/publications/expanding-retrieval-practice-promotes-short-term-retention-but-eq/); [PDF](https://Www.Gwern.net/doc/psychology/spaced-repetition/2007-karpicke.pdf)
- A meta-regression on retrieval-practice spacing found no significant difference between expanding and uniform schedules (g = 0.034). Author attribution is not confirmed from the snippet — [Springer, Educ Psych Rev s10648-020-09572-8](https://link.springer.com/10.1007/s10648-020-09572-8)
- Kang, Lindsey, Mozer & Pashler (2014) addressed expanding vs equal intervals in *Psychonomic Bulletin & Review*. Its findings were not retrieved — [PDF](https://home.cs.colorado.edu/~mozer/Research/Selected%20Publications/reprints/KangLindseyMozerPashler2014.pdf)
- Open Spaced Repetition SRS benchmark:
  - Data: about 10k Anki collections, about 350M evaluation reviews, time-series splits.
  - Metrics: log loss and RMSE(bins) for calibration, AUC for discrimination.
  - Results without same-day reviews: FSRS-6 log loss 0.3460, RMSE(bins) 0.0653, AUC 0.7034; FSRS-5 0.3561 / 0.0742 / 0.7010; FSRS-4.5 0.3625 / 0.0764 / 0.6891.
  - The current README does not list SM-2 alongside these.
  - [srs-benchmark GitHub](https://github.com/open-spaced-repetition/srs-benchmark)
- Secondary sources say FSRS predicts better than SM-2 for about 99.5% of users. They disagree on SM-2's log loss (0.354 vs 0.616), and note that SM-2 was never designed to output probabilities, so the comparison is somewhat artificial — [mindomax](https://www.mindomax.com/fsrs-vs-sm2-spaced-repetition-algorithm); [studycardsai](https://studycardsai.com/blog/spaced-repetition-statistics) (both vendor or secondary; low confidence)
- FSRS lets users set a "desired retention" target. The benchmark notes FSRS-7 adds penalties for problems at very high (97–99%) and low desired retention — [srs-benchmark GitHub](https://github.com/open-spaced-repetition/srs-benchmark)

### Inferences
- Use a model-based scheduler (FSRS via the open-source `ts-fsrs`/`fsrs-rs` libraries) for concept and definition flashcards, with a default desired retention around 0.85–0.90. Very high targets cost many more reviews. The specific target value is a design judgement, not a verified finding.
- For lesson-level review (not single cards), a simple rule is enough: revisit about 1 day, about 1 week, and about 1 month after first learning. This follows Cepeda's ridgeline and the Adesope 1–6 day lag. Do not build elaborate expanding schedules for their own sake.
- Self-paced learners skip reviews, so the scheduler must handle overdue items gracefully. FSRS models elapsed time explicitly.

### Gaps
- No primary-source SM-2 vs FSRS numbers were retrieved. Check the Anki manual's FSRS section and the srs-benchmark history for SM-2 rows.
- Cepeda 2006 (*Psych Bulletin* distributed practice meta-analysis, 839 assessments) was not retrieved, so its effect sizes are not reported here.
- Evidence for flashcard schedulers comes mainly from paired-associate and fact material. Scheduling for multi-step derivations and code skills is less studied.

---

## 3. Interleaving

### Takeaway
Interleaving gives a moderate benefit (g = 0.42) when learners must tell apart similar categories (for example, which formula or architecture applies). The benefit is smaller in maths (g = 0.34) and not significant for expository text. It helps discrimination, not first exposure.

### Cited Findings
- Brunmair & Richter (2019), *Psychological Bulletin* 145(11), 1029–1052, covered 59 studies, 238 effect sizes and 158 samples:
  - Overall g = 0.42; mathematical tasks g = 0.34; expository texts and tastes gave non-significant or ambiguous effects; painting styles g = 0.67.
  - Effects were larger when categories were similar to each other, items within a category were less similar, and the material was more complex.
  - [PubMed](https://pubmed.ncbi.nlm.nih.gov/31556629/); [author PDF](https://www.psychologie.uni-wuerzburg.de/fileadmin/06020400/2019/Brunmair_Richter_in_press__2019_META-ANALYSIS_OF_INTERLEAVED_LEARNING.pdf)
- Earlier conference versions of the same meta-analysis found no overall maths effect. The published version, with more studies, found the small significant g = 0.34 — [Frontiers corrigendum (PMC6813467)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6813467/)
- Dunlosky et al. (2013) rated interleaved practice "moderate utility". This is from my prior knowledge and the search snippet did not confirm it — [APS](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html)
- Kornell & Bjork (2008): interleaving painting styles improved classification of new paintings, yet nearly 80% of participants thought blocking was as good or better — [Bjork lab, Yan et al. 2016 PDF](https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/11/YanBjorkBjork2016.pdf)

### Inferences
- Block practice when a concept is first introduced. Interleave in review and quiz sets across lessons. Examples:
  - Mixing "which normalisation, LayerNorm or RMSNorm?", "which positional encoding?", "which loss?" items.
  - Mixing attention-variant identification (MHA/MQA/GQA) and tokenizer algorithms (BPE vs WordPiece vs Unigram).
- Interleave categories that are easily confused. Interleaving unrelated topics brings little benefit.
- Expect learners to rate interleaved sets as harder and "less effective". Explain why the platform does it.

### Gaps
- No direct evidence on interleaving for programming or ML-concept material was found.

---

## 4. Successive relearning

### Takeaway
Successive relearning means retrieving each item to a criterion, then doing so again in later sessions. It strongly improves retention of definitions and concepts. Evidence for procedural maths is thin, and the effect is partly confounded with extra exposure.

### Cited Findings
- One-week retention was 68% when items were correctly recalled once in each of three spaced sessions, vs 26% for three correct recalls in a single session (Rawson & Dunlosky 2022, *Current Directions in Psychological Science*, quoted secondarily) — [SAGE](https://journals.sagepub.com/doi/full/10.1177/09637214221100484); [Firth Substack](https://firth.substack.com/p/learning-and-re-learning)
- Rawson, Dunlosky & Sciartelli (2013) used course material with college students. The benefit held for higher- and lower-performing students — [RetrievalPractice.org](https://www.retrievalpractice.org/archive/2018/successive-relearning)
- Getting three correct recalls in the initial session beat one correct recall at one week, but this difference disappeared after three relearning sessions — [Efrat Furst summary](https://sites.google.com/view/efratfurst/successive-relearning)
- Caveats:
  - Successive relearning effects are confounded with exposure to the material.
  - The research base is limited and focused on vocabulary and definitions.
  - A Rawson, Dunlosky & Janes study questioned whether it extends to maths procedures.
  - [Higham et al. (Southampton eprint)](https://eprints.soton.ac.uk/449677/1/Higham_et_al._in_press_JEdPsych.pdf); [Springer s10648-023-09809-2](https://link.springer.com/article/10.1007/s10648-023-09809-2)

### Inferences
- For glossary and interview-style concept cards, require one correct recall per session across at least 3 spaced sessions. Do not count a concept as "mastered" after one good session.
- For maths and code procedures, use fresh problem variants on each relearning pass, not the same item.

### Gaps
- Outcome of the Rawson–Dunlosky–Janes maths study not retrieved.

---

## 5. Dunlosky et al. (2013) utility ratings

### Takeaway
High utility: practice testing and distributed practice. Moderate: elaborative interrogation, self-explanation, interleaved practice. Low: summarisation, highlighting, keyword mnemonic, imagery for text, rereading.

### Cited Findings
- Practice testing and distributed practice received the highest rating. Rereading and highlighting are what most students do, but they do not consistently improve performance. Summarisation and imagery for text were rated low but help some students on some tasks — [APS](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html); [Phys.org](https://phys.org/news/2013-01-strategies-grade-popular-ineffective.pdf)
- Donoghue & Hattie (2021) meta-analysed the same ten techniques and confirmed practice testing and distributed practice as the most effective — [Frontiers](https://www.frontiersin.org/articles/10.3389/feduc.2021.581216/pdf)

### Inferences
- Avoid features that encourage low-utility habits as the main activity: highlighters, "mark as read", and long passive re-reads. Replace "review this lesson" with "quiz yourself on this lesson".

### Gaps
- The moderate tier (elaborative interrogation, self-explanation, interleaving) and the keyword mnemonic in the low tier come from my prior knowledge of the paper. The retrieved snippets did not list them explicitly.
- Donoghue & Hattie's per-technique effect sizes were not retrieved.

---

## 6. Cognitive load theory and Mayer's multimedia principles

### Takeaway
For novices, worked examples (g ≈ 0.48) beat unguided problem solving, but the advantage reverses as expertise grows (expertise reversal). Pages mixing maths, diagrams, code and simulations should follow these principles:
- Remove extraneous material (coherence, d ≈ 0.86).
- Signal what matters (d ≈ 0.69).
- Segment into learner-paced chunks (d ≈ 0.67).
- Pre-teach key terms.
- Place labels and explanations next to what they describe, not in redundant parallel text.

### Cited Findings
- Barbieri et al. (2023) worked-examples meta-analysis, *Educational Psychology Review*:
  - Average g = 0.48 (robust variance estimation); a poster version gave g = 0.43 with I² = 94.46%.
  - Correct-only examples gave larger effects than incorrect or mixed examples.
  - Adding self-explanation prompts to worked examples moderated the effect negatively.
  - [Springer PDF](https://link.springer.com/content/pdf/10.1007/s10648-023-09745-1.pdf); [UDel poster](https://www.cehd.udel.edu/wp-content/uploads/2022/02/Worked-Examples-Meta-Poster_022722_SC.pdf)
- Expertise reversal (Kalyuga et al.; Kalyuga 2007 review): for more experienced learners, solving problems becomes better than studying worked examples. One 2025 paper notes that methodological variation has so far prevented a meta-analysis of this question — [Wikipedia: Worked-example effect](https://en.wikipedia.com/wiki/Worked-example_effect); [Springer s10648-025-10071-x](https://link.springer.com/article/10.1007/s10648-025-10071-x)
- Mayer's review table (Mayer 2021, reproduced in "The Future of Multimedia Learning"), using median Cohen's d:
  - coherence 0.86 (18/19 tests positive)
  - signalling 0.69 (15/16)
  - segmenting 0.67 (7/7)
  - [EdTech Books](https://edtechbooks.org/docx/10349)
- A different Mayer source (*J Computer Assisted Learning* abstract, as summarised) reports other values: coherence 0.70, signalling 0.46, redundancy 0.87, segmenting 0.70, pre-training 0.46, temporal contiguity 1.30. These numbers are inconsistent between publications, so treat them as approximate — [bib-bvb record](https://bvbvf1.bib-bvb.de/vufind/PrimoRecord/cdi_proquest_journals_1936208032)
- Redundancy principle: adding printed text to graphics plus narration does not help, especially in fast-paced lessons. Pre-training principle: people learn better when they already know the names and characteristics of the main concepts — [Mayer 2020 handout](https://ugc.futurelearn.com/uploads/files/7d/d6/7dd6188d-c343-4311-b064-ac98d2c95abc/Multimedia_Principles._R._E._Mayer__2020.pdf)
- Some multimedia principles are stronger for low-knowledge than for high-knowledge learners (boundary condition) — [JSU summary](https://iep.jsu.edu/online/faculty/MultimediaPrinciples_Summary.pdf); [Cambridge Handbook index](https://assets.cambridge.org/97813166/38088/index/9781316638088_index.pdf)
- Critique: one commentator argues Mayer's results show well-designed text works well and that narrated multimedia is not automatically better — [Reda Sadki](https://redasadki.me/2025/09/13/richard-mayers-research-on-multimedia-for-learning-actually-proves-text-works-better/) (blog opinion)

### Inferences
- **Maths:** show derivations as worked examples with step annotations placed next to the equation, not in a separate paragraph (spatial contiguity and split attention). Fade later steps: in the first example show all steps, in the next leave the last step blank, then the last two, and so on. Then move to full problems.
- **Code:** annotate code inline or with linked highlights (hover a line to highlight the matching diagram element or equation term), which is signalling. Avoid repeating the same content as prose, code comment and caption (redundancy).
- **Simulations:** introduce the variables and terms before the simulation (pre-training). Have the simulation start with one control exposed and add more later (segmenting). Let learners pace it themselves with step and next controls, not autoplay.
- **Coherence:** cut decorative "fun facts", tangential history and ornamental images from core lesson flow, or move them to optional asides.
- **Adaptivity:** offer a "skip to problems / I know this" path for experienced learners (expertise reversal). Ideally a short diagnostic quiz decides whether to show full worked examples or go straight to problems.

### Gaps
- Exact redundancy, spatial-contiguity and pre-training medians from Mayer's 2021 table were not retrieved; the EdTech Books page returned 403.
- The negative moderation of worked examples by self-explanation prompts in Barbieri conflicts with older work (e.g., Renkl) showing prompts help. I found no reconciliation; flag as contested.
- No direct evidence was found on interactive simulations specifically. For example, Moreno & Mayer's interactivity work and PhET research were not retrieved.

---

## 7. Desirable difficulties, generation, pretesting, productive failure vs explicit instruction

### Takeaway
Making learning effortful in specific ways helps, though learners feel it is less effective. The specific ways are retrieving, spacing, interleaving, generating, and attempting before being taught. Problem-solving-before-instruction (productive failure) has a large meta-analytic effect for conceptual understanding and transfer in older learners. For young learners and domain-general skills, explicit instruction first is better. Pretesting gives a small-to-moderate benefit.

### Cited Findings
- Sinha & Kapur (2021), *Review of Educational Research*: 53 studies, 166 comparisons of PS-I vs I-PS.
  - The bias-corrected effect favouring PS-I was g = 0.87.
  - High-fidelity productive-failure designs gave g = 0.37–0.58 (per secondary reporting; the combination with the 0.87 headline is not reconciled in snippets).
  - Moderators were grade level, intervention duration and study design. Effects favoured I-PS for grades 2–5 and domain-general skills.
  - [X-MOL listing](https://www.x-mol.com/paper/1406031499744456704); [OUCI record](https://ouci.dntb.gov.ua/works/4KnMgZq7)
- An earlier, smaller review (12 articles to 2015) gave an average effect of 0.43, 95% CI [0.19, 0.68] — [Frontiers in Education 2022](https://frontiersin.org/articles/10.3389/feduc.2022.956416/pdf)
- A comparative meta-analysis of preparatory approaches (problem solving vs sense-making before instruction) exists — [ETH Research Collection](https://www.research-collection.ethz.ch/entities/publication/087241d3-ca0e-469e-a7f3-df9c122e2585) (findings not retrieved)
- Pan & Sana (2021) compared pretesting (errorful generation) with posttesting (retrieval practice), including a meta-analysis — [PDF](https://sc-pan.github.io/pdf/PS_2021.pdf). A 2023 review reports a pretesting advantage of d ≈ 0.30 over retrieval practice in some comparison; the exact context is unverified — [PR 2023 PDF](https://sc-pan.github.io/pdf/PR_2023.pdf)
- Pretesting effects persist, smaller, when feedback is delayed 24–48 h — [Springer, Psych Research 2024](https://link.springer.com/article/10.1007/s00426-024-02042-8)
- A 2025 study found that task complexity shapes the benefit of "struggle first, then prompt" with GenAI-assisted pretesting. This is a single study and preprint-level evidence — [arXiv 2504.10249](https://arxiv.org/pdf/2504.10249)
- Desirable-difficulty work by Bjork's lab: learners' beliefs (e.g., blocking > interleaving) persist even after testing and are hard to correct — [Yan, Bjork & Bjork 2016 PDF](https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/11/YanBjorkBjork2016.pdf)

### Inferences
- Use **pretest prompts** at the start of lessons ("Before reading: why might dividing by √d_k matter in attention? Guess."). They are cheap and evidence-backed, and wrong guesses are fine if feedback follows.
- Use **productive-failure-style openers** for conceptual lessons where learners have enough prior knowledge to generate attempts. Examples: "Design a way to turn text into integers" before BPE; "How would you make attention not look at the future?" before causal masking. Then give explicit instruction that contrasts learner attempts with the canonical solution. Keep these short and low-stakes.
- **Novices and procedural content:** explicit instruction and worked examples first. The CLT and productive-failure literatures agree that prior knowledge and the type of goal (procedural fluency vs conceptual transfer) decide which order is better. This is consistent with the Sinha & Kapur moderators and with expertise reversal.
- Contested: CLT researchers (Sweller, Kirschner et al.) and productive-failure researchers disagree on minimally guided instruction. Present this as a design choice that depends on context, not a settled rule.

### Gaps
- No exact pooled pretesting effect size was retrieved (e.g., the Pan & Sana meta-analytic g).
- The generation-effect meta-analysis (Bertsch et al. 2007, d ≈ 0.40 from memory) was not retrieved.
- The relationship between the 0.87 and the 0.37–0.58 figures in Sinha & Kapur needs checking against the paper.

---

## 8. Elaboration, self-explanation, concrete examples, analogies

### Takeaway
Self-explanation prompts have a medium meta-analytic effect (g = 0.55) and are well suited to maths and code. Elaborative interrogation ("why is this true?") is rated moderate utility. Concrete examples and analogies are widely recommended, but I did not find meta-analytic effect sizes for them in this pass.

### Cited Findings
- Bisra, Liu, Nesbit, Salimi & Winne (2018), *Educational Psychology Review*: 69 effect sizes from 64 reports, about 6,000 participants, overall random-effects g = 0.55 (medium).
  - Generic prompts beat specific prompts and no prompts (from the thesis version).
  - Prompt-type moderators: interrogative g = 0.56, imperative g = 0.40.
  - Most participants were undergraduates.
  - [Gwern-hosted PDF](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf); [TUM Clearinghouse review](https://www.clearinghouse.edu.tum.de/wp-content/uploads/2023/09/CHU-KR-25_ENG_Bisra_2018_Selbsterklaerungen.pdf); [BPS Research Digest](https://www.bps.org.uk/research-digest/self-explanation-powerful-learning-technique-according-meta-analysis-64-studies)
- Worked examples plus self-explanation prompts showed a negative moderation in Barbieri et al. (2023), which conflicts with Bisra — [Springer PDF](https://link.springer.com/content/pdf/10.1007/s10648-023-09745-1.pdf)

### Inferences
- After a derivation or code block, add a short generic prompt: "Explain in one sentence why this step follows" or "What would break if we removed the residual connection?". Collect free text, then show an expert explanation to compare against. An LLM tutor could give feedback, but that is an untested design idea.
- Keep prompts light when they accompany worked examples, so the extra load does not overwhelm novices (Barbieri moderator).
- Pair every abstract concept with at least two different concrete examples (e.g., attention over a toy sentence and over a code snippet) to support transfer. This follows recommendations by the Learning Scientists and Make It Stick, which were not verified in this pass.

### Gaps
- No meta-analytic effect sizes were retrieved for concrete examples, analogies (e.g., Alfieri et al. 2013 on case comparison), or elaborative interrogation specifically.
- Chi's original self-explanation studies were not retrieved directly.

---

## 9. Metacognition: illusions of competence, judgments of learning, calibration

### Takeaway
Learners routinely misjudge their learning. Fluent, easy experiences feel effective, while effortful, effective ones feel worse. A platform therefore cannot rely on self-reported confidence or "feels clear" signals. It should show learners objective retrieval results and calibration feedback.

### Cited Findings
- Deslauriers et al. (2019), *PNAS* 116(39), 19251–19257: in a randomised physics comparison with identical content, students in active-learning classes learned more but rated their own learning lower. The gap was partly due to the greater cognitive effort. A fluent "superstar lecturer" could make students prefer the weaker method — [PDF](https://openlab.citytech.cuny.edu/gamelab/files/2023/01/Deslauriersa-et-al-2019.pdf)
- Kornell & Bjork (2008): nearly 80% judged blocking as good as or better than interleaving, despite the opposite result. The misjudgment persists after testing and is hard to correct (Yan et al. 2016) — [Yan, Bjork & Bjork 2016](https://sites.lifesci.ucla.edu/psych-bjorklab/wp-content/uploads/sites/13/2016/11/YanBjorkBjork2016.pdf)
- Learners make poor learning judgments based on perceived effort and familiarity, and metacognitive illusions in judgments of learning resist both cognitive and metacognitive feedback — [Springer s10648-023-09797-3](https://link.springer.com/10.1007/s10648-023-09797-3); [Mannheim PDF](https://madoc.bib.uni-mannheim.de/72174/1/Mending%20metacognitive%20illusions%20in%20JOLs%20when%20neither%20cognitive%20nor%20metacognitive%20feedback%20is%20effective.pdf)

### Inferences
- Base "mastery" and progress indicators on performance in delayed retrieval, not on page completion or time spent.
- **Confidence-based assessment:** ask "How sure are you?" before revealing an answer, then show a personal calibration chart (confidence vs accuracy). Treat confident errors as top-priority review items. The value of confidence ratings for calibration training is an inference; I did not verify a meta-analysis here.
- Tell learners up front, briefly: "This will feel harder than re-reading; that is the point." This can reduce drop-off from desirable difficulties, though the research above suggests beliefs are hard to change.
- Avoid "I understand this" self-check buttons as gates.

### Gaps
- No meta-analysis of confidence-based marking or calibration training effects was retrieved.
- No evidence was retrieved on whether showing calibration dashboards improves later study choices in self-paced online settings.

---

## 10. Learning styles (to rule out)

### Takeaway
Matching instruction to self-reported "visual/auditory/kinesthetic" styles (the meshing hypothesis) has no adequate evidence base. The platform should not personalise by learning style. It should use multiple representations for everyone, because the content needs them.

### Cited Findings
- Pashler, McDaniel, Rohrer & Bjork (2008), *Psychological Science in the Public Interest*:
  - Very few studies used a design that could test meshing; a valid test needs a crossover (disordinal) interaction.
  - Several that did contradicted it.
  - There is "no adequate evidence base to justify incorporating learning-styles assessments into general educational practice".
  - They caution that not every possible style theory has been tested.
  - [USF record](https://digitalcommons.usf.edu/psy_facpub/1765/); [APS](https://www.psychologicalscience.org/?p=35318)

### Inferences
- No style quiz and no "visual learner mode". Pair representations according to the content (equation plus diagram plus code), in line with Mayer's multimedia and dual-coding principles, for all learners.
- Personalise only on prior knowledge and performance (expertise reversal), which does have evidence.

### Gaps
- Later direct tests (e.g., Rogowsky et al. 2015) were not retrieved in this pass.

---

## Cross-cutting design implications (synthesis for the platform)

Inferences drawn from the findings above:

1. **Lesson loop:** pretest question, then a short explicit segment (worked example with integrated annotations), then a faded example, then an independent problem or self-explanation prompt, then an end-of-lesson retrieval quiz with feedback.
2. **Cross-lesson loop:** an FSRS-scheduled review queue of concept and formula cards plus interleaved mixed-problem sets drawn from earlier modules. Lesson-level revisits at about 1 day, 1 week and 1 month. Mastery needs correct recall in 3 separate sessions.
3. **Adaptivity:** a diagnostic at module start decides between worked-example-heavy and problem-first paths. Productive-failure openers suit conceptual lessons for learners with prerequisites. Novices get explicit instruction first.
4. **Page design for maths, code and simulations:** remove ornament (coherence); highlight what to attend to and link it across representations (signalling); keep explanations next to what they explain (contiguity, avoiding split attention); no duplicate narration plus text (redundancy); learner-paced steps (segmenting); key terms first (pre-training).
5. **Metacognition:** confidence ratings before answer reveal, calibration feedback, and mastery based on delayed performance. Explain desirable difficulties to learners.
6. **Don'ts:** no learning-styles personalisation; no highlighting or re-reading as the main study mode; no completion-based "mastery".
