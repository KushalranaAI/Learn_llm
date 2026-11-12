# Redesign: a learning loop and a map

Evidence and sources: [research/reports/Learning platform redesign research.md](research/reports/Learning%20platform%20redesign%20research.md).
Visual language is unchanged ([DESIGN.md](DESIGN.md): dark, one emerald accent, shared tokens). What changed is how the
pieces connect: what the learner does on each page, what comes back later, and how the course is mapped.

The report's conclusion drives every decision here: a map tells learners what exists, but what decides whether they
learn is whether they **predict, recall and build again and again, spread over days**.

## 1. The learning loop (every topic)

| Step | What the learner does | Built as | Why |
|---|---|---|---|
| Predict | Commits to an answer before the explanation | ```` ```predict ```` block, first topic of every lesson | Predicting before a demo beats watching it (Crouch et al. 2004) |
| Learn | Intuition, then maths with a worked example | Existing topic body | Worked examples, g ≈ 0.48 for novices |
| Do | Runs the simulation as an experiment, writes the code | Sims, labs, "Run it yourself" lessons | Learning by doing; 4C/ID whole tasks |
| Check | Picks an answer, **says how sure**, then sees the explanation | `QuizCard` confidence step | Confident errors are the ones best corrected (hypercorrection) |
| Recall | One check **from an earlier lesson** at the end of the topic | `Recall` ("From earlier") | Cumulative review keeps prerequisites alive |

## 2. Review that schedules itself

- **Every** first answer joins the deck, not just misses. Initial interval depends on the answer and confidence:
  sure-but-wrong 10 minutes, wrong 1 day, guessed-right 1 day, think-so-right 3 days, sure-right 7 days.
- Intervals 1, 3, 7, 14, 30, 60 days. Right moves one step (a guess moves none); wrong goes back to the start.
- **Mastery = correct delayed recall in 2 later sessions on different days** (`MASTERY_WINS`), never page views.
  A lesson is mastered when 80% of its checks are.
- Sessions are capped at 20 (`DAILY_CAP`), confident mistakes first, neighbouring items from different lessons.
- **Encompassing credit:** finishing a topic in a practice module (Build from scratch, Fine-tuning) pushes back the
  due date of review items from the theory lessons it builds on. It never raises mastery: only real recall does.
- Code: `lib/progress.ts` (`recordCheck`, `nextReview`, `reviewSession`, `creditLessons`), `app/review/page.tsx`.

## 3. The map

- `content/map.json` holds the graph: each module's position (spine row and branches), each lesson's soft
  prerequisites, and goal paths. Tests (`lib/learner.test.ts`) check it lists every lesson, points only at real
  lessons, has no cycles and never points forward within a module.
- **Roadmap page** (`/curriculum`, nav "Roadmap"): goal filter (Everything, Understand, Build, Fine-tune, Apply),
  a "Ready to learn" fringe, review due, overall progress, then two zoom levels of 7–12 nodes each:
  - modules: a solid recommended spine 01 → 05, with Prompt and context branching after module 01 and Inference
    after module 02 (dashed);
  - the selected module's lessons in prerequisite layers, with transitive edges pruned.
- Lesson states: **later** (builds on something unfinished; a hint, not a lock), **ready**, **in progress**,
  **finished**, **mastered**, plus a separate **due for review** count. "I know this" counts a lesson as finished.
- Prerequisites appear as "Builds on" panels on lesson pages and on the first topic, never as locks.
- Progress counts topics against each module's own total, so adding a module never shrinks anyone's progress.
- Phones get the same maps as vertical lists.

## 4. Motivation: competence and autonomy, nothing else

Kept: progress bars, mastery, the calibration chart ("are you as right as you feel?"), weekly activity
("3 of 7 days", weeks in a row), goal paths, "I know this". Replaced: the daily streak. Left out on purpose:
leaderboards, XP, loss-framed or guilt copy, and "mark as read" as a mastery signal.

## 5. Course order

The report's smaller alternative is in: 01 How LLMs work → 02 Build from scratch → 03 Training → 04 Fine-tuning →
05 Evaluation (moved up from last) → 06 Inference (branch) → 07 Prompt and context (branch, open after module 01).

## Next (not built yet)

1. **Merge modules 01 and 02 into one build spine** (concept, simulation, code and check per topic, with a
   no-code flag), and shrink 01 to a 1–3 lesson overview. The research supports this most, but it is a content
   rewrite, so it is a separate decision.
2. **Capstones with offline-checkable checkpoints:** the notebook prints a value under a fixed seed (e.g. loss at
   step 100) and the learner pastes it into the page. This needs measured values from real runs.
3. Parsons (put the lines in order) and find-the-bug code items; a split view for simulation topics on desktop;
   a weekly study plan exportable to a calendar (.ics); FSRS scheduling for glossary and interview cards.
