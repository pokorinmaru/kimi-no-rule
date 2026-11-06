#!/usr/bin/env node
// PreToolUse (Bash|PowerShell): before `git commit`, scan what is about to be committed for secrets.
// Scans staged changes, unstaged tracked changes and untracked files (covers `git add -A && git commit`).
// Uses gitleaks as well when it is on PATH; CI always runs gitleaks over the full history.
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { deny, projectDir, readInput } from "./lib/common.mjs";

// `git [global options] commit`. Group 1 holds the global options (to find -C <dir>).
const ARG = String.raw`(?:"[^"]*"|'[^']*'|[^\s;|&]+)`;
const GIT_COMMIT = new RegExp(String.raw`\bgit((?:\s+(?:-[Cc]\s+${ARG}|--?[\w-]+(?:=${ARG})?))*)\s+commit\b`);
const DASH_C = new RegExp(String.raw`-C\s+(${ARG})`);
const SKIP_FILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|[^/]+\.lock)$/;

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

/** @param {string[]} args @param {string} cwd */
function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : "";
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

async function main() {
  const input = await readInput();
  const ti = /** @type {Record<string, unknown>} */ (input["tool_input"] ?? {});
  const command = String(ti["command"] ?? "");
  const m = GIT_COMMIT.exec(command);
  if (!m) return;

  const base = typeof input["cwd"] === "string" && input["cwd"] ? input["cwd"] : projectDir(input);
  const dashC = DASH_C.exec(m[1] ?? "")?.[1]?.replace(/^["']|["']$/g, "");
  const cwd = dashC ? path.resolve(base, dashC) : base;
  if (spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).status !== 0) {
    deny(`コミット先のリポジトリを読めないため、シークレット検査ができません（${cwd}）。リポジトリの場所を確かめてください。`);
  }
  /** @type {Array<[string, string]>} */
  const lines = [
    ...addedLines(git(["diff", "--cached", "-U0", "--no-color"], cwd)),
    ...addedLines(git(["diff", "-U0", "--no-color"], cwd)),
  ];
  const top = git(["rev-parse", "--show-toplevel"], cwd).trim() || cwd;
  for (const rel of git(["ls-files", "--others", "--exclude-standard"], cwd).split("\n").filter(Boolean)) {
    const abs = path.join(top, rel);
    try {
      if (statSync(abs).size > 1024 * 1024) continue;
      const text = readFileSync(abs, "utf8");
      if (text.includes("\u0000")) continue;
      for (const l of text.split(/\r?\n/)) lines.push([rel, l]);
    } catch {
      // unreadable: skip
    }
  }

  const findings = new Set();
  for (const [file, line] of lines) {
    if (SKIP_FILE.test(file)) continue;
    const kind = classify(line);
    if (kind) findings.add(`${file}: ${kind}`);
  }

  const gl = spawnSync("gitleaks", ["git", "--pre-commit", "--staged", "--redact", "--no-banner", "."], { cwd: top, encoding: "utf8" });
  if (!gl.error && gl.status === 1) findings.add(`gitleaks: ${gl.stdout.split("\n").slice(0, 10).join(" / ")}`);

  if (findings.size > 0) {
    deny(
      `コミットしようとしている変更にシークレットらしき値があります（値は表示しません）:\n- ${[...findings].join("\n- ")}\n` +
        "値を取り除き、.env など ignore されたファイルや環境変数に移してからコミットしてください。誤検知なら QUESTIONS.md に書いてください。",
    );
  }
}

main().catch((/** @type {unknown} */ e) => {
  deny(`pre-commit-secrets の内部エラーのため止めました: ${e instanceof Error ? e.message : String(e)}`);
});
