// The AI-free check (指示書 第7.3節, 第11節 M8; HANDOFF §3 F7): which prepared problems to give, and the
// judging, which is core's judgeAnswer only (原則3). Pure functions.
import { judgeAnswer, type ProblemRecord, type Rational } from "@kimi/core";
import type { CheckItem } from "../store/store.ts";

export const CHECK_SIZE = 3;

/** Problems the child met before: in the junior's flow, and in earlier checks. */
export interface Met {
  flow: readonly string[];
  check: readonly string[];
}

/** Three prepared problems: not met before first (then met only in a check, then met with the junior),
 * alternating the two kinds (the order in the text follows the relation or not) so both are in every check. */
export function pickCheckProblems(bank: readonly ProblemRecord[], met: Met, size: number = CHECK_SIZE): ProblemRecord[] {
  const tier = (r: ProblemRecord): number => {
    const id = r.world.problem_id;
    if (met.flow.includes(id)) return 2;
    if (met.check.includes(id)) return 1;
    return 0;
  };
  const ranked = bank.map((r, i) => ({ r, i, t: tier(r) })).sort((a, b) => a.t - b.t || a.i - b.i);
  const queues = {
    consistent: ranked.filter((x) => x.r.consistency === "consistent"),
    inconsistent: ranked.filter((x) => x.r.consistency === "inconsistent"),
  };
  const picked: ProblemRecord[] = [];
  // Start with the kind whose best problem is the least met (consistent on a tie).
  let next: keyof typeof queues = (queues.inconsistent[0]?.t ?? 9) < (queues.consistent[0]?.t ?? 9) ? "inconsistent" : "consistent";
  while (picked.length < size && (queues.consistent.length > 0 || queues.inconsistent.length > 0)) {
    const other = next === "consistent" ? "inconsistent" : "consistent";
    const from = queues[next].length > 0 ? next : other;
    const head = queues[from].shift();
    if (head !== undefined) picked.push(head.r);
    next = other;
  }
  return picked;
}

/** Whether the answer is right: core decides (packages/core answers). */
export function judgeCheck(record: ProblemRecord, value: Rational): boolean {
  return judgeAnswer(record, value);
}

/** For the grown-up: right answers over the problems given (a skipped problem was given). */
export function scoreOf(items: readonly CheckItem[]): { right: number; total: number } {
  return { right: items.filter((i) => i.outcome === "right").length, total: items.length };
}
