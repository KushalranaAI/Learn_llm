"use client";
// The frame around every page: brand mark, search bar (Ctrl/Cmd K), theme toggle, and the icon rail.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { dueReviews, useProgress } from "@/lib/progress";
import CommandPalette from "./CommandPalette";
import ThemeToggle from "./ThemeToggle";
import Icon, { type IconName } from "./ui/Icon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/curriculum", label: "Curriculum", icon: "grid" },
  { href: "/interview", label: "Interview prep", icon: "chats" },
  { href: "/simulations", label: "Simulations", icon: "activity" },
  { href: "/labs", label: "Labs", icon: "beaker" },
  { href: "/sandbox", label: "Sandbox", icon: "boxes" },
  { href: "/review", label: "Review", icon: "repeat" },
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/glossary", label: "Glossary", icon: "book" },
];

export function BrandMark() {
  // Four rising bars (1 → 100) with a spark on top: original mark for this course.
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="7" y="29" width="6" height="11" rx="3" fill="currentColor" opacity="0.55" />
      <rect x="16" y="23" width="6" height="17" rx="3" fill="currentColor" opacity="0.7" />
      <rect x="25" y="16" width="6" height="24" rx="3" fill="currentColor" opacity="0.85" />
      <rect x="34" y="10" width="6" height="30" rx="3" fill="currentColor" />
      <circle cx="37" cy="4.5" r="3" fill="var(--accent)" />
    </svg>
  );
}

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/curriculum") return path.startsWith("/curriculum") || path.startsWith("/learn");
  return path.startsWith(href);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const progress = useProgress();
  const [due, setDue] = useState(0);
  useEffect(() => setDue(dueReviews(progress).length), [progress]);

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
    <div className="shell">
      <Link href="/" className="brand" aria-label="LLM Engineering 1 → 100, home">
        <BrandMark />
      </Link>
      <header className="topbar">
        <button type="button" className="searchbar" onClick={() => setOpen(true)} aria-label="Search the course">
          <Icon name="search" size={20} />
          <span>Search</span>
          <kbd className="kbd">Ctrl K</kbd>
        </button>
        <div className="topbar-right">
          <ThemeToggle />
          <Link href="/progress" className="btn sm">
            <Icon name="user" size={16} /> My progress
          </Link>
        </div>
      </header>
      <nav className="rail" aria-label="Main">
        {NAV.map((n, i) => (
          <span key={n.href} style={{ display: "contents" }}>
            {(i === 3 || i === 6) && <i className="rail-sep" aria-hidden="true" />}
            <Link href={n.href} className={isActive(path, n.href) ? "active" : ""} aria-label={n.label} aria-current={isActive(path, n.href) ? "page" : undefined}>
              <Icon name={n.icon} size={22} />
              {n.href === "/review" && due > 0 && <i className="dot" aria-label={`${due} due`} />}
              <span className="tip">{n.label}</span>
            </Link>
          </span>
        ))}
      </nav>
      <main className="content" id="main">
        {children}
      </main>
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </div>
  );
}
