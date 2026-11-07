// The transfer problems at run time (指示書 第6.7節 手順6, Q48). After the child fixes the junior's reading on a
// problem, core offers a stored problem the old reading fails on: first one in another known phrasing, then one
// in the same wording as the fixed problem. Only when the child reads the other phrasing as written, before any
// help on its wording, and solves it, is the fix kept as a reading that does not lean on the wording. The
// wording is decided against the problem the child actually fixed. Pure functions only.
import { runRule, type Hypothesis } from "../rules/run.ts";
import { sameReading } from "../rules/same-reading.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import { hypothesis as hypothesisSchema } from "../schema/reading-rule.ts";
import type { WorldScene } from "../schema/world-scene.ts";
import { wordingTag } from "./wording.ts";

/** A stored transfer problem and the old reading it was written to catch (content/problems/transfer/transfers.json). */
export interface TransferLink {
  problemId: string;
  oldReading: Hypothesis;
}

export type TransferWording = "same" | "different";

export interface TransferOption {
  record: ProblemRecord;
  oldReading: Hypothesis;
  wording: TransferWording;
}

/** Whether the old reading builds a world other than the sentence's own on the record; false when it cannot run there. */
function oldReadingFails(record: ProblemRecord, oldReading: Hypothesis): boolean {
  try {
    return !sameReading(runRule(oldReading, record), record.world, true);
  } catch {
    return false;
  }
}

/** The links of the transfer list core accepts: a stored record, a reading that parses, and that fails on the record. */
export function transferLinks(meta: unknown, records: readonly ProblemRecord[]): TransferLink[] {
  if (meta === null || typeof meta !== "object" || Array.isArray(meta)) return [];
  const out: TransferLink[] = [];
  for (const [problemId, entry] of Object.entries(meta as Record<string, unknown>)) {
    const record = records.find((r) => r.world.problem_id === problemId);
    if (record === undefined || entry === null || typeof entry !== "object") continue;
    const parsed = hypothesisSchema.safeParse((entry as { oldReading?: unknown }).oldReading);
    if (!parsed.success || !oldReadingFails(record, parsed.data)) continue;
    out.push({ problemId, oldReading: parsed.data });
  }
  return out.sort((a, b) => a.problemId.localeCompare(b.problemId));
}

/**
 * The transfer problems to offer after the child fixed `oldReadingId` on `fixed`: those in the route's bank, not
 * done in the session, that the old reading fails on; another known phrasing first, then the same wording.
 */
export function transferOptions(o: {
  fixed: ProblemRecord;
  oldReadingId: string;
  links: readonly TransferLink[];
  bank: readonly ProblemRecord[];
  done: readonly string[];
}): TransferOption[] {
  const done = new Set(o.done);
  const options: TransferOption[] = [];
  for (const link of o.links) {
    if (link.oldReading.id !== o.oldReadingId || done.has(link.problemId)) continue;
    const record = o.bank.find((r) => r.world.problem_id === link.problemId);
    if (record === undefined || !oldReadingFails(record, link.oldReading)) continue;
    const tag = wordingTag(o.fixed.world.problem_text, record.world.problem_text);
    if (tag === "neither") continue;
    options.push({ record, oldReading: link.oldReading, wording: tag });
  }
  const rank = (w: TransferWording): number => (w === "different" ? 0 : 1);
  return options.sort((a, b) => rank(a.wording) - rank(b.wording) || a.record.world.problem_id.localeCompare(b.record.world.problem_id));
}

/**
 * A reading that does not lean on the wording: the problem is in another known phrasing than the fixed one, the
 * old reading fails on it, and the child's first world there (before the word book showed its wording) is the
 * sentence's own and not the old reading's, and the child solved it.
 */
export function readsBeyondWording(o: {
  fixed: ProblemRecord;
  record: ProblemRecord;
  oldReading: Hypothesis;
  childWorld: WorldScene | null;
  solved: boolean;
  unaided: boolean;
}): boolean {
  if (!o.solved || !o.unaided || o.childWorld === null) return false;
  if (wordingTag(o.fixed.world.problem_text, o.record.world.problem_text) !== "different") return false;
  try {
    const oldWorld = runRule(o.oldReading, o.record);
    if (sameReading(oldWorld, o.record.world, true)) return false;
    return sameReading(o.childWorld, o.record.world, true) && !sameReading(o.childWorld, oldWorld, true);
  } catch {
    return false;
  }
}
