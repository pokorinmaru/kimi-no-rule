// The stored transfer problems for the app to use later (指示書 第6.7節 手順6). Only records that pass core's
// checks again are handed out; records a person has not checked (human_checked false) only when asked, as for
// the adult trial route (Q42). The runtime wiring into apps/web is not done here.
import type { ProblemRecord } from "@kimi/core";
import type { TransferWording } from "@kimi/interpret";
import { TRANSFER_DIR, readStoredTransfer, transferErrors } from "./transfer.ts";

export interface TransferEntry {
  record: ProblemRecord;
  oldReadingId: string;
  wording: TransferWording;
  fixedProblemId: string;
}

export function transferBankFor(opts: { includeUnchecked?: boolean; dir?: string } = {}): TransferEntry[] {
  const stored = readStoredTransfer(opts.dir ?? TRANSFER_DIR);
  const out: TransferEntry[] = [];
  for (const record of stored.records) {
    const meta = stored.meta[record.world.problem_id];
    if (meta === undefined || transferErrors(record, meta).length > 0) continue;
    if (!record.checks.human_checked && opts.includeUnchecked !== true) continue;
    out.push({ record, oldReadingId: meta.oldReading.id, wording: meta.wording, fixedProblemId: meta.fixedProblemId });
  }
  return out;
}

/** The first same-wording and the first different-wording problem for a fixed reading; null where none. */
export function transferPairFor(entries: readonly TransferEntry[], oldReadingId: string): { same: TransferEntry | null; different: TransferEntry | null } {
  const of = (w: TransferWording): TransferEntry | null => entries.find((e) => e.oldReadingId === oldReadingId && e.wording === w) ?? null;
  return { same: of("same"), different: of("different") };
}
