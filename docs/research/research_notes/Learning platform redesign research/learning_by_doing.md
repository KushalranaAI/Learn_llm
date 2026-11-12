# Learning by Doing and Motivation Design in Technical Self-Learning Platforms

Scope: how platforms make learners do, experiment and build, and how they keep them motivated. The aim is to inform Learn LLM, which is free, local-first, has no accounts, stores progress in localStorage, and already has simulations, quizzes, labs (predict, then compute by hand, then meet goals in a sim) and PyTorch code that runs locally or in Colab.

Research budget note: this pass used about 18 search and fetch calls. Several platform-specific questions (Brilliant, Scrimba, Exercism, Boot.dev, Codecademy, Kaggle Learn, Hugging Face course) were not researched from primary sources. They are listed under Gaps rather than filled in from memory.

## 1. Interactive exercise types and their evidence (explorables, live code, build-along). What works for ML and maths-heavy topics?

### Takeaway
Interactivity on its own has weak and mostly untested evidence. What has evidence is active engagement around the interaction: predicting before observing, explaining, and building working artefacts. The "build a complete working thing first, then peel back layers" style (fast.ai) and the "build it from scratch in code" style (Karpathy) are widely used for ML, but their support comes from practitioner reasoning, not controlled studies.

### Cited Findings
- Interactive articles (explorables) are a synthesis-of-theory format, not an experimentally validated one. Hohman, Conlen, Heer and Chau's Distill paper (2020, doi 10.23915/distill.00028) draws on HCI, multimedia learning, infovis and journalism and lists five affordances: connecting people and data, making systems playful, promoting self-reflection, personalizing reading, and reducing cognitive load. — [Distill: Communicating with Interactive Articles](https://distill.pub/2020/communicating-with-interactive-articles/); affordance list summarised in [UW CSE442 lecture](https://courses.cs.washington.edu/courses/cse442/22wi/lectures/CSE442-Narrative.pdf)
- Conlen, Kale and Heer (EuroVis 2019) note that the effectiveness of interactive articles "at engaging readers and communicating a message has not been widely studied with real-world audiences." — [UW IDL: Idyll analytics paper](https://idl.uw.edu/papers/idyll-analytics)
- Hohman et al. note that building a successful interactive article "is closer to building a website than writing a blog post", so the authoring cost is high. — cited in [Evaluating Authoring Tools with the Explorable Authoring Requirements (arXiv 2403.17714)](https://arxiv.org/pdf/2403.17714)
- Distill is on indefinite hiatus. — [UW IDL Living Papers](https://idl.uw.edu/living-papers-paper/living-papers/index.pdf)
- A 2025 controlled study (n=605) of interactive AI-literacy simulations covering fairness, dataset representativeness and bias in language models found conceptual improvement and broader generalization in the explorable conditions, but control conditions also showed learning gains. The added value of interactivity was therefore modest or unclear. — [Thinking Like a Scientist: Can Interactive Simulations Foster Critical AI Literacy? (arXiv 2507.21090)](https://arxiv.org/pdf/2507.21090)
- A small between-subjects study (n=37) compared an interactive deep-learning environment for RNNs (exploRNN) with text-based learning on learning outcomes and cognitive load. It is directly relevant to ML topics, but the sample is small. — [Springer, The Visual Computer 2022](https://link.springer.com/article/10.1007/s00371-022-02593-0)
- fast.ai deliberately teaches "top down": first show how to do something with a complete working state-of-the-art network, then repeat it later with all the detail. The team says it chose this after studying research on effective education. — [fast.ai course18 About](https://course18.fast.ai/about.html); [Rachel Thomas, fast.ai teaching philosophy (2016)](https://rachel.fast.ai/posts/2016-10-08-teaching-philosophy/)
- Reviewers report that top-down works for some learners and frustrates others. — [Hackernoon: how not to do fast.ai](https://hackernoon.com/how-not-to-do-fast-ai-or-any-ml-mooc-3d34a7e0ab8c); [Machine Learning Mastery review](https://machinelearningmastery.com/practical-deep-learning-for-coders-review/)
- Karpathy's "Neural Networks: Zero to Hero" builds networks from scratch in code, "starting from backpropagation and building up to modern deep neural networks, like GPT". The micrograd lecture links an exercise hosted as a Google Colab, and the makemore series moves from bigram to MLP to attention. — [karpathy.ai/zero-to-hero](https://karpathy.ai/zero-to-hero.html); [GitHub karpathy/nn-zero-to-hero](https://github.com/karpathy/nn-zero-to-hero)
- A community ecosystem formed around Zero to Hero: learners publish their own per-lecture notebooks with Colab links and exercise solutions. Learners turn a build-along course into personal portfolio artefacts on their own. — [anubhavmaity NeuralNetworks-Zero-To-Hero](https://anubhavmaity.github.io/NeuralNetworks-Zero-To-Hero); [ryankillian/karpathy-lectures-notebooks](https://github.com/ryankillian/karpathy-lectures-notebooks)
- In-browser Python is mature enough for numeric teaching. Pyodide runs NumPy's compiled C extensions as WebAssembly. A Zonca (2026) report says the full Software Carpentry Python Novice curriculum (NumPy, Matplotlib, Pandas) runs in JupyterLite with no server. — [Zonca: JupyterLite, no server needed](https://www.zonca.dev/posts/2026-05-18-jupyterlite-no-server-needed)
- Courses already ship this way. "Learn Python for Engineers" teaches a NumPy chapter through JupyterLite and Pyodide, and py-edu-fr uses JupyterLite for its first lessons. — [TeachBooks/learn-python](https://github.com/TeachBooks/learn-python); [py-edu-fr Python for science](https://py-edu-fr.pages.heptapod.net/py-edu-fr-science)
- Limitation: JupyterLite cannot upgrade or downgrade preinstalled packages unless they are pure Python, so pinning versions can fail. — [Skills Network: JupyterLite overview](https://author.skills.network/docs/labs/tools/jupyterlite/overview)
- PyData and EuroSciPy talks name education as a core JupyterLite use case because learners get a computing environment without installing anything. — [PyData Global 2021 talk](https://pydata.org/global2021/schedule/presentation/113/jupyterlite-jupyter-webassembly-python); [EuroSciPy 2022](https://pretalx.com/euroscipy-2022/talk/SYA7GA/)

### Inferences
- For Learn LLM, the existing sims are worth keeping, but the evidence says their value depends on the activity wrapped around them (prediction, explanation, goals), not on the sliders. That favours the current "predict, then compute, then meet goals" lab structure over free-play sims.
- For an ML curriculum, a reasonable hybrid is: a top-down "see the whole thing working" moment early (fast.ai), then from-scratch builds of each component (Karpathy), with sims as the bridge between the two.
- Pyodide or JupyterLite could run small NumPy exercises in the browser, such as tokenizer counting, softmax, attention on tiny matrices, or a bigram model, with no server, which fits the local-first constraint. Full PyTorch is not available in Pyodide (not verified here), so heavy training would stay in Colab or local runs.

### Gaps
- Brilliant, Scrimba, Exercism, Boot.dev, Codecademy, Kaggle Learn and Hugging Face course notebooks were not researched from primary sources in this pass. I found no independent learning-outcome evidence for any of these platforms; their claims are mostly marketing.
- I found no controlled study isolating the learning effect of the Bret Victor or Nicky Case style of explorable.
- Whether PyTorch, or a usable subset, runs under Pyodide was not checked.

## 2. Predict-then-observe, parameter sweeps, challenges, debugging, Parsons problems, fill-in-the-blank, faded worked examples, projects

### Takeaway
Prediction prompts have the strongest and cheapest evidence. Watching a demo passively teaches about as much as not seeing it, while predicting first gives significantly more understanding. Parsons problems give similar learning in less time than writing code from scratch. Subgoal-labelled worked examples help, especially for struggling learners.

### Cited Findings
- Crouch, Fagen, Callan and Mazur (2004, American Journal of Physics) ran seven demos across Harvard intro physics sections under different modes. Students who only watched a demo and heard the explanation showed no greater understanding at semester's end than students who never saw it. Students who predicted the outcome first showed significantly greater understanding. — [Swarthmore repository](https://works.swarthmore.edu/fac-physics/203); [full text via CORE](https://core.ac.uk/download/76218714.pdf)
- Even in the predict and discuss modes, fully correct explanations stayed modest (about 30% and 32%). A single demonstration has limited effect, so repetition and follow-up matter. — [CORE full text](https://core.ac.uk/download/76218714.pdf)
- Students rate demonstrations among the most interesting parts of a course, but enjoyment did not equal learning. — [Mazur group page](https://mazur.harvard.edu/presentations/classroom-demonstrations-learning-tools-or-entertainment)
- Ericson, Margulieux and Rick (2017) found Parsons problems faster to solve than fixing or writing code, with similar learning gains. In a follow-up experiment, the Parsons and adaptive Parsons groups learned the most. This is reported through secondary summaries; I did not check the primary paper. — [escholarship summary](https://escholarship.org/content/qt8794g5s0/qt8794g5s0.pdf?t=qbddoc); [Adaptive Parsons problems (bibsonomy)](https://www.bibsonomy.org/bibtex/2b2617611446ed22e870de6f4d75f9ab8/brusilovsky)
- Hou, Ericson and Wang (2023) ran a study with 89 undergraduates. Parsons problems used as on-demand scaffolding raised practice performance and efficiency compared with unaided code writing, and posttest scores were the same. A later study (n=81) found time savings but no significant pre/post learning gain in either condition. — [NSF PAR 10510497](https://par.nsf.gov/servlets/purl/10510497); [NSF PAR 10510493](https://par.nsf.gov/servlets/purl/10510493)
- "Proof Blocks", the Parsons-style idea applied to maths proofs, were studied for efficiency against writing proofs. This is relevant to maths-heavy content such as deriving gradients. — [arXiv 2211.09609](https://arxiv.org/pdf/2211.09609)
- Subgoal labels are short explanations naming the function of each step in a worked example. In a semester-long CS1 study they improved early assessment performance and helped most for students at risk of failing or dropping out. — [Margulieux, Morrison & Decker, IJ STEM Education 2020 (DOAJ)](https://doaj.org/article/9a2c85d66fd54ec9ab019e9a510bbf17); [NSF PAR 10099373](https://par.nsf.gov/servlets/purl/10099373)
- Pooled data from three studies show a stable effect size for subgoal labels in programming, and the materials have been extended to Python CS1 (ICER 2022). — [Raspberry Pi Foundation seminar paper](https://www.raspberrypi.org/app/uploads/2020/07/Using-subgoal-labels-to-reduce-cognitive-load-in-introductory-programming.pdf); [NSF PAR 10336481](https://par.nsf.gov/servlets/purl/10336481)

### Inferences
- Learn LLM should make "predict before you move the slider" mandatory and recorded, with a one-tap prediction stored in localStorage and shown back after the reveal. This is the cheapest evidence-backed upgrade, and the "predict" step in the labs already follows it.
- Parameter-sweep sims should be framed as experiments: "predict the curve shape, then sweep." Free-play alone risks the "entertainment" outcome Crouch et al. measured.
- Parsons problems work well for PyTorch code, for example ordering the lines of a training loop or an attention forward pass. They are cheap to build client-side with drag-and-drop and need no code execution.
- Subgoal-labelled worked code with comment headers like "# 1. compute scores", "# 2. scale", "# 3. mask", "# 4. softmax" can be faded across lessons. First show the full solution, then blank out a step, then give only the labels.
- "Find the bug" exercises (for example a missing `zero_grad()`, a wrong softmax axis, or causal-mask leakage) fit ML naturally, but I found no direct evidence for them (see Gaps).

### Gaps
- I did not find a meta-analysis of predict-observe-explain (POE) beyond Crouch et al.
- I found no ML-specific study of faded worked examples or debugging exercises. The faded worked-example literature (Renkl, Atkinson) was not retrieved in this pass.
- I found no evidence on capstones or portfolios in self-paced platforms.

## 3. Bridging in-browser learning and real environments (Colab, local)

### Takeaway
The dominant pattern, seen in Karpathy's course and community notebook repos, is per-lesson notebooks with Colab links that sit next to the lecture or article. JupyterLite now allows a zero-install, server-free first step in the browser before moving to Colab or local runs for heavier work.

### Cited Findings
- The Zero to Hero micrograd lecture links its exercise as a hosted Google Colab, and community repos publish one notebook per lecture with Colab links for notes and exercises. — [karpathy/nn-zero-to-hero](https://github.com/karpathy/nn-zero-to-hero); [anubhavmaity Zero-To-Hero](https://anubhavmaity.github.io/NeuralNetworks-Zero-To-Hero)
- JupyterLite removes the server and install step for NumPy, Matplotlib and Pandas level teaching. — [Zonca 2026](https://www.zonca.dev/posts/2026-05-18-jupyterlite-no-server-needed)

### Inferences
- A local-first way to verify that a learner's local or Colab run worked is a checkpoint value. The notebook prints a deterministic value under a fixed seed, such as the loss at step 100 rounded, a tensor hash, or the 5th generated token. The learner pastes it into the lesson, and the browser compares it against the expected value or range. This needs no server and is my own design suggestion, not a sourced practice.
- A three-tier "where to run" ladder could work: (1) a sim in the page, (2) a NumPy cell in the page via Pyodide, (3) "Open in Colab" or a local PyTorch notebook, with a checkpoint to paste back.

### Gaps
- I did not research Hugging Face course notebooks, Kaggle Learn's in-kernel exercise checker (learntools), or the mechanics of the "Open in Colab" badge, and found no evidence on whether checkpoint verification improves completion.

## 4. Motivation and gamification: streaks, XP, badges, goals, SDT, negative effects, Duolingo

### Takeaway
Gamification gives small-to-medium average gains, but specific elements have specific effects. Badges, progress graphs and similar feedback support the feeling of competence; social elements support relatedness. Reward-heavy designs can undermine intrinsic motivation. Duolingo's own data show streaks and streak freezes help retention, but these are company-reported, mostly small, and depend on loss aversion. For a solo platform without social features, competence feedback and flexible, forgiving goals are the safest tools.

### Cited Findings
- Sailer and Homner's meta-analysis (Educational Psychology Review, 2020, online 2019) found small positive effects of gamification: cognitive g = 0.49, motivational g = 0.36, behavioural g = 0.25. The cognitive effect held in a subsplit of high-rigour studies. Game fiction and social interaction moderated behavioural outcomes. — [Uni Augsburg OPUS](https://opus.bibliothek.uni-augsburg.de/opus4/frontdoor/index/index/docId/109056); [PDF](https://opus.bibliothek.uni-augsburg.de/opus4/files/109056/109056.pdf)
- Other meta-analyses report widely varying effect sizes, from g ≈ 0.46 to d = 1.12 in a 2026 higher-education meta-analysis. The estimates depend heavily on what each study includes, so treat large numbers with caution. — [SAGE Open 2026](https://journals.sagepub.com/doi/10.1177/21582440261421375)
- Sailer, Hense, Mayr and Mandl (2017) ran an RCT framed by Self-Determination Theory. Badges, leaderboards and performance graphs improved competence need satisfaction and perceived task meaningfulness. Avatars, meaningful stories and teammates improved social relatedness. The authors conclude that "gamification is not effective per se", because different elements have different psychological effects. — [Uni Augsburg PDF](https://opus.bibliothek.uni-augsburg.de/opus4/files/109059/109059.pdf); [UZH reference](https://www.gbl.uzh.ch/quartz/references/Sailer-et-al.-(2017))
- Hanus and Fox (2015, Computers & Education 80) ran a 16-week study with 71 students. The gamified course, with a leaderboard and badges, showed declining motivation, satisfaction and empowerment, and lower final exam scores than the non-gamified course. The effect on exam scores ran through intrinsic motivation. Badges were bundled with the leaderboard, so their effect cannot be isolated. — [dblp record](https://dblp.org/rec/journals/ce/HanusF15); [summary](https://ai.updf.com/paper-detail/assessing-the-effects-of-gamification-in-the-classroom-a-longitudinal-hanus-fox-dff76a9862467d426113ec530f83942016ae3a97)
- Deci, Koestner and Ryan's 1999 meta-analysis of 128 experiments found that tangible rewards substantially undermine intrinsic motivation, which supports cognitive evaluation theory (the overjustification effect). The finding is still contested, notably by Cameron and Pierce. — [Deci, Koestner & Ryan 1999 PDF](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf); [2001 follow-up](https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf)
- Duolingo company data: learners reaching a 7-day streak are "3.6 times more likely to complete their course". Over 6 million people are on streaks of 7+ days. A new streak-milestone animation raised 7-day retention of new learners by +1.7%. Allowing up to two equipped Streak Freezes increased daily active learners by +0.38%. — [Duolingo blog: How the streak builds habit (2022)](https://blog.duolingo.com/how-duolingo-streak-builds-habit)
- Duolingo company data: reaching a 7-day streak makes learners 2.4 times more likely to come back the next day. Duolingo decoupled the streak from the daily goal so that any lesson extends it. After this, fewer learners hit daily goals but more built daily habits and total learning time went up. — [Duolingo: Improving the streak](https://blog.duolingo.com/improving-the-streak); [Making Duolingo: how streaks keep learners committed](https://making.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)
- The "3.6x / 2.4x more likely" figures are correlational. Committed learners self-select into long streaks, so they do not show that streaks cause completion. The +1.7% and +0.38% figures come from A/B tests and are causal but small. — inference from [Duolingo blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit)
- Duolingo's notification system uses a "sleeping, recovering" multi-armed bandit (Yancey & Settles, KDD 2020) to pick reminder templates. It handles novelty effects, where new messages look better than they are, and templates that apply only to some learners. — [Yancey & Settles KDD 2020 PDF](https://research.Duolingo.com/papers/yancey.kdd20.pdf); [Duolingo blog: Hi, it's Duo](https://blog.duolingo.com/hi-its-duo-the-ai-behind-the-meme/)
- Duolingo notifications reportedly lean on loss framing (from a WSJ summary). — [Gigazine summary](https://gigazine.net/gsc_news/en/20240618-duolingo-app-streaks)
- A claimed +14% Day-7 retention lift from the "Streak Wager" appears only in secondary sources and is unverified. — [Taplytics](https://taplytics.com/blog/how-duolingo-ran-an-experiment-on-their-streaks-feature)
- Streak anxiety is described by commentators rather than measured: the streak shifts from achievement to something to defend through loss avoidance, and "streaks can become the point and the learning fades". — [Yu-kai Chou](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/); [UX Magazine](https://uxmag.com/articles/the-psychology-of-hot-streak-game-design)

### Inferences
- For a solo, no-accounts platform, the SDT mapping suggests:
  - **Competence:** progress graphs, mastery maps per module, "you predicted correctly X of Y", and visible skill unlocks. These are the elements Sailer et al. (2017) link to competence and meaningfulness.
  - **Autonomy:** non-linear paths, optional challenge modes, and learner-set weekly goals rather than imposed daily ones.
  - **Relatedness:** this is the hardest need to meet without social features. Weak substitutes include narrative framing (a "you are building a GPT" storyline) and pointers to external communities.
- Avoid leaderboards, which need a server and carry Hanus and Fox's risk, and avoid points or XP as the main reward (the overjustification risk). If streaks are used, make them weekly or flexible, include built-in freezes, and decouple them from fixed daily quotas. Duolingo's own data favour flexibility, and a solo learner of a hard technical topic cannot practise daily the way a language learner can.
- Do not use loss-framed notifications. A web app without accounts cannot send reliable push notifications anyway.
- Treat progress in localStorage as the learner's own artefact: provide export and import of progress JSON so a lost browser profile does not wipe a streak or record, which would be demotivating.

### Gaps
- I found no peer-reviewed study of streak anxiety or of streaks in adult self-directed technical learning.
- I found no evidence specific to adult self-learners in technical subjects without social features.
- Duolingo's figures are company-reported and not independently replicated.

## 5. Feedback design: immediate vs delayed, hint ladders, explanations of wrong answers, confidence ratings

### Takeaway
The timing evidence is mixed. Immediate feedback tends to help retention and novices; delayed feedback may help transfer. Hints on demand beat proactive hints, but learners abuse bottom-out hints, so ladders need friction. Asking for confidence before revealing the answer exploits the hypercorrection effect: confidently wrong answers are the ones most likely to be corrected after feedback.

### Cited Findings
- A substantial body of research finds no difference between immediate and delayed feedback, and some newer studies favour delay. A 2023 study (Ryan et al.) found no timing effect on near or far transfer. — [Leiden repository (feedback timing)](https://scholarlypublications.universiteitleiden.nl/access/item%3A2983255/view); [Papers Podcast #38](https://paperspodcast.ki.se/38-feedback-one-more-time38)
- Immediate feedback is linked to retention and delayed feedback to transfer. Low-prior-knowledge learners may benefit more from immediate feedback, but this is a hypothesis, not a settled finding. — [UWorld research paper (commercial source)](https://collegereadiness.uworld.com/wp-content/uploads/2024/11/UWorld-College-Readiness-Research-Paper.pdf)
- Shute's 2008 review notes that about a third of studies in two seminal feedback meta-analyses found negative effects of feedback on learning, so feedback design matters, not just its presence. — reported via [Leiden repository](https://scholarlypublications.universiteitleiden.nl/access/item%3A3185633/view)
- Swart, Nielen and Sikkema-de Jong (2019, Educational Research Review 28, 100296) is a meta-analysis on the timing and content of feedback in learning from text. — [Leiden repository](https://scholarlypublications.universiteitleiden.nl/access/item%3A2983255/view)
- Razzaq and Heffernan (2010): students learned significantly more with hints on demand than with proactive hints. — [WPI PDF](https://web.cs.wpi.edu/~nth/pubs_and_grants/papers/2010/ITS/Razzaq%20Hints%20Is%20It%20Better%20to%20Give%20or%20Wait.pdf)
- "Gaming the system" means learners click rapidly through hint sequences to reach the bottom-out hint that gives the answer. In one Aleven observation, unproductive help-seeking was 72% of student actions. Countermeasures include removing bottom-out hints or adding a time delay before them. — [LearnLab: Help abuse](https://learnlab.org/research/wiki/index.php/Help_abuse); [Baker: Gaming the System retrospective](https://learninganalytics.upenn.edu/ryanbaker/PSCS-gaming-v6.pdf)
- Bottom-out hints may still help when learners use them as worked examples. One algebra tutoring study found that hint type (high-level vs bottom-out) did not affect learning. — [LearnLab: Help abuse](https://learnlab.org/research/wiki/index.php/Help_abuse)
- Hypercorrection effect (Butterfield & Metcalfe, 2001): high-confidence errors are more likely to be corrected after feedback than low-confidence errors, probably because learners pay more attention to the surprise. Corrections persisted a week later in one study. Butler, Fazio and Marsh found these errors also come back if the correct answer is forgotten. — [PMC 3079415](https://pmc.ncbi.nlm.nih.gov/articles/PMC3079415); [Duke: Understanding the Hypercorrection Effect](https://dukespace.lib.duke.edu/items/d6ab09ca-f55c-4efb-9d32-2788bc5838b2)

### Inferences
- Quizzes and predictions: ask for a confidence rating (e.g. "sure / think so / guessing") before revealing the answer. Highlight confidently wrong answers with an explanation and a short "why this misconception is tempting" note, and requeue them for spaced review stored in localStorage, since Butler et al. show they can come back.
- Explain every wrong option in multiple-choice questions. This is cheap to author and targets misconceptions directly.
- Give immediate feedback for procedural checks (hand computations, code checkers). For conceptual sims, consider delayed or summary feedback ("review your predictions") to encourage transfer.
- Hint ladder: concept nudge, then pointer to the relevant step or formula, then a partially worked step, then the full solution. Add light friction before the last rung (a "try once more" prompt or a short delay) and record hint use locally so the learner can see it, not to penalise them.

### Gaps
- I found no study of confidence ratings or hint ladders inside ML or maths self-learning platforms.
- Khan Academy's hint design and its published research were not retrieved in this pass.
