import { defineProject } from "vitest/config";

// The screen tests render the whole app in jsdom; under a parallel run on a loaded machine one can pass the default
// 5 s while still correct (2026-11-08: a different screen test timed out on each full run), so they get 20 s.
export default defineProject({
  test: { name: "@kimi/web", include: ["src/**/*.test.ts", "src/**/*.test.tsx"], testTimeout: 20_000 },
});
