// Who built this, and where to find them. Shown in the footer and the metadata.
export const BRAND = {
  name: "Kushal Rana",
  course: "LLM Engineering 1 → 100",
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
