#!/usr/bin/env node
// Secret scan before commits, in two places:
// 1. Claude Code PreToolUse (Bash|PowerShell): before a `git commit` command, scan staged changes, unstaged
//    tracked changes and untracked files (covers `git add -A && git commit`).
// 2. Git's own pre-commit hook (.githooks/pre-commit runs this with --git-hook): scans the staged changes of
//    every commit, however the command was written. This is the backstop for command-parsing gaps.
// Uses gitleaks as well when it is on PATH; CI always runs gitleaks over the full history.
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { deny, projectDir, readInput } from "./lib/common.mjs";

// Tokens: quoted strings or bare words. A command segment ends at ; | & or a newline.
const TOKEN = /"[^"]*"|'[^']*'|[^\s;|&]+/g;
const unquote = (/** @type {string} */ t) => t.replace(/^["']|["']$/g, "");
// Variables that can point git at another repository, index or config. Any mention is denied.
const GIT_ENV = /\bGIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG\w*|NAMESPACE|COMMON_DIR|CEILING_DIRECTORIES)\b/i;
const OPTION_WITH_VALUE = new Set(["-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);
const SKIP_FILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|[^/]+\.lock)$/;

/**
 * Every `git ... commit` in a command. Only plain `-C <dir>` is accepted as a global option (allowlist):
 * anything else (-c, --git-dir, --work-tree, ...) could point the commit somewhere we do not scan.
 * @param {string} command
 * @returns {Array<{ dirs: string[], badOption: string | undefined }>}
 */
function parseCommits(command) {
  const commits = [];
  for (const segment of command.split(/[;|&\n]+/)) {
    const tokens = [...segment.matchAll(TOKEN)].map((t) => unquote(t[0]));
    const g = tokens.findIndex((t) => /(^|[\\/])git(\.exe)?$/i.test(t));
    if (g < 0) continue;
    /** @type {string[]} */
    const dirs = [];
    /** @type {string | undefined} */
    let badOption;
    for (let i = g + 1; i < tokens.length; i++) {
      const t = tokens[i] ?? "";
      if (t === "-C") {
        dirs.push(tokens[++i] ?? "");
      } else if (t.startsWith("-")) {
        badOption ??= t;
        if (OPTION_WITH_VALUE.has(t)) i++;
      } else {
        if (t === "commit") {
          // Skipping git's own pre-commit hook (the backstop) is not allowed.
          const skip = tokens.slice(i + 1).find((a) => a.startsWith("--no-v") || /^-[a-zA-Z]*n[a-zA-Z]*$/.test(a)); // git accepts --no-v… prefixes
          commits.push({ dirs, badOption: badOption ?? skip });
        }
        break; // the subcommand decides; stop at it
      }
    }
  }
  return commits;
}

/** @type {Array<[string, RegExp]>} */
const RULES = [
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI-style key", /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ["AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ["private key", /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ["Azure connection string", /(?:AccountKey|SharedAccessKey)=[A-Za-z0-9+/=]{30,}/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
];
const GENERIC = /(api[_-]?key|secret|token|passw(?:or)?d|access[_-]?key|auth)[A-Za-z0-9_-]*["']?\s*[:=]\s*["']?([A-Za-z0-9_\-/+=.]{20,})/i;

/** @param {string} s */
function entropy(s) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

/** @param {string} line @returns {string | undefined} */
function classify(line) {
  for (const [kind, re] of RULES) if (re.test(line)) return kind;
  const g = GENERIC.exec(line);
  if (g && g[2] && entropy(g[2]) >= 3.5) return `generic secret (${g[1]})`;
  return undefined;
}

/**
 * Run git; a failure (error, non-zero exit, output over the buffer) throws so the scan fails closed.
 * @param {string[]} args @param {string} cwd
 */
function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) throw new Error(`git ${args[0]} failed: ${r.error ? String(r.error) : r.stderr}`);
  return r.stdout;
}

/** Added lines from a unified diff, as [file, line]. @param {string} diff */
function addedLines(diff) {
  /** @type {Array<[string, string]>} */
  const out = [];
  let file = "";
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) file = l.slice(4).replace(/^b\//, "");
    else if (l.startsWith("+") && !l.startsWith("+++")) out.push([file, l.slice(1)]);
  }
  return out;
}

/**
 * Scan what a commit in `cwd` would contain. Returns undefined when `cwd` is not a readable repository.
 * @param {string} cwd
 * @param {boolean} includeWorkingTree also scan unstaged and untracked files
 * @returns {string[] | undefined}
 */
function scan(cwd, includeWorkingTree) {
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (top.status !== 0) return undefined;
  const root = top.stdout.trim() || cwd;

  /** @type {Array<[string, string]>} */
  const lines = [...addedLines(git(["diff", "--cached", "-U0", "--no-color"], cwd))];
  if (includeWorkingTree) {
    lines.push(...addedLines(git(["diff", "-U0", "--no-color"], cwd)));
    for (const rel of git(["ls-files", "--others", "--exclude-standard"], cwd).split("\n").filter(Boolean)) {
      const abs = path.join(root, rel);
      try {
        if (statSync(abs).size > 1024 * 1024) continue;
        const text = readFileSync(abs, "utf8");
        if (text.includes("\u0000")) continue;
        for (const l of text.split(/\r?\n/)) lines.push([rel, l]);
      } catch {
        // unreadable: skip
      }
    }
  }

  const findings = new Set();
  for (const [file, line] of lines) {
    if (SKIP_FILE.test(file)) continue;
    const kind = classify(line);
    if (kind) findings.add(`${file}: ${kind}`);
  }
  const gl = spawnSync("gitleaks", ["git", "--pre-commit", "--staged", "--redact", "--no-banner", "."], { cwd: root, encoding: "utf8" });
  if (!gl.error && gl.status === 1) findings.add(`gitleaks: ${gl.stdout.split("\n").slice(0, 10).join(" / ")}`);
  return [...findings];
}

const ADVICE =
  "値を取り除き、.env など ignore されたファイルや環境変数に移してからコミットしてください。誤検知なら QUESTIONS.md に書いてください。";

/** git's pre-commit hook: staged changes only; exit 1 aborts the commit. */
function gitHookMode() {
  const findings = scan(process.cwd(), false);
  if (findings === undefined) {
    process.stderr.write("pre-commit-secrets: リポジトリを読めないためコミットを止めました。\n");
    process.exit(1);
  }
  if (findings.length > 0) {
    process.stderr.write(`シークレットらしき値があるためコミットを止めました（値は表示しません）:\n- ${findings.join("\n- ")}\n${ADVICE}\n`);
    process.exit(1);
  }
}

async function claudeHookMode() {
  const input = await readInput();
  const ti = /** @type {Record<string, unknown>} */ (input["tool_input"] ?? {});
  const command = String(ti["command"] ?? "");
  if (/\bgit\b/.test(command) && /hooks-?path/i.test(command)) {
    deny("git のフックの場所（core.hooksPath）を変える・消すコマンドは止めています。.githooks/pre-commit がシークレット検査の最後の砦です。");
  }
  const commits = parseCommits(command);
  if (commits.length === 0) return;

  const bad = commits.find((c) => c.badOption)?.badOption ?? GIT_ENV.exec(command)?.[0];
  if (bad) {
    deny(
      `git commit と一緒に -C 以外のオプションや git の場所を変える環境変数（${bad}）があると、コミット先を確かめられずシークレット検査ができないため止めました。リポジトリの中で普通に git commit してください。`,
    );
  }

  const base = typeof input["cwd"] === "string" && input["cwd"] ? input["cwd"] : projectDir(input);
  const all = [];
  for (const c of commits) {
    // Several -C options apply one after another, as in git.
    let cwd = base;
    for (const d of c.dirs) cwd = path.resolve(cwd, d);
    const findings = scan(cwd, true);
    if (findings === undefined) {
      deny(`コミット先のリポジトリを読めないため、シークレット検査ができません（${cwd}）。リポジトリの場所を確かめてください。`);
    }
    all.push(...findings);
  }
  if (all.length > 0) {
    deny(`コミットしようとしている変更にシークレットらしき値があります（値は表示しません）:\n- ${[...new Set(all)].join("\n- ")}\n${ADVICE}`);
  }
}

if (process.argv.includes("--git-hook")) {
  try {
    gitHookMode();
  } catch (e) {
    process.stderr.write(`pre-commit-secrets internal error: ${String(e)}\n`);
    process.exit(1);
  }
} else {
  claudeHookMode().catch((/** @type {unknown} */ e) => {
    deny(`pre-commit-secrets の内部エラーのため止めました: ${e instanceof Error ? e.message : String(e)}`);
  });
}
