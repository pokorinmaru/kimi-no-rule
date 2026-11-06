import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "@kimi/web", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
