// Builds the static copy of the course for GitHub Pages into out/ (`npm run build:pages`).
//
// The static copy has no server, so the server-only route (app/api: the local AI relay that reads .env) must not be part
// of it. Instead of moving files around inside this project (which fights a running `npm run dev`, especially on
// Windows), the build happens in a throwaway copy next to it, without app/api, .env, node_modules or .next. This project
// itself is never modified (except out/), so the dev server can stay running while you build.
// Ported from Machine Learning 1 → 100 (web/scripts/build-pages.mjs).
//
//   npm run build:pages                       # served at /Learn_llm (a GitHub project page)
//   PAGES_BASE_PATH= npm run build:pages      # served from the root of a domain
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentSecurityPolicy } from "./csp.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const work = path.join(path.dirname(app), `.${path.basename(app)}-pages-build`);
const SKIP = new Set(["node_modules", "out", ".git", "tsconfig.tsbuildinfo", "next-env.d.ts", ".vercel"]);
const skipped = (rel) => {
  const top = rel.split("/")[0];
  if (SKIP.has(top) || top.startsWith(".next")) return true; // .next, .next-test ... never copy build output
  if (/^\.env(\..*)?$/.test(top) && top !== ".env.example") return true; // never copy secrets
  return rel === "app/api" || rel.startsWith("app/api/");
};

const rmWork = () => fs.rmSync(work, { recursive: true, force: true });
rmWork();
fs.cpSync(app, work, { recursive: true, filter: (src) => !skipped(path.relative(app, src).split(path.sep).join("/")) });
fs.symlinkSync(path.join(app, "node_modules"), path.join(work, "node_modules"), "junction");
if (fs.existsSync(path.join(work, "app", "api"))) throw new Error("app/api must not be in the static build copy");

let status = 1;
try {
  const next = path.join(app, "node_modules", "next", "dist", "bin", "next");
  const env = { ...process.env, STATIC_EXPORT: "1", PAGES_BUILD_ROOT: path.dirname(app) };
  const res = spawnSync(process.execPath, [next, "build"], { cwd: work, stdio: "inherit", env });
  status = res.status ?? 1;
  if (status === 0) {
    fs.rmSync(path.join(app, "out"), { recursive: true, force: true });
    fs.cpSync(path.join(work, "out"), path.join(app, "out"), { recursive: true });
  }
} finally {
  // remove the junction first so deleting the copy can never reach into the real node_modules
  try {
    fs.unlinkSync(path.join(work, "node_modules"));
  } catch {
    /* already gone */
  }
  rmWork();
}

/** Next writes route-segment payloads as nested files (__next.learn/$d$section/__PAGE__.txt) but its client asks for the
 *  flat dotted name (__next.learn.$d$section.__PAGE__.txt). Without the flat copies every prefetch is a 404 on a static host. */
function addFlatSegmentFiles(dir) {
  let copied = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("__next.")) {
      const walk = (d, prefix) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(path.join(d, e.name), `${prefix}.${e.name}`);
          else {
            fs.copyFileSync(path.join(d, e.name), path.join(dir, `${prefix}.${e.name}`));
            copied++;
          }
        }
      };
      walk(full, entry.name);
    } else if (entry.name !== "_next") copied += addFlatSegmentFiles(full);
  }
  return copied;
}

/** Adds a Content-Security-Policy <meta> tag to every page, allowing only this page's own inline scripts (by hash). */
function addCsp(dir) {
  let pages = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "_next") pages += addCsp(full);
    } else if (entry.name.endsWith(".html")) {
      let html = fs.readFileSync(full, "utf8");
      const hashes = new Set();
      for (const m of html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
        if (/type="application\/(ld\+)?json"/.test(m[1])) continue; // data, not executed
        hashes.add(`'sha256-${createHash("sha256").update(m[2]).digest("base64")}'`);
      }
      const policy = contentSecurityPolicy({ scriptSrc: ["'self'", ...hashes] });
      html = html.replace(/<head>/, `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
      fs.writeFileSync(full, html);
      pages++;
    }
  }
  return pages;
}

if (status === 0) {
  const out = path.join(app, "out");
  if (fs.existsSync(path.join(out, "api"))) throw new Error("out/ must not contain an api route");
  console.log(`Added a Content-Security-Policy to ${addCsp(out)} pages`);
  console.log(`Added ${addFlatSegmentFiles(out)} flat segment files`);
  fs.writeFileSync(path.join(out, ".nojekyll"), ""); // GitHub Pages: serve the _next folder as-is
  console.log("\nStatic site written to out/");
}
process.exit(status);
