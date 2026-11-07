// pnpm make:discriminating [out dir] [--dry-run]: has Opus write discriminating problems for the reading pairs
// the bank does not tell apart (指示書 第6.7節 手順3; Q33). Needs ANTHROPIC_API_KEY (BLOCKED B3) unless --dry-run.
// It prints the pairs and the expected number of calls, and asks nothing. Records are written unchecked by a
// person (human_checked false); the build log holds answers and is for adults only.
// While it runs, a progress line per Claude call and per finished pair goes to stdout and to
// evals/results/progress.log (gitignored; the same log as the eval runner, lines tagged [make:discriminating]).
import { fileURLToPath } from "node:url";
import { FRACTION_BANK } from "@kimi/core";
import { anthropicAgentClient, anthropicClient } from "@kimi/interpret";
import { fileSink } from "../../evals/src/runner/progress.ts";
import { DEFAULT_DIR } from "./dirs.ts";
import { LOG_FILE, MAX_PAIRS, PER_PAIR, expectedCalls, makeDiscriminating, readStored, weakPairs, writeMade } from "./discriminating.ts";
import { makeProgress } from "./make-progress.ts";

const PROGRESS_LOG = fileURLToPath(new URL("../../../evals/results/progress.log", import.meta.url));

const args = process.argv.slice(2).filter((a) => a !== "--");
const dryRun = args.includes("--dry-run");
const outDir = args.find((a) => !a.startsWith("--")) ?? DEFAULT_DIR;

const stored = readStored(outDir);
const pairs = weakPairs([...FRACTION_BANK, ...stored.records]);
const calls = expectedCalls(pairs.length);
console.log(`stored discriminating problems: ${String(stored.records.length)} (in ${outDir})`);
console.log(`reading pairs the bank splits at most once (cap ${String(MAX_PAIRS)}):`);
for (const p of pairs) console.log(`  ${p.a.id} / ${p.b.id}: split by ${String(p.splits)} problem(s)`);
const planned = `Opus about ${String(calls.opusTypical)}, at most ${String(calls.opusMax)}; Haiku at most ${String(calls.haikuMax)}`;
console.log(`expected calls: ${String(calls.problems)} problem(s) asked (${String(PER_PAIR)} per pair); ${planned}`);
if (pairs.length === 0 || dryRun) process.exit(0);
if ((process.env.ANTHROPIC_API_KEY ?? "") === "") {
  console.error("make:discriminating needs ANTHROPIC_API_KEY in the environment (BLOCKED B3).");
  process.exit(2);
}
const progress = makeProgress({ sink: fileSink(PROGRESS_LOG), pairs: pairs.length, plannedCalls: planned });
console.log(`progress log: ${PROGRESS_LOG}`);
const client = progress.client(anthropicClient());
const made = await makeDiscriminating(
  { agent: progress.agent(anthropicAgentClient()), judge: client, listen: client },
  { pairs, bank: FRACTION_BANK, stored },
  {},
  { onPair: (d) => progress.pairDone(`${d.pair.a.id} / ${d.pair.b.id}${d.noReply ? " (no reply from the writer)" : ""}`, d.kept, d.refused) },
);
writeMade(outDir, made);
console.log(`${String(made.accepted.length)} kept (human_checked false); the log (answers, adults only) is ${LOG_FILE} in ${outDir}`);
