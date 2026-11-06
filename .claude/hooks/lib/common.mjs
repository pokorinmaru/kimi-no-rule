// Shared helpers for the project hooks. No dependencies: hooks run with plain `node`.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOOKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(HOOKS_DIR, "..", "..");

const DEFAULT_DESIGN_DIR = "C:\\dev\\hackathon-2026\\学習アプリ";

/** The design folder (outside the repo). Overridable for tests via KIMI_DESIGN_DIR. */
export function designDir() {
  const v = process.env["KIMI_DESIGN_DIR"];
  return v && v.length > 0 ? v : DEFAULT_DESIGN_DIR;
}

/** The project root the hook should act on. */
export function projectDir(/** @type {Record<string, unknown>} */ input) {
  const env = process.env["CLAUDE_PROJECT_DIR"];
  if (env && env.length > 0) return env;
  if (typeof input["cwd"] === "string" && input["cwd"].length > 0) return input["cwd"];
  return process.cwd();
}

/** @returns {Promise<Record<string, unknown>>} */
export async function readInput() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

/**
 * Deny a tool call (PreToolUse JSON form) and exit.
 * @param {string} reason
 * @returns {never}
 */
export function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    }),
  );
  process.exit(0);
}

/**
 * Normalise a path for comparison: forward slashes, lower case, Git Bash drive form (/c/...) to c:/..., no trailing slash.
 * @param {string} p
 */
export function normPath(p) {
  let s = p.replace(/\\/g, "/");
  s = s.replace(/^\/([a-zA-Z])\//, "$1:/");
  if (!/^[a-zA-Z]:\//.test(s) && !s.startsWith("/")) s = path.resolve(s).replace(/\\/g, "/");
  // Collapse "." and ".." so a\..\design cannot slip past the prefix check. Keep the drive letter out of
  // normalisation: ".." above a drive root stays at the root, as on Windows.
  const drive = /^[a-zA-Z]:/.exec(s)?.[0] ?? "";
  s = drive + path.posix.normalize(s.slice(drive.length));
  return s.replace(/\/+$/, "").toLowerCase();
}

/** @param {string} target @param {string} dir */
export function isInside(target, dir) {
  const t = normPath(target);
  const d = normPath(dir);
  return t === d || t.startsWith(d + "/");
}

/** Keep the last `n` lines of a long output. @param {string} s @param {number} n */
export function tail(s, n) {
  const lines = s.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - n)).join("\n");
}
