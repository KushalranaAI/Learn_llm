// Who built this, and where to find them. Shown in the footer and the metadata.
export const BRAND = {
  name: "Kushal Rana",
  course: "LLM Engineering 1 → 100",
  tagline: "AI engineer building open, hands-on courses you learn by doing.",
  handle: "@KushalranaAI",
  projects: [
    { label: "System Learn", href: "https://kushalranaai.github.io/system_learn/" },
    { label: "Machine Learning 1 → 100", href: "https://kushalranaai.github.io/machine-learning-1-to-100/" },
    { label: "All-in-One RAG Tutorials", href: "https://kushalranaai.github.io/All-in-One-RAG_tutorials/" },
  ],
  links: [
    { id: "portfolio", label: "Portfolio", href: "https://kushalranaai.github.io/" },
    { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/kushal-rana" },
    { id: "youtube", label: "YouTube", href: "https://www.youtube.com/@naaku-o2x" },
    { id: "x", label: "X (Twitter)", href: "https://x.com/KushalranaAI" },
    { id: "medium", label: "Medium", href: "https://kushalrana448.medium.com/" },
  ],
} as const;

/** Prefix for fetches of files in public/ or route handlers, so the GitHub Pages copy finds them under its base path. */
export const asset = (p: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${p}`;
