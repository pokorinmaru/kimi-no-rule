// pnpm make:transfer [out dir] [--dry-run] [--misread-gate]: has Opus write transfer problems (指示書 第6.7節 手順6;
// Q33): for each common misreading × {same wording as the fixed problem, a different known phrasing}, one problem
// the old reading would fail on, at most MAX_TRANSFER a run (slots already stored are skipped, so the next run
// fills the rest). Needs ANTHROPIC_API_KEY (BLOCKED B3) unless --dry-run. It prints the plan and the expected
// number of calls before calling, and asks nothing. Records are written unchecked by a person (human_checked
// false); the build log holds answers and is for adults only. The misread rate is recorded, not a gate (Q44),
// unless --misread-gate. Progress lines per Claude call and per finished problem go to stdout and to
// evals/results/progress.log (tagged [make:transfer]).
import { fileURLToPath } from "node:url";
import { FRACTION_BANK } from "@kimi/core";
import { anthropicAgentClient, anthropicClient } from "@kimi/interpret";
import { fileSink } from "../../evals/src/runner/progress.ts";
import { makeProgress } from "./make-progress.ts";
import { MAX_TRANSFER, TRANSFER_DIR, TRANSFER_LOG_FILE, expectedTransferCalls, makeTransfer, planTransfer, readStoredTransfer, writeMadeTransfer } from "./transfer.ts";

const PROGRESS_LOG = fileURLToPath(new URL("../../../evals/results/progress.log", import.meta.url));

const args = process.argv.slice(2).filter((a) => a !== "--");
const dryRun = args.includes("--dry-run");
const misreadGate = args.includes("--misread-gate");
const outDir = args.find((a) => !a.startsWith("--")) ?? TRANSFER_DIR;

const stored = readStoredTransfer(outDir);
const plan = planTransfer(FRACTION_BANK, stored);
const calls = expectedTransferCalls(plan.slots.length);
console.log(`stored transfer problems: ${String(stored.records.length)} (in ${outDir})`);
console.log(`planned problems (common misreading x same/different wording, cap ${String(MAX_TRANSFER)}):`);
for (const s of plan.slots) console.log(`  ${s.reading.id} / ${s.wording}: fixed problem ${s.fixed.world.problem_id}`);
if (plan.noFixed.length > 0) console.log(`no bank problem the misreading fails on: ${plan.noFixed.join(", ")}`);
const planned = `Opus about ${String(calls.opusTypical)}, at most ${String(calls.opusMax)}; Haiku at most ${String(calls.haikuMax)}`;
console.log(`expected calls: ${String(calls.problems)} problem(s); ${planned}`);
if (plan.slots.length === 0 || dryRun) process.exit(0);
if ((process.env.ANTHROPIC_API_KEY ?? "") === "") {
  console.error("make:transfer needs ANTHROPIC_API_KEY in the environment (BLOCKED B3).");
  process.exit(2);
}
const progress = makeProgress({ sink: fileSink(PROGRESS_LOG), pairs: plan.slots.length, plannedCalls: planned, tag: "[make:transfer]", unit: "problem" });
console.log(`progress log: ${PROGRESS_LOG}`);
const client = progress.client(anthropicClient());
const made = await makeTransfer(
  { agent: progress.agent(anthropicAgentClient()), judge: client, listen: client },
  { slots: plan.slots, bank: FRACTION_BANK, stored },
  misreadGate ? {} : { misreadThreshold: 0 },
  { onSlot: (d) => progress.pairDone(`${d.slot.reading.id} / ${d.slot.wording}${d.noReply ? " (no reply from the writer)" : ""}`, d.kept, d.refused) },
);
writeMadeTransfer(outDir, made);
console.log(`${String(made.accepted.length)} kept (human_checked false); the log (answers, adults only) is ${TRANSFER_LOG_FILE} in ${outDir}`);
