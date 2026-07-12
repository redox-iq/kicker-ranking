import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const isGitHubPages =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GITHUB_PAGES === "true";

export default defineConfig({
  plugins: [react()],
  base: isGitHubPages ? "/kicker-ranking/" : "/",
  build: {},
  test: {
    environment: "node"
  }
});
