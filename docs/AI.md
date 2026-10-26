# AI tutor: setup

The AI tutor is optional. Without it, every page, simulation, lab and the sandbox work exactly the same; the only
visible trace is a small **Add AI** chip in the top bar and an **AI tutor** button at the bottom right.

With it you get:

- **Ask AI** (bottom right, or **Ctrl+/**): a resizable side panel that knows what is on your screen and keeps one
  conversation per page. Answers stream in, with maths rendered by KaTeX.
- **Explain with AI** under simulation results, next to quiz feedback, and next to the Ask AI button on the sandbox.
- **Explain / Ask…** on any text you highlight.

Nothing is ever sent until you press a button.

There are two ways to give the app a key. Pick one.

| | Browser vault | `.env` relay |
|---|---|---|
| Where the key lives | this browser, encrypted (AES-256-GCM) | a git-ignored `.env` file on your computer |
| Works on | the local app and the static GitHub Pages copy | the local app only (`npm run dev` / `npm start`) |
| Providers | Claude, OpenAI, Gemini, Ollama / LM Studio, Azure OpenAI (local app only) | Claude, OpenAI, Azure OpenAI |
| Browser ever sees the key | yes (it sends it to the provider) | never |

---

## Option A: keys in a `.env` file (local app, recommended)

1. In the project folder (`Learn_llm/`, next to `package.json`), copy the example file:

   ```bash
   cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
   ```

2. Open `.env` and fill in the provider(s) you use. Leave the rest empty.

   ```bash
   # Anthropic (Claude)
   ANTHROPIC_API_KEY=sk-ant-...

   # OpenAI
   OPENAI_API_KEY=sk-...

   # Azure OpenAI (endpoint, deployment and key are all needed; the version is optional)
   AZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT=my-gpt-4o-mini
   AZURE_OPENAI_API_KEY=...
   # AZURE_OPENAI_API_VERSION=2024-10-21
   ```

   Rules: no quotes needed, no spaces around `=`, and **never** add a `NEXT_PUBLIC_` prefix (that would put the key in
   the page's JavaScript). `.env` is listed in `.gitignore`: never commit it.

3. Start the app:

   ```bash
   npm run dev                 # http://localhost:3100
   ```

4. Open **http://localhost:3100/ai** (or click **Add AI** in the top bar). Under **Keys found in your .env file**,
   click **Use Claude (Anthropic) from .env** (or OpenAI / Azure). The chip in the top bar turns into **AI on**.
   For Claude, pick the model on the same page: `claude-opus-5-5` (default), `claude-sonnet-5-5` or `claude-haiku-5-5`.

Editing `.env` later needs no restart: the relay re-reads it on every request. Press **Re-check .env** on `/ai` to
refresh which providers it finds.

**How it works.** The browser calls `/api/ai-server/...` on the local Next.js server
(`app/api/ai-server/[[...path]]/route.ts`). The relay (`lib/ai/relay.ts`):

- reads `.env` (and real environment variables, which win) and attaches the key to the outgoing request;
- only calls three fixed upstream URLs (OpenAI chat completions, Anthropic messages, your Azure deployment); the
  browser cannot choose the destination;
- only answers the local app: the `Host` must be `localhost` / `127.0.0.1` / `[::1]`, an `Origin` must match it, and
  POSTs need the `x-llm100` header (so other websites can't spend your key);
- returns to the browser only booleans from `GET /api/ai-server/status`
  (`{ "relay": true, "openai": false, "anthropic": true, "azure": false }`) and redacts any key (full or masked) that
  a provider echoes back in an error.

The UI detects the relay by calling that status endpoint (only when the page is served from localhost and is not the
static copy). A `200` with `relay: true` means the relay exists.

## Option B: a key in the browser (works everywhere)

1. Open `/ai` (or click **Add AI**).
2. Choose a provider: **Claude (Anthropic)**, **OpenAI**, **Google Gemini**, **Azure OpenAI** (local app only),
   **Ollama**, or **Local server / other** (LM Studio, llama.cpp, vLLM).
3. Paste the key (links to each provider's key page are next to the field). For Azure also enter the endpoint,
   deployment name and API version.
4. Choose the model (Claude defaults to `claude-opus-5-5`).
5. **Test connection** (lists the models your key can use), then **Save and use AI**.

Storage choices on the same page:

- **On this device** (default) or **This session only** (forgotten when the tab closes).
- **Protection: This device** (a non-extractable browser key; nothing to type) or **A passphrase** (PBKDF2-SHA256,
  600,000 rounds; typed once per browser session; without it nobody can decrypt). **Lock now** forgets it immediately.
- **Forget all keys & chats** deletes every saved key, the encryption key and all saved conversations.
  (Keys in `.env` are not touched.)
- **Turn AI off** keeps your keys but hides every AI button.

Keys are never written unencrypted. If the page isn't on `https://` or `localhost`, browsers refuse to encrypt, so the
key is kept in memory for that tab only.

## Free and private: Ollama

1. Install Ollama from <https://ollama.com>.
2. In a terminal: `ollama pull llama3.2`, and leave Ollama running.
3. On `/ai` choose **Ollama**, press **Test connection**, then **Save and use AI**.

If the test says it can't reach Ollama, it is blocking the page's origin. Quit Ollama and start it with
`OLLAMA_ORIGINS=*` (macOS/Linux: `OLLAMA_ORIGINS=* ollama serve`; Windows PowerShell:
`$env:OLLAMA_ORIGINS="*"; ollama serve`). For LM Studio, start the local server in the Developer tab and enable CORS.
Small local models have small context windows, so the tutor sends less of the screen to them (adjustable on `/ai`).

## What the tutor can see

Each screen registers what it shows with `useChatSource(key, { label, suggestions, build })` from `lib/ai/sources.ts`.
`build()` runs only when you send a question, so the context is always current.

| Screen | Shared with the tutor | Never shared |
|---|---|---|
| Topic page | lesson and topic title, the topic's markdown | quick-check answers and explanations (stripped) |
| Simulation (and lab sim steps) | title, summary, current settings, results, goals, the maths | a lab's solution parameters |
| Lab step | lab title, step title and brief, the question and options | correct option, numeric answer, worked solution |
| Sandbox | your design (components, settings, wiring), traffic and incident, last run's metrics and the guide's text | |
| Interview | the current question; the answer only after you reveal it | an answer you haven't revealed |

Turn off **Share the current screen with my questions** on `/ai` to send only your question.

## The static copy (GitHub Pages)

`npm run build:pages` copies the app to a throwaway folder next to it **without `app/api` and without `.env`**, builds
it with `STATIC_EXPORT=1` (which sets `NEXT_PUBLIC_STATIC_EXPORT=1`), and copies the result to `out/`. So:

- `out/` contains no API route and no key;
- the UI hides the `.env` options and Azure OpenAI there;
- Claude, OpenAI, Gemini and Ollama still work, with the key held in the visitor's browser vault.

## Security notes

- A Content-Security-Policy is sent as a header by the local app and added as a `<meta>` tag to every page of the
  static copy (`scripts/csp.mjs`). The page may only connect to itself, the supported AI providers and `localhost`.
- What it can't stop: script running inside the page could still use an unlocked key. Give API keys a spending
  limit, and use a passphrase on shared computers.
- The app never logs keys. Tests (`lib/ai/vault.test.ts`, `lib/ai/relay.test.ts`) check that stored data and relay
  responses never contain a key.

## Troubleshooting

| Message | Fix |
|---|---|
| "The provider rejected the API key" | check the key on `/ai` or in `.env` |
| "Model or endpoint not found" | check the model name (Azure: the deployment name, not the model) |
| "Couldn't reach the local relay" | `npm run dev` stopped; start it again |
| "Is Ollama running?" | start Ollama; if it is running, use `OLLAMA_ORIGINS=*` (above) |
| Keys in `.env` aren't offered | the file must be named `.env` in the project root; press **Re-check .env**; the static copy never offers them |
