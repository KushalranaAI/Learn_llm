"use client";
// Choose a provider, add a key (or use the one in .env), pick a model, test, save. Used on /ai and inside the tutor panel.
// Ported from Machine Learning 1 → 100 (web/components/ai/AISettings.tsx).
import { useEffect, useState } from "react";
import { clearChats } from "@/lib/ai/chats";
import { listModels } from "@/lib/ai/client";
import { type ProviderId, isRelayProvider, providerById } from "@/lib/ai/providers";
import { IS_STATIC, availableProviders, buildConnection, forgetAllKeys, isReady, lockVault, moveKeys, probeServerKeys, saveCredentials, setProtection, updateSettings, useConnection } from "@/lib/ai/settings";
import Icon from "../ui/Icon";
import UnlockCard from "./UnlockCard";
import "./ai.css";

type Status = { tone: "idle" | "busy" | "ok" | "bad"; message?: string; hint?: string };

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <i />
    </button>
  );
}

export default function AISettings({ onDone }: { onDone?: () => void }) {
  const { settings, keys, urls, secure, status: vaultStatus, server, connection, isLocal, ready } = useConnection();
  const offered = availableProviders(isLocal); // Azure OpenAI only shows up when the local server serves this page
  const provider = offered.find((p) => p.id === settings.provider) ?? offered[0];
  const [apiKey, setApiKey] = useState(keys[provider.id] ?? "");
  const [baseUrl, setBaseUrl] = useState(urls[provider.id] ?? provider.baseUrl);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ tone: "idle" });
  const [settingUp, setSettingUp] = useState(false);
  const [pass1, setPass1] = useState("");
  const [pass2, setPass2] = useState("");
  const [protectErr, setProtectErr] = useState("");
  const [protectMsg, setProtectMsg] = useState("");

  // switching provider (or the vault opening) loads that provider's saved values
  const savedKey = keys[provider.id] ?? "";
  const savedUrl = urls[provider.id] ?? provider.baseUrl;
  useEffect(() => {
    setApiKey(savedKey);
    setBaseUrl(savedUrl);
    setModels([]);
    setStatus({ tone: "idle" });
  }, [provider.id, savedKey, savedUrl]);

  const fromEnv = isRelayProvider(provider.id) && server[provider.id]; // this provider's key is in .env on this computer
  const model = settings.models[provider.id] || provider.defaultModel;
  const suggestions = [...new Set([...(provider.suggestedModels ?? []), ...models])];
  const envProviders = (["anthropic", "openai", "azure"] as const).filter((id) => server[id] && (isLocal || !providerById(id).localOnly));

  function persist() {
    const key = apiKey.trim();
    const base = baseUrl.trim() || provider.baseUrl;
    if (!fromEnv) saveCredentials(provider.id, key, base === provider.baseUrl ? undefined : base, settings.remember);
    return { key, base };
  }

  async function test() {
    setStatus({ tone: "busy", message: "Connecting…" });
    const { key, base } = persist();
    const probe = buildConnection(settings, { [provider.id]: key }, provider.id, { [provider.id]: base }, server); // a key held in .env is never probed from the browser
    try {
      const found = await listModels(probe);
      setModels(found);
      const preferred = found.length && !found.includes(model) ? (found.find((m) => m === provider.defaultModel) ?? found[0]) : model;
      updateSettings({ models: { ...settings.models, [provider.id]: preferred }, configured: true });
      setStatus({
        tone: "ok",
        message: fromEnv
          ? "Ready. The local server will attach the key from .env."
          : found.length
            ? `Connected - ${found.length} models available. Saved.`
            : provider.kind === "azure"
              ? "Endpoint and key accepted. Now enter your deployment name below."
              : "Connected, but no models were listed. Type a model name below.",
      });
    } catch (e) {
      const err = e as { message?: string; hint?: string };
      setStatus({ tone: "bad", message: err.message ?? "Could not connect.", hint: err.hint });
    }
  }

  function save() {
    persist();
    updateSettings({ configured: true });
    setStatus({ tone: "ok", message: "Saved. The tutor and the Explain with AI buttons are on." });
    onDone?.();
  }

  const draft = buildConnection(settings, { [provider.id]: apiKey.trim() }, provider.id, { [provider.id]: baseUrl.trim() || provider.baseUrl }, server);
  const canSave = isReady(draft) && !(provider.kind === "azure" && !fromEnv && !baseUrl.trim());

  return (
    <div className="ai-settings">
      {envProviders.length > 0 && (
        <div className="ai-notice ok">
          <Icon name="shield" size={16} />
          <div className="small">
            <b>Keys found in your <code>.env</code> file</b> (they stay on this computer; the browser never sees them).
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              {envProviders.map((id) => (
                <button key={id} type="button" className={`chip-btn ${settings.provider === id && ready ? "on" : ""}`} onClick={() => { updateSettings({ provider: id, configured: true }); setStatus({ tone: "ok", message: `Using the ${providerById(id).label} key from .env.` }); }}>
                  <Icon name="key" size={13} /> Use {providerById(id).label} from .env
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {server.relay && envProviders.length === 0 && (
        <p className="muted small">
          Tip: running locally, you can keep keys out of the browser entirely: copy <code>.env.example</code> to <code>.env</code>, add a key, and reload. See <code>docs/AI.md</code>.
        </p>
      )}

      <section className="ai-section">
        <h3>Choose your AI</h3>
        <div className="ai-provider-grid" role="radiogroup" aria-label="AI provider">
          {offered.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={p.id === provider.id} className={`ai-provider ${p.id === provider.id ? "selected" : ""}`} onClick={() => updateSettings({ provider: p.id as ProviderId })}>
              <span className="ai-provider-top">
                <b>{p.label}</b>
                <span className="row" style={{ gap: 4 }}>
                  {isRelayProvider(p.id) && server[p.id] && <span className="pill accent">.env</span>}
                  <span className={`pill ${p.local ? "accent" : ""}`}>{p.local ? "local" : "cloud"}</span>
                </span>
              </span>
              <span className="muted small">{p.tagline}</span>
            </button>
          ))}
        </div>
        {IS_STATIC && <p className="muted small" style={{ marginTop: 8 }}>This is the static copy of the course: Azure OpenAI and keys from <code>.env</code> need the app running locally (<code>npm run dev</code>).</p>}
      </section>

      <section className="ai-section">
        <h3>Connect {provider.label}</h3>
        <p className="muted small">{provider.setup}</p>

        {provider.editableBaseUrl && !fromEnv && (
          <label className="ai-field">
            <span>{provider.baseLabel ?? "Server address"}</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} autoComplete="off" placeholder={provider.basePlaceholder ?? provider.baseUrl} />
          </label>
        )}

        {provider.kind === "azure" && !fromEnv && (
          <label className="ai-field">
            <span>API version</span>
            <input value={settings.azureApiVersion} onChange={(e) => updateSettings({ azureApiVersion: e.target.value })} spellCheck={false} autoComplete="off" placeholder="2024-10-21" />
            <small className="muted">Leave the default unless your deployment needs a different version.</small>
          </label>
        )}

        {fromEnv && (
          <div className="ai-notice ok" role="status">
            <Icon name="shield" size={16} />
            <div className="small"><b>Using the key in your <code>.env</code> file.</b> It stays on this computer and is attached by the local server: nothing to paste, nothing stored in the browser.</div>
          </div>
        )}

        {(provider.needsKey || provider.id === "custom") && !fromEnv && (
          <label className="ai-field">
            <span className="ai-field-label">
              {provider.keyLabel}
              {provider.keyUrl && (
                <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="ai-field-link">
                  Get a key <Icon name="external" size={12} />
                </a>
              )}
            </span>
            <span className="ai-input-row">
              <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} spellCheck={false} autoComplete="off" placeholder={provider.needsKey ? "Paste your key" : "Optional"} />
              <button type="button" className="icon-btn" onClick={() => setShowKey(!showKey)} aria-label={showKey ? "Hide key" : "Show key"}>
                <Icon name={showKey ? "eye-off" : "eye"} size={16} />
              </button>
            </span>
          </label>
        )}

        {fromEnv && provider.kind === "azure" ? (
          <p className="muted small">The endpoint and deployment come from <code>AZURE_OPENAI_ENDPOINT</code> and <code>AZURE_OPENAI_DEPLOYMENT</code> in your <code>.env</code>.</p>
        ) : (
          <label className="ai-field">
            <span>{provider.modelLabel ?? "Model"}</span>
            <input
              list="ai-models"
              value={settings.models[provider.id] ?? provider.defaultModel}
              onChange={(e) => updateSettings({ models: { ...settings.models, [provider.id]: e.target.value } })}
              spellCheck={false}
              autoComplete="off"
              placeholder={provider.id === "custom" ? "Name of a model your server has loaded" : provider.kind === "azure" ? "e.g. my-gpt-4o" : provider.defaultModel}
            />
            <datalist id="ai-models">{suggestions.map((m) => <option key={m} value={m} />)}</datalist>
            <small className="muted">{provider.modelHelp ?? (provider.suggestedModels ? `Suggested: ${provider.suggestedModels.join(", ")}. Or type any model name.` : "Pick from the list after testing, or type any model name.")}</small>
          </label>
        )}

        <div className="row">
          <button type="button" className="btn" onClick={test} disabled={status.tone === "busy" || (provider.needsKey && !apiKey.trim() && !fromEnv) || (provider.kind === "azure" && !fromEnv && !baseUrl.trim())}>
            <Icon name="zap" size={16} /> {status.tone === "busy" ? "Testing…" : "Test connection"}
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={!canSave}>
            <Icon name="check" size={16} /> Save and use AI
          </button>
          {keys[provider.id] && !fromEnv && (
            <button type="button" className="btn ghost" onClick={() => { saveCredentials(provider.id, "", undefined, settings.remember); setApiKey(""); setStatus({ tone: "idle" }); }}>
              Remove key
            </button>
          )}
        </div>
        {status.message && (
          <div className={`ai-notice ${status.tone}`} role="status">
            <Icon name={status.tone === "ok" ? "circle-check" : status.tone === "bad" ? "alert" : "info"} size={16} />
            <div className="small">
              {status.message}
              {status.hint && <div>{status.hint}</div>}
            </div>
          </div>
        )}
      </section>

      <section className="ai-section">
        <h3>Where your key is stored</h3>
        <div className="ai-choice" role="radiogroup" aria-label="Key storage">
          {[
            { v: true, t: "On this device", d: "Encrypted in this browser until you remove it." },
            { v: false, t: "This session only", d: "Forgotten when you close the tab." },
          ].map((o) => (
            <button key={String(o.v)} type="button" role="radio" aria-checked={settings.remember === o.v} className={`ai-choice-opt ${settings.remember === o.v ? "selected" : ""}`} onClick={() => { updateSettings({ remember: o.v }); moveKeys(o.v); }}>
              <b>{o.t}</b>
              <span className="muted small">{o.d}</span>
            </button>
          ))}
        </div>
        {secure ? (
          <div className="ai-notice info">
            <Icon name="shield" size={16} />
            <div className="small">
              <b>Encrypted at rest (AES-256-GCM).</b> A copy of the stored data is unreadable on its own. Keys go only to the provider you chose; no course server ever sees them.
              <br /><b>What it can&apos;t stop:</b> with &quot;this device&quot; protection, anything running in this page, or anyone using your unlocked browser, can still use the saved key. A passphrase fixes the second case. Prefer a key with a spending limit.
            </div>
          </div>
        ) : (
          <div className="ai-notice bad" role="alert">
            <Icon name="alert" size={16} />
            <div className="small">
              <b>Can&apos;t encrypt on this address.</b> Browsers only allow encryption on <code>https://</code> pages and <code>localhost</code>. Your key is kept in memory for this tab only and never written to storage.
            </div>
          </div>
        )}

        {secure && (
          <>
            <h3 style={{ marginTop: 18 }}>How it is protected</h3>
            {vaultStatus === "locked" ? (
              <UnlockCard />
            ) : (
              <>
                <div className="ai-choice" role="radiogroup" aria-label="Protection">
                  {([
                    { v: "device", t: "This device", d: "Nothing to type. A browser-held key you can't read or export." },
                    { v: "passphrase", t: "A passphrase", d: "You type it once per browser session. Without it, nobody can decrypt." },
                  ] as const).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      role="radio"
                      aria-checked={settings.protection === o.v}
                      className={`ai-choice-opt ${settings.protection === o.v ? "selected" : ""}`}
                      onClick={() => {
                        if (o.v === settings.protection) return;
                        if (o.v === "device") void setProtection("device").then(() => setProtectMsg("Now protected by this device's key."));
                        else setSettingUp(true);
                      }}
                    >
                      <b>{o.t}</b>
                      <span className="muted small">{o.d}</span>
                    </button>
                  ))}
                </div>
                {settingUp && (
                  <form
                    className="ai-passphrase"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (pass1.length < 8) return setProtectErr("Use at least 8 characters.");
                      if (pass1 !== pass2) return setProtectErr("The two passphrases don't match.");
                      try {
                        await setProtection("passphrase", pass1);
                        setSettingUp(false);
                        setPass1("");
                        setPass2("");
                        setProtectErr("");
                        setProtectMsg("Passphrase set. You'll be asked for it once per browser session. If you forget it, remove the saved keys and add them again: it can't be recovered.");
                      } catch (err) {
                        setProtectErr(err instanceof Error ? err.message : "Couldn't set the passphrase.");
                      }
                    }}
                  >
                    <label className="ai-field"><span>New passphrase (8+ characters)</span><input type="password" value={pass1} onChange={(e) => setPass1(e.target.value)} autoComplete="new-password" /></label>
                    <label className="ai-field"><span>Type it again</span><input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" /></label>
                    {protectErr && <div className="ai-notice bad" role="alert"><Icon name="alert" size={16} /><div className="small">{protectErr}</div></div>}
                    <div className="row">
                      <button type="submit" className="btn primary"><Icon name="shield" size={16} /> Protect with passphrase</button>
                      <button type="button" className="btn ghost" onClick={() => { setSettingUp(false); setProtectErr(""); setPass1(""); setPass2(""); }}>Cancel</button>
                    </div>
                  </form>
                )}
                {settings.protection === "passphrase" && !settingUp && (
                  <div className="row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn" onClick={() => lockVault()}><Icon name="lock" size={16} /> Lock now</button>
                  </div>
                )}
                {protectMsg && <div className="ai-notice ok" role="status"><Icon name="circle-check" size={16} /><div className="small">{protectMsg}</div></div>}
              </>
            )}
          </>
        )}
      </section>

      <section className="ai-section">
        <h3>What the tutor can see</h3>
        <div className="ai-switch-row">
          <Switch on={settings.shareContext} onChange={(v) => updateSettings({ shareContext: v })} label="Share the current screen with my questions" />
          <span>
            <b>Share the current screen with my questions</b>
            <span className="muted small ai-block">
              Sends what you are looking at (topic text, simulation settings and results, the lab step, your sandbox design) so answers match this course. Never quiz answers, solutions or unrevealed interview answers. {provider.local ? "Stays on your computer." : `Goes to ${provider.label}.`}
            </span>
          </span>
        </div>
        <label className="ai-field">
          <span>Amount of screen text to share</span>
          <select value={settings.contextChars ?? ""} onChange={(e) => updateSettings({ contextChars: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Automatic for {provider.label} ({provider.contextChars.toLocaleString("en-US")} characters)</option>
            <option value="2500">Small - 2,500 (tiny local models)</option>
            <option value="6000">Medium - 6,000</option>
            <option value="16000">Large - 16,000</option>
            <option value="40000">Very large - 40,000 (big-context models)</option>
          </select>
        </label>
      </section>

      <section className="ai-section">
        <h3>Reset</h3>
        <div className="row">
          <button
            type="button"
            className="btn ai-danger"
            onClick={() => {
              if (!confirm("Remove every saved API key (and its encryption key or passphrase protection) and all saved AI chats from this browser? Keys in .env are not touched.")) return;
              forgetAllKeys();
              clearChats();
              setApiKey("");
              setStatus({ tone: "idle" });
            }}
          >
            <Icon name="trash" size={16} /> Forget all keys &amp; chats
          </button>
          {ready && (
            <button type="button" className="btn ghost" onClick={() => updateSettings({ configured: false })} title="Keeps your saved keys">
              Turn AI off
            </button>
          )}
          {server.relay && (
            <button type="button" className="btn ghost" onClick={() => probeServerKeys(true)} title="Re-read which keys .env has">
              <Icon name="refresh" size={15} /> Re-check .env
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
