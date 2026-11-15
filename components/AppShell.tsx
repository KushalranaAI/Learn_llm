"use client";
// The frame around every page, the same pattern as System Learn: a 56px top bar (logo, icon links, search, theme),
// the page, and a quiet credit strip at the bottom. The optional AI tutor (components/ai) hangs off the frame.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { dueReviews, useProgress } from "@/lib/progress";
import AIChip from "./ai/AIChip";
import AIPanel, { AILauncher } from "./ai/AIPanel";
import { AIProvider } from "./ai/AIProvider";
import InterviewSource from "./ai/InterviewSource";
import SelectionAsk from "./ai/SelectionAsk";
import CommandPalette from "./CommandPalette";
import Credit from "./Credit";
import ThemeToggle from "./ThemeToggle";
import Icon, { type IconName } from "./ui/Icon";

// Four primary destinations (learn → practise → interview); personal tools sit on the right as icon buttons.
const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/curriculum", label: "Roadmap", icon: "route" },
  { href: "/labs", label: "Labs", icon: "beaker" },
  { href: "/simulations", label: "Simulations", icon: "activity" },
  { href: "/interview", label: "Interview", icon: "chats" },
];
const TOOLS: { href: string; label: string; icon: IconName }[] = [
  { href: "/review", label: "Review", icon: "repeat" },
  { href: "/glossary", label: "Glossary", icon: "book" },
  { href: "/progress", label: "My progress", icon: "chart" },
];

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      {/* the LLM glyph from the family registry (design/roadmaps.js): a chat bubble of tokens */}
      <path d="M11.5 8h9a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-5l-4 3.5V20a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" fill="none" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="12.6" cy="14" r="1.5" fill="var(--on-accent)" />
      <circle cx="16" cy="14" r="1.5" fill="var(--on-accent)" />
      <circle cx="19.4" cy="14" r="1.5" fill="var(--on-accent)" />
    </svg>
  );
}

function isActive(path: string, href: string) {
  if (href === "/curriculum") return path.startsWith("/curriculum") || path.startsWith("/learn");
  return path.startsWith(href);
}

export default function AppShell({ children, topics }: { children: React.ReactNode; topics: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const progress = useProgress();
  const [due, setDue] = useState(0);
  useEffect(() => setDue(dueReviews(progress).length), [progress]);
  // The Learn in Public family elements (<kr-roadmaps>, <kr-next-roadmap>) are registered after hydration, in the browser only.
  useEffect(() => {
    import("@/app/design/roadmaps.js");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AIProvider>
    <div className="app">
      <header className="nav">
        <Link href="/" className="brand" aria-label="LLM Engineering 1 → 100, home">
          <Logo /> <span className="brand-name">LLM 1 → 100</span>
        </Link>
        <nav className="nav-links" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} title={n.label} className={isActive(path, n.href) ? "active" : ""} aria-current={isActive(path, n.href) ? "page" : undefined}>
              <Icon name={n.icon} size={16} /> <span className="nav-label">{n.label}</span>
            </Link>
          ))}
        </nav>
        <kr-roadmaps current="llm" done={Object.keys(progress.done).length} total={topics} />
        <div className="nav-right">
          <button type="button" className="search-chip" onClick={() => setOpen(true)} aria-label="Search the course">
            <Icon name="search" size={15} /> <span>Search</span> <kbd className="kbd">Ctrl K</kbd>
          </button>
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className={`icon-btn nav-tool ${path.startsWith(t.href) ? "on" : ""}`} aria-label={t.href === "/review" && due > 0 ? `${t.label}: ${due} due` : t.label} title={t.label}>
              <Icon name={t.icon} size={17} />
              {t.href === "/review" && due > 0 && <span className="nav-badge">{due > 99 ? "99+" : due}</span>}
            </Link>
          ))}
          <AIChip />
          <ThemeToggle />
        </div>
      </header>
      <main className="content" id="main" data-askable>
        {children}
      </main>
      <Credit />
      {open && <CommandPalette onClose={() => setOpen(false)} />}
      <AILauncher />
      <AIPanel />
      <SelectionAsk />
      <InterviewSource />
    </div>
    </AIProvider>
  );
}
