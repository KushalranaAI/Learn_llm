"use client";
// /ai: the AI settings page (System Learn's AiSettingsPage), with the status chip and what the tutor does.
import { providerById } from "@/lib/ai/providers";
import { IS_STATIC, useConnection } from "@/lib/ai/settings";
import Icon from "../ui/Icon";
import { useAI } from "./AIProvider";
import AISettings from "./AISettings";
import "./ai.css";

export default function AISettingsPage() {
  const { ready, status, settings, connection, server } = useConnection();
  const ai = useAI();
  const locked = status === "locked";
  return (
    <div className="page mid stack" style={{ gap: 24 }}>
      <header className="page-head">
        <p className="eyebrow"><Icon name="sparkles" size={13} /> Optional</p>
        <h1>AI tutor</h1>
        <p className="lead">Bring your own key for a tutor that can see the topic, simulation, lab step or sandbox design you are working on. Everything in the course works the same without it.</p>
        <div className="row" style={{ marginTop: 14 }}>
          <span className={`ai-chip ${ready ? "on" : ""} ${locked ? "locked" : ""}`} role="status">
            <Icon name={locked ? "lock" : "sparkles"} size={14} />
            {locked ? "Locked: enter your passphrase" : ready ? `AI on · ${providerById(settings.provider).label} · ${connection.model}${connection.viaServer ? " (key from .env)" : ""}` : "AI off"}
          </span>
          {ready && (
            <button type="button" className="btn sm" onClick={() => ai.openPanel("chat")}>
              <Icon name="message" size={14} /> Open the tutor <kbd className="kbd">Ctrl /</kbd>
            </button>
          )}
        </div>
      </header>
      <div className="ai-page-grid">
        <div className="card">
          <AISettings />
        </div>
        <aside className="ai-page-aside">
          <div className="card tight">
            <h4>What you get</h4>
            <ul>
              <li><b>Ask AI</b>: the round button at the bottom right (or <kbd className="kbd">Ctrl /</kbd>). One conversation per page.</li>
              <li><b>Explain with AI</b> under simulation results, quiz feedback and on the sandbox. Nothing is sent until you click.</li>
              <li>Highlight any text and press <b>Explain</b>.</li>
            </ul>
          </div>
          <div className="card tight">
            <h4>Privacy</h4>
            <ul>
              <li>Keys typed here are stored only in this browser, encrypted (AES-256-GCM), and sent only to the provider you pick.</li>
              <li>{server.relay ? "This local app can also use keys from your .env file: they never reach the browser." : IS_STATIC ? "This static copy has no server. Run the app locally to use keys from a .env file or Azure OpenAI." : "Running locally, keys can also live in a .env file (see docs/AI.md)."}</li>
              <li>The tutor never sees quiz answers, worked solutions or interview answers you haven&apos;t revealed.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
