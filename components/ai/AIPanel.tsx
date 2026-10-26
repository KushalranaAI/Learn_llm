"use client";
// The AI tutor: a resizable panel docked on the right, plus the floating "Ask AI" button that opens it (Ctrl+/).
// It knows what the current screen shows (lib/ai/sources.ts), keeps one conversation per page, and streams answers
// rendered with KaTeX. Ported from Machine Learning 1 → 100 (AIPanel) and System Learn (ChatWidget).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type Msg, chatStore, saveThread } from "@/lib/ai/chats";
import { AIError, streamChat } from "@/lib/ai/client";
import { buildSystem, buildUserTurn, defaultSuggestions } from "@/lib/ai/prompts";
import { providerById } from "@/lib/ai/providers";
import { contextBudget, useConnection } from "@/lib/ai/settings";
import { collectContext, useChatSources } from "@/lib/ai/sources";
import { CopyButton } from "../Markdown";
import MiniMarkdown from "../MiniMarkdown";
import Icon from "../ui/Icon";
import AISettings from "./AISettings";
import { DEFAULT_WIDTH, EXPANDED_WIDTH, MAX_WIDTH, MIN_WIDTH, useAI } from "./AIProvider";
import UnlockCard from "./UnlockCard";
import "./ai.css";

/** The round button at the bottom right. */
export function AILauncher() {
  const ai = useAI();
  const { ready, status } = useConnection();
  const path = usePathname();
  const explain = useChatSources().find((s) => s.explain)?.explain;
  if (ai.open || path === "/ai") return null;
  return (
    <div className="ai-launch-group">
      {ready && explain && (
        <button type="button" className="chip-btn ai-explain-btn ai-launch-explain" onClick={() => ai.ask({ prompt: explain.prompt, send: true })}>
          <Icon name="sparkles" size={14} /> {explain.label ?? "Explain with AI"}
        </button>
      )}
      <button type="button" className={`ai-launcher ${ready ? "on" : ""}`} onClick={() => ai.openPanel("chat")} aria-label="Ask the AI tutor (Ctrl+/)" title="Ask the AI tutor (Ctrl+/)">
        <Icon name={status === "locked" ? "lock" : "sparkles"} size={17} />
        <span>{ready ? "Ask AI" : "AI tutor"}</span>
      </button>
    </div>
  );
}

export default function AIPanel() {
  const ai = useAI();
  const path = usePathname() || "/";
  const { settings, connection, ready, status } = useConnection();
  const sources = useChatSources();
  const provider = providerById(settings.provider);
  const key = path;
  const keyRef = useRef(key);
  keyRef.current = key;

  const [messages, setMessages] = useState<Msg[]>([]);
  const messagesRef = useRef<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [quote, setQuote] = useState<string | undefined>();
  const abort = useRef<AbortController | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const handled = useRef(0);
  const stick = useRef(true);

  const commit = (next: Msg[]) => {
    messagesRef.current = next;
    setMessages(next);
  };

  // each page keeps its own conversation
  useEffect(() => {
    abort.current?.abort();
    commit(chatStore.get().threads[key] ?? []);
    setError(null);
    setQuote(undefined);
    setStreaming(false);
  }, [key]);

  // keep the newest text in view unless the learner scrolled up to read
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  async function send(text: string, q: string | undefined = quote) {
    text = text.trim() || (q ? "Explain this." : "");
    if (!text || streaming) return;
    if (!ready) {
      ai.setView("settings");
      return;
    }
    const user: Msg = { role: "user", content: text, quote: q };
    const base = [...messagesRef.current, user];
    commit([...base, { role: "assistant", content: "" }]);
    setDraft("");
    setQuote(undefined);
    setError(null);
    setStreaming(true);
    stick.current = true;

    const ctrl = new AbortController();
    abort.current = ctrl;
    const threadKey = key;
    const system = buildSystem(path, settings.shareContext ? collectContext() : "", settings.shareContext, contextBudget(settings));
    const api = base.slice(-12).map((m) => ({ role: m.role, content: m.role === "user" ? buildUserTurn(m.content, m.quote) : m.content }));

    let acc = "";
    let frame = 0;
    const onSamePage = () => threadKey === keyRef.current;
    const flush = () => {
      frame = 0;
      if (onSamePage()) commit([...base, { role: "assistant", content: acc }]);
    };
    try {
      await streamChat(connection, system, api, {
        signal: ctrl.signal,
        onToken: (t) => {
          acc += t;
          if (!frame) frame = requestAnimationFrame(flush);
        },
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const err = e as AIError;
        setError({ message: err.message || "Something went wrong.", hint: err.hint });
      }
    } finally {
      if (frame) cancelAnimationFrame(frame);
      if (abort.current === ctrl) setStreaming(false);
      const final = acc ? [...base, { role: "assistant" as const, content: acc }] : base;
      saveThread(threadKey, final);
      if (onSamePage()) commit(final);
    }
  }
  const sendRef = useRef(send);
  sendRef.current = send;

  // requests from "Explain with AI" buttons and text selection
  useEffect(() => {
    const r = ai.request;
    if (!r || r.id === handled.current) return;
    handled.current = r.id;
    if (r.quote !== undefined) setQuote(r.quote);
    if (r.send && r.prompt) void sendRef.current(r.prompt, r.quote);
    else {
      setDraft(r.prompt ?? "");
      requestAnimationFrame(() => composer.current?.focus());
    }
  }, [ai.request]);

  useEffect(() => {
    if (ai.open && ai.view === "chat") requestAnimationFrame(() => composer.current?.focus());
  }, [ai.open, ai.view]);

  useEffect(() => {
    const el = composer.current;
    if (!el || !ai.open) return; // a hidden panel measures 0
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 24), 160)}px`;
  }, [draft, ai.open, ai.view]);

  const stop = () => abort.current?.abort();
  const clear = () => {
    abort.current?.abort();
    commit([]);
    setError(null);
    setQuote(undefined);
    saveThread(key, []);
  };
  const regenerate = () => {
    const last = [...messagesRef.current].reverse().find((m) => m.role === "user");
    if (!last) return;
    const idx = messagesRef.current.lastIndexOf(last);
    commit(messagesRef.current.slice(0, idx));
    void send(last.content, last.quote);
  };

  const suggestions = sources.flatMap((s) => s.suggestions ?? []).slice(0, 5);
  const starters = suggestions.length ? suggestions : defaultSuggestions(path);
  const sees = sources.map((s) => s.label).join(" · ");
  const lastAssistant = messages.length - 1;
  const width = ai.expanded ? EXPANDED_WIDTH : ai.width;

  if (!ai.open) return null;
  return (
    <aside className="ai-panel" aria-label="AI tutor" style={{ "--ai-w": `${width}px` } as React.CSSProperties} onKeyDown={(e) => e.key === "Escape" && !streaming && ai.closePanel()}>
      <div
        className="ai-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the AI tutor. Drag, or use the left and right arrow keys; double-click to reset."
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        onDoubleClick={() => ai.setWidth(DEFAULT_WIDTH)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); ai.setWidth(width + 32); }
          if (e.key === "ArrowRight") { e.preventDefault(); ai.setWidth(width - 32); }
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = width;
          const el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          document.body.classList.add("ai-resizing");
          const move = (ev: PointerEvent) => ai.setWidth(startW + (startX - ev.clientX)); // dragging left makes it wider
          const up = () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", up);
            el.removeEventListener("pointercancel", up);
            document.body.classList.remove("ai-resizing");
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", up);
          el.addEventListener("pointercancel", up);
        }}
      />
      <header className="ai-head">
        <div className="ai-title">
          <span className="ai-title-icon"><Icon name="sparkles" size={16} /></span>
          <div>
            <b>AI tutor</b>
            <button type="button" className="ai-model" onClick={() => ai.setView(ai.view === "settings" ? "chat" : "settings")} title="AI settings">
              {ready ? `${provider.label} · ${connection.model}` : "Not set up"}
            </button>
          </div>
        </div>
        <div className="ai-head-actions">
          {ai.view === "chat" && messages.length > 0 && (
            <button type="button" className="icon-btn" onClick={clear} aria-label="Clear this conversation" title="Clear conversation">
              <Icon name="trash" size={16} />
            </button>
          )}
          <button type="button" className={`icon-btn ${ai.expanded ? "on" : ""}`} onClick={ai.toggleExpanded} aria-pressed={ai.expanded} aria-label={ai.expanded ? "Make the AI tutor narrower" : "Expand the AI tutor"} title={ai.expanded ? "Narrower" : "Wider"}>
            <Icon name="expand" size={16} />
          </button>
          <button type="button" className={`icon-btn ${ai.view === "settings" ? "on" : ""}`} onClick={() => ai.setView(ai.view === "settings" ? "chat" : "settings")} aria-label="AI settings" title="AI settings">
            <Icon name="sliders" size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={ai.closePanel} aria-label="Close AI tutor" title="Close (Ctrl+/)">
            <Icon name="x" size={16} />
          </button>
        </div>
      </header>

      {ai.view === "settings" ? (
        <div className="ai-body">
          <AISettings onDone={() => ai.setView("chat")} />
          <p className="muted small" style={{ marginTop: 16 }}>
            All settings are also on the <Link href="/ai" onClick={ai.closePanel}>AI page</Link>.
          </p>
        </div>
      ) : (
        <>
          <div
            className="ai-body ai-messages"
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {status === "locked" && <UnlockCard />}
            {!ready && status !== "locked" && (
              <div className="ai-empty card">
                <div className="ai-empty-icon"><Icon name="sparkles" size={20} /></div>
                <h3>Add AI to get a tutor</h3>
                <p className="muted small">
                  Optional. Bring your own Claude, OpenAI or Gemini key, or run a free model on your computer with Ollama. The course works exactly the same without it.
                </p>
                <div className="row" style={{ justifyContent: "center" }}>
                  <button type="button" className="btn primary" onClick={() => ai.setView("settings")}>
                    <Icon name="key" size={16} /> Add AI
                  </button>
                  <Link href="/ai" className="btn ghost" onClick={ai.closePanel}>Open AI settings</Link>
                </div>
              </div>
            )}

            {ready && messages.length === 0 && (
              <div className="ai-intro">
                <h3>{sources[0] ? `Ask about “${sources[0].label}”` : "Ask me anything about LLMs"}</h3>
                <p className="muted small">
                  Highlight any text and press <b>Explain</b>, or just type. {settings.shareContext ? (sees ? "I can see this screen." : "") : "I can’t see the screen (turned off in Settings)."}
                </p>
                <div className="ai-suggestions">
                  {starters.map((s) => (
                    <button key={s} type="button" className="ai-suggestion" onClick={() => send(s)}>
                      <Icon name="lightbulb" size={14} /> {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}`}>
                {m.role === "user" ? (
                  <div className="ai-bubble">
                    {m.quote && <blockquote className="ai-quote">{m.quote.length > 220 ? m.quote.slice(0, 220) + "…" : m.quote}</blockquote>}
                    {m.content}
                  </div>
                ) : (
                  <div className="ai-answer">
                    {m.content ? <MiniMarkdown>{m.content}</MiniMarkdown> : <span className="ai-typing" aria-label="Thinking"><i /><i /><i /></span>}
                    {m.content && !(streaming && i === lastAssistant) && (
                      <div className="ai-msg-actions">
                        <CopyButton text={m.content} />
                        {i === lastAssistant && (
                          <button type="button" className="chip-btn" onClick={regenerate}>
                            <Icon name="refresh" size={14} /> Retry
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {error && (
              <div className="ai-notice bad" role="alert">
                <Icon name="alert" size={16} />
                <div className="small">
                  <b>{error.message}</b>
                  {error.hint && <div>{error.hint}</div>}
                  <div className="row" style={{ marginTop: 8 }}>
                    <button type="button" className="chip-btn" onClick={regenerate}><Icon name="refresh" size={14} /> Try again</button>
                    <button type="button" className="chip-btn" onClick={() => ai.setView("settings")}><Icon name="sliders" size={14} /> Settings</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <form
            className="ai-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            {quote && (
              <div className="ai-quote-bar">
                <Icon name="quote" size={14} />
                <span>{quote.length > 160 ? quote.slice(0, 160) + "…" : quote}</span>
                <button type="button" className="icon-btn" onClick={() => setQuote(undefined)} aria-label="Remove quoted text">
                  <Icon name="x" size={14} />
                </button>
              </div>
            )}
            <div className="ai-composer-row">
              <textarea
                ref={composer}
                value={draft}
                rows={1}
                placeholder={ready ? (quote ? "Ask about the selected text…" : "Ask a question…") : "Add AI first"}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                aria-label="Message to the AI tutor"
              />
              {streaming ? (
                <button type="button" className="btn primary ai-round" onClick={stop} aria-label="Stop generating">
                  <Icon name="stop" size={16} />
                </button>
              ) : (
                <button type="submit" className="btn primary ai-round" disabled={!draft.trim() && !quote} aria-label="Send">
                  <Icon name="send" size={16} />
                </button>
              )}
            </div>
            <div className="ai-composer-foot muted">
              <span>Enter to send · Shift+Enter new line · Ctrl+/ toggles</span>
              <span title={sees}>{settings.shareContext ? (sees ? `Sees: ${sees}` : "Screen shared") : "Screen not shared"} · AI can make mistakes</span>
            </div>
          </form>
        </>
      )}
    </aside>
  );
}
