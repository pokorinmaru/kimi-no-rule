import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "@kimi/world-builder", include: ["src/**/*.test.ts"] },
});
