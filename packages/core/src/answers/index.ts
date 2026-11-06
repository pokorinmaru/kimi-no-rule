// Judging the child's numbers (原則3: correctness is decided here only). The size of one segment of the
// "1" holder's tape, and the answer to the question. Pure functions only.
import { apply } from "../apply/index.ts";
import { diagnose } from "../diagnose/index.ts";
import { div, eq, fromSchema, rat } from "../rational/index.ts";
import type { AnyOp } from "../schema/semantic.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import type { Rational } from "../schema/common.ts";
import { solve } from "../solve/index.ts";

/** The problem's multiplicative relation (a fraction or a multiple between two quantities). */
function multiple(record: ProblemRecord) {
  return record.world.relations.find(
    (r) => (r.operator === "fraction_of" || r.operator === "times") && r.reference !== null && r.amount !== null,
  );
}

/** Whether `value` is the size of one segment: the reference (the "1") cut into the multiple's denominator. */
export function judgeUnitValue(record: ProblemRecord, value: Rational): boolean {
  const rel = multiple(record);
  if (rel === undefined || rel.reference === null || rel.amount === null) return false;
  const res = solve(record.world);
  if (res.kind !== "unique") return false;
  const whole = res.values.get(rel.reference);
  if (whole === undefined) return false;
  return eq(div(whole, rat(rel.amount.den)), fromSchema(value));
}

/** Whether `value` answers the question (diagnose of the answer alone finds it right). */
export function judgeAnswer(record: ProblemRecord, value: Rational): boolean {
  const ops: AnyOp[] = [{ op: "state_answer", target_id: record.world.question.target_id, number: value, evidence: "" }];
  const child = apply({ correct: record.world, ops });
  return diagnose({ record, ops, child }).outcome === "correct_unexplained";
}
