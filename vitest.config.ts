import { defineConfig } from "vitest/config";

// Separate from vite.config.ts (which is rooted at src/web for the SPA build).
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
