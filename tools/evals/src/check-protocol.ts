// M2: run in CI (pnpm check:protocol). The eval protocol and the frozen test data still match their lock,
// the lock was written in one commit, and no result came before it (指示書 第10節, 第11節 M2).
//   --write  writes the lock (only when freezing; the history check then refuses a second lock commit)
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { LOCK_PATH, checkFreezeHistory, checkLock, lockOf, type Commit } from "./protocol.ts";

/** What the lock covers: the protocol and the test split of every eval. */
export const FROZEN = ["EVALS-PROTOCOL.md", "evals/data/interpret/test.jsonl", "evals/data/safety/test.jsonl"] as const;

const root = new URL("../../../", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");

/** Commits oldest first, with the files each one touched. */
function history(): Commit[] {
  const out = execFileSync("git", ["log", "--reverse", "--name-only", "--format=@@%H"], { cwd: new URL(".", root), encoding: "utf8" });
  const commits: Commit[] = [];
  for (const block of out.split("@@").slice(1)) {
    const [hash = "", ...files] = block.split("\n").map((l) => l.trim());
    commits.push({ hash, files: files.filter((f) => f !== "") });
  }
  return commits;
}

const files = FROZEN.map((path) => ({ path, content: read(path) }));
if (process.argv.includes("--write")) {
  writeFileSync(new URL(LOCK_PATH, root), lockOf(files));
  console.log(`${LOCK_PATH} written for ${FROZEN.length} files.`);
} else {
  const problems = [
    ...checkLock(read(LOCK_PATH), files).map((p) => `${p.path}: ${p.kind}`),
    ...checkFreezeHistory(history()),
  ];
  if (problems.length > 0) {
    console.error(`The eval protocol is not as frozen:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log("The eval protocol and the test data match their lock.");
}
