// Static build for GitHub Pages: `npm run build:pages` → out/ (with .nojekyll so _next/ is served).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

execSync("npx next build", { stdio: "inherit", env: { ...process.env, STATIC_EXPORT: "1" } });
writeFileSync("out/.nojekyll", "");
console.log("\nStatic site written to out/");
