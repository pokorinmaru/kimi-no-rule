import path from "node:path";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runHook, tempDir, writeFiles } from "./helpers.ts";

const SCRIPT = "stop-gate.mjs";

/** A tiny project whose `pnpm test` passes or fails depending on test.mjs. */
function fixtureProject(passing: boolean): string {
  const dir = tempDir("stop");
  writeFiles(dir, {
    "package.json": JSON.stringify({ name: "fixture", private: true, scripts: { test: "node test.mjs" } }),
    "test.mjs": passing ? "console.log('1 passed');\n" : "console.error('FAIL sample.test.ts > adds'); process.exit(1);\n",
  });
  return dir;
}

const stop = (project: string, extra: Record<string, unknown> = {}) =>
  runHook(SCRIPT, { hook_event_name: "Stop", stop_hook_active: false, cwd: project, ...extra }, { CLAUDE_PROJECT_DIR: project });

const blocked = (r: ReturnType<typeof stop>) => r.status === 0 && r.json?.["decision"] === "block";

describe("stop-gate", () => {
  it("blocks finishing when pnpm test fails (a broken test stops the session)", () => {
    const r = stop(fixtureProject(false));
    expect(blocked(r)).toBe(true);
    expect(String(r.json?.["reason"])).toContain("sample.test.ts");
  });

  it("lets the session finish once the test is fixed", () => {
    const project = fixtureProject(false);
    expect(blocked(stop(project))).toBe(true);
    writeFileSync(path.join(project, "test.mjs"), "console.log('1 passed');\n");
    const r = stop(project);
    expect(r.status).toBe(0);
    expect(blocked(r)).toBe(false);
  });

  it("does not block again while already continuing from a stop hook (no endless loop)", () => {
    const r = stop(fixtureProject(false), { stop_hook_active: true });
    expect(r.status).toBe(0);
    expect(blocked(r)).toBe(false);
  });

  it("falls back to the cwd in the input when CLAUDE_PROJECT_DIR is unset", () => {
    const project = fixtureProject(false);
    const r = runHook(SCRIPT, { hook_event_name: "Stop", stop_hook_active: false, cwd: project }, { CLAUDE_PROJECT_DIR: "" });
    expect(blocked(r)).toBe(true);
  });
});
