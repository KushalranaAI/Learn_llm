"use client";
import { useState } from "react";
import { unlockVault } from "@/lib/ai/settings";
import { VaultError } from "@/lib/ai/vault";
import Icon from "../ui/Icon";
import "./ai.css";

/** Shown when saved keys are protected by a passphrase and it hasn't been typed in this browser session yet. */
export default function UnlockCard() {
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await unlockVault(pass);
      setPass("");
    } catch (err) {
      setError(err instanceof VaultError ? err.message : "Couldn't unlock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card ai-unlock" onSubmit={submit}>
      <div className="ai-empty-icon"><Icon name="lock" size={20} /></div>
      <h3>Unlock your saved keys</h3>
      <p className="muted small">Your keys are encrypted with a passphrase. Enter it once per browser session.</p>
      <label className="ai-field">
        <span>Passphrase</span>
        <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
      </label>
      {error && <div className="ai-notice bad" role="alert"><Icon name="alert" size={16} /><div className="small">{error}</div></div>}
      <button type="submit" className="btn primary" disabled={busy || pass.length === 0}>
        <Icon name="check" size={16} /> {busy ? "Unlocking…" : "Unlock"}
      </button>
    </form>
  );
}
