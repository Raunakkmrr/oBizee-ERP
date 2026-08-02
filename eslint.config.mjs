import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Mirrors obizee-dashboard/eslint.config.mjs — same family, same rules.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // macOS AppleDouble junk created on the exFAT (T7) drive — not source.
    "**/._*",
    "**/.DS_Store",
  ]),
  {
    // Hand-rolled data fetching sets loading/data state inside on-mount effects.
    // This React 19 rule treats that common pattern as a perf-advisory; keep it
    // visible as a warning rather than a blocking error across our data hooks.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
