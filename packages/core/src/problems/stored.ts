// The problems written offline and stored as files (指示書 第6.7節 手順3・手順6, Q33・Q48). A stored record joins a
// bank only when core accepts it: the record schema, its source, the world, the sentences and the problem
// conditions. The device (Vite modules) and the local worker (files read at start) both pass what they read
// here, so they know the same problems. Pure functions: nothing is read from disk here.
import { problemConditions } from "../diagnose/conditions.ts";
import { problemRecord, type ProblemRecord } from "../schema/problem-record.ts";
import { validateStatements, validateWorld } from "../schema/semantic.ts";

/** The records of the source core accepts, sorted by problem id; anything else is dropped (never thrown). */
export function acceptStored(raws: Iterable<unknown>, source: ProblemRecord["source"]): ProblemRecord[] {
  const out: ProblemRecord[] = [];
  for (const raw of raws) {
    const parsed = problemRecord.safeParse(raw);
    if (!parsed.success) continue;
    const r = parsed.data;
    if (r.source !== source) continue;
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

/** The prepared problems first, then each stored one whose id is new (a prepared id is never replaced). */
export function withStored(prepared: readonly ProblemRecord[], stored: readonly ProblemRecord[]): readonly ProblemRecord[] {
  const ids = new Set(prepared.map((r) => r.world.problem_id));
  const extra: ProblemRecord[] = [];
  for (const r of stored) {
    if (ids.has(r.world.problem_id)) continue;
    ids.add(r.world.problem_id);
    extra.push(r);
  }
  return extra.length === 0 ? prepared : [...prepared, ...extra];
}
