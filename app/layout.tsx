import "./globals.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark-dimmed.css";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import AppShell from "@/components/AppShell";
import { THEME_SCRIPT } from "@/lib/theme-script";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "LLM Engineering 1 → 100 · Kushal Rana", template: "%s · LLM 1 → 100" },
  description:
    "Learn how large language models work and how they are built: every idea explained with the maths, a live simulation and hands-on labs.",
  authors: [{ name: "Kushal Rana", url: "https://kushalranaai.github.io/" }],
  creator: "Kushal Rana",
  publisher: "Kushal Rana",
  keywords: ["LLM", "large language models", "transformer", "attention", "pretraining", "fine-tuning", "RLHF", "LLM evaluation", "interview prep", "Kushal Rana"],
  openGraph: {
    type: "website",
    siteName: "LLM Engineering 1 → 100 by Kushal Rana",
    title: "LLM Engineering 1 → 100 - built by Kushal Rana",
    description: "Learn how large language models work and how they are built: maths, live simulations and labs.",
  },
  twitter: { card: "summary_large_image", site: "@KushalranaAI", creator: "@KushalranaAI" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script sets data-theme before React hydrates
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* browser extensions add attributes to <body> before React loads */}
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
