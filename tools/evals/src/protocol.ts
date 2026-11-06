// M2: the eval protocol is fixed before any tuning (指示書 第10節). evals/protocol.lock holds a sha256 of
// EVALS-PROTOCOL.md and of the frozen test data; CI checks the lock still matches, that it was written
// in one commit only, and that no result (EVALS.md) is older than it.
import { createHash } from "node:crypto";

export interface LockedFile {
  path: string;
  content: string;
}

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
/** Line endings do not change a file's lock (a Windows checkout must agree with CI). */
const normal = (s: string): string => s.replace(/\r\n/g, "\n");

export function lockOf(files: readonly LockedFile[]): string {
  const paths = new Set<string>();
  for (const f of files) {
    if (paths.has(f.path)) throw new Error(`${f.path} is given twice`);
    paths.add(f.path);
  }
  const lines = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((f) => `${sha256(normal(f.content))}  ${f.path}`);
  return `${lines.join("\n")}\n`;
}

export interface LockProblem {
  path: string;
  kind: "changed" | "missing" | "extra";
}

/** Compares a lock with the files as they are now: changed, missing (locked, not given) or extra (given, not locked). */
export function checkLock(lockText: string, files: readonly LockedFile[]): LockProblem[] {
  const locked = new Map<string, string>();
  for (const line of normal(lockText).split("\n")) {
    if (line.trim() === "") continue;
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line.trim());
    if (m === null) throw new Error(`not a lock line: ${line}`);
    locked.set(m[2] as string, m[1] as string);
  }
  const problems: LockProblem[] = [];
  const given = new Map(files.map((f) => [f.path, f.content]));
  for (const [path, hash] of [...locked].sort()) {
    const c = given.get(path);
    if (c === undefined) problems.push({ path, kind: "missing" });
    else if (sha256(normal(c)) !== hash) problems.push({ path, kind: "changed" });
  }
  for (const path of given.keys()) if (!locked.has(path)) problems.push({ path, kind: "extra" });
  return problems.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export interface Commit {
  hash: string;
  files: readonly string[];
}

export const LOCK_PATH = "evals/protocol.lock";
export const RESULTS_PATH = "EVALS.md";

/** The paths a lock names, in its order. */
export function lockedPaths(lockText: string): string[] {
  return normal(lockText)
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(l.trim());
      if (m === null) throw new Error(`not a lock line: ${l}`);
      return m[2] as string;
    });
}

/**
 * Commits oldest first. A lock is written in one commit only. For the protocol's own lock, results also
 * come no earlier than it; an addendum lock (Q27) freezes more files later and is only checked for
 * being written once.
 */
export function checkFreezeHistory(commits: readonly Commit[], lockPath: string = LOCK_PATH): string[] {
  const problems: string[] = [];
  const lockAt = commits.flatMap((c, i) => (c.files.includes(lockPath) ? [i] : []));
  if (lockAt.length === 0) problems.push(`${lockPath} was never committed`);
  if (lockAt.length > 1) problems.push(`${lockPath} was changed after it was frozen (commits ${lockAt.map((i) => commits[i]?.hash).join(", ")})`);
  if (lockPath !== LOCK_PATH) return problems;
  const first = lockAt[0];
  const resultsAt = commits.findIndex((c) => c.files.includes(RESULTS_PATH));
  if (resultsAt >= 0 && (first === undefined || resultsAt < first)) problems.push(`${RESULTS_PATH} was committed before the protocol was frozen`);
  return problems;
}
