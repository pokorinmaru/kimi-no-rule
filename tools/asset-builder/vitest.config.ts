import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "@kimi/asset-builder", include: ["src/**/*.test.ts"] },
});
