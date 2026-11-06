import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "@kimi/worker", include: ["src/**/*.test.ts"] },
});
