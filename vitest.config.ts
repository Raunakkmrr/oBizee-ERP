import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The formatters pin Asia/Kolkata explicitly rather than trusting the
    // ambient zone, so the suite runs in UTC on purpose: if a formatter ever
    // leaks the local timezone, these tests fail here rather than in production.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The project lives on an exFAT volume, so macOS writes an AppleDouble
    // sidecar beside every file — and `._money.test.ts` matches the glob above.
    // They are binary resource forks, so Vite fails to transform them and the
    // run reports failed files despite every real test passing.
    exclude: ["**/._*", "**/node_modules/**", "**/.next/**"],
  },
});
