import { contentSecurityPolicy } from "./scripts/csp.mjs";

// `npm run build:pages` sets STATIC_EXPORT=1 to produce a fully static copy for GitHub Pages. It is built from a
// throwaway copy without app/api (scripts/build-pages.mjs), so the static copy has no AI relay; the browser-side AI
// (keys encrypted in the browser, Ollama) still works there. Everything else is client-side too (progress lives in localStorage).
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = staticExport ? (process.env.PAGES_BASE_PATH ?? "/Learn_llm") : "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_STATIC_EXPORT: staticExport ? "1" : "" },
  // build-pages.mjs builds in a sibling folder whose node_modules is a junction back to this project: let Turbopack
  // resolve files across both (the parent folder).
  ...(process.env.PAGES_BUILD_ROOT && { turbopack: { root: process.env.PAGES_BUILD_ROOT } }),
  // The local app sends the policy as a header. (The static copy can't send headers; build-pages.mjs adds it as a <meta> tag.)
  // Next's own bootstrap scripts are inline and change per request, so script-src has to allow 'unsafe-inline' here;
  // the static copy is stricter because its inline scripts are fixed and can be hashed.
  ...(!staticExport && {
    async headers() {
      const dev = process.env.NODE_ENV !== "production";
      return [
        {
          source: "/:path*",
          headers: [
            { key: "Content-Security-Policy", value: [contentSecurityPolicy({ dev }), "frame-ancestors 'none'"].join("; ") },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "same-origin" },
          ],
        },
      ];
    },
  }),
  ...(staticExport && {
    output: "export",
    basePath,
    trailingSlash: true,
    images: { unoptimized: true },
  }),
};

export default nextConfig;
