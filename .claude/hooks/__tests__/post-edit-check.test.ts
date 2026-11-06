import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, runHook, tempDir, writeFiles } from "./helpers.ts";

const SCRIPT = "post-edit-check.mjs";

const edited = (root: string, file: string) =>
  runHook(
    SCRIPT,
    { hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: file }, tool_response: { filePath: file } },
    { CLAUDE_PROJECT_DIR: root },
  );

function fixture(files: Record<string, string>): string {
  const root = tempDir("post");
  writeFiles(root, {
    "package.json": JSON.stringify({ name: "fixture-root", private: true }),
    "packages/demo/package.json": JSON.stringify({ name: "@fx/demo", private: true, type: "module" }),
    "packages/demo/tsconfig.json": JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", types: [] },
      include: ["src"],
    }),
    ...files,
  });
  return root;
}

describe("post-edit-check", () => {
  it("passes after editing a healthy package in this repo (runs tsc and its unit tests)", () => {
    const r = edited(REPO_ROOT, path.join(REPO_ROOT, "packages", "core", "src", "index.ts"));
    expect(r.status, r.stderr).toBe(0);
  });

  it("reports a type error in the edited package back to Claude (exit 2)", () => {
    const root = fixture({ "packages/demo/src/a.ts": "export const n: number = 'not a number';\n" });
    const r = edited(root, path.join(root, "packages", "demo", "src", "a.ts"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("TS2322");
    expect(r.stderr).toContain("@fx/demo");
  });

  it("reports failing unit tests in the edited package (exit 2)", () => {
    const root = fixture({
      "packages/demo/src/a.ts": "export const n = 1;\n",
      "packages/demo/src/a.test.ts": "throw new Error('deliberately broken test');\n",
    });
    const r = edited(root, path.join(root, "packages", "demo", "src", "a.ts"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("deliberately broken test");
  });

  it("does nothing for files outside any package", () => {
    const root = fixture({ "packages/demo/src/a.ts": "export const n: number = 'broken';\n" });
    const r = edited(root, path.join(root, "NOTES.md"));
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
  });
});
