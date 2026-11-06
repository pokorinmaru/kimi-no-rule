import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOOKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(HOOKS_DIR, "..", "..");

export interface HookRun {
  status: number | null;
  stdout: string;
  stderr: string;
  json: Record<string, unknown> | undefined;
}

/** Run a hook script the way Claude Code does: JSON on stdin, read exit code / stdout / stderr. */
export function runHook(
  script: string,
  input: Record<string, unknown>,
  env: Record<string, string> = {},
): HookRun {
  const r = spawnSync(process.execPath, [path.join(HOOKS_DIR, script)], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 110_000,
  });
  let json: Record<string, unknown> | undefined;
  const out = r.stdout.trim();
  if (out.startsWith("{")) json = JSON.parse(out) as Record<string, unknown>;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

export function tempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `kimi-${prefix}-`));
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

/** PreToolUse JSON deny, as documented for Claude Code hooks. */
export function isDenied(r: HookRun): boolean {
  const out = r.json?.["hookSpecificOutput"] as Record<string, unknown> | undefined;
  return r.status === 0 && out?.["permissionDecision"] === "deny";
}

export function isAllowed(r: HookRun): boolean {
  return r.status === 0 && !isDenied(r);
}

export function denyReason(r: HookRun): string {
  const out = r.json?.["hookSpecificOutput"] as Record<string, unknown> | undefined;
  return String(out?.["permissionDecisionReason"] ?? "");
}
