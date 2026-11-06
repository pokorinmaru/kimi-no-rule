import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { denyReason, isAllowed, isDenied, runHook, tempDir, writeFiles } from "./helpers.ts";

const SCRIPT = "pre-commit-secrets.mjs";

// Fake secrets are assembled at runtime so this file contains none.
const FAKE = {
  anthropic: ["sk", "ant", "api03", "Zx8Qp".repeat(16)].join("-"),
  aws: "AKIA" + "QWERTYUIOPASDFGH",
  github: "ghp" + "_" + "a1B2c3D4".repeat(5),
  privateKey: ["-----BEGIN", "RSA", "PRIVATE", "KEY-----"].join(" ") + "\nMIIEow\n",
  generic: "API" + "_KEY=" + "q8Rw2LmZ7vX4nT9pK3sY6bH1",
};

function repo(files: Record<string, string>, stage: boolean): string {
  const dir = tempDir("git");
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("config", "user.name", "fixture");
  git("config", "user.email", ["fixture", "example.com"].join(String.fromCharCode(64)));
  writeFiles(dir, files);
  if (stage) git("add", "-A");
  return dir;
}

const bash = (dir: string, command: string) =>
  runHook(SCRIPT, { hook_event_name: "PreToolUse", tool_name: "Bash", cwd: dir, tool_input: { command } }, { CLAUDE_PROJECT_DIR: dir });

describe("pre-commit-secrets", () => {
  for (const [kind, secret] of Object.entries(FAKE)) {
    it(`denies git commit when a staged file contains a ${kind} secret`, () => {
      const dir = repo({ "src/config.ts": `export const x = ${JSON.stringify(secret)};\n` }, true);
      const r = bash(dir, 'git commit -m "add config"');
      expect(isDenied(r)).toBe(true);
      expect(denyReason(r)).toContain("src/config.ts");
      expect(denyReason(r)).not.toContain(secret);
    });
  }

  it("also scans files that `git add -A && git commit` is about to stage", () => {
    const dir = repo({ ".env": `${FAKE.generic}\n` }, false);
    expect(isDenied(bash(dir, 'git add -A && git commit -m "wip"'))).toBe(true);
  });

  it("recognises git commit with global options before the subcommand", () => {
    const dir = repo({ "src/config.ts": FAKE.aws }, true);
    expect(isDenied(bash(dir, 'git -c user.name=x -c core.hooksPath=/dev/null commit -m "x"'))).toBe(true);
    expect(isDenied(bash(dir, 'git --no-pager commit -m "x"'))).toBe(true);
  });

  it("scans the repository named by git -C", () => {
    const dir = repo({ "src/config.ts": FAKE.aws }, true);
    const r = runHook(
      SCRIPT,
      { hook_event_name: "PreToolUse", tool_name: "Bash", cwd: tempDir("elsewhere"), tool_input: { command: `git -C "${dir}" commit -m x` } },
      { CLAUDE_PROJECT_DIR: "" },
    );
    expect(isDenied(r)).toBe(true);
  });

  it("resolves several -C options cumulatively, as git does", () => {
    const dir = repo({ "src/config.ts": FAKE.aws }, true);
    const r = runHook(
      SCRIPT,
      { hook_event_name: "PreToolUse", tool_name: "Bash", cwd: tempDir("elsewhere"), tool_input: { command: `git -C "${path.dirname(dir)}" -C ${path.basename(dir)} commit -m x` } },
      { CLAUDE_PROJECT_DIR: "" },
    );
    expect(isDenied(r)).toBe(true);
  });

  it("denies commits that redirect the repository with --git-dir, --work-tree or GIT_DIR", () => {
    const dir = repo({ "src/a.ts": "export const a = 1;\n" }, true);
    expect(isDenied(bash(dir, "git --git-dir=/elsewhere/.git commit -m x"))).toBe(true);
    expect(isDenied(bash(dir, "git --work-tree /elsewhere commit -m x"))).toBe(true);
    expect(isDenied(bash(dir, "GIT_DIR=/elsewhere/.git git commit -m x"))).toBe(true);
  });

  it("only accepts plain -C as a global option (allowlist)", () => {
    const dir = repo({ "src/a.ts": "export const a = 1;\n" }, true);
    expect(isDenied(bash(dir, "git -c core.worktree=/elsewhere commit -m x"))).toBe(true);
    expect(isDenied(bash(dir, "GIT_DIR = /elsewhere/.git git commit -m x"))).toBe(true);
    expect(isDenied(bash(dir, '$env:GIT_DIR="/elsewhere/.git"; git commit -m x'))).toBe(true);
    expect(isAllowed(bash(dir, `git -C "${dir}" commit -m "mentions -C and --git-dir in the message"`))).toBe(true);
  });

  it("does not treat other subcommands that mention commit as commits", () => {
    const dir = repo({ "src/config.ts": FAKE.aws }, true);
    expect(isAllowed(bash(dir, "git log --grep commit"))).toBe(true);
  });

  it("checks every commit in a chained command", () => {
    const dir = repo({ "src/a.ts": "export const a = 1;\n" }, true);
    expect(isDenied(bash(dir, 'git commit -m a; git -c core.worktree=/x commit -m b'))).toBe(true);
  });

  it("denies any mention of variables that move the repository", () => {
    const dir = repo({ "src/a.ts": "export const a = 1;\n" }, true);
    expect(isDenied(bash(dir, "export GIT_DIR; git commit -m x"))).toBe(true);
    expect(isDenied(bash(dir, "env GIT_INDEX_FILE=/tmp/i git commit -m x"))).toBe(true);
  });

  it("denies when the repository cannot be read (fail closed)", () => {
    const notRepo = tempDir("norepo");
    expect(isDenied(bash(notRepo, 'git commit -m "x"'))).toBe(true);
  });

  it("allows a clean commit", () => {
    const dir = repo({ "src/a.ts": "export const a = 1;\n" }, true);
    expect(isAllowed(bash(dir, 'git commit -m "clean"'))).toBe(true);
  });

  it("ignores commands that are not git commit", () => {
    const dir = repo({ "src/config.ts": FAKE.aws }, true);
    expect(isAllowed(bash(dir, "git status"))).toBe(true);
    expect(isAllowed(bash(dir, "pnpm test"))).toBe(true);
  });

  it("ignores lockfile integrity hashes", () => {
    const dir = repo({ "pnpm-lock.yaml": "integrity: sha512-" + "Ab9+".repeat(20) + "==\n" }, true);
    expect(isAllowed(bash(dir, 'git commit -m "lock"'))).toBe(true);
  });
});
