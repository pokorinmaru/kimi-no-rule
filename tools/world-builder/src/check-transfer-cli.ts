// pnpm check:transfer [dir]: runs core's checks again on every stored transfer problem (valid world, sentences,
// unique solution equal to the expected answer, problem conditions, the old reading still fails there, and the
// wording is still the one it was written for).
import { TRANSFER_DIR, checkStoredTransfer } from "./transfer.ts";

const dir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? TRANSFER_DIR;
const res = checkStoredTransfer(dir);
for (const e of res.errors) console.error(`✗ ${e}`);
console.log(`${String(res.records)} transfer problem(s) checked in ${dir}; ${String(res.errors.length)} error(s)`);
process.exit(res.errors.length === 0 ? 0 : 1);
