// `npm run build:pages` sets STATIC_EXPORT=1 to produce a fully static copy for GitHub Pages.
// Everything is client-side (progress lives in localStorage), so the static copy has every feature.
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = staticExport ? (process.env.PAGES_BASE_PATH ?? "/Learn_llm") : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  ...(staticExport && {
    output: "export",
    basePath,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default nextConfig;
