import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "@kimi/interpret", include: ["src/**/*.test.ts"] },
});
