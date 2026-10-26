/**
 * A local-only relay that keeps AI keys on the server side. The keys come from environment variables (a `.env` file at
 * the project root, loaded by app/api/ai-server/[[...path]]/route.ts), are attached here to the outgoing request, and are
 * never sent to the browser. It exists only in the local app (`npm run dev` / `npm start`); the static GitHub Pages copy
 * (`npm run build:pages`) is built without app/api, so it has no relay at all.
 * Ported from Machine Learning 1 → 100 (web/server/ai-relay.ts).
 *
 * Because it spends the owner's key, it only answers requests that come from the same local page:
 *  - the Host header must be localhost (defeats DNS rebinding),
 *  - an Origin header, if present, must match the Host (defeats other websites calling it),
 *  - POSTs need a custom header, which forces a CORS preflight that other origins can't pass.
 */

export type Env = Record<string, string | undefined>;
export type ProviderId = "openai" | "anthropic" | "azure";
export interface ServerKeys {
  openai: boolean;
  anthropic: boolean;
  azure: boolean;
}

export const APP_HEADER = "x-llm100";
const MAX_BODY = 2_000_000;
const AZURE_HOST = /\.(openai\.azure\.com|cognitiveservices\.azure\.com|services\.ai\.azure\.com)$/;
const SECRET_NAMES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AZURE_OPENAI_API_KEY"];
const val = (env: Env, k: string) => env[k]?.trim() ?? "";

function azureBase(env: Env): string | null {
  try {
    const u = new URL(val(env, "AZURE_OPENAI_ENDPOINT"));
    return u.protocol === "https:" && AZURE_HOST.test(u.hostname) ? u.origin : null;
  } catch {
    return null;
  }
}

/** Which providers have a complete configuration. Booleans only: never the values. */
export function serverKeys(env: Env): ServerKeys {
  return {
    openai: !!val(env, "OPENAI_API_KEY"),
    anthropic: !!val(env, "ANTHROPIC_API_KEY"),
    azure: !!val(env, "AZURE_OPENAI_API_KEY") && !!val(env, "AZURE_OPENAI_DEPLOYMENT") && !!azureBase(env),
  };
}

interface Upstream {
  url: string;
  headers: Record<string, string>;
}

/** The only upstream URLs the relay will call, one per provider. The browser can't choose the destination. */
function upstreamFor(provider: ProviderId, rest: string, env: Env, req: Request): Upstream | { status: number; message: string } {
  if (!serverKeys(env)[provider]) return { status: 501, message: `No ${provider} key is configured in .env on this computer.` };
  if (provider === "openai" && rest === "v1/chat/completions")
    return { url: "https://api.openai.com/v1/chat/completions", headers: { authorization: `Bearer ${val(env, "OPENAI_API_KEY")}` } };
  if (provider === "anthropic" && rest === "v1/messages") {
    const headers: Record<string, string> = { "x-api-key": val(env, "ANTHROPIC_API_KEY"), "anthropic-version": req.headers.get("anthropic-version") ?? "2023-06-01" };
    const beta = req.headers.get("anthropic-beta");
    if (beta) headers["anthropic-beta"] = beta;
    return { url: "https://api.anthropic.com/v1/messages", headers };
  }
  if (provider === "azure" && rest === "chat/completions") {
    const version = val(env, "AZURE_OPENAI_API_VERSION") || "2024-10-21";
    return {
      url: `${azureBase(env)}/openai/deployments/${encodeURIComponent(val(env, "AZURE_OPENAI_DEPLOYMENT"))}/chat/completions?api-version=${encodeURIComponent(version)}`,
      headers: { "api-key": val(env, "AZURE_OPENAI_API_KEY") },
    };
  }
  return { status: 404, message: "Unknown relay path." };
}

/** True only for requests that originate from a page served by this local server. */
export function isLocalRequest(req: Request): boolean {
  const host = req.headers.get("host") ?? "";
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Providers echo a masked copy of a bad key in their 401 messages (e.g. "sk-proj-ab************wxyz"). The browser must not
 * see even that much of a key held on the server, so error bodies have the key and any masked-key text removed.
 */
export function redactSecrets(text: string, env: Env): string {
  let out = text;
  for (const k of SECRET_NAMES) {
    const v = val(env, k);
    if (v.length >= 8) out = out.split(v).join("[key hidden]");
  }
  return out.replace(/[A-Za-z0-9_-]*\*{3,}[A-Za-z0-9_-]*/g, "[key hidden]");
}

const noStore = { "cache-control": "no-store" };
const json = (status: number, body: unknown) => Response.json(body, { status, headers: noStore });
const fail = (status: number, message: string) => json(status, { error: { message } });

/** `path` is the URL path after /api/ai-server, e.g. ["openai", "v1", "chat", "completions"]. `fetchImpl` is injectable for tests. */
export function createAiServerHandler(env: Env | (() => Env), fetchImpl: typeof fetch = fetch) {
  return async (req: Request, path: string[]): Promise<Response> => {
    const e = typeof env === "function" ? env() : env;
    if (!isLocalRequest(req)) return fail(403, "This relay only answers requests from the local app.");
    const rest = path.join("/");

    // Status: which providers .env configures (booleans only). `relay: true` lets the UI know the relay exists at all.
    if (req.method === "GET" && (rest === "" || rest === "status")) return json(200, { relay: true, ...serverKeys(e) });
    if (req.method !== "POST") return fail(405, "Method not allowed.");
    if (req.headers.get(APP_HEADER) !== "1") return fail(403, "Missing app header.");

    const m = rest.match(/^(openai|anthropic|azure)\/(.+)$/);
    if (!m) return fail(404, "Unknown relay path.");
    const up = upstreamFor(m[1] as ProviderId, m[2], e, req);
    if ("status" in up) return fail(up.status, up.message);

    const declared = Number(req.headers.get("content-length") ?? 0);
    const body = declared > MAX_BODY ? null : await req.text();
    if (body === null || body.length > MAX_BODY) return fail(413, "Request too large.");

    try {
      const upstream = await fetchImpl(up.url, { method: "POST", headers: { "content-type": "application/json", ...up.headers }, body, signal: req.signal });
      const headers = { "content-type": upstream.headers.get("content-type") ?? "application/json", ...noStore };
      if (upstream.status >= 400) return new Response(redactSecrets(await upstream.text(), e), { status: upstream.status, headers }); // small JSON error: buffer and clean it
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (err) {
      if (req.signal.aborted) return new Response(null, { status: 499 });
      return fail(502, `Couldn't reach the AI provider: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}
