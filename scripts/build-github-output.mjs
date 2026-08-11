import fs from "node:fs";
import path from "node:path";

const distDir = path.join(process.cwd(), "dist");
const indexPath = path.join(distDir, "index.html");
const routes = ["matches", "rankings", "stats", "players"];

if (!fs.existsSync(indexPath)) {
  throw new Error("Vite output is missing dist/index.html.");
}

// GitHub Pages serves this file for unknown paths. Using the app shell here
// lets client-side routes such as /rankings survive reloads and direct visits.
fs.copyFileSync(indexPath, path.join(distDir, "404.html"));

// Also publish a real index file for every known route. This preserves clean
// URLs and avoids relying solely on GitHub Pages' custom 404 fallback.
for (const route of routes) {
  const routeEntryPath = path.join(distDir, `${route}.html`);
  if (!fs.existsSync(routeEntryPath)) {
    throw new Error(`Vite output is missing dist/${route}.html.`);
  }

  const routeDir = path.join(distDir, route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.copyFileSync(routeEntryPath, path.join(routeDir, "index.html"));
}

// Prevent any Jekyll processing when the artifact is served by GitHub Pages.
fs.writeFileSync(path.join(distDir, ".nojekyll"), "");
