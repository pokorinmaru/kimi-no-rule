import { defineConfig, devices } from "@playwright/test";
import { E2E_API_BASE } from "./e2e/api-base.ts";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env["CI"],
  reporter: process.env["CI"] ? "github" : "list",
  use: { baseURL: "http://localhost:4173" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    // The tests play the app with the local server down: the build points at a port nobody listens on, so a
    // local server running with a key on 8787 never changes the flow under test (run-through, 2026-11-08).
    env: { VITE_API_BASE: E2E_API_BASE },
    timeout: 120_000,
  },
});
