import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "@kimi/baseline-parser", include: ["src/**/*.test.ts"] },
});
