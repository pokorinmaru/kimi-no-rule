// The problem one sentence at a time (Q62). A two-holder multiple problem (one count given, "A is p/q of B", the other
// count asked) becomes four steps the child checks one by one: the number sentence, who is compared with whom, one
// part, and the parts asked. Every right answer comes from core's solution, so the screen never computes one; the
// screen stops at the step where the child's reading parts from the problem's and keeps which step it was.
import { div, fromSchema, mul, rat, toSchema } from "../rational/index.ts";
import type { Rational } from "../schema/common.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import { solve } from "../solve/index.ts";
import { objectScene, type ObjectScene, type StageHolder } from "../stage/index.ts";

export type Step =
  /** The sentence that gives a count: the child reads the number. */
  | { kind: "fact"; statementIndex: number; holderId: string; quantityId: string; value: Rational }
  /** The relation sentence: whose count is the other compared with (the one taken as the whole). */
  | { kind: "relation"; statementIndex: number; relationId: string; subjectHolderId: string; referenceHolderId: string; referenceQuantityId: string; amount: Rational }
  /** The known count split into `parts` equal parts: how much is one part. */
  | { kind: "unit"; knownHolderId: string; parts: number; value: Rational }
  /** The asked holder's `parts` parts: the answer. */
  | { kind: "total"; statementIndex: number; targetHolderId: string; parts: number; value: Rational };

/** The steps of a problem, or null when it is not one given count, one multiple and the other count asked. */
export function stepsOf(record: ProblemRecord): Step[] | null {
  const w = record.world;
  if (w.holders.length !== 2 || w.relations.length !== 1 || w.events.length > 0) return null;
  const rel = w.relations[0];
  if (rel === undefined || rel.operator !== "fraction_of" || rel.amount === null || rel.reference === null) return null;
  const subject = w.quantities.find((q) => q.id === rel.subject);
  const reference = w.quantities.find((q) => q.id === rel.reference);
  if (subject === undefined || reference === undefined) return null;
  const known = subject.value !== null ? subject : reference.value !== null ? reference : null;
  if (known === null || known.value === null) return null;
  const asked = known === subject ? reference : subject;
  if (asked.value !== null || w.question.target_id !== asked.id) return null;
  const res = solve(w);
  const answer = res.kind === "unique" ? res.values.get(asked.id) : undefined;
  if (answer === undefined) return null;
  const amount = fromSchema(rel.amount);
  // The reference is split into den parts and the subject is num of them.
  const partsOf = (id: string): number => Number(id === reference.id ? amount.den : amount.num);
  const unit = div(fromSchema(known.value), rat(partsOf(known.id)));
  const sentenceOf = (id: string): number => record.statements.findIndex((s) => s.element_ids.includes(id));
  const factAt = sentenceOf(known.id);
  const relationAt = sentenceOf(rel.id);
  const askedAt = record.statements.findIndex((s) => s.is_question);
  if (factAt < 0 || relationAt < 0 || askedAt < 0) return null;
  // One part must not be the answer itself (the asked holder one part): the smaller step would draw it (safety review S3).
  if (partsOf(asked.id) === 1) return null;
  // The steps' answers must agree with the solution: one part times the asked parts is the answer.
  const total = mul(unit, rat(partsOf(asked.id)));
  if (total.num * answer.den !== answer.num * total.den) return null;
  return [
    { kind: "fact", statementIndex: factAt, holderId: known.holder, quantityId: known.id, value: known.value },
    {
      kind: "relation",
      statementIndex: relationAt,
      relationId: rel.id,
      subjectHolderId: subject.holder,
      referenceHolderId: reference.holder,
      referenceQuantityId: reference.id,
      amount: rel.amount,
    },
    { kind: "unit", knownHolderId: known.holder, parts: partsOf(known.id), value: toSchema(unit) },
    { kind: "total", statementIndex: askedAt, targetHolderId: asked.holder, parts: partsOf(asked.id), value: toSchema(answer) },
  ];
}

/**
 * A percent off written in the relation sentence (「20%引き」) that the relation keeps as num/den of the whole (4/5):
 * the percent, and the parts it splits into. Null when the sentence writes no such percent, or it does not agree.
 */
export function percentOff(record: ProblemRecord, step: Extract<Step, { kind: "relation" }>): { percent: number; parts: number; kept: number } | null {
  const tokens = record.statements[step.statementIndex]?.tokens ?? [];
  const at = tokens.findIndex((t, i) => /^[0-9]+%$/.test(t) && tokens[i + 1] === "引き");
  if (at < 0) return null;
  const percent = Number((tokens[at] ?? "").replace("%", ""));
  const { num, den } = step.amount;
  // The part taken off is one of den parts, and what is kept is num of them: 20%引き is 1 of 5 off, 4 of 5 kept.
  if (den - num !== 1 || percent * den !== 100) return null;
  return { percent, parts: den, kept: num };
}

/**
 * The picture of a step: at the number sentence only the holder it names, with its own (given) count; from the
 * relation on, the problem's world through core's objectScene, which keeps the answer and one part hidden until the
 * child has said them (`said`). Null when the world cannot be drawn as things.
 */
export function stepScene(record: ProblemRecord, step: Step, said: readonly Rational[]): ObjectScene | null {
  const full = objectScene(record.world, record.world, { values: said });
  if (full === null) return null;
  if (step.kind !== "fact") return full;
  const own = full.holders.find((h) => h.holderId === step.holderId);
  if (own === undefined) return null;
  const alone: StageHolder = { ...own, dishes: 0, isOne: false };
  return { ...full, holders: [alone], share: null, pairing: null, breaks: false };
}
