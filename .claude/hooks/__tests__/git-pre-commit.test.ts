import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT, tempDir, writeFiles } from "./helpers.ts";

// Git's own pre-commit hook (.githooks/pre-commit): the backstop that runs on every commit,
// however the commit command was written.
const HOOKS_PATH = path.join(REPO_ROOT, ".githooks");
const FAKE_AWS = "AKIA" + "QWERTYUIOPASDFGH";

function repoWithHook(files: Record<string, string>): { dir: string; git: (...a: string[]) => ReturnType<typeof spawnSync> } {
  const dir = tempDir("githook");
  const git = (...args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "fixture");
  git("config", "user.email", ["fixture", "example.com"].join(String.fromCharCode(64)));
  git("config", "core.hooksPath", HOOKS_PATH);
  writeFiles(dir, files);
  git("add", "-A");
  return { dir, git };
}

describe(".githooks/pre-commit", () => {
  it("aborts a commit that stages a secret, even with options the Claude hook would not parse", () => {
    const { git } = repoWithHook({ "src/config.ts": `export const k = "${FAKE_AWS}";\n` });
    const r = git("-c", "color.ui=never", "commit", "-q", "-m", "x");
    expect(r.status).not.toBe(0);
    expect(String(r.stderr)).toContain("src/config.ts");
    expect(String(r.stderr)).not.toContain(FAKE_AWS);
  });

  it("lets a clean commit through", () => {
    const { git } = repoWithHook({ "src/a.ts": "export const a = 1;\n" });
    const r = git("commit", "-q", "-m", "clean");
    expect(r.status, String(r.stderr)).toBe(0);
  });
});
