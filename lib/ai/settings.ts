// AI settings and credentials. Everything lives only in this browser:
//  - settings (provider, model, preferences) in localStorage - nothing secret
//  - API keys and endpoints encrypted (vault.ts), on this device or for this session only
//  - or no key at all in the browser: the local relay attaches keys from .env (app/api/ai-server, local dev only)
// Ported from Machine Learning 1 → 100 (web/lib/ai/settings.ts), without its legacy-format migrations.
import { useSyncExternalStore } from "react";
import { jsonStore, useStore } from "../localstore";
import type { Connection } from "./client";
import { type ProviderId, PROVIDERS, isRelayProvider, providerById } from "./providers";
import { type Envelope, type Protection, Vault, VaultError, cryptoAvailable, isEnvelope } from "./vault";

export type AISettings = {
  provider: ProviderId;
  models: Partial<Record<ProviderId, string>>;
  remember: boolean;
  shareContext: boolean;
  contextChars: number | null; // null = provider default
  configured: boolean; // the learner has completed setup (a successful test, or pressed Save)
  azureApiVersion: string;
  protection: Protection; // how saved keys are encrypted: with a device key, or a passphrase
};

const DEFAULTS: AISettings = { provider: "anthropic", models: {}, remember: true, shareContext: true, contextChars: null, configured: false, azureApiVersion: "2024-10-21", protection: "device" };

export const settingsStore = jsonStore<AISettings>("llm100-ai-settings", DEFAULTS);
export const useAISettings = () => useStore(settingsStore);
export const updateSettings = (patch: Partial<AISettings>) => settingsStore.set((s) => ({ ...s, ...patch }));

/** The static GitHub Pages copy: no server, so no .env relay and no Azure (it needs the local app). */
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

// -------------------------------------------------------------------------------- encrypted credentials
// API keys and endpoints are stored only as an encrypted envelope (see vault.ts), in localStorage ("on this device")
// and/or sessionStorage ("this session only"). Two protection modes:
//   "device"      the key is a non-extractable browser key; nothing to type, ever.
//   "passphrase"  the key is derived from a passphrase you type once per browser session.
// Decrypted values live in memory only while the page is open.

type Keys = Partial<Record<ProviderId, string>>;
type Urls = Partial<Record<ProviderId, string>>;
type Creds = { keys: Keys; urls: Urls };
export type VaultStatus = "loading" | "ready" | "locked";
type VaultState = { status: VaultStatus; secure: boolean; keys: Keys; urls: Urls; error: string };

const DEVICE_SLOT = "llm100-ai-credentials";
const SESSION_SLOT = "llm100-ai-credentials-session";

const vault = new Vault();
const EMPTY: VaultState = { status: "loading", secure: true, keys: {}, urls: {}, error: "" };
let state: VaultState = EMPTY;
let device: Creds = { keys: {}, urls: {} };
let session: Creds = { keys: {}, urls: {} };
let initStarted = false;
const listeners = new Set<() => void>();

const merged = (): Pick<VaultState, "keys" | "urls"> => ({ keys: { ...device.keys, ...session.keys }, urls: { ...device.urls, ...session.urls } });
const publish = (patch: Partial<VaultState> = {}) => {
  state = { ...state, ...merged(), ...patch };
  listeners.forEach((l) => l());
};
const hasData = (c: Creds) => Object.keys(c.keys).length > 0 || Object.keys(c.urls).length > 0;
const readEnvelope = (store: Storage, slot: string): Envelope | null => {
  try {
    const parsed = JSON.parse(store.getItem(slot) ?? "null");
    return isEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const parseCreds = (text: string | null): Creds => {
  try {
    const c = JSON.parse(text ?? "null") as Partial<Creds> | null;
    return { keys: c?.keys ?? {}, urls: c?.urls ?? {} };
  } catch {
    return { keys: {}, urls: {} };
  }
};
const protection = (): Protection => settingsStore.get().protection;
type Slot = { env: Envelope; target: "device" | "session" };
const storedSlots = (): Slot[] =>
  [
    { env: readEnvelope(localStorage, DEVICE_SLOT), target: "device" as const },
    { env: readEnvelope(sessionStorage, SESSION_SLOT), target: "session" as const },
  ].filter((e): e is Slot => e.env !== null);

/** Encrypts both slots with the current protection mode. Never writes credentials unencrypted. */
async function save() {
  if (!cryptoAvailable()) return; // keys then live in memory for this tab only
  const mode = protection();
  const put = async (store: Storage, slot: string, c: Creds) => {
    if (hasData(c) || mode === "passphrase") store.setItem(slot, JSON.stringify(await vault.seal(JSON.stringify(c), mode)));
    else store.removeItem(slot);
  };
  try {
    if (mode === "passphrase" && !vault.hasPassphraseSession()) return; // can't encrypt until unlocked
    await put(localStorage, DEVICE_SLOT, device);
    await put(sessionStorage, SESSION_SLOT, session);
  } catch (e) {
    publish({ error: e instanceof Error ? e.message : "Couldn't save." }); // storage blocked: credentials stay in memory
  }
}

async function openSlots(envs: Slot[], passphrase?: string) {
  let first = true;
  for (const { env, target } of envs) {
    const creds = parseCreds(await vault.open(env, first ? passphrase : undefined));
    first = false;
    if (target === "device") device = creds;
    else session = creds;
  }
}

function init() {
  if (initStarted || typeof window === "undefined") return;
  initStarted = true;
  void (async () => {
    const secure = cryptoAvailable();
    try {
      const envs = storedSlots();
      if (secure && envs.some((e) => e.env.mode === "passphrase")) {
        publish({ status: "locked", secure });
        return;
      }
      if (secure) {
        try {
          await openSlots(envs);
        } catch (e) {
          publish({ error: e instanceof VaultError ? e.message : "" }); // lost device key or damaged data: start empty
        }
      }
      publish({ status: "ready", secure });
    } catch {
      publish({ status: "ready", secure });
    }
  })();
}

const subscribeVault = (l: () => void) => {
  init();
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function useAIVault(): VaultState {
  return useSyncExternalStore(subscribeVault, () => state, () => EMPTY);
}

/** Opens passphrase-protected credentials. Throws a VaultError ("wrong-passphrase" ...) on failure. */
export async function unlockVault(passphrase: string) {
  await openSlots(storedSlots(), passphrase);
  publish({ status: "ready", error: "" });
}

/** Forgets the passphrase and the decrypted credentials from memory (they stay encrypted in storage). */
export function lockVault() {
  vault.lock();
  device = { keys: {}, urls: {} };
  session = { keys: {}, urls: {} };
  publish({ status: "locked" });
}

/** Switches protection. Going to "passphrase" needs the new passphrase; going back to "device" needs the vault unlocked. */
export async function setProtection(mode: Protection, passphrase?: string) {
  if (mode === "passphrase") {
    if (!passphrase || passphrase.length < 8) throw new VaultError("locked", "Use a passphrase of at least 8 characters.");
    await vault.seal("{}", "passphrase", passphrase); // new salt + key for this session
  }
  settingsStore.set((s) => ({ ...s, protection: mode }));
  if (mode === "device") vault.lock();
  await save();
  publish({ error: "" });
}

/** Saves (or, with an empty key, removes) one provider's key and endpoint, encrypted. */
export function saveCredentials(provider: ProviderId, key: string, url: string | undefined, remember: boolean) {
  for (const c of [device, session]) {
    delete c.keys[provider];
    delete c.urls[provider];
  }
  const target = remember ? device : session;
  if (key) target.keys[provider] = key;
  if (url) target.urls[provider] = url;
  publish();
  void save();
}

/** Removes every stored credential, destroys the device key and forgets any passphrase. */
export function forgetAllKeys() {
  device = { keys: {}, urls: {} };
  session = { keys: {}, urls: {} };
  try {
    localStorage.removeItem(DEVICE_SLOT);
    sessionStorage.removeItem(SESSION_SLOT);
  } catch {
    /* storage blocked */
  }
  settingsStore.set((s) => ({ ...s, protection: "device", configured: false }));
  void vault.destroy();
  publish({ status: "ready", error: "" });
}

/** Move every credential between "this device" and "this session" when the learner flips the switch. */
export function moveKeys(remember: boolean) {
  const all = merged();
  device = remember ? all : { keys: {}, urls: {} };
  session = remember ? { keys: {}, urls: {} } : all;
  publish();
  void save();
}

// ------------------------------------------------------------------------------- keys held in .env (local only)
// The local app can keep keys in the project's .env and attach them on the server (lib/ai/relay.ts). Asking which
// providers are configured returns booleans only. The static copy has no server, so it never asks.

export type ServerKeys = { relay: boolean; openai: boolean; anthropic: boolean; azure: boolean };
const NO_SERVER_KEYS: ServerKeys = { relay: false, openai: false, anthropic: false, azure: false };
let serverKeys: ServerKeys = NO_SERVER_KEYS;
let serverProbe = false;
const serverListeners = new Set<() => void>();

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];
const isLocalHost = () => typeof window !== "undefined" && LOCAL_HOSTS.includes(window.location.hostname);

/** Asks the relay (GET /api/ai-server/status) which providers .env configures. Detection = a 200 with `relay: true`. */
export function probeServerKeys(force = false) {
  if ((serverProbe && !force) || typeof window === "undefined") return;
  serverProbe = true;
  if (IS_STATIC || !isLocalHost()) return; // the relay only exists in the local dev/production server
  fetch("/api/ai-server/status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((k: Partial<ServerKeys> | null) => {
      serverKeys = k?.relay ? { relay: true, openai: !!k.openai, anthropic: !!k.anthropic, azure: !!k.azure } : NO_SERVER_KEYS;
      serverListeners.forEach((l) => l());
    })
    .catch(() => {});
}

export function useServerKeys(): ServerKeys {
  return useSyncExternalStore(
    (l) => {
      probeServerKeys();
      serverListeners.add(l);
      return () => void serverListeners.delete(l);
    },
    () => serverKeys,
    () => NO_SERVER_KEYS,
  );
}

// ------------------------------------------------------------------------------------- connection

export function buildConnection(s: AISettings, keys: Keys, provider: ProviderId = s.provider, urls: Urls = state.urls, server: ServerKeys = NO_SERVER_KEYS): Connection {
  const p = providerById(provider);
  const viaServer = isRelayProvider(provider) ? server[provider] : false;
  return {
    viaServer,
    provider,
    kind: p.kind,
    baseUrl: urls[provider] || p.baseUrl,
    apiKey: viaServer ? "" : (keys[provider] ?? ""),
    model: viaServer && provider === "azure" ? "from .env" : s.models[provider] || p.defaultModel,
    apiVersion: s.azureApiVersion,
  };
}

const subscribeNever = () => () => {};

/** True when the app is served by the local server (not the static copy). Azure OpenAI is only offered then. */
export function useIsLocal(): boolean {
  return useSyncExternalStore(subscribeNever, () => !IS_STATIC && isLocalHost(), () => false);
}

/** Providers this page may offer: everything locally, everything except local-only ones elsewhere. */
export function availableProviders(isLocal: boolean) {
  return PROVIDERS.filter((p) => isLocal || !p.localOnly);
}

export function isReady(c: Connection): boolean {
  const p = providerById(c.provider);
  return !!c.model && (!p.needsKey || !!c.apiKey || !!c.viaServer);
}

export const contextBudget = (s: AISettings) => s.contextChars ?? providerById(s.provider).contextChars;

/** Hook: the active connection plus whether it is ready to use (AI "on"). */
export function useConnection() {
  const settings = useAISettings();
  const { keys, urls, status, secure, error } = useAIVault();
  const isLocal = useIsLocal();
  const server = useServerKeys();
  const connection = buildConnection(settings, keys, settings.provider, urls, server);
  const allowed = isLocal || !providerById(settings.provider).localOnly; // a saved Azure choice is ignored on the static copy
  // AI is "on" only after the learner saved a setup (or chose "Use … from .env"): nothing turns on by itself.
  const ready = status === "ready" && allowed && settings.configured && isReady(connection);
  return { settings, keys, urls, secure, status, error, server, isLocal, connection, ready };
}

export { PROVIDERS };
