// pnpm make:discriminating [out dir] [--dry-run]: has Opus write discriminating problems for the reading pairs
// the bank does not tell apart (指示書 第6.7節 手順3; Q33). Needs ANTHROPIC_API_KEY (BLOCKED B3) unless --dry-run.
// It prints the pairs and the expected number of calls, and asks nothing. Records are written unchecked by a
// person (human_checked false); the build log holds answers and is for adults only.
import { FRACTION_BANK } from "@kimi/core";
import { anthropicAgentClient, anthropicClient } from "@kimi/interpret";
import { DEFAULT_DIR } from "./dirs.ts";
import { LOG_FILE, MAX_PAIRS, PER_PAIR, expectedCalls, makeDiscriminating, readStored, weakPairs, writeMade } from "./discriminating.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const outDir = args.find((a) => !a.startsWith("--")) ?? DEFAULT_DIR;

const stored = readStored(outDir);
const pairs = weakPairs([...FRACTION_BANK, ...stored.records]);
const calls = expectedCalls(pairs.length);
console.log(`stored discriminating problems: ${String(stored.records.length)} (in ${outDir})`);
console.log(`reading pairs the bank splits at most once (cap ${String(MAX_PAIRS)}):`);
for (const p of pairs) console.log(`  ${p.a.id} / ${p.b.id}: split by ${String(p.splits)} problem(s)`);
console.log(
  `expected calls: ${String(calls.problems)} problem(s) asked (${String(PER_PAIR)} per pair); Opus about ${String(calls.opusTypical)}, at most ${String(calls.opusMax)}; Haiku at most ${String(calls.haikuMax)}`,
);
if (pairs.length === 0 || dryRun) process.exit(0);
if ((process.env.ANTHROPIC_API_KEY ?? "") === "") {
  console.error("make:discriminating needs ANTHROPIC_API_KEY in the environment (BLOCKED B3).");
  process.exit(2);
}
const client = anthropicClient();
const made = await makeDiscriminating({ agent: anthropicAgentClient(), judge: client, listen: client }, { pairs, bank: FRACTION_BANK, stored });
writeMade(outDir, made);
console.log(`${String(made.accepted.length)} kept (human_checked false); the log (answers, adults only) is ${LOG_FILE} in ${outDir}`);
