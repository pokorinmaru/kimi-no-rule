// pnpm eval:import-third-party: reads evals/third-party/safety.csv and kohai.csv (filled by a third-party
// adult), checks every row, and writes evals/data/{safety,kohai}/third-party.jsonl. Then it prints the
// command that freezes them as addendum 4 and writes a draft of that addendum (指示書 第10.1節・第10.3節).
//   --problems   prints the problem list for evals/third-party/README.md and does nothing else
// Neither the rows nor the findings are logged beyond their line numbers (findings are masked).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { lockedPaths } from "./protocol.ts";
import { THIRD_PARTY, addendumDraft, freezeCommand, importKohaiCsv, importSafetyCsv, problemList, toJsonl, type ImportResult } from "./third-party.ts";

const root = new URL("../../../", import.meta.url);
const at = (p: string): URL => new URL(p, root);
const read = (p: string): string => readFileSync(at(p), "utf8");

if (process.argv.includes("--problems")) {
  process.stdout.write(problemList());
  process.exit(0);
}

const frozen = new Set(
  readdirSync(at("evals/"))
    .filter((f) => f.endsWith(".lock"))
    .flatMap((f) => lockedPaths(read(`evals/${f}`))),
);

const jobs: { csv: string; out: string; result: ImportResult<object> }[] = [
  { csv: THIRD_PARTY.safetyCsv, out: THIRD_PARTY.safetyJsonl, result: existsSync(at(THIRD_PARTY.safetyCsv)) ? importSafetyCsv(read(THIRD_PARTY.safetyCsv)) : { rows: [], errors: [] } },
  { csv: THIRD_PARTY.kohaiCsv, out: THIRD_PARTY.kohaiJsonl, result: existsSync(at(THIRD_PARTY.kohaiCsv)) ? importKohaiCsv(read(THIRD_PARTY.kohaiCsv)) : { rows: [], errors: [] } },
];

let failed = false;
for (const j of jobs) {
  if (j.result.errors.length > 0) {
    failed = true;
    console.error(`${j.csv}: not imported (${j.result.errors.length} problem(s)):\n- ${j.result.errors.join("\n- ")}`);
  }
  if (j.result.rows.length > 0 && frozen.has(j.out)) {
    failed = true;
    console.error(`${j.out} is frozen by a lock; it is not overwritten. Changing frozen rows needs a new addendum (addendum 5).`);
  }
}
if (failed) process.exit(1);

const written: { path: string; rows: number }[] = [];
for (const j of jobs) {
  if (j.result.rows.length === 0) {
    console.log(`${j.csv}: no rows; nothing written.`);
    continue;
  }
  writeFileSync(at(j.out), toJsonl(j.result.rows));
  written.push({ path: j.out, rows: j.result.rows.length });
  console.log(`${j.out}: ${j.result.rows.length} rows written (source third_party, split test).`);
}

if (written.length > 0) {
  if (existsSync(at(THIRD_PARTY.addendum))) console.log(`${THIRD_PARTY.addendum} already exists; left as it is.`);
  else {
    writeFileSync(at(THIRD_PARTY.addendum), addendumDraft(written));
    console.log(`${THIRD_PARTY.addendum}: draft written. Fill in who wrote the rows and when, before freezing.`);
  }
  console.log("\nFreeze them before any Claude run on them (pnpm eval:live), and commit the lock in one commit:");
  console.log(`  ${freezeCommand(written.map((w) => w.path))}`);
}
