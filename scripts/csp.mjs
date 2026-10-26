// The Content-Security-Policy shared by the local app (sent as a header, see next.config.mjs) and the static GitHub Pages
// copy (a <meta> tag with a hash for every inline script, added by build-pages.mjs). It limits what the page can load and,
// above all, where it can send data: only to this app, the AI providers it supports, and servers on this computer
// (Ollama, LM Studio). A script injected into the page can't send a saved key to an unknown site.
// Ported from Machine Learning 1 → 100 (web/scripts/csp.mjs). Checked with KaTeX, Mermaid, React Flow and next/font.

const PROVIDERS = [
  "https://api.openai.com",
  "https://api.anthropic.com",
  "https://*.openai.azure.com",
  "https://*.cognitiveservices.azure.com",
  "https://*.services.ai.azure.com",
  "https://generativelanguage.googleapis.com",
];
const LOOPBACK = ["http://localhost:*", "http://127.0.0.1:*"]; // Ollama, LM Studio and similar on this machine ([::1] is not a valid CSP source)

/** @param {{ scriptSrc?: string[], dev?: boolean }} opts */
export function contentSecurityPolicy({ scriptSrc = ["'self'", "'unsafe-inline'"], dev = false } = {}) {
  return [
    "default-src 'self'",
    `script-src ${[...scriptSrc, ...(dev ? ["'unsafe-eval'"] : [])].join(" ")}`,
    "style-src 'self' 'unsafe-inline'", // React, KaTeX, Mermaid and React Flow set inline styles
    "img-src 'self' data: blob:",
    "font-src 'self' data:", // next/font and KaTeX fonts are served by this app
    `connect-src ${["'self'", ...PROVIDERS, ...LOOPBACK, ...(dev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : [])].join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
}
