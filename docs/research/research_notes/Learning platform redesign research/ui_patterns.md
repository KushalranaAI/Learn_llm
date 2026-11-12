# UI/UX patterns of leading learning-path platforms and showcase learning-platform designs (for the "Learn LLM" redesign)

Scope note: about 20 search and fetch calls. Primary sources were reachable for Duolingo, Khan Academy, Exercism, Codecademy and ustwo (Brilliant), plus several secondary write-ups. roadmap.sh's DeepWiki page returned HTTP 429. Awwwards, Dribbble, Behance and Mobbin gave almost nothing useful through search. Where a point comes from general product knowledge rather than a fetched source, it is listed under Inferences or Gaps, not under Cited Findings.

## How products show the roadmap / skill map / course map (layout, node content, states, prerequisites)

### Takeaway
Three layout families dominate.
1. **Single linear path** (Duolingo since 2022): units with headers, nodes that are binary or near-binary, and review steps placed on the path itself.
2. **Prerequisite graph or concept map** (Exercism, Khan-style skill tree, roadmap.sh): nodes styled by a small fixed set of states (locked / available / complete / mastered, or done / learning / skipped).
3. **Hierarchical syllabus** (Codecademy, Boot.dev): path, then modules/units, then lessons and projects, as expandable lists.

The best-documented state model is Exercism's four node states. Khan's five-level skill mastery scale is a good model for "needs review", because levels can go down as well as up.

### Cited Findings
**Duolingo path (announced May 2022, launched to all learners Nov 1, 2022)**
- Each circle on the path is one level of a skill. Tapping a circle opens a popup that describes the lesson topic. Completed levels turn gold and can be replayed. Uncompleted ones are grey "pebbles" — [Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design)
- Lessons are grouped into small units. Each unit header names the new concepts, and each unit has a guidebook (tips) in its top-right corner — [Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design)
- Practice and review sessions are placed on the path itself (spaced repetition, a "waterfall" mix of new and review), so the learner never has to go back to old skills. Stories (book icon) and end-of-unit "Legendary" challenges are special node types — [Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design)
- A floating arrow button in the bottom right returns the learner to their current position after scrolling away — [Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design)
- The path replaced the tree, which let learners choose their next lesson. With the path, the learner can no longer choose which new lesson comes next — [NBC News](https://www.nbcnews.com/tech/tech-news/duolingos-update-redesign-luis-von-ahn-interview-rcna44655)
- Duolingo's VP of design called the redesign a "complete reboot of our product strategy". It shipped together with character animations — [Behind the Design: Duolingo (via search snippet)](https://blog.progressiverobot.co.uk/behind-the-design-duolingo)
- A product manager said the redesign came from users asking for more guidance and less complexity (search-result snippet) — [Yahoo/UK coverage](https://uk.finance.yahoo.com/news/duolingo-language-learning-app-undergoes-135344395.html)

**Exercism (v3 tracks: concept exercises plus practice exercises)**
- The concept map is a directed graph. Each concept is a node, and the edges come from the prerequisites declared by each concept exercise. The map runs from simple to complex — [Exercism docs: concept map](https://exercism.org/docs/building/tracks/concept-map)
- Node states, shown through node styling:
  - **Mastered:** the learning exercise and all practice exercises are done.
  - **Complete:** the learning exercise is done, but some practice exercises are not.
  - **Available:** the learning exercise is not done yet.
  - **Locked:** prerequisites are not met.

  — [Exercism docs: concept map](https://exercism.org/docs/building/tracks/concept-map)
- **Edge pruning:** only edges from the preceding level are drawn. Transitive edges are dropped (for example, Basics→Strings is hidden when Integers sits between them), which keeps the graph readable — [Exercism docs: concept map](https://exercism.org/docs/building/tracks/concept-map)
- Each exercise's metadata declares the `concepts` it teaches and its `prerequisites`. Exercises may only use features from their transitive prerequisites — [Exercism docs: concept exercises](https://exercism.org/docs/building/tracks/concept-exercises)
- Completing a Concept Exercise unlocks further Concept and Practice Exercises. v1 had "no concept of progression or structure", and v3 introduced the syllabus to fix that — [Exercism v3 rationale](https://github.com/exercism/v3/blob/master/docs/rationale-for-v3.md)
- **Known pitfall:** the Java concept tree was "very hard to follow" because too many practice exercises were listed under each concept. Practice exercises tagged with several concepts implied relations that were not real prerequisites. The proposed fix is a handful of relevant exercises per concept, following the Python track — [exercism/java#2631](https://github.com/exercism/java/issues/2631)
- The public track page frames the syllabus as "Master 17 key concepts in Python", with Learn / Practice tabs — [Exercism Python concepts](https://exercism.org/tracks/python/concepts)

**Khan Academy**
- The skill mastery scale has five levels: Not started → Attempted → Familiar → Proficient → Mastered. Levels can move down as well as up. For example, a Mastered skill can drop two levels to Familiar after a score below 70% — [Khan Help: mastery levels](https://support.khanacademy.org/hc/en-us/articles/115002552631)
- Course mastery % counts the share of skills at Proficient or Mastered. Example: 5 of 20 skills gives 25% — [Khan Help](https://support.khanacademy.org/hc/en-us/articles/115002552631)
- Khan's own research favours reaching Proficient on fewer skills over reaching Familiar on many — [Khan blog: skills to proficient](https://blog.khanacademy.org/?p=13201)
- The Course and Unit pages were redesigned in 2023 for faster navigation, and later gained "a visual overview of your skill progress in each course and unit" — [Khan community update](https://support.khanacademy.org/hc/uz/community/posts/17688715412621/comments/17690602418317)
- In the "reimagined" Khan experience (classroom), Course Mastery % and Mastery Challenges are removed. Practice is organised as "Unit Missions" instead. Independent learners may still see the classic view — [Khan Help: reimagined experience](https://support.khanacademy.org/hc/en-us/articles/47216131257997-Why-don-t-I-see-Course-Mastery-in-the-reimagined-Khan-Academy-experience)
- A secondary 2025 design write-up describes the layout as a skill-tree-like mastery progress view, a video/blackboard in the centre and a practice panel on the right. It calls the concept graph "the most important design decision". This is secondary and may not match the live product — [Desirability Lab, Mar 2025](https://desirabilitylab.com/backfill/backfill-2025-97-khan-academy-course-design)

**roadmap.sh**
- Learners can mark nodes as **Done, Learning (in progress), or Skipped**, and log in to track progress. These labels come from secondary descriptions of the open-source repo, not from official docs — [SourceForge mirror](https://sourceforge.net/mirror/developer-roadmap/); [GitHub repo](https://github.com/nilbuild/developer-roadmap)
- Each topic's content is stored as a separate markdown file in the repo and synced to the site — [GitHub repo](https://github.com/nilbuild/developer-roadmap)

**Codecademy (career path redesign, ~2020–2023)**
- Paths were reorganised into distinct modules. A "Career Path Syllabus" lists every topic, and each topic opens a "Unit Syllabus" of lessons and projects. A stated goal was to show progress more clearly, after complaints that hours of work produced only "marginal increases in progress" — [Codecademy blog: career path redesign](https://www.codecademy.com/resources/blog/career-path-redesign)
- When content is added, completed work is kept but the overall percentage can drop. Learners opt in with an "Update syllabus" button — [Codecademy Help: syllabus updates](https://help.codecademy.com/hc/en-us/articles/12941723129627-Career-Path-Syllabus-Updates)

**Boot.dev**
- Learning paths are made of a series of courses. A 2025 changelog admitted the path page was "really just a landing page of sorts". Custom learning paths were added later — [Boot.dev Beat 2025-05](https://www.boot.dev/blog/news/bootdev-beat-2025-05); [bootdotdev/curriculum](https://github.com/bootdotdev/curriculum)
- XP and levels unlock named ranks (for example Level 30 Acolyte up to Level 100 Archmage), with XP thresholds such as Level 2 = 400 XP. The wiki may be out of date — [Boot.dev wiki: the game](https://blog.boot.dev/wiki/the-game)

**Brilliant**
- ustwo's ten-week "Game Feel" engagement produced:
  - a "Level Gameboard" for tracking lesson progress
  - lesson and challenge tiles with detail tooltips
  - progress trackers (points earned)
  - in-lesson celebrations on correct answers, plus encouragement states when learners struggle
  - a learning companion character that points to the next lesson
  - a learning path page "showing direction and progression while still letting users choose their own route"

  No metrics or launch date are given — [ustwo: Brilliant](https://ustwo.com/work/brilliant)
- Brilliant rebuilt its game mechanics in early 2023 using Rive (path colour customisation, streak counter). This is vendor marketing — [Rive blog](https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations)

### Inferences
- A good state set for Learn LLM: **Locked / Available / In progress / Complete / Mastered**, plus an orthogonal **Needs review** flag. This combines Exercism's states, roadmap.sh's "learning" state and Khan's decaying levels. "Skipped / already know this" (roadmap.sh) suits self-learners who arrive with prior ML knowledge.
- With about 7 modules and 45 lessons, a phased linear path (Duolingo/Codecademy style, units with headers and explanatory guidebooks) with optional skip-ahead fits best. Show the ~250 topics only inside a lesson, not on the main map. The Exercism Java issue shows that graphs with many nodes per concept become unreadable.
- If a graph view is offered, prune transitive edges (Exercism) and show only true prerequisites, not "related" links.
- Brilliant's "direction plus freedom" framing, together with the Duolingo backlash, suggests showing a recommended order without hard-locking. Use soft prerequisite warnings rather than padlocks.

### Gaps
- No primary sources could be fetched on the current visual design of roadmap.sh (topic side drawer, progress bar, shortcuts), Boot.dev's course map UI, Brilliant's 2024–2026 course path, DataCamp tracks, Coursera, fast.ai, Hugging Face Learn, freeCodeCamp, Educative or Frontend Masters learning paths. Treat any description of these as unverified.
- Exercism's learner-facing visuals (colours, icons per state) are not documented in the fetched docs.

## Where am I / what's next (resume, next-up, breadcrumbs, sidebars, sticky progress, keyboard, search)

### Takeaway
Documented patterns:
- a "return to current position" affordance on long maps (Duolingo's floating arrow)
- unit headers that name the new concepts
- an always-visible outline with breadcrumbs and "you are here" markers (LMS guidance)
- "today" or continue views that surface the courses in progress (Codecademy)

Keyboard navigation and command palettes in learning products are not documented in any source found.

### Cited Findings
- Duolingo's path has a floating button that jumps back to the learner's current spot after scrolling — [Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design)
- LMS UX guidance (Sept 2025):
  - keep the course menu or outline always visible
  - add breadcrumbs and "You are here" indicators, with logical module names
  - hide secondary menus until hovered or tapped
  - reduce notifications in lesson mode, and keep notes and help one click away
  - the main failure modes are hidden navigation (dropdowns) and unclear course length

  — [Lazarev.agency: LMS UX](https://www.lazarev.agency/articles/lms-ux)
- Put progress indicators in a consistent location, usually the top. They support Nielsen's "visibility of system status" heuristic but cannot make a long journey shorter — [Uxcel: progress trackers](https://app.uxcel.com/courses/information-architecture/youre-here-navigation-system-654/utilize-progress-trackers-5134)
- Applying Nielsen's heuristics to e-learning: learners need an "undo" route back after a wrong click. Too many navigation paths make courses harder to use — [eLearning Industry](https://elearningindustry.com/advertise/elearning-marketing-resources/blog/how-to-improve-elearning-course-design-usability-by-adopting-the-10-usability-heuristics); [TTMS](https://ttms.com/why-does-design-matter-how-ux-design-for-e-learning-affects-the-effectiveness-of-online-training/)
- Codecademy's dashboard (2018, older) separated a "Today View" of current courses from a "My Courses" tab that shows progress in past courses — [Codecademy blog, 2018](https://www.codecademy.com/resources/blog/updates-to-the-codecademy-dashboard)
- The Brilliant companion character points learners to their next lesson — [ustwo](https://ustwo.com/work/brilliant)
- iSpring Learn shows the current slide, time spent and remaining content — [Lazarev.agency](https://www.lazarev.agency/articles/lms-ux)

### Inferences
- Put one "Continue: Module X › Lesson Y › Topic Z" resume target at the top of home and of each module page, and add a "jump to current" control on the roadmap.
- In lessons, use a collapsible outline drawer of topics with per-topic state, plus a thin sticky progress bar at the top. Showing remaining time ("~12 min left") answers the "unclear length" complaint.
- Keyboard support (j/k or arrows to step through topics) and a ⌘K palette that searches modules, lessons, topics and glossary terms would set the product apart. No researched competitor documents these, so they are not established conventions to copy.

### Gaps
- No sources found for keyboard navigation or command palettes in Khan, Brilliant, Codecademy, roadmap.sh or Exercism.
- No current (2024–2026) primary source for Codecademy's or Boot.dev's "resume" card.

## Lesson page layouts (split view, step cards, scrollytelling, inline exercises, long technical content)

### Takeaway
Each documented layout serves a different kind of material:
- **Content plus interactive panel side by side** (Khan: video/blackboard centre with practice panel; Scrimba: the video is the editor). Best for hands-on material.
- **Short step-by-step lessons that increase in difficulty** (Brilliant). Best for conceptual material.
- **Celebration and encouragement micro-states** around inline answers.

### Cited Findings
- Scrimba "scrims" record editor events, not pixels, so the learner can pause and edit the instructor's code in place. "The video player is the IDE" — [Hashnode thread](https://hashnode.com/forums/thread/how-does-scrimbas-inline-code-editor-cum-video-viewer-work); [SurviveJS interview](https://survivejs.com/blog/scrimba-interview/)
- Scrimba is desktop-first. Mobile use is limited for interactive coding — [Scrimba vs Mimo (Scrimba's own article)](https://scrimba.com/articles/scrimba-vs-mimo-which-coding-platform-should-you-choose/)
- Brilliant lessons "start with the simplest useful case and increase in complexity" — [Brilliant: how Brilliant teaches math](https://brilliant.org/resources/choosing-brilliant/how-brilliant-teaches-math/)
- Brilliant shows in-lesson celebrations on correct answers and encouraging states when learners struggle. Motion is deliberately balanced so it does not distract from problem-solving — [ustwo](https://ustwo.com/work/brilliant)
- Khan's (secondary-described) layout has a progress tree, a centre video/blackboard and a right-hand practice panel, with large type for phones — [Desirability Lab](https://desirabilitylab.com/backfill/backfill-2025-97-khan-academy-course-design)
- "Every unnecessary menu, banner, or pop-up is a thief of attention." Use a focused lesson mode — [Lazarev.agency](https://www.lazarev.agency/articles/lms-ux)

### Inferences
- For Learn LLM, match the layout to the material:
  - **Conceptual and maths topics:** a reading column with inline checkpoints (Brilliant step model).
  - **Simulations:** a split view on desktop (text left, live simulation right), stacked on mobile with the simulation pinned or collapsible.
  - **Labs:** a full-width workbench.
- Celebrate quietly, with brief micro-feedback only. Reserve louder moments for module completion.

### Gaps
- No sources fetched on Educative, freeCodeCamp or Boot.dev lesson layouts, on scrollytelling learning sites, or on how platforms typeset long maths (KaTeX density, collapsible derivations).

## Dashboard / home for returning learners (streaks, goals, review due, next, rings, heatmaps)

### Takeaway
Home screens centre on current progress, the next lesson and goals. Streaks are the most common retention mechanic, and the best-documented one to backfire. Spaced-review prompts work best placed inside the path (Duolingo) rather than in a separate queue.

### Cited Findings
- Duolingo puts spaced practice on the path. Free users reach extra practice from the top bar, and paying users get a Practice Hub tab — [Duolingo blog](https://blog.duolingo.com/new-duolingo-home-screen-design)
- Portfolio case studies (self-reported):
  - "Skill Path" dashboard: shows goals, progress and next lesson, with a clear hierarchy — [Contra: Skill Path](https://contra.com/s/UAgRlRNq-skill-path-learning-platform-dashboard)
  - Skillay: claims whitespace and progressive disclosure cut first-week drop-off by 40% (unverified) — [Synkora: Skillay](https://synkora-gh.pages.dev/work/skillay)
- Uxcel shows learners visual skill graphs and progress dashboards — [Uxcel Help](https://help.uxcel.com/articles/9795632-how-to-use-the-uxcel-platform-complete-guide-for-individual)
- Khan's research on "skills to proficient" favours depth metrics over breadth metrics — [Khan blog](https://blog.khanacademy.org/?p=13201)
- Gamification guidance: tie milestones to encouragement, and add points, badges and leaderboards only after core usability works — [Lazarev.agency](https://www.lazarev.agency/articles/lms-ux)
- Badges lose their effect after a few weeks, while progress bars keep motivating longer (secondary opinion) — [Desirability Lab](https://desirabilitylab.com/backfill/backfill-2025-97-khan-academy-course-design)

### Inferences
- For a free, local-first, no-account product:
  - Home: a resume card, a "review due" count (topics whose quiz was failed or which are older than N days), module progress rings or bars, and an optional quiet activity heatmap.
  - Streaks: forgiving or optional, if used at all (see pitfalls).
  - Mastery %: count only "Complete/Mastered", in the Khan style, so it cannot be inflated by skimming.

### Gaps
- No primary sources fetched for Brilliant's, Boot.dev's or DataCamp's current home dashboards, or for heatmap usage in learning products.

## Showcase designs (Awwwards, Behance, Dribbble, Mobbin, case studies) 2023–2026

### Takeaway
Search through these galleries was not productive. Awwwards turned up no education Site-of-the-Day winners in 2024–2025, and Dribbble, Behance and Mobbin did not appear in results. The design case studies found (ustwo/Brilliant, Contra and portfolio pieces, UX Planet) repeat a common set of patterns:
- tile or card-based lesson grids
- a "next lesson" hero
- progress trackers and rings
- skill graphs
- progressive disclosure and generous whitespace
- playful motion for feedback
- gamified micro-rewards

### Cited Findings
- No Awwwards Site of the Day for an education or course platform was found for 2024–2025. "Upskill Universe" received only an Honorable Mention (Feb 2025), with no description — [Awwwards search results](https://www.awwwards.com/websites/%23B60165/)
- ustwo/Brilliant: game-feel system covering a level gameboard, tiles, tooltips, trackers, celebrations and a companion — [ustwo](https://ustwo.com/work/brilliant)
- Brilliant uses Rive state-machine animations for path colours and the streak counter (2023+) — [Rive blog](https://rive.app/blog/how-brilliant-org-motivates-learners-with-rive-animations)
- Portfolio case studies favour microlearning "bites", progressive skill-building and gamified rewards — [evulpo case study](https://fanny-portfolio.pages.dev/evulpo_lp.html), and progressive disclosure for lower cognitive load — [Skillay](https://synkora-gh.pages.dev/work/skillay)
- Kids' STEAM platform case study, gamified (UX Planet) — [UX Planet](https://uxplanet.org/ckc-ux-case-study-gamified-ste-a-m-learning-for-kids-5aa8952d9322)

### Inferences
- The recurring visual vocabulary that fits a dark, single-accent theme:
  - the accent used only for "current" and "done" states
  - muted outlines for locked or available nodes
  - card tiles that show type icons (reading, simulation, quiz, lab) and an estimated time
  - motion limited to state changes

### Gaps
- No usable Dribbble, Behance or Mobbin pattern descriptions were retrieved. Any claims about "2025 Dribbble trends" would be unsourced.

## Known UX pitfalls and complaints

### Takeaway
Four pitfalls recur:
1. **Forced linearity** removes agency (the Duolingo path backlash).
2. **Overloaded graphs** become unreadable (Exercism Java).
3. **Progress that feels stuck or drops** when content is added (Codecademy).
4. **Streak and gamification fatigue**: users end up chasing the counter instead of learning.

Hidden navigation and desktop-only design are generic LMS complaints.

### Cited Findings
- **Duolingo path backlash (late 2022):**
  - Learners complained of lost choice ("You can't choose to study something specific"), harder access to specific content and retroactively inserted lessons. A Change.org petition asked for the tree to return — [PiunikaWeb](https://piunikaweb.com/2022/10/17/duolingo-app-update-with-path-ui-faces-backlash-from-users/); [Lev Lafayette](https://levlafayette.com/node/747); [Change.org](https://www.change.org/p/reverse-duolingo-s-path-update)
  - The CEO said metrics showed equivalent engagement, and that most users accepted the change — [NBC News](https://www.nbcnews.com/tech/tech-news/duolingos-update-redesign-luis-von-ahn-interview-rcna44655)
  - Defenders note that the old tree let people skim level 1 everywhere and forget the material — [LanguageCrush forum](https://languagecrush.com/forum/t/3438)
- **Exercism Java:** the concept tree was "very hard to follow" because of exercise overload under each concept — [exercism/java#2631](https://github.com/exercism/java/issues/2631)
- **Codecademy:** after hours of work, progress rose only marginally, and the overall % can drop when content is added — [Codecademy blog](https://www.codecademy.com/resources/blog/career-path-redesign); [Codecademy Help](https://help.codecademy.com/hc/en-us/articles/12941723129627-Career-Path-Syllabus-Updates)
- **Khan:** a mastered skill can be demoted, which motivates review but can feel punitive. A secondary source notes that mastery gating may frustrate fast learners — [Khan Help](https://support.khanacademy.org/hc/en-us/articles/115002552631); [Desirability Lab](https://desirabilitylab.com/backfill/backfill-2025-97-khan-academy-course-design)
- **Streaks:**
  - Silverman et al. (2023, *JCR*), as summarised by The Decision Lab (Mar 2026): users may value extending a streak over the activity itself, and breaking a streak raises the chance of quitting. Paid repair reduces churn but weakens motivation to keep the streak. The article also warns against guilt-based messaging — [The Decision Lab](https://thedecisionlab.com/insights/consumer-insights/streak-creep-the-perils-of-too-much-gamification)
  - I did not read the JCR paper directly.
- A 2025 study of 307 Duolingo users looks at how the game layer can cause psychological fatigue and hinder continued use. Effects depended on motivation and perceived complexity — [VTechWorks](https://vtechworks.lib.vt.edu/items/b755d7af-84d5-4450-9604-fa6fb8fff82f)
- **Generic LMS pitfalls:** hidden navigation, unclear course length, distractions in lesson mode, gamification added before usability works, and desktop-only design — [Lazarev.agency](https://www.lazarev.agency/articles/lms-ux)

### Inferences
- For Learn LLM:
  - Keep a recommended linear order, but allow free navigation with soft prerequisite hints.
  - Keep each map view to about 7–12 nodes per screen (modules, then lessons). Never draw all ~250 topics as one graph.
  - Base progress on fixed denominators shown at module level.
  - Make streaks optional, forgiving and free of guilt (or leave them out).
  - Make every map and outline usable at phone width as a vertical list.

### Gaps
- No quantitative sources on how much "overwhelming roadmaps" hurt completion (for example on roadmap.sh). No sourced mobile-specific complaints about Khan, Brilliant or Exercism maps were found.
