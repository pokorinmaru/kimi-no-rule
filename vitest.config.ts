import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/web",
      "apps/worker",
      "tools/*",
      {
        test: {
          name: "hooks",
          include: [".claude/hooks/__tests__/**/*.test.ts"],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
