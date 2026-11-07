/// <reference types="vite/client" />
// The problems the research layer chooses from (指示書 第6.7節 手順3, Q33): core's prepared bank and the
// discriminating problems written offline into content/problems/discriminating. A stored record joins only when
// core accepts it (the record schema, the sentences and the problem conditions). The child's route takes only
// those a person has checked (human_checked true); the adults' try route may add the unchecked ones behind a
// visible toggle. Nothing here computes a number or a world.
import { FRACTION_BANK, problemConditions, schemas, validateStatements, validateWorld, type ProblemRecord } from "@kimi/core";

/** The stored records as core accepts them, from the modules of the folder (path to parsed JSON). */
export function discriminatingFrom(modules: Record<string, unknown>): ProblemRecord[] {
  const out: ProblemRecord[] = [];
  for (const raw of Object.values(modules)) {
    const parsed = schemas.problemRecord.safeParse(raw);
    if (!parsed.success) continue;
    const r = parsed.data;
    if (r.source !== "discriminating_bank") continue;
    try {
      if (!validateWorld(r.world).ok) continue;
      if (!validateStatements(r.world, r.statements, r.syntax_marks).ok) continue;
      if (!problemConditions(r).ok) continue;
    } catch {
      continue;
    }
    out.push(r);
  }
  return out.sort((a, b) => a.world.problem_id.localeCompare(b.world.problem_id));
}

export const STORED_DISCRIMINATING: readonly ProblemRecord[] = discriminatingFrom(
  import.meta.glob("../../../../content/problems/discriminating/p_*.json", { eager: true, import: "default" }),
);

/** The bank of a route: the prepared problems first, then the stored ones it may use (a prepared id is never replaced). */
export function bankFor(o: { includeUnchecked: boolean; stored?: readonly ProblemRecord[] }): readonly ProblemRecord[] {
  const ids = new Set(FRACTION_BANK.map((r) => r.world.problem_id));
  const extra = (o.stored ?? STORED_DISCRIMINATING).filter((r) => (o.includeUnchecked || r.checks.human_checked) && !ids.has(r.world.problem_id));
  return extra.length === 0 ? FRACTION_BANK : [...FRACTION_BANK, ...extra];
}

/** How many stored problems wait for a person's check (shown to adults beside the toggle). */
export const uncheckedCount = (stored: readonly ProblemRecord[] = STORED_DISCRIMINATING): number => stored.filter((r) => !r.checks.human_checked).length;
