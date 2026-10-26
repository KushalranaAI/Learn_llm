# LLM Engineering 1 → 100

*Built by [Kushal Rana](https://kushalranaai.github.io/) · [LinkedIn](https://www.linkedin.com/in/kushal-rana) · [YouTube](https://www.youtube.com/@naaku-o2x) · [X](https://x.com/KushalranaAI) · [Medium](https://kushalrana448.medium.com/)*

**Learn how large language models work and how to build with them, by doing.** Every topic explains the idea, works
through the maths with real numbers, lets you see it in a live simulation, and checks your understanding. Labs and a
systems sandbox turn it into practice.

- **9 modules**: how LLMs work · training and adaptation · inference and serving · prompt and context engineering ·
  evaluation · retrieval and RAG · agents and tool use · production systems · LLM system design case studies.
- **Topic pages** with a sticky segmented progress bar, an "In this lesson" panel, KaTeX maths, diagrams, step-by-step
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

## AI tutor (optional, bring your own key)

Everything above works without AI. If you want a tutor, open **✨ Add AI** in the top bar (`/ai`), pick a provider, add a
key, press **Test connection**, then **Save and use AI**. Full step-by-step setup, including the `.env` file: [docs/AI.md](docs/AI.md).

- **Ask AI**: the round button at the bottom right (or **Ctrl+/**) opens a resizable side panel. Answers stream in and
  render maths with KaTeX. Each page keeps its own conversation.
- **It sees what you see.** Each screen registers what the tutor may know with one `useChatSource(...)` call
  (`lib/ai/sources.ts`, System Learn's idea): the topic text on a topic page; the settings, results and maths of a
  simulation (also inside lab steps); the brief and question of a lab step; your sandbox design, last run and guide; the
  current interview question. **Never** quiz answers, worked solutions, or an interview answer you haven't revealed.
  You can switch screen sharing off on `/ai`.
- **Explain with AI** buttons under simulation results, next to quiz feedback and on the sandbox (beside **Ask AI**), and **Explain** on any text you
  highlight. They appear only when AI is set up, and nothing is sent until you click.

| Provider | What you enter | Default model |
|---|---|---|
| Claude (Anthropic) | API key | `claude-opus-5-5` (also `claude-sonnet-5-5`, `claude-haiku-5-5`) |
| OpenAI | API key | `gpt-4o-mini` |
| Google Gemini | API key | `gemini-2.0-flash` |
| Azure OpenAI (local app only) | endpoint, deployment name, API version, key | your deployment |
| Ollama / LM Studio / any OpenAI-compatible server on this computer | server address (optional key) | `llama3.2` (Ollama) |

**Two ways to hold a key.**

1. **Browser vault** (works everywhere, including the static copy). The key is stored only in this browser, encrypted
   with AES-256-GCM: with a non-extractable device key (nothing to type) or a passphrase (PBKDF2-SHA256, 600,000 rounds,
   typed once per browser session). Choose **On this device** or **This session only**; **Forget all keys & chats**
   deletes everything and the encryption key. Requests go straight from your browser to the provider.
2. **`.env` relay** (local app only, the safest). Copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY`,
   `OPENAI_API_KEY` or the `AZURE_OPENAI_*` values, then run `npm run dev`. The `/ai` page shows **Use … from .env**.
   The local route `app/api/ai-server` (rules in `lib/ai/relay.ts`) attaches the key on the server; the browser only learns
   *which* providers are configured, never a key, and any key a provider echoes back in an error is redacted. It only
   answers the local app (localhost `Host`, same origin, a custom header). `.env` is git-ignored: never commit it, and never
   give these variables a `NEXT_PUBLIC_` prefix.

**Privacy.** No course server ever sees your prompts or keys: they go to the provider you pick (or to your own computer
for Ollama / the relay). A Content-Security-Policy (header locally, `<meta>` in the static copy) only lets the page talk
to this app, the supported AI providers and `localhost`. What it can't stop: script running inside the page could still
use an unlocked key, so prefer a key with a spending limit and a passphrase on shared computers.

**Static copy limits.** `npm run build:pages` builds a throwaway copy of the app *without* `app/api`, so `out/` has no
relay: there, keys from `.env` and Azure OpenAI aren't offered. Claude, OpenAI, Gemini and Ollama work from the browser.

**Free and offline with Ollama.** Install [Ollama](https://ollama.com), run `ollama pull llama3.2`, leave it running,
then choose **Ollama** on `/ai`. If the browser can't reach it, restart Ollama with `OLLAMA_ORIGINS=*` (see docs/AI.md).
Small local models have small context windows, so the tutor sends less of the screen to them.

## Write content

Lessons are markdown in `content/modules/NN-module/NN-lesson/NN-topic.md`. See `CONTENT_GUIDE.md` for the format and
the directive blocks (```` ```quiz ````, ```` ```sim ````, ```` ```steps ````, ```` ```callout-* ````, ```` ```lab ````,
```` ```sandbox ````) and `CURRICULUM.md` for the map of modules, lessons, simulations and labs.

## Layout

| Path | What |
|---|---|
| `app/` | routes: home, curriculum, learn/[module]/[lesson]/[topic], interview, glossary, review, progress, simulations, labs, sandbox |
| `components/` | shell, dashboard, markdown + lesson blocks, quiz, lab player |
| `lib/` | content loader (server), progress and spaced review (browser), `lib/ai/` (providers, encrypted key vault, streaming client, `.env` relay, tutor context) |
| `components/ai/` | the optional AI tutor: top-bar chip, side panel, settings, Explain with AI |
| `sims/` | simulation framework (`types.ts`, `ui.tsx`) and the simulations (`a/`, `b/`) |
| `labs/` | lab definitions |
| `sandbox/` | sandbox engine, catalogue, scenarios and canvas |
| `content/` | the course text, interview questions and glossary |

The curriculum structure takes inspiration from [llmdojo.dev](https://llmdojo.dev/). The visual design (tokens, top bar, cards, step player, sandbox canvas) is the same design system as
[System Learn](../system_learn_app), so the two apps feel like one family. All content and code here are original.
