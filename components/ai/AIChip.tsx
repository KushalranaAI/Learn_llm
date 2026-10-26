"use client";
// The "AI" chip in the top bar (System Learn's ai-chip): Add AI / AI on / Unlock AI, linking to the /ai settings page.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConnection } from "@/lib/ai/settings";
import Icon from "../ui/Icon";
import "./ai.css";

export default function AIChip() {
  const { ready, status } = useConnection();
  const path = usePathname();
  const locked = status === "locked";
  const label = locked ? "Unlock AI" : ready ? "AI on" : "Add AI";
  const title = locked ? "Your saved AI key is locked: enter your passphrase" : ready ? "AI tutor is on (Ctrl+/ to ask)" : "Optional: add an AI key for a tutor and Explain with AI";
  return (
    <Link href="/ai" className={`ai-chip ${ready ? "on" : ""} ${locked ? "locked" : ""} ${path === "/ai" ? "active" : ""}`} title={title} aria-label={label}>
      <Icon name={locked ? "lock" : "sparkles"} size={14} /> <span className="ai-chip-label">{label}</span>
    </Link>
  );
}
