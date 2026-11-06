// Conditions a prepared problem must meet (指示書 第5.2節). Drawability (第8.5節) comes in M4 (Q6).
import { apply } from "../apply/index.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { solve } from "../solve/index.ts";
import { checkStatements } from "../statements/index.ts";
import { sameWorld } from "../world/same-world.ts";
import { misreadCandidates, type FlipKind } from "./candidates.ts";

export type ConditionFailure =
  | "not_unique"
  | "impossible"
  | "nonlinear"
  | "no_candidate"
  | "candidate_same_as_correct"
  | "candidate_same_answer"
  | "candidate_all_statements_hold";

export function problemConditions(record: ProblemRecord): {
  ok: boolean;
  failures: { code: ConditionFailure; flip?: { kind: FlipKind; element_id: string } }[];
} {
  const world = record.world;
  const failures: { code: ConditionFailure; flip?: { kind: FlipKind; element_id: string } }[] = [];
  const res = solve(world);
  if (res.kind === "nonlinear") failures.push({ code: "nonlinear" });
  else if (res.kind !== "unique") failures.push({ code: "not_unique" });
  else if (res.impossible.length > 0) failures.push({ code: "impossible" });
  const correctAnswer = res.kind === "unique" ? res.values.get(world.question.target_id) : undefined;

  const candidates = misreadCandidates(world);
  if (candidates.length === 0) failures.push({ code: "no_candidate" });
  // The child of each candidate touches every element the sentences name, so every sentence is judged.
  const phrases = [...new Set(record.statements.flatMap((s) => s.element_ids))].map((element_id) => ({
    phrase: element_id,
    lang: world.problem_lang,
    element_id,
  }));
  for (const c of candidates) {
    const flip = c.flips[0];
    if (flip === undefined) continue;
    if (sameWorld(c.world, world)) failures.push({ code: "candidate_same_as_correct", flip });
    if (correctAnswer !== undefined && c.answer !== null && eq(fromSchema(c.answer), correctAnswer)) {
      failures.push({ code: "candidate_same_answer", flip });
    }
    const child = apply({ correct: world, ops: c.ops, phrases });
    const checked = checkStatements({
      correct: world,
      statements: record.statements,
      syntaxMarks: record.syntax_marks,
      ops: c.ops,
      child,
    });
    if (checked.kind === "checked" && !checked.statements.some((s) => s.verdict === "fails")) {
      failures.push({ code: "candidate_all_statements_hold", flip });
    }
  }
  return { ok: failures.length === 0, failures };
}
