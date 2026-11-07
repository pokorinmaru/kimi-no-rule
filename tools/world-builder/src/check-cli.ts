// pnpm check:discriminating [dir]: runs core's checks again on every stored discriminating problem (valid world,
// sentences, unique solution equal to the expected answer, problem conditions, and its reading pair still split).
import { DEFAULT_DIR } from "./dirs.ts";
import { checkStored } from "./discriminating.ts";

const dir = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? DEFAULT_DIR;
const res = checkStored(dir);
for (const e of res.errors) console.error(`✗ ${e}`);
console.log(`${String(res.records)} discriminating problem(s) checked in ${dir}; ${String(res.errors.length)} error(s)`);
process.exit(res.errors.length === 0 ? 0 : 1);
