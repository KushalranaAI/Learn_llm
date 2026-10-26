// Streaming chat + model listing for Anthropic, OpenAI-compatible (incl. Ollama / LM Studio) and Gemini.
// Runs in the browser: the API key goes straight to the provider the learner chose, nowhere else (or, for keys kept in
// .env, to the local relay at /api/ai-server, which attaches the key on the server). Ported from Machine Learning 1 → 100.
import { type ProviderId, type ProviderKind, providerById } from "./providers";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type Connection = { provider: ProviderId; kind: ProviderKind; baseUrl: string; apiKey: string; model: string; apiVersion?: string;
  /** The key lives in .env on this computer: call the local relay with no key; the server attaches it. */
  viaServer?: boolean;
};

export class AIError extends Error {
  constructor(message: string, public hint?: string) {
    super(message);
  }
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");
/** Azure endpoints are used as scheme + host, so pasting a full URL with a path still works. */
const azureBase = (c: Connection) => {
  try {
    return new URL(c.baseUrl.trim()).origin;
  } catch {
    return trimSlash(c.baseUrl.trim());
  }
};
const azureVersion = (c: Connection) => c.apiVersion?.trim() || "2024-10-21";

function headers(c: Connection): Record<string, string> {
  if (c.viaServer) return { "content-type": "application/json", "x-llm100": "1" };
  if (c.kind === "anthropic") {
    return {
      "content-type": "application/json",
      "x-api-key": c.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }
  if (c.kind === "gemini") return { "content-type": "application/json", "x-goog-api-key": c.apiKey };
  if (c.kind === "azure") return { "content-type": "application/json", "api-key": c.apiKey };
  return { "content-type": "application/json", ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) };
}

function hintFor(c: Connection, status?: number): string | undefined {
  if (status === 401 || status === 403) return "The provider rejected the API key. Check it in Settings.";
  if (status === 404 && c.kind === "azure") return `Azure has no deployment named “${c.model}” on this endpoint. Use the deployment name from Azure AI Foundry, not the model name, and check the API version.`;
  if (status === 404 && c.provider === "ollama") return `Ollama doesn't have the model “${c.model}”. Run: ollama pull ${c.model}`;
  if (status === 404) return "Model or endpoint not found. Check the model name and base URL in Settings.";
  if (status === 429) return "Rate limited or out of quota. Wait a moment or check your plan.";
  if (status === undefined) {
    if (c.provider === "ollama") return "Is Ollama running? Start it, then try again. If it is running, allow this page with OLLAMA_ORIGINS=* and restart Ollama.";
    if (c.kind === "azure") return "Couldn't reach the endpoint. Check it looks like https://YOUR-RESOURCE.openai.azure.com, that the resource allows public network access, and that its networking/CORS settings allow requests from this page.";
    if (c.provider === "custom") return "Is the server running and is CORS enabled? (LM Studio: Developer → Server settings → Enable CORS.)";
    return "Network error. Check your connection.";
  }
  return undefined;
}

async function failure(c: Connection, res: Response): Promise<never> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      message = j?.error?.message ?? (typeof j?.error === "string" ? j.error : null) ?? j?.message ?? text.slice(0, 300);
    } catch {
      if (text) message = text.slice(0, 300);
    }
  } catch {
    /* keep status line */
  }
  throw new AIError(message, hintFor(c, res.status));
}

async function request(c: Connection, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    const host = c.viaServer ? "the local relay (is `npm run dev` still running?)" : new URL(url, typeof location === "undefined" ? "http://localhost" : location.href).host;
    throw new AIError(`Couldn't reach ${host}.`, hintFor(c));
  }
  if (!res.ok) await failure(c, res);
  return res;
}

/** Yields the payload of each `data:` line of a server-sent-events response. */
async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
  if (buffer.startsWith("data:")) yield buffer.slice(5).trim();
}

export async function streamChat(
  c: Connection,
  system: string,
  messages: ChatMsg[],
  o: { signal?: AbortSignal; onToken: (t: string) => void; maxTokens?: number },
): Promise<string> {
  const base = trimSlash(c.baseUrl);
  const turns = messages.filter((m, i) => !(i === 0 && m.role === "assistant")); // every API wants a user turn first
  let res: Response;
  let pick: (j: Record<string, any>) => string | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (c.kind === "anthropic") {
    res = await request(c, c.viaServer ? "/api/ai-server/anthropic/v1/messages" : `${base}/v1/messages`, {
      method: "POST",
      headers: headers(c),
      signal: o.signal,
      body: JSON.stringify({ model: c.model, max_tokens: o.maxTokens ?? 4096, system, messages: turns, stream: true }),
    });
    pick = (j) => {
      if (j.type === "error") throw new AIError(j.error?.message ?? "The model returned an error.");
      return j.type === "content_block_delta" && j.delta?.type === "text_delta" ? j.delta.text : undefined;
    };
  } else if (c.kind === "azure") {
    res = await request(c, c.viaServer ? "/api/ai-server/azure/chat/completions" : `${azureBase(c)}/openai/deployments/${encodeURIComponent(c.model)}/chat/completions?api-version=${encodeURIComponent(azureVersion(c))}`, {
      method: "POST",
      headers: headers(c),
      signal: o.signal,
      body: JSON.stringify({ stream: true, messages: [{ role: "system", content: system }, ...turns] }),
    });
    pick = (j) => {
      if (j.error) throw new AIError(j.error.message ?? String(j.error));
      return j.choices?.[0]?.delta?.content || undefined; // the first chunk has no choices while content filters run
    };
  } else if (c.kind === "gemini") {
    res = await request(c, `${base}/v1beta/models/${encodeURIComponent(c.model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: headers(c),
      signal: o.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      }),
    });
    pick = (j) => j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") || undefined;
  } else {
    res = await request(c, c.viaServer ? "/api/ai-server/openai/v1/chat/completions" : `${base}/chat/completions`, {
      method: "POST",
      headers: headers(c),
      signal: o.signal,
      body: JSON.stringify({ model: c.model, stream: true, messages: [{ role: "system", content: system }, ...turns] }),
    });
    pick = (j) => {
      if (j.error) throw new AIError(j.error.message ?? String(j.error));
      return j.choices?.[0]?.delta?.content || undefined;
    };
  }

  let full = "";
  for await (const data of sseData(res)) {
    if (!data || data === "[DONE]") continue;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(data);
    } catch {
      continue;
    }
    const token = pick(json);
    if (token) {
      full += token;
      o.onToken(token);
    }
  }
  if (!full) throw new AIError("The model returned an empty answer.", c.provider === "ollama" ? "Try a larger model, or shrink the lesson-context size in Settings." : undefined);
  return full;
}

/** Non-streaming convenience for one-shot jobs like quiz generation. */
export function complete(c: Connection, system: string, prompt: string, signal?: AbortSignal): Promise<string> {
  return streamChat(c, system, [{ role: "user", content: prompt }], { signal, onToken: () => {} });
}

/** Model ids available to this key / server. Doubles as a connection test. */
export async function listModels(c: Connection): Promise<string[]> {
  if (c.viaServer) return []; // the key is on the server; the status check already confirmed it
  const base = trimSlash(c.baseUrl);
  if (c.kind === "anthropic") {
    const res = await request(c, `${base}/v1/models?limit=100`, { headers: headers(c) });
    return ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
  }
  if (c.kind === "azure") {
    // Azure can't list deployments with an API key, so this only checks the endpoint and key; the learner types the deployment name.
    await request(c, `${azureBase(c)}/openai/models?api-version=${encodeURIComponent(azureVersion(c))}`, { headers: headers(c) });
    return [];
  }
  if (c.kind === "gemini") {
    const res = await request(c, `${base}/v1beta/models?pageSize=100`, { headers: headers(c) });
    return ((await res.json()).models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""));
  }
  const res = await request(c, `${base}/models`, { headers: headers(c) });
  const body = await res.json();
  return (body.data ?? body.models ?? []).map((m: { id?: string; name?: string }) => m.id ?? m.name).filter(Boolean);
}

export const describe = (c: Connection) => `${providerById(c.provider).label} · ${c.model || "no model chosen"}`;
