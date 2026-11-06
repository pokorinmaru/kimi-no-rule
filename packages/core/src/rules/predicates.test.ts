// M1 step (7): each predicate of the rule language, one at a time (指示書 第5.8節, 第11節 M1).
// Written before the implementation. A predicate is seen through runRule: a rule whose only clause
// has the predicate as its condition and an action that visibly changes the element.
// Word positions come from syntax_marks of the record.
import { describe, expect, it } from "vitest";
import type { Expr, ProblemRecord } from "../schema/index.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import { eventRecord } from "../diagnose/test-records.ts";
import { runRule } from "./run.ts";
import {
  act,
  ALWAYS,
  and,
  clause,
  hyp,
  not,
  or,
  p,
  percentRecord,
  smallKnownRecord,
  unitFractionRecord,
  wordRecord,
} from "./test-rules.ts";

const signboard = (): ProblemRecord => structuredClone(signboardRecord);

/** Whether the condition holds for the relation: a swap under it moves the base. */
function holdsOnRelation(when: Expr, rec: ProblemRecord, relationId: string): boolean {
  const before = rec.world.relations.find((r) => r.id === relationId);
  const after = runRule(hyp("probe", [clause(when, act.swap())]), rec).relations.find((r) => r.id === relationId);
  if (before === undefined || after === undefined) throw new Error("no relation " + relationId);
  return after.reference !== before.reference;
}

/** Whether the condition holds for the event: a flip under it changes the event type. */
function holdsOnEvent(when: Expr, rec: ProblemRecord, eventId: string): boolean {
  const before = rec.world.events.find((e) => e.id === eventId);
  const after = runRule(hyp("probe", [clause(when, act.flipEvent())]), rec).events.find((e) => e.id === eventId);
  if (before === undefined || after === undefined) throw new Error("no event " + eventId);
  return after.type !== before.type;
}

const onSignboard = (when: Expr): boolean => holdsOnRelation(when, signboard(), "r_ratio");
const onWord = (when: Expr): boolean => holdsOnRelation(when, wordRecord(), "r_1");

describe("predicates on the relation itself", () => {
  it("relation_operator_is", () => {
    expect(onSignboard(p("relation_operator_is", "fraction_of"))).toBe(true);
    expect(onSignboard(p("relation_operator_is", "times"))).toBe(false);
    expect(onWord(p("relation_operator_is", "times"))).toBe(true);
  });

  it("ratio_kind_is reads the kinds marked on the written multiple", () => {
    expect(onSignboard(p("ratio_kind_is", "lt1"))).toBe(true);
    expect(onSignboard(p("ratio_kind_is", "fraction"))).toBe(true);
    expect(onSignboard(p("ratio_kind_is", "gt1"))).toBe(false);
    expect(onSignboard(p("ratio_kind_is", "percent"))).toBe(false);
    expect(holdsOnRelation(p("ratio_kind_is", "percent"), percentRecord(), "r_1")).toBe(true);
    expect(onWord(p("ratio_kind_is", "gt1"))).toBe(true);
  });

  it("ratio_is_unit_fraction", () => {
    expect(holdsOnRelation(p("ratio_is_unit_fraction"), unitFractionRecord(), "r_1")).toBe(true);
    expect(onSignboard(p("ratio_is_unit_fraction"))).toBe(false);
    expect(onWord(p("ratio_is_unit_fraction"))).toBe(false);
  });
});

describe("predicates on the problem", () => {
  it("problem_type_is", () => {
    expect(onSignboard(p("problem_type_is", "ratio"))).toBe(true);
    expect(onSignboard(p("problem_type_is", "compare"))).toBe(false);
  });

  it("consistency_is", () => {
    expect(onSignboard(p("consistency_is", "inconsistent"))).toBe(true);
    expect(onSignboard(p("consistency_is", "consistent"))).toBe(false);
    expect(onWord(p("consistency_is", "consistent"))).toBe(true);
  });

  it("numbers_compare compares the known number with the multiple", () => {
    // 6 and 3/4; 6 and 3; 2 and 3.
    expect(onSignboard(p("numbers_compare", "larger_is_known"))).toBe(true);
    expect(onSignboard(p("numbers_compare", "smaller_is_known"))).toBe(false);
    expect(onWord(p("numbers_compare", "larger_is_known"))).toBe(true);
    const small = smallKnownRecord();
    expect(holdsOnRelation(p("numbers_compare", "smaller_is_known"), small, "r_1")).toBe(true);
    expect(holdsOnRelation(p("numbers_compare", "larger_is_known"), small, "r_1")).toBe(false);
  });
});

describe("predicates on the base of the relation", () => {
  it("reference_is by the role of the base", () => {
    expect(onSignboard(p("reference_is", "asked"))).toBe(true);
    expect(onSignboard(p("reference_is", "known_value"))).toBe(false);
    expect(onWord(p("reference_is", "known_value"))).toBe(true);
    expect(onWord(p("reference_is", "asked"))).toBe(false);
  });

  it("reference_is by the order of mention (older brother first, younger second)", () => {
    expect(onSignboard(p("reference_is", "second_mentioned"))).toBe(true);
    expect(onSignboard(p("reference_is", "first_mentioned"))).toBe(false);
  });

  it("reference_is by size, on the values of the correct world", () => {
    // Signboard: the base (younger, 8) is larger than the older (6). Word record: the base (6) is smaller than 18.
    expect(onSignboard(p("reference_is", "larger_number"))).toBe(true);
    expect(onSignboard(p("reference_is", "smaller_number"))).toBe(false);
    expect(onWord(p("reference_is", "smaller_number"))).toBe(true);
    expect(onWord(p("reference_is", "larger_number"))).toBe(false);
  });
});

describe("predicates on words, placed by syntax_marks", () => {
  it("word_in_statement looks only at the sentence tied to the relation", () => {
    expect(onWord(p("word_in_statement", "倍"))).toBe(true);
    expect(onWord(p("word_in_statement", "に対して"))).toBe(false);
    // In another sentence of the same problem only.
    expect(onWord(p("word_in_statement", "s0"))).toBe(false);
    expect(onSignboard(p("word_in_statement", "これ"))).toBe(true);
    expect(onSignboard(p("word_in_statement", "何"))).toBe(false);
  });

  it("word_before_ratio is the word right before the written multiple", () => {
    expect(onWord(p("word_before_ratio", "の"))).toBe(true);
    expect(onWord(p("word_before_ratio", "数"))).toBe(false);
    expect(onSignboard(p("word_before_ratio", "の"))).toBe(true);
    expect(onSignboard(p("word_before_ratio", "です"))).toBe(false);
  });

  it("word_after_holder takes the occurrence nearest the multiple and the holder right before it", () => {
    // The particle appears after b (far from the 3) and after a (next to the 3); a is the base.
    expect(onWord(p("word_after_holder", "reference", "の"))).toBe(true);
    expect(onWord(p("word_after_holder", "subject", "の"))).toBe(false);
    expect(onWord(p("word_after_holder", "reference", "倍"))).toBe(false);
  });
});

describe("true, and the ways to combine conditions", () => {
  it("true holds on relations and events", () => {
    expect(onSignboard(ALWAYS)).toBe(true);
    expect(holdsOnEvent(ALWAYS, eventRecord(), "e_1")).toBe(true);
  });

  it("a predicate about relations does not hold on an event", () => {
    expect(holdsOnEvent(p("relation_operator_is", "times"), eventRecord(), "e_1")).toBe(false);
    expect(holdsOnEvent(not(p("relation_operator_is", "times")), eventRecord(), "e_1")).toBe(true);
  });

  it("and, or, not", () => {
    const yes = p("relation_operator_is", "fraction_of");
    const no = p("relation_operator_is", "times");
    expect(onSignboard(and(yes, ALWAYS))).toBe(true);
    expect(onSignboard(and(yes, no))).toBe(false);
    expect(onSignboard(or(no, yes))).toBe(true);
    expect(onSignboard(or(no, not(ALWAYS)))).toBe(false);
    expect(onSignboard(not(no))).toBe(true);
    expect(onSignboard(not(yes))).toBe(false);
    const all = and(p("ratio_kind_is", "lt1"), not(p("ratio_is_unit_fraction")), p("word_before_ratio", "の"));
    expect(onSignboard(all)).toBe(true);
  });
});
