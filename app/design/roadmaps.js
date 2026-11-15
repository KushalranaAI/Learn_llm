/* =========================================================================
   Learn in Public - the roadmap family, shared by every app.

   One framework-free ES module, byte-identical in every app. The reference copy lives in the
   learn-in-public hub repo (src/design/roadmaps.js); change it there and copy it across (FAMILY.md).

   It holds:
   - FAMILY, STAGES, ROADMAPS: who we are, the recommended journey and every roadmap in it.
   - <kr-roadmaps current="ml" done="12" total="58" resume-href="…" resume-label="…">
       the "Roadmaps" button for the top bar. A disclosure (button + <nav> of plain links, WAI-ARIA APG):
       it lists every roadmap, marks the one you are in (aria-current) and the one to take next, and
       shows your progress in each. Nothing is locked: the order is a recommendation.
   - <kr-next-roadmap current="ml">
       a "Where to go next" block for a home page or the end of a course.
   - Shared progress: <kr-roadmaps> saves {done, total, resume} for its app under "kr:roadmap:<id>".
       Every hosted app lives on https://kushalranaai.github.io/<repo>/, one origin, so the hub and
       every switcher can read all of them. Locally each app runs on its own port and sees only itself.

   Both elements render into a shadow root, so no app stylesheet leaks in, and read colour, type and
   radius from the shared design tokens (design/tokens.css), so they follow the app's light/dark theme.
   ========================================================================= */

export const FAMILY = Object.freeze({
  name: "Learn in Public",
  author: "Kushal Rana",
  tagline: "Free, hands-on roadmaps from your first class to production AI systems.",
  hub: "https://kushalranaai.github.io/learn-in-public/",
  repo: "https://github.com/KushalranaAI/learn-in-public",
});

/** The journey, in order. Every roadmap belongs to one stage. */
export const STAGES = Object.freeze([
  { id: "code", n: 1, title: "Write code", text: "Programming foundations: three languages, objects and clean design." },
  { id: "data", n: 2, title: "Learn from data", text: "Classical machine learning, from the maths to neural networks." },
  { id: "llm", n: 3, title: "Build with LLMs", text: "How language models work, then retrieval, agents and AI engineering." },
  { id: "systems", n: 4, title: "Design systems", text: "Architecture at scale: the systems around your code and your models." },
]);

/* Glyphs drawn on the 32px emerald family tile (stroke and fill use --on-accent). */
const GLYPHS = {
  hub: '<path d="M10 19.4V17a3 3 0 0 1 3-3h6a3 3 0 0 0 3-3v-.6" stroke-width="2.4"/><circle cx="10" cy="22" r="2.6" class="f"/><circle cx="22" cy="9.6" r="2.6" class="f"/>',
  oop: '<path d="M16 7.5l7.5 4.2v8.6L16 24.5l-7.5-4.2v-8.6z" stroke-width="2.2"/><path d="M8.5 11.7 16 16l7.5-4.3M16 16v8.5" stroke-width="2.2"/>',
  python: '<path d="m9.5 11 5 5-5 5"/><path d="M17 21.5h6"/>',
  ml: '<path d="M8 22 24 10" stroke-width="2.2" opacity=".6"/><circle cx="11.5" cy="15.5" r="2.2" class="f"/><circle cx="16.5" cy="19.5" r="2.2" class="f"/><circle cx="21" cy="10" r="2.2" class="f"/>',
  llm: '<path d="M11.5 8h9a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-5l-4 3.5V20a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" stroke-width="2.2"/><circle cx="12.6" cy="14" r="1.5" class="f"/><circle cx="16" cy="14" r="1.5" class="f"/><circle cx="19.4" cy="14" r="1.5" class="f"/>',
  rag: '<circle cx="13.5" cy="13.5" r="5.5"/><path d="m17.6 17.6 4.4 4.4"/><path d="M21 8.5h4.5M23.25 6.25v4.5" stroke-width="2"/>',
  ai: '<path d="M9 22.5 16 9l7 13.5"/><circle cx="16" cy="18.2" r="2.3" class="f"/>',
  system: '<path d="M8 22h4v-6H8zm6 0h4V10h-4zm6 0h4v-9h-4z" class="f"/>',
};

/**
 * Every roadmap, in the recommended order. `url` is the hosted copy (null when the roadmap only runs
 * locally; then `repo` is the way in). `next` lists what to take after it, best first.
 */
export const ROADMAPS = Object.freeze([
  {
    id: "oop",
    name: "OOP All-in-One",
    stage: "code",
    level: "Beginner",
    tagline: "Objects in Python, C++ and JavaScript, side by side.",
    summary: "Start from zero: the basics of three languages, how an object is born in memory, every core OOP idea with step-through diagrams, and five projects built in all three.",
    ready: "You can use a computer and want to start programming. No experience needed.",
    stats: ["18 basics lessons", "11 concepts", "5 projects"],
    url: "https://kushalranaai.github.io/OOP-All-In-One/",
    repo: "https://github.com/KushalranaAI/OOP-All-In-One",
    next: ["python", "system"],
  },
  {
    id: "python",
    name: "Python Projects",
    stage: "code",
    level: "Beginner to advanced",
    tagline: "Clean, object-oriented Python by building 20 apps.",
    summary: "Twenty end-to-end projects, from a guessing game to a search engine and an interpreter. Each has a build guide, diagrams, a test suite you run from the browser and a small web UI.",
    ready: "You know Python basics (variables, loops, functions) and some classes.",
    stats: ["20 projects", "12 guides", "295 tests"],
    url: null,
    repo: "https://github.com/KushalranaAI/Python-Projects",
    next: ["ml", "system"],
  },
  {
    id: "ml",
    name: "ML 1 → 100",
    stage: "data",
    level: "Intermediate",
    tagline: "All of classical machine learning, derived and built from scratch.",
    summary: "From raw data to gradient boosting, neural networks and reinforcement learning. Every algorithm is derived, written in NumPy and checked against scikit-learn.",
    ready: "You are comfortable in Python and remember high-school maths.",
    stats: ["58 lessons", "16 visualisers", "5 projects"],
    url: "https://kushalranaai.github.io/machine-learning-1-to-100/",
    repo: "https://github.com/KushalranaAI/machine-learning-1-to-100",
    next: ["llm", "rag"],
  },
  {
    id: "llm",
    name: "LLM 1 → 100",
    stage: "llm",
    level: "Intermediate",
    tagline: "How large language models work, and how they are built.",
    summary: "Tokenizers, attention, training, fine-tuning, inference and evaluation, with the maths worked through on real numbers, live simulations and labs.",
    ready: "You know Python and the basics of machine learning: what training and a loss are.",
    stats: ["7 modules", "270+ topics", "Labs"],
    url: "https://kushalranaai.github.io/Learn_llm/",
    repo: "https://github.com/KushalranaAI/Learn_llm",
    next: ["rag", "ai"],
  },
  {
    id: "rag",
    name: "RAG in 30 Days",
    stage: "llm",
    level: "Intermediate",
    tagline: "Retrieval-augmented generation, from your first embedding to MCP agents.",
    summary: "One topic a day for 30 days: embeddings, chunking, hybrid search, reranking, evaluation, agentic RAG and MCP, then 15 portfolio projects.",
    ready: "You can write Python and have called an API. LLM 1 → 100 helps but is not required.",
    stats: ["30 days", "15 projects", "3 MCP servers"],
    url: "https://kushalranaai.github.io/All-in-One-RAG_tutorials/",
    repo: "https://github.com/KushalranaAI/All-in-One-RAG_tutorials",
    next: ["ai", "system"],
  },
  {
    id: "ai",
    name: "AI Engineer Path",
    stage: "llm",
    level: "Advanced",
    tagline: "From writing software to shipping AI systems in production.",
    summary: "Seventeen levels from foundations to serving, evaluation, security and interviews, with guided projects and a studio where you design and simulate AI systems.",
    ready: "You can build software and have used an LLM API; RAG in 30 Days is a good warm-up.",
    stats: ["17 levels", "198 modules", "22 projects"],
    url: "https://kushalranaai.github.io/AI-engineering/",
    repo: "https://github.com/KushalranaAI/AI-engineering",
    next: ["system", "llm"],
  },
  {
    id: "system",
    name: "System Learn",
    stage: "systems",
    level: "All levels",
    tagline: "System design by building it: wire it, load it, break it, fix it.",
    summary: "Wire servers, caches, queues and databases on a canvas, push traffic through them and watch what fails. Lessons, labs and simulations up to AI system design.",
    ready: "You have built a small web app. Interview prep starts at any level.",
    stats: ["288 lessons", "38 labs", "37 simulations"],
    url: "https://kushalranaai.github.io/system_learn/",
    repo: "https://github.com/KushalranaAI/system_learn",
    next: ["ai", "llm"],
  },
].map((r) => Object.freeze({ ...r, glyph: GLYPHS[r.id] })));

export const roadmapById = (id) => ROADMAPS.find((r) => r.id === id) ?? null;

/** Where a roadmap opens: the hosted copy, or its repository when it only runs locally. */
export const roadmapHref = (r) => r.url ?? r.repo;

/** What to take after `id`, best first. */
export const nextRoadmaps = (id) => (roadmapById(id)?.next ?? []).map(roadmapById).filter(Boolean);

/** The family tile as an SVG string. `id` is a roadmap id or "hub". */
export function tileSvg(id, size = 28) {
  const glyph = id === "hub" ? GLYPHS.hub : GLYPHS[id] ?? GLYPHS.hub;
  return `<svg class="tile" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="8" fill="var(--accent, #10b981)"/><g fill="none" stroke="var(--on-accent, #03130c)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}

/* ---------- shared progress ---------- */
const KEY = (id) => `kr:roadmap:${id}`;

/** { done, total, href, label, at } for a roadmap, or null when this browser has never opened it (on this origin). */
export function readProgress(id) {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY(id));
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Merge `patch` into a roadmap's saved summary. Only <kr-roadmaps> calls this for its own app. */
export function saveProgress(id, patch) {
  try {
    const next = { ...(readProgress(id) ?? {}), ...patch, at: Date.now() };
    localStorage.setItem(KEY(id), JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

/** 0..1, or null when there is nothing to measure yet. */
export function progressRatio(p) {
  const done = Number(p?.done), total = Number(p?.total);
  return total > 0 && done >= 0 ? Math.min(1, done / total) : null;
}

/* ---------- elements ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ARROW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const GRID = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>';

const SHARED_CSS = `
:host { font: inherit; color: var(--text, #e8ebf2); }
* { box-sizing: border-box; }
.tile { display: block; flex: none; border-radius: 8px; }
.tile .f { fill: var(--on-accent, #03130c); stroke: none; }
a { color: inherit; text-decoration: none; }
a:focus-visible, button:focus-visible { outline: none; box-shadow: var(--ring, 0 0 0 3px #10b98140); }
.meter { display: block; height: 4px; border-radius: 99px; background: var(--panel-3, #222836); overflow: hidden; }
.meter > span { display: block; height: 100%; border-radius: 99px; background: var(--accent, #10b981); }
.pill { display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line, #232937); background: var(--panel-2, #1a1f2a); color: var(--muted, #828aa0); font-weight: 600; white-space: nowrap; line-height: 1.6; }
.pill.accent { color: var(--accent-strong, #34d399); border-color: var(--accent-line, #10b98140); background: var(--accent-soft, #10b9811a); }
.pill.here { color: var(--text, #e8ebf2); border-color: var(--line-2, #2e3546); }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

const SWITCHER_CSS = `
:host { display: inline-flex; position: relative; flex: none; }
.btn { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; border-radius: var(--r-sm, 8px); color: var(--muted, #828aa0); font-weight: 500; font-size: 0.9rem; white-space: nowrap; transition: color 0.15s, background 0.15s, box-shadow 0.15s; }
.btn:hover, .btn[aria-expanded="true"] { color: var(--text, #e8ebf2); background: var(--panel, #141821); }
.btn[aria-expanded="true"] { box-shadow: inset 0 0 0 1px var(--line, #232937); }
.btn[aria-expanded="true"] svg { color: var(--accent-strong, #34d399); }
.btn:focus-visible { box-shadow: var(--ring, 0 0 0 3px #10b98140); }
:host([label="none"]) .label { display: none; }
:host([label="none"]) .btn { padding: 0; width: 34px; justify-content: center; }
@media (max-width: 720px) { :host(:not([label="always"])) .label { display: none; } :host(:not([label="always"])) .btn { padding: 0; width: 34px; justify-content: center; } }

.panel { position: fixed; inset: auto; margin: 0; padding: 0; width: min(440px, calc(100vw - 24px)); max-height: min(680px, calc(100vh - 76px)); overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--line-2, #2e3546) transparent; border: 1px solid var(--line-2, #2e3546); border-radius: var(--r-lg, 16px); background: var(--bg-2, #0f1218); color: var(--text, #e8ebf2); box-shadow: var(--shadow-lg, 0 20px 50px #00000080); z-index: 1000; }
.panel:not([popover]) { display: none; }
.panel:not([popover]).open { display: block; }
.panel:popover-open { animation: kr-in 0.16s var(--ease, ease-out); }
@keyframes kr-in { from { opacity: 0; transform: translateY(-4px); } }
.head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line, #232937); background: var(--panel, #141821); position: sticky; top: 0; z-index: 1; }
.head a.family { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; border-radius: 8px; }
.head b { display: block; font-size: 0.95rem; letter-spacing: -0.01em; }
.head small { display: block; color: var(--muted, #828aa0); font-size: 0.76rem; }
.head .all { display: inline-flex; align-items: center; gap: 4px; color: var(--accent-strong, #34d399); font-size: 0.8rem; font-weight: 600; white-space: nowrap; border-radius: 6px; }
.head .all:hover { text-decoration: underline; text-underline-offset: 3px; }
.stage { display: flex; align-items: center; gap: 8px; margin: 0; padding: 12px 18px 4px; color: var(--muted, #828aa0); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 650; }
.stage .n { font-family: var(--mono, ui-monospace, monospace); color: var(--faint, #5b6378); }
ul { list-style: none; margin: 0; padding: 0 8px; }
.item { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 7px 10px; border-radius: 10px; transition: background 0.15s; }
a.item:hover { background: var(--panel-2, #1a1f2a); }
.item.current { background: var(--accent-soft, #10b9811a); box-shadow: inset 0 0 0 1px var(--accent-line, #10b98140); }
.item .txt { min-width: 0; }
.item b { display: block; font-size: 0.88rem; font-weight: 600; }
.item small { display: block; color: var(--muted, #828aa0); font-size: 0.77rem; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 0.72rem; color: var(--muted, #828aa0); font-variant-numeric: tabular-nums; }
.item .meta .meter { width: 52px; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; padding: 11px 18px; border-top: 1px solid var(--line, #232937); color: var(--muted, #828aa0); font-size: 0.76rem; }
.foot a { color: var(--accent-strong, #34d399); font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 6px; }
`;

const NEXT_CSS = `
:host { display: block; }
:host([hidden]) { display: none; }
h2 { font-size: 1.05rem; font-weight: 650; letter-spacing: -0.01em; line-height: 1.2; margin: 0 0 6px; color: var(--text, #e8ebf2); }
.sub { margin: 0 0 14px; color: var(--muted, #828aa0); font-size: 0.88rem; line-height: 1.5; }
.sub a { color: var(--accent-strong, #34d399); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; }
.card { display: flex; flex-direction: column; gap: 6px; padding: 18px 20px; border-radius: var(--r-lg, 16px); background: var(--panel, #141821); border: 1px solid var(--line, #232937); color: var(--text, #e8ebf2); transition: border-color 0.2s, transform 0.2s var(--ease, ease), box-shadow 0.2s; min-width: 0; }
.card:hover { border-color: var(--line-2, #2e3546); transform: translateY(-2px); box-shadow: var(--shadow, 0 8px 24px #00000059); }
.card.primary { border-color: var(--accent-line, #10b98140); background: linear-gradient(135deg, var(--accent-soft, #10b9811a), transparent 60%), var(--panel, #141821); }
.card.primary:hover { border-color: var(--accent, #10b981); }
@media (min-width: 760px) { .grid.has-more .card.primary { grid-column: span 2; } }
.top { display: flex; align-items: center; gap: 12px; }
.eyebrow { display: block; color: var(--accent-strong, #34d399); text-transform: uppercase; font-size: 0.66rem; letter-spacing: 0.12em; font-weight: 650; }
.card:not(.primary) .eyebrow { color: var(--muted, #828aa0); }
h3 { margin: 2px 0 0; font-size: 1.02rem; font-weight: 650; letter-spacing: -0.01em; }
.tag { margin: 4px 0 0; color: var(--text-2, #b9c0cf); font-size: 0.88rem; line-height: 1.5; flex: 1; }
.stats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.go { display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; color: var(--accent-strong, #34d399); font-size: 0.82rem; font-weight: 600; }
.prog { display: flex; align-items: center; gap: 8px; margin-top: 6px; color: var(--muted, #828aa0); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
.prog .meter { flex: 1; }
:host([compact]) .card { padding: 14px 16px; }
:host([compact]) .tag { display: none; }
`;

function sheet(css) {
  try {
    const s = new CSSStyleSheet();
    s.replaceSync(css);
    return s;
  } catch {
    return null; // older browsers: fall back to a <style> element
  }
}

function adopt(root, css) {
  const s = sheet(css);
  if (s && "adoptedStyleSheets" in root) root.adoptedStyleSheets = [s];
  else root.innerHTML = `<style>${css}</style>`;
}

function progressMeta(p) {
  const ratio = progressRatio(p);
  if (ratio === null) return "";
  return `<span>${esc(p.done)}/${esc(p.total)}</span><span class="meter"><span style="width:${Math.round(ratio * 100)}%"></span></span>`;
}

const Base = typeof HTMLElement === "undefined" ? class {} : HTMLElement;

/** The "Roadmaps" button and panel for the top bar. */
class KrRoadmaps extends Base {
  static observedAttributes = ["current", "done", "total", "resume-href", "resume-label"];

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    adopt(this.root, SHARED_CSS + SWITCHER_CSS);
    this.onKey = this.onKey.bind(this);
    this.onOutside = this.onOutside.bind(this);
    this.place = this.place.bind(this);
  }

  connectedCallback() {
    this.render();
    this.save();
    window.addEventListener("resize", this.place);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.place);
    this.closeFallback();
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    this.save();
    if (this.isOpen()) this.fillPanel();
  }

  /** Saves this app's progress so the hub and the other apps can show it. */
  save() {
    const id = this.getAttribute("current");
    if (!roadmapById(id)) return;
    const patch = {};
    const done = this.getAttribute("done"), total = this.getAttribute("total");
    if (total !== null && Number(total) > 0) Object.assign(patch, { done: Math.max(0, Number(done) || 0), total: Number(total) });
    const href = this.getAttribute("resume-href");
    if (href) {
      try { patch.href = new URL(href, document.baseURI).href; } catch { /* ignore a malformed link */ }
      patch.label = this.getAttribute("resume-label") || "";
    }
    const prev = readProgress(id);
    const changed = !prev || Object.keys(patch).some((k) => prev[k] !== patch[k]) || Date.now() - (prev.at ?? 0) > 60_000;
    if (changed) saveProgress(id, patch);
  }

  render() {
    const popover = typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
    this.usePopover = popover; // not `this.popover`: that is HTMLElement's own popover attribute
    const style = this.root.querySelector("style");
    this.root.innerHTML = "";
    if (style) this.root.append(style);
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <button class="btn" type="button" aria-expanded="false" aria-controls="kr-panel" title="All ${esc(FAMILY.name)} roadmaps" ${popover ? 'popovertarget="kr-panel"' : ""} part="button">
        ${GRID}<span class="label" part="label">Roadmaps</span>
      </button>
      <nav class="panel" id="kr-panel" aria-label="${esc(FAMILY.name)} roadmaps" ${popover ? 'popover="auto"' : ""} part="panel"></nav>`;
    this.root.append(...wrap.childNodes);
    this.btn = this.root.querySelector(".btn");
    this.panel = this.root.querySelector(".panel");
    if (popover) {
      this.panel.addEventListener("beforetoggle", (e) => {
        if (e.newState === "open") { this.fillPanel(); this.place(true); }
      });
      this.panel.addEventListener("toggle", (e) => {
        const open = e.newState === "open";
        this.btn.setAttribute("aria-expanded", String(open));
        if (open) this.panel.querySelector("a")?.focus({ preventScroll: true });
        else if (this.root.activeElement && this.panel.contains(this.root.activeElement)) this.btn.focus();
      });
    } else {
      this.btn.addEventListener("click", () => (this.isOpen() ? this.closeFallback(true) : this.openFallback()));
    }
    this.panel.addEventListener("keydown", (e) => this.onPanelKey(e));
  }

  isOpen() {
    return this.usePopover ? this.panel?.matches(":popover-open") : this.panel?.classList.contains("open");
  }

  openFallback() {
    this.fillPanel();
    this.panel.classList.add("open");
    this.place(true);
    this.btn.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("pointerdown", this.onOutside, true);
    this.panel.querySelector("a")?.focus({ preventScroll: true });
  }

  closeFallback(refocus = false) {
    if (!this.panel || this.usePopover) return;
    this.panel.classList.remove("open");
    this.btn?.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("pointerdown", this.onOutside, true);
    if (refocus) this.btn?.focus();
  }

  onKey(e) {
    if (e.key === "Escape") this.closeFallback(true);
  }

  onOutside(e) {
    if (!e.composedPath().includes(this)) this.closeFallback();
  }

  /** Arrow keys move between roadmaps; Home and End jump to the ends. */
  onPanelKey(e) {
    const links = [...this.panel.querySelectorAll("a")];
    const i = links.indexOf(this.root.activeElement);
    const go = (n) => { e.preventDefault(); links[(n + links.length) % links.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(links.length - 1);
  }

  /** Under the button, kept inside the window; right-aligned when the button sits on the right half. */
  place(force = false) {
    if (!this.panel || !this.btn || !(force === true || this.isOpen())) return;
    const b = this.btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const w = Math.min(440, vw - 24); // the panel's CSS width, known before it is shown
    const left = b.left + b.width / 2 > vw / 2 ? b.right - w : b.left;
    this.panel.style.left = `${Math.max(12, Math.min(left, vw - w - 12))}px`;
    this.panel.style.top = `${Math.round(b.bottom + 8)}px`;
  }

  fillPanel() {
    const current = this.getAttribute("current");
    const upNext = nextRoadmaps(current)[0]?.id;
    const stages = STAGES.map((s) => {
      const items = ROADMAPS.filter((r) => r.stage === s.id).map((r) => {
        const isHere = r.id === current;
        const p = readProgress(r.id);
        const meta = isHere
          ? `<span class="pill here">You're here</span>${progressMeta(p)}`
          : r.id === upNext
            ? `<span class="pill accent">Up next</span>${progressMeta(p)}`
            : progressMeta(p) || (r.url ? "" : '<span class="pill">Runs locally</span>');
        const body = `${tileSvg(r.id, 32)}<span class="txt"><b>${esc(r.name)}</b><small>${esc(r.tagline)}</small></span><span class="meta">${meta}</span>`;
        const href = isHere && p?.href ? p.href : roadmapHref(r);
        return `<li><a class="item${isHere ? " current" : ""}" href="${esc(href)}"${isHere ? ' aria-current="page"' : ""}${r.url || isHere ? "" : ' target="_blank" rel="noopener"'}>${body}</a></li>`;
      });
      return `<p class="stage"><span class="n">0${s.n}</span>${esc(s.title)}</p><ul>${items.join("")}</ul>`;
    });
    this.panel.innerHTML = `
      <div class="head">
        <a class="family" href="${esc(FAMILY.hub)}">${tileSvg("hub", 30)}<span><b>${esc(FAMILY.name)}</b><small>${ROADMAPS.length} free roadmaps · one journey</small></span></a>
        <a class="all" href="${esc(FAMILY.hub)}">All roadmaps ${ARROW}</a>
      </div>
      ${stages.join("")}
      <div class="foot"><span>Built by ${esc(FAMILY.author)} · free and open source</span><a href="${esc(FAMILY.hub)}#start">Where to start ${ARROW}</a></div>`;
  }
}

/** "Where to go next": the roadmap to take after this one, plus one alternative. */
class KrNextRoadmap extends Base {
  static observedAttributes = ["current", "heading", "compact"];

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    adopt(this.root, SHARED_CSS + NEXT_CSS);
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.render();
  }

  render() {
    const current = roadmapById(this.getAttribute("current"));
    const next = nextRoadmaps(current?.id).slice(0, 2);
    const style = this.root.querySelector("style");
    this.root.innerHTML = "";
    if (style) this.root.append(style);
    if (!current || !next.length) return;
    const heading = this.getAttribute("heading") || "Where to go next";
    const cards = next.map((r, i) => {
      const p = readProgress(r.id);
      const ratio = progressRatio(p);
      const prog = ratio === null ? "" : `<span class="prog"><span class="meter"><span style="width:${Math.round(ratio * 100)}%"></span></span>${esc(p.done)}/${esc(p.total)}</span>`;
      const external = r.url ? "" : ' target="_blank" rel="noopener"';
      return `<a class="card${i === 0 ? " primary" : ""}" href="${esc(roadmapHref(r))}"${external}>
        <span class="top">${tileSvg(r.id, 38)}<span><span class="eyebrow">${i === 0 ? "Up next" : "Or try"} · ${esc(STAGES.find((s) => s.id === r.stage)?.title ?? "")}</span><h3>${esc(r.name)}</h3></span></span>
        <p class="tag">${esc(i === 0 ? r.summary : r.tagline)}</p>
        <span class="stats">${r.stats.map((s) => `<span class="pill">${esc(s)}</span>`).join("")}</span>
        ${prog}
        <span class="go">${r.url ? (p ? "Continue" : "Open roadmap") : "Get the code"} ${ARROW}</span>
      </a>`;
    });
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <h2 part="heading">${esc(heading)}</h2>
      <p class="sub">${esc(current.name)} is one of ${ROADMAPS.length} connected roadmaps in <a href="${esc(FAMILY.hub)}">${esc(FAMILY.name)}</a>, each building on the one before.</p>
      <div class="grid${next.length > 1 ? " has-more" : ""}">${cards.join("")}</div>`;
    this.root.append(...wrap.childNodes);
  }
}

if (typeof window !== "undefined" && window.customElements) {
  if (!customElements.get("kr-roadmaps")) customElements.define("kr-roadmaps", KrRoadmaps);
  if (!customElements.get("kr-next-roadmap")) customElements.define("kr-next-roadmap", KrNextRoadmap);
}
