// M2: run in CI (pnpm check:protocol). Every lock under evals/ (the protocol's own lock and its addenda)
// still matches the files it names, each lock was written in one commit, and no result came before the
// protocol's lock (指示書 第10節, 第11節 M2).
//   --write <lock path> <file>...   writes a lock (only when freezing; a second commit of it fails the check)
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { LOCK_PATH, checkFreezeHistory, checkLock, lockOf, lockedPaths, type Commit } from "./protocol.ts";

const root = new URL("../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");

/** Commits oldest first, with the files each touched (a merge lists what it changed from its first parent). */
function history(): Commit[] {
  const out = execFileSync("git", ["log", "--reverse", "--name-only", "--diff-merges=first-parent", "--format=@@%H"], {
    cwd: new URL(".", root),
    encoding: "utf8",
  });
  const commits: Commit[] = [];
  for (const block of out.split("@@").slice(1)) {
    const [hash = "", ...files] = block.split("\n").map((l) => l.trim());
    commits.push({ hash, files: files.filter((f) => f !== "") });
  }
  return commits;
}

const args = process.argv.slice(2);
if (args[0] === "--write") {
  const [, lockPath, ...paths] = args;
  if (lockPath === undefined || paths.length === 0) {
    console.error("usage: check-protocol --write <lock path> <file>...");
    process.exit(2);
  }
  writeFileSync(new URL(lockPath, root), lockOf(paths.map((path) => ({ path, content: read(path) }))));
  console.log(`${lockPath} written for ${paths.length} files.`);
} else {
  const locks = readdirSync(new URL("evals/", root))
    .filter((f) => f.endsWith(".lock"))
    .map((f) => `evals/${f}`)
    .sort();
  const commits = history();
  const problems: string[] = [];
  if (!locks.includes(LOCK_PATH)) problems.push(`${LOCK_PATH} is missing`);
  for (const lock of locks) {
    const text = read(lock);
    const files = lockedPaths(text).map((path) => ({ path, content: read(path) }));
    problems.push(...checkLock(text, files).map((p) => `${lock}: ${p.path} ${p.kind}`), ...checkFreezeHistory(commits, lock));
  }
  if (problems.length > 0) {
    console.error(`The eval protocol is not as frozen:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`The eval protocol and the frozen files match their ${locks.length} lock(s).`);
}
