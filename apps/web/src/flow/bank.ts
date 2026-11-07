/// <reference types="vite/client" />
// The problems the research layer chooses from (指示書 第6.7節 手順3・手順6, Q33・Q48): core's prepared bank, the
// discriminating problems written offline into content/problems/discriminating and the transfer problems in
// content/problems/transfer (with the old readings they were written for, transfers.json). A stored record joins
// only when core accepts it (core acceptStored: the same check the local worker runs on the same files). The
// child's route takes only those a person has checked (human_checked true); the adults' try route may add the
// unchecked ones behind a visible toggle. Nothing here computes a number or a world.
import { FRACTION_BANK, acceptStored, transferLinks, withStored, type ProblemRecord, type TransferLink } from "@kimi/core";
import transfersJson from "../../../../content/problems/transfer/transfers.json";

/** The stored records as core accepts them, from the modules of the folder (path to parsed JSON). */
export function discriminatingFrom(modules: Record<string, unknown>): ProblemRecord[] {
  return acceptStored(Object.values(modules), "discriminating_bank");
}

export const STORED_DISCRIMINATING: readonly ProblemRecord[] = discriminatingFrom(
  import.meta.glob("../../../../content/problems/discriminating/p_*.json", { eager: true, import: "default" }),
);

export const STORED_TRANSFER: readonly ProblemRecord[] = acceptStored(
  Object.values(import.meta.glob("../../../../content/problems/transfer/p_*.json", { eager: true, import: "default" })),
  "research",
);

/** Each stored transfer problem and the old reading it was written to catch (core transferLinks). */
export const TRANSFER_LINKS: readonly TransferLink[] = transferLinks(transfersJson, STORED_TRANSFER);

/** Every stored problem: the discriminating ones, then the transfer ones. */
export const STORED_PROBLEMS: readonly ProblemRecord[] = [...STORED_DISCRIMINATING, ...STORED_TRANSFER];

/** The bank of a route: the prepared problems first, then the stored ones it may use (a prepared id is never replaced). */
export function bankFor(o: { includeUnchecked: boolean; stored?: readonly ProblemRecord[] }): readonly ProblemRecord[] {
  return withStored(
    FRACTION_BANK,
    (o.stored ?? STORED_PROBLEMS).filter((r) => o.includeUnchecked || r.checks.human_checked),
  );
}

/** How many stored problems wait for a person's check (shown to adults beside the toggle). */
export const uncheckedCount = (stored: readonly ProblemRecord[] = STORED_PROBLEMS): number => stored.filter((r) => !r.checks.human_checked).length;
