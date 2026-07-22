import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which is rooted at src/web for the SPA build).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // node:sqlite is a Node built-in, used by the schema tests to run the real
    // migrations. Vite must leave it alone rather than try to resolve a package.
    server: { deps: { external: [/^node:sqlite$/] } },
  },
});
