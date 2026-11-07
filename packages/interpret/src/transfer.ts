// Transfer problems written offline (指示書 第6.7節 手順6; Q33). After a child fixes a reading on a problem, a
// transfer problem is one on which the old reading would fail again: either with the wording of the fixed
// problem ("same") or with another known phrasing ("different"), so that solving the second shows the fix does
// not hang on a cue word. Opus writes one text; it goes through the one build of 第6.6節 (buildProblem: two
// independent builds, the restated text, the sentence list, the problem conditions; the misread rate is
// recorded, not a gate, as in Q44 when the caller passes misreadThreshold 0). core then decides whether the
// record is kept: the sentences and problem conditions hold, the old reading builds a world other than the
// correct one (core predict), and the wording is the one asked for (core wordingTag). Kept records wait for a
// person's check (human_checked false). This never runs at a child's request.
import { z } from "zod";
import {
  COMMON_FRACTION_READINGS,
  CORRECT_READING_ID,
  TRANSFER_CUES,
  problemConditions,
  schemas,
  validateStatements,
  wordingCues,
  wordingTag,
  type Hypothesis,
  type ProblemRecord,
} from "@kimi/core";
import { buildProblem, judgeCall, type BuildDeps, type BuildLogEntry, type BuildOptions, type RejectReason } from "./build.ts";
import { splitsPair } from "./discriminate.ts";

export type TransferWording = "same" | "different";

/** The record source for transfer problems: they belong to the research layer's step (core schema enum). */
export const TRANSFER_SOURCE = "research" satisfies ProblemRecord["source"];

export interface TransferInput {
  /** The reading the child fixed (a misreading). */
  oldReading: Hypothesis;
  /** The problem the child fixed it on: its wording is kept or avoided. */
  fixed: ProblemRecord;
  wording: TransferWording;
  /** Texts the new problem must not repeat. */
  avoidTexts: readonly string[];
}

export interface TransferOptions extends BuildOptions {
  timeoutMs?: number;
  problemId?: string;
  /** The build of 第6.6節; replaced only in tests. */
  build?: typeof buildProblem;
}

export type TransferRefusal = "duplicate_text" | "wording_mismatch" | "build_rejected" | "statements_invalid" | "conditions_failed" | "run_failed" | "old_reading_holds";

export interface TransferItem {
  problemId: string;
  text: string;
  wording: TransferWording;
  status: "accepted" | "refused";
  reason?: TransferRefusal;
  buildReason?: RejectReason;
  log: BuildLogEntry[];
}

export interface TransferResult {
  writer: "ok" | "no_reply";
  record: ProblemRecord | null;
  item: TransferItem | null;
}

const WRITER_TIMEOUT_MS = 120_000;

export const TRANSFER_SYSTEM = [
  "You write one new word problem in Japanese for an app for 6th graders in Japan, on one type: a fraction used as a multiple (one quantity is a fraction, or a fraction times, of another).",
  "A child has just fixed a way of reading such problems. You are given that old reading, written as a rule of the app's reading language, and the problem the child fixed it on.",
  "Write a problem on which the old reading would again build a different world from the correct one, so that solving it shows whether the fix holds.",
  "You are told whether to keep the relation words of the fixed problem or to use another phrasing instead; follow that exactly, and keep the rest of the sentence natural.",
  "The problem has two holders (family roles or things such as boxes, ribbons or tanks, never personal names), one kind of thing, one known number, one sentence relating the two by a fraction, and a question asking the other number. Keep the answer a whole number or a simple fraction.",
  "Write it yourself for this app. Do not copy, adapt or translate a textbook or any published problem, and do not repeat or rephrase the problems you are given.",
  "Keep the scene everyday and gentle for children. Say whether its words point to the operation it needs (consistent) or to the other one (inconsistent), and why the old reading fails on it.",
].join("\n");

const reply = z.strictObject({
  problem_text: z.string(),
  consistency: z.enum(["consistent", "inconsistent"]),
  why: z.string(),
});

const normalized = (t: string): string => t.replace(/\s+/g, "");

const correctReading = (): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === CORRECT_READING_ID);
  if (h === undefined) throw new Error("no correct reading in core");
  return h;
};

/** Whether the old reading builds a world other than the correct one on the record (core predict). Throws when it cannot run there. */
export function oldReadingFails(record: ProblemRecord, oldReading: Hypothesis): boolean {
  return splitsPair(record, correctReading(), oldReading);
}

const ruleText = (h: Hypothesis): string => JSON.stringify({ id: h.id, clauses: h.clauses, note: h.note_for_adult });

/** What the writer is asked about the wording. */
function wordingAsk(fixedText: string, wording: TransferWording): string {
  const fixed = wordingCues(fixedText);
  if (wording === "same") {
    const words = TRANSFER_CUES.filter((c) => fixed.includes(c.id)).map((c) => c.words[0]);
    const kept = words.length === 0 ? "the plain の relating the two (as in the fixed problem)" : words.map((w) => `「${w ?? ""}」`).join(" and ");
    return `Wording: the same as the fixed problem. Relate the two holders with ${kept}, and use none of the other phrasings.`;
  }
  const others = TRANSFER_CUES.filter((c) => !fixed.includes(c.id)).map((c) => `「${c.words[0] ?? ""}」`);
  return `Wording: different from the fixed problem. Relate the two holders with one of ${others.join(", ")}, and not with the fixed problem's relation words.`;
}

export async function writeTransfer(deps: BuildDeps, input: TransferInput, options: TransferOptions = {}): Promise<TransferResult> {
  const build = options.build ?? buildProblem;
  const problemId = options.problemId ?? `p_transfer_${input.oldReading.id}_${input.wording}_1`;
  const buildOpts: BuildOptions = {};
  for (const k of ["maxRejections", "misreadThreshold", "misreadCount", "minValidMisreads", "maxTurns"] as const) {
    const v = options[k];
    if (v !== undefined) buildOpts[k] = v;
  }
  const fixedText = input.fixed.world.problem_text;
  const context = [`The old reading:\n${ruleText(input.oldReading)}`, `The fixed problem:\n${fixedText}`].join("\n\n");
  const avoid = input.avoidTexts.length === 0 ? "" : `\nDo not repeat these texts:\n${input.avoidTexts.map((t) => `- ${t}`).join("\n")}`;
  const written = await judgeCall(
    deps,
    TRANSFER_SYSTEM,
    context,
    `Write one problem. ${wordingAsk(fixedText, input.wording)}${avoid}`,
    reply,
    (v) => v.problem_text.trim() !== "",
    reply,
    options.timeoutMs ?? WRITER_TIMEOUT_MS,
  );
  if (written === null) return { writer: "no_reply", record: null, item: null };

  const text = written.problem_text.trim();
  const refuse = (reason: TransferRefusal, log: BuildLogEntry[], buildReason?: RejectReason): TransferResult => ({
    writer: "ok",
    record: null,
    item: { problemId, text, wording: input.wording, status: "refused", reason, ...(buildReason === undefined ? {} : { buildReason }), log },
  });
  if (input.avoidTexts.some((t) => normalized(t) === normalized(text))) return refuse("duplicate_text", []);
  if (wordingTag(fixedText, text) !== input.wording) return refuse("wording_mismatch", []);

  const outcome = await build(deps, { problemId, problemText: text, lang: "ja", grade: 6, consistency: written.consistency, source: TRANSFER_SOURCE, pairId: null }, buildOpts);
  if (outcome.status !== "adopted") return refuse("build_rejected", outcome.log, outcome.reason);
  const log = [...outcome.log];
  const record = schemas.problemRecord.parse({ ...outcome.record, source: TRANSFER_SOURCE, checks: { ...outcome.record.checks, human_checked: false } });
  if (wordingTag(fixedText, record.world.problem_text) !== input.wording) return refuse("wording_mismatch", log);
  if (!validateStatements(record.world, record.statements, record.syntax_marks).ok) return refuse("statements_invalid", log);
  if (!problemConditions(record).ok) return refuse("conditions_failed", log);
  let fails: boolean;
  try {
    fails = oldReadingFails(record, input.oldReading);
  } catch {
    return refuse("run_failed", log);
  }
  if (!fails) return refuse("old_reading_holds", log);
  log.push({ step: "adopt", ok: true, detail: `${input.oldReading.id} builds a world other than the correct one; wording ${input.wording}` });
  return { writer: "ok", record, item: { problemId, text, wording: input.wording, status: "accepted", log } };
}
