#!/usr/bin/env node
// PostToolUse (Write|Edit|MultiEdit): type-check and unit-test the workspace package that owns the edited file.
// Failures go back to Claude via exit 2 + stderr. Files outside a package are ignored.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT, isInside, normPath, projectDir, readInput, tail } from "./lib/common.mjs";

const TSC = path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
const VITEST = path.join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs");

/** Nearest directory with package.json between the file and the project root (exclusive). */
function owningPackage(/** @type {string} */ file, /** @type {string} */ root) {
  if (!isInside(file, root)) return undefined;
  let dir = path.dirname(file);
  while (isInside(dir, root) && normPath(dir) !== normPath(root)) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    dir = path.dirname(dir);
  }
  return undefined;
}

/** @param {string[]} args @param {string} cwd */
function run(args, cwd) {
  const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8", timeout: 170_000, env: { ...process.env, CI: "1", FORCE_COLOR: "0" } });
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}${r.error ? String(r.error) : ""}` };
}

async function main() {
  const input = await readInput();
  const ti = /** @type {Record<string, unknown>} */ (input["tool_input"] ?? {});
  const file = String(ti["file_path"] ?? ti["notebook_path"] ?? "");
  if (!file) return;
  const root = projectDir(input);
  const pkg = owningPackage(path.resolve(root, file), root);
  if (!pkg) return;

  const name = JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8")).name ?? path.basename(pkg);
  const failures = [];

  if (existsSync(path.join(pkg, "tsconfig.json"))) {
    const tsc = run([TSC, "--noEmit", "-p", pkg], pkg);
    if (!tsc.ok) failures.push(`[${name}] tsc --noEmit failed:\n${tail(tsc.out, 40)}`);
  }
  const test = run([VITEST, "run", "--passWithNoTests"], pkg);
  if (!test.ok) failures.push(`[${name}] unit tests failed:\n${tail(test.out, 60)}`);

  if (failures.length > 0) {
    process.stderr.write(`${failures.join("\n\n")}\n`);
    process.exit(2);
  }
}

main().catch((/** @type {unknown} */ e) => {
  process.stderr.write(`post-edit-check internal error: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(2);
});
