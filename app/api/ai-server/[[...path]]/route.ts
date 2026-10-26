// Local-only relay: AI keys kept in the project's .env are attached here, on the server, so you never paste them in the
// browser. See lib/ai/relay.ts for the rules. Not part of the static GitHub Pages copy: scripts/build-pages.mjs builds a
// throwaway copy of the app without app/api.
import fs from "node:fs";
import path from "node:path";
import { createAiServerHandler, type Env } from "@/lib/ai/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RELAY_VARS = /^(OPENAI|ANTHROPIC|AZURE_OPENAI)_/;

/** Minimal .env parser: KEY=value, optional quotes, # comments. Read per request, so editing .env needs no restart. */
function readDotEnv(): Env {
  const out: Env = {};
  try {
    const text = fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m || !RELAY_VARS.test(m[1])) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      else v = v.replace(/\s+#.*$/, "");
      out[m[1]] = v;
    }
  } catch {
    /* no .env: nothing configured */
  }
  return out;
}

// The file is re-read on every request (so edits apply without a restart); real environment variables win over it.
// Next also loads .env into process.env at startup, so both routes lead to the same values.
const env = (): Env => ({ ...readDotEnv(), ...Object.fromEntries(Object.entries(process.env).filter(([k, v]) => RELAY_VARS.test(k) && v)) });
const handler = createAiServerHandler(env);

type Ctx = { params: Promise<{ path?: string[] }> };
const run = async (req: Request, { params }: Ctx) => handler(req, (await params).path ?? []);
export const GET = run;
export const POST = run;
export const PUT = run;
export const DELETE = run;
export const PATCH = run;
