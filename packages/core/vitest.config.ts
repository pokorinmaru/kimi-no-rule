import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "@kimi/core", include: ["src/**/*.test.ts"] },
});
