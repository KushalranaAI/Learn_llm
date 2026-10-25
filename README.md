# LLM Engineering 1 → 100

*Built by [Kushal Rana](https://kushalranaai.github.io/) · [LinkedIn](https://www.linkedin.com/in/kushal-rana) · [YouTube](https://www.youtube.com/@naaku-o2x) · [X](https://x.com/KushalranaAI) · [Medium](https://kushalrana448.medium.com/)*

**Learn how large language models work and how to build with them, by doing.** Every topic explains the idea, works
through the maths with real numbers, lets you see it in a live simulation, and checks your understanding. Labs and a
systems sandbox turn it into practice.

- **9 modules**: how LLMs work · training and adaptation · inference and serving · prompt and context engineering ·
  evaluation · retrieval and RAG · agents and tool use · production systems · LLM system design case studies.
- **Topic pages** with a segmented progress bar, an "In this lesson" sidebar, KaTeX maths, diagrams, step-by-step
  walkthroughs, embedded simulations and quick checks.
- **Spaced review**: quick checks you miss come back after 1, 3, 7, 14 and 30 days until they stick.
- **Simulations**: live models of neurons, gradient descent, tokenizers, attention, sampling, KV caches, batching,
  quantization, retrieval, agents, routing, guardrails and more, each with "How this is computed".
- **Labs**: predict → compute by hand → meet goals in a simulation → build it in the sandbox. Hints and verified solutions.
- **Sandbox**: wire an LLM system on a canvas (gateway, router, caches, guardrails, retriever, models, agents), push
  traffic through it, inject incidents, and read the guide's explanation.
- **Interview prep** (junior → senior) and a **glossary**.
- No account and no backend: progress stays in your browser (export/import from **My progress**).

## Run it

```bash
npm install
npm run dev          # http://localhost:3100
```

`npm run verify` runs the tests, the type-checker and a production build. `npm run build:pages` writes a fully static
copy to `out/` for GitHub Pages (base path `/Learn_llm`, override with `PAGES_BASE_PATH`).

## Write content

Lessons are markdown in `content/modules/NN-module/NN-lesson/NN-topic.md`. See `CONTENT_GUIDE.md` for the format and
the directive blocks (```` ```quiz ````, ```` ```sim ````, ```` ```steps ````, ```` ```callout-* ````, ```` ```lab ````,
```` ```sandbox ````) and `CURRICULUM.md` for the map of modules, lessons, simulations and labs.

## Layout

| Path | What |
|---|---|
| `app/` | routes: home, curriculum, learn/[module]/[lesson]/[topic], interview, glossary, review, progress, simulations, labs, sandbox |
| `components/` | shell, dashboard, markdown + lesson blocks, quiz, lab player |
| `lib/` | content loader (server), progress and spaced review (browser) |
| `sims/` | simulation framework (`types.ts`, `ui.tsx`) and the simulations (`a/`, `b/`) |
| `labs/` | lab definitions |
| `sandbox/` | sandbox engine, catalogue, scenarios and canvas |
| `content/` | the course text, interview questions and glossary |

The page layout takes inspiration from [llmdojo.dev](https://llmdojo.dev/); all content and code here are original.
