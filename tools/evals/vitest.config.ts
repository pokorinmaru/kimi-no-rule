import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "@kimi/evals", include: ["src/**/*.test.ts"] },
});
