// Discriminating problems written offline (指示書 第6.7節 手順3; Q33). For a pair of readings that the bank does
// not tell apart, Opus writes one or two new problem texts; each goes through the one build of 第6.6節
// (buildProblem: two independent builds, the restated text, the sentence list, the problem conditions, the
// misread check). core then decides whether the record is kept: the sentence list and the problem conditions
// hold, and the two readings build different worlds on it (core predict). Kept records wait for a person's
// check (human_checked false). This never runs at a child's request.
import { z } from "zod";
import { predict, problemConditions, schemas, validateStatements, type Hypothesis, type ProblemRecord } from "@kimi/core";
import { buildProblem, judgeCall, type BuildDeps, type BuildLogEntry, type BuildOptions, type RejectReason } from "./build.ts";

export interface DiscriminateInput {
  readingA: Hypothesis;
  readingB: Hypothesis;
  /** The problems the app has: shown to Opus with whether the pair splits there. */
  bank: readonly ProblemRecord[];
  /** Texts the new problems must not repeat (the bank's and those written before). */
  avoidTexts: readonly string[];
}

export interface DiscriminateOptions extends BuildOptions {
  /** How many texts to ask for (1 or 2). */
  count?: 1 | 2;
  /** The writer call's deadline. */
  timeoutMs?: number;
  /** The new records are named `${idPrefix}_${n}`, n from startIndex. */
  idPrefix?: string;
  startIndex?: number;
  /** The build of 第6.6節; replaced only in tests. */
  build?: typeof buildProblem;
}

export type DiscriminateRefusal = "duplicate_text" | "build_rejected" | "statements_invalid" | "conditions_failed" | "run_failed" | "not_split";

export interface DiscriminateItem {
  problemId: string;
  text: string;
  status: "accepted" | "refused";
  reason?: DiscriminateRefusal;
  buildReason?: RejectReason;
  log: BuildLogEntry[];
}

export interface DiscriminateResult {
  writer: "ok" | "no_reply";
  accepted: ProblemRecord[];
  results: DiscriminateItem[];
}

const WRITER_TIMEOUT_MS = 120_000;

export const DISCRIMINATE_SYSTEM = [
  "You write new word problems in Japanese for an app for 6th graders in Japan, on one type: a fraction used as a multiple (one quantity is a fraction, or a fraction times, of another).",
  "You are given two ways a child might read such problems, written as rules of the app's reading language, and the problems the app already has with whether the two readings build different worlds on each.",
  "Write problems on which the two readings build different worlds, so that the child's first world tells which way the child read it.",
  "Each problem has two holders (family roles or things such as boxes, ribbons or tanks, never personal names), one kind of thing, one known number, one sentence relating the two by a fraction, and a question asking the other number. Keep the answer a whole number or a simple fraction.",
  "Write every problem yourself for this app. Do not copy, adapt or translate a textbook or any published problem, and do not repeat or rephrase the problems you are given.",
  "Keep the scenes everyday and gentle for children. Say for each problem whether its words point to the operation it needs (consistent) or to the other one (inconsistent), and why the two readings part on it.",
].join("\n");

const reply = z.strictObject({
  problems: z.array(
    z.strictObject({
      problem_text: z.string(),
      consistency: z.enum(["consistent", "inconsistent"]),
      why: z.string(),
    }),
  ),
});

const normalized = (t: string): string => t.replace(/\s+/g, "");

/** Whether the two readings build different worlds on the record (core predict). Throws when a rule cannot run there. */
export function splitsPair(record: ProblemRecord, a: Hypothesis, b: Hypothesis): boolean {
  const p = predict([a, b], record, true);
  return new Set(p.predictions.map((x) => x.worldClass)).size > 1;
}

function safeSplits(record: ProblemRecord, a: Hypothesis, b: Hypothesis): boolean | "run_failed" {
  try {
    return splitsPair(record, a, b);
  } catch {
    return "run_failed";
  }
}

const ruleText = (h: Hypothesis): string => JSON.stringify({ id: h.id, clauses: h.clauses, note: h.note_for_adult });

export async function writeDiscriminating(deps: BuildDeps, input: DiscriminateInput, options: DiscriminateOptions = {}): Promise<DiscriminateResult> {
  const count = options.count ?? 2;
  const build = options.build ?? buildProblem;
  const idPrefix = options.idPrefix ?? `p_disc_${input.readingA.id}_${input.readingB.id}`;
  const start = options.startIndex ?? 1;
  const buildOpts: BuildOptions = {};
  for (const k of ["maxRejections", "misreadThreshold", "misreadCount", "minValidMisreads", "maxTurns"] as const) {
    const v = options[k];
    if (v !== undefined) buildOpts[k] = v;
  }

  const known = input.bank.map((r) => {
    const s = safeSplits(r, input.readingA, input.readingB);
    return `- ${r.world.problem_text} (${s === true ? "the two readings part" : "the two readings build the same world"})`;
  });
  const context = [`Reading A:\n${ruleText(input.readingA)}`, `Reading B:\n${ruleText(input.readingB)}`, `Problems the app has:\n${known.join("\n")}`].join("\n\n");
  const avoid = input.avoidTexts.length === 0 ? "" : `\nDo not repeat these texts:\n${input.avoidTexts.map((t) => `- ${t}`).join("\n")}`;
  const written = await judgeCall(
    deps,
    DISCRIMINATE_SYSTEM,
    context,
    `Write ${count === 1 ? "one problem" : `at most ${count} problems`}.${avoid}`,
    reply,
    (v) => v.problems.length >= 1 && v.problems.length <= count && v.problems.every((p) => p.problem_text.trim() !== ""),
    reply,
    options.timeoutMs ?? WRITER_TIMEOUT_MS,
  );
  if (written === null) return { writer: "no_reply", accepted: [], results: [] };

  const seen = new Set(input.avoidTexts.map(normalized));
  const accepted: ProblemRecord[] = [];
  const results: DiscriminateItem[] = [];
  for (const [i, p] of written.problems.entries()) {
    const problemId = `${idPrefix}_${start + i}`;
    const text = p.problem_text.trim();
    const refuse = (reason: DiscriminateRefusal, log: BuildLogEntry[], buildReason?: RejectReason): void => {
      results.push({ problemId, text, status: "refused", reason, ...(buildReason === undefined ? {} : { buildReason }), log });
    };
    if (seen.has(normalized(text))) {
      refuse("duplicate_text", []);
      continue;
    }
    seen.add(normalized(text));
    const outcome = await build(deps, { problemId, problemText: text, lang: "ja", grade: 6, consistency: p.consistency, source: "discriminating_bank", pairId: null }, buildOpts);
    if (outcome.status !== "adopted") {
      refuse("build_rejected", outcome.log, outcome.reason);
      continue;
    }
    const log = [...outcome.log];
    const record = schemas.problemRecord.parse({ ...outcome.record, source: "discriminating_bank", checks: { ...outcome.record.checks, human_checked: false } });
    if (!validateStatements(record.world, record.statements, record.syntax_marks).ok) {
      refuse("statements_invalid", log);
      continue;
    }
    if (!problemConditions(record).ok) {
      refuse("conditions_failed", log);
      continue;
    }
    const split = safeSplits(record, input.readingA, input.readingB);
    if (split !== true) {
      refuse(split === "run_failed" ? "run_failed" : "not_split", log);
      continue;
    }
    log.push({ step: "adopt", ok: true, detail: `${input.readingA.id} and ${input.readingB.id} build different worlds` });
    accepted.push(record);
    results.push({ problemId, text, status: "accepted", log });
  }
  return { writer: "ok", accepted, results };
}
