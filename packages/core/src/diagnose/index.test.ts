// M1 step (6): diagnose (指示書 第5.4節: the layer table, its order, a match, the candidates and the two kinds of
// problem; worlds from 第5.3節; the signboard line of 第11節 M1). Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { AnyOp, ProblemRecord } from "../schema/index.ts";
import { apply } from "../apply/index.ts";
import { num, op, phrase } from "../apply/test-worlds.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import type { Candidate } from "./candidates.ts";
import { diagnose, type DiagnoseInput, type Diagnosis, type Layer } from "./index.ts";
import {
  differenceRecord,
  eventRecord,
  moveRecord,
  statementElements,
  timesRecord,
  twoStepRecord,
} from "./test-records.ts";

const PROPERTY_RUNS = { numRuns: 60 };

/** The order in which layers are shown, first to last. */
const ORDER: Layer[] = [
  "question",
  "direction",
  "relation_kind",
  "situation",
  "word_meaning",
  "quantity",
  "operation_choice",
  "calculation",
];

type Flip = Candidate["flips"][number];
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sortFlips = (fs: readonly Flip[]): Flip[] =>
  [...fs].sort((a, b) => byCodeUnit(a.element_id + " " + a.kind, b.element_id + " " + b.kind));

interface RunOptions {
  phrases?: string[];
  unclear?: string[];
}

/** Applies the ops to the record and diagnoses the result. */
function run(record: ProblemRecord, ops: AnyOp[], o: RunOptions = {}): Diagnosis {
  const correct = structuredClone(record.world);
  const child = apply({ correct, ops, phrases: (o.phrases ?? []).map(phrase) });
  const input: DiagnoseInput = o.unclear === undefined ? { record, ops, child } : { record, ops, child, unclear: o.unclear };
  return diagnose(input);
}

/** Every element the sentences name, as phrases: the child has touched all of them. */
const all = (r: ProblemRecord): RunOptions => ({ phrases: statementElements(r) });

const D = differenceRecord(5, 3); // b = 5 + 3 = 8; the candidate gives 2
const M = timesRecord(4, 3); // b = 3 x 4 = 12; the candidate gives 4/3
const E = eventRecord(5, 3); // 5 then gains 3 = 8
const S = signboardRecord; // younger = 8; the candidate gives 9/2

describe("diagnose: a match", () => {
  it("difference: every element touched and the same world is a match, with no layer", () => {
    const d = run(D, [], all(D));
    expect(d.outcome).toBe("match");
    expect(d.layers).toEqual([]);
    expect(d.primary).toBeNull();
    expect(d.operationEvidence).toEqual([]);
  });

  it("the world after the ops is compared, not the ops: two swaps cancel out", () => {
    expect(run(D, [op.swap("r_1"), op.swap("r_1")], all(D)).outcome).toBe("match");
  });

  it("less with the ends swapped is the same difference: a match", () => {
    expect(run(D, [op.setRelationOperator("r_1", "less_by"), op.swap("r_1")], all(D)).outcome).toBe("match");
  });

  it("signboard: naming the right base on the ratio is a match, and the base is recorded as observed", () => {
    const d = run(S, [op.setReference("r_ratio", "q_otouto")], all(S));
    expect(d.outcome).toBe("match");
    expect(d.layers).toEqual([]);
    expect(d.observedReference).toBe(true);
  });

  it("signboard: moving the base back to the right one after a swap is a match", () => {
    expect(run(S, [op.swap("r_ratio"), op.setReference("r_ratio", "q_otouto")], all(S)).outcome).toBe("match");
  });

  it("times: naming the right base is a match", () => {
    expect(run(M, [op.setReference("r_1", "q_a")], all(M)).outcome).toBe("match");
  });

  it("a sentence element left untouched is not a match, even when the world is the same", () => {
    // q_a keeps its given value without being touched, so the world equals the correct one.
    expect(run(D, [], { phrases: ["r_1", "q_b"] }).outcome).not.toBe("match");
  });
});

describe("diagnose: a ratio whose base was not chosen", () => {
  it("signboard: the same world without naming a base asks for the base, with no layer", () => {
    const d = run(S, [], all(S));
    expect(d.outcome).toBe("needs_reference");
    expect(d.layers).toEqual([]);
    expect(d.primary).toBeNull();
  });

  it("times: the same holds for a ratio of a consistent problem", () => {
    expect(run(M, [], all(M)).outcome).toBe("needs_reference");
  });

  it("a difference needs no base", () => {
    expect(run(D, [], all(D)).outcome).toBe("match");
  });

  it("a base chosen but wrong is not a match, even when the counts come out the same", () => {
    // Swapping the ends and turning 3/4 over gives younger = 8 again, but with the older one as the base.
    const d = run(S, [op.setReference("r_ratio", "q_ani"), op.setRelationAmount("r_ratio", num(4, 3))], all(S));
    expect(d.outcome).toBe("layers");
    expect(d.layers).toEqual(["direction", "quantity"]);
  });
});

describe("diagnose: one layer per kind of op", () => {
  const rows: [string, ProblemRecord, AnyOp[], Layer][] = [
    ["rename_item_kind", D, [op.renameItemKind("k_thing", "y")], "word_meaning"],
    ["swap_relation_direction", D, [op.swap("r_1")], "direction"],
    ["set_relation_reference to the other end", D, [op.setReference("r_1", "q_b")], "direction"],
    ["set_relation_reference on a ratio", S, [op.setReference("r_ratio", "q_ani")], "direction"],
    ["set_relation_operator more_by to less_by", D, [op.setRelationOperator("r_1", "less_by")], "direction"],
    ["set_relation_operator more_by to times", D, [op.setRelationOperator("r_1", "times")], "relation_kind"],
    ["set_relation_operator times to fraction_of", M, [op.setRelationOperator("r_1", "fraction_of")], "relation_kind"],
    ["set_event_type", E, [op.setEventType("e_1", "lose")], "relation_kind"],
    ["add_relation", D, [op.addRelation("n_1", "more_by", "q_b", "q_a", num(1))], "relation_kind"],
    ["add_event", E, [op.addEvent("n_1", "lose", "h_a", "k_thing", num(1))], "relation_kind"],
    ["set_event_to_holder", moveRecord(), [op.setEventToHolder("e_1", "h_c")], "relation_kind"],
    ["set_quantity", D, [op.setQuantity("q_a", num(6))], "quantity"],
    ["set_relation_amount", D, [op.setRelationAmount("r_1", num(4))], "quantity"],
    ["set_event_amount", E, [op.setEventAmount("e_1", num(4))], "quantity"],
    ["set_question_target", D, [op.setQuestionTarget("q_a", "quantity")], "question"],
    ["add_holder", D, [op.addHolder("n_1", "x")], "situation"],
    ["add_item_kind", D, [op.addItemKind("n_1", "y")], "situation"],
    ["add_quantity", D, [op.addQuantity("n_1", "h_a", "k_thing", null, num(2))], "situation"],
    ["remove_element", D, [op.remove("r_1")], "situation"],
  ];

  it.each(rows)("%s", (_name, record, ops, layer) => {
    const d = run(record, ops);
    expect(d.outcome).toBe("layers");
    expect(d.layers).toEqual([layer]);
    expect(d.primary).toBe(layer);
    expect(d.operationEvidence).toEqual([]);
  });

  it("every op of the rows is applied, not discarded", () => {
    for (const [, record, ops] of rows) expect(apply({ correct: record.world, ops }).discarded).toEqual([]);
  });
});

describe("diagnose: a number only", () => {
  it("the answer of the candidate: operation_choice, with the candidate flips as evidence", () => {
    const d = run(D, [op.answer("q_b", num(2))]);
    expect(d.outcome).toBe("layers");
    expect(d.layers).toEqual(["operation_choice"]);
    expect(d.primary).toBe("operation_choice");
    expect(sortFlips(d.operationEvidence)).toEqual(
      sortFlips([
        { kind: "operator_swap", element_id: "r_1" },
        { kind: "swap_ends", element_id: "r_1" },
      ]),
    );
  });

  it("an answer shared by two candidates keeps both as evidence", () => {
    const d = run(twoStepRecord(), [op.answer("q_b", num(5))]);
    expect(d.layers).toEqual(["operation_choice"]);
    expect([...new Set(d.operationEvidence.map((x) => x.element_id))].sort()).toEqual(["r_1", "r_2"]);
    expect(d.operationEvidence).toHaveLength(4);
  });

  it("the correct answer: correct but not yet explained, with no layer", () => {
    const d = run(D, [op.answer("q_b", num(8))]);
    expect(d.outcome).toBe("correct_unexplained");
    expect(d.layers).toEqual([]);
    expect(d.primary).toBeNull();
  });

  it("a candidate answer said after touching the relation is judged by the ops, not as operation_choice", () => {
    // The swap makes the judging world give 2, and the child says 2.
    const d = run(D, [op.swap("r_1"), op.answer("q_b", num(2))]);
    expect(d.layers).toEqual(["direction"]);
    expect(d.operationEvidence).toEqual([]);
  });

  it("any difference world: the candidate answer is operation_choice and the correct one is correct_unexplained", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 15 }), (a, d) => {
        // Both answers are decided before the world: a + d is right, a - d is the misreading.
        const r = differenceRecord(a, d);
        expect(run(r, [op.answer("q_b", num(a - d))]).layers).toEqual(["operation_choice"]);
        expect(run(r, [op.answer("q_b", num(a + d))]).outcome).toBe("correct_unexplained");
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("diagnose: the answer of the judging world and the answer said", () => {
  it("a changed amount and an answer that does not follow from it: quantity, then calculation", () => {
    // The judging world gives 5 + 4 = 9; the child says 10.
    const d = run(D, [op.setRelationAmount("r_1", num(4)), op.answer("q_b", num(10))]);
    expect(d.layers).toEqual(["quantity", "calculation"]);
    expect(d.primary).toBe("quantity");
  });

  it("an answer that follows from the changed amount adds no calculation", () => {
    expect(run(D, [op.setRelationAmount("r_1", num(4)), op.answer("q_b", num(9))]).layers).toEqual(["quantity"]);
  });

  it("a candidate answer that does not follow from the touched relation is a calculation, not operation_choice", () => {
    const d = run(D, [op.setRelationAmount("r_1", num(4)), op.answer("q_b", num(2))]);
    expect(d.layers).toEqual(["quantity", "calculation"]);
    expect(d.operationEvidence).toEqual([]);
  });
});

describe("diagnose: a procedure", () => {
  it("its value is the candidate answer: operation_choice, with the candidate flips as evidence", () => {
    const d = run(S, [op.procedure("q_otouto", [{ quantity_id: "q_ani" }, num(3, 4)], "multiply")]);
    expect(d.layers).toEqual(["operation_choice"]);
    expect(sortFlips(d.operationEvidence)).toEqual(
      sortFlips([
        { kind: "invert_amount", element_id: "r_ratio" },
        { kind: "swap_ends", element_id: "r_ratio" },
      ]),
    );
  });

  it("its value is the correct answer: correct but not yet explained", () => {
    const d = run(S, [op.procedure("q_otouto", [{ quantity_id: "q_ani" }, num(3, 4)], "divide")]);
    expect(d.outcome).toBe("correct_unexplained");
    expect(d.layers).toEqual([]);
  });

  it("its value is neither: calculation", () => {
    const d = run(S, [op.procedure("q_otouto", [{ quantity_id: "q_ani" }, num(2)], "multiply")]);
    expect(d.layers).toEqual(["calculation"]);
    expect(d.operationEvidence).toEqual([]);
  });
});

describe("diagnose: unclear elements", () => {
  it("are kept as not yet confirmed and add no layer", () => {
    const d = run(D, [], { unclear: ["r_1"] });
    expect(d.unconfirmed).toEqual(["r_1"]);
    expect(d.layers).toEqual([]);
  });

  it("do not change the layers of the other ops", () => {
    const d = run(D, [op.setQuantity("q_a", num(6))], { unclear: ["r_1"] });
    expect(d.unconfirmed).toEqual(["r_1"]);
    expect(d.layers).toEqual(["quantity"]);
  });

  it("are empty when nothing is unclear", () => {
    expect(run(D, [op.swap("r_1")]).unconfirmed).toEqual([]);
  });
});

describe("diagnose: naming the base it already has", () => {
  it("adds no layer and is recorded as observed", () => {
    const d = run(D, [op.setReference("r_1", "q_a")]);
    expect(d.layers).toEqual([]);
    expect(d.observedReference).toBe(true);
  });

  it("next to another op, only that op makes a layer", () => {
    const d = run(D, [op.setReference("r_1", "q_a"), op.setQuantity("q_a", num(6))]);
    expect(d.layers).toEqual(["quantity"]);
    expect(d.observedReference).toBe(true);
  });

  it("is not recorded when no such op was said", () => {
    expect(run(D, [op.swap("r_1")]).observedReference).toBe(false);
  });
});

describe("diagnose: more than one layer", () => {
  it("are listed in the fixed order, and the first is shown", () => {
    const d = run(D, [
      op.setQuantity("q_a", num(6)),
      op.renameItemKind("k_thing", "y"),
      op.swap("r_1"),
      op.setQuestionTarget("q_a", "quantity"),
    ]);
    expect(d.layers).toEqual(["question", "direction", "word_meaning", "quantity"]);
    expect(d.primary).toBe("question");
  });

  it("a layer is listed once however many ops raise it", () => {
    const d = run(D, [op.setQuantity("q_a", num(6)), op.setRelationAmount("r_1", num(4)), op.addHolder("n_1", "x")]);
    expect(d.layers).toEqual(["situation", "quantity"]);
  });

  it("for any set of ops in any order, the layers are those of the ops, in the fixed order, once each", () => {
    const pool: [AnyOp, Layer][] = [
      [op.renameItemKind("k_thing", "y"), "word_meaning"],
      [op.setQuantity("q_a", num(6)), "quantity"],
      [op.setRelationAmount("r_1", num(4)), "quantity"],
      [op.setQuestionTarget("q_a", "quantity"), "question"],
      [op.swap("r_1"), "direction"],
      [op.addHolder("n_1", "x"), "situation"],
      [op.addItemKind("n_2", "y"), "situation"],
      [op.setRelationOperator("r_1", "times"), "relation_kind"],
    ];
    fc.assert(
      fc.property(fc.shuffledSubarray(pool, { minLength: 1 }), (picked) => {
        const d = run(D, picked.map(([o]) => o));
        const expected = ORDER.filter((l) => picked.some(([, x]) => x === l));
        expect(d.layers).toEqual(expected);
        expect(d.primary).toBe(expected[0]);
        expect(d.outcome).toBe("layers");
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("diagnose: consistent and inconsistent problems", () => {
  it("a consistent problem: the candidate answer is operation_choice, and the kind is recorded", () => {
    const d = run(M, [op.answer("q_b", num(4, 3))]);
    expect(d.layers).toEqual(["operation_choice"]);
    expect(d.consistency).toBe("consistent");
    expect(sortFlips(d.operationEvidence)).toEqual(
      sortFlips([
        { kind: "invert_amount", element_id: "r_1" },
        { kind: "swap_ends", element_id: "r_1" },
      ]),
    );
  });

  it("an inconsistent problem: the same, with the other kind recorded", () => {
    const d = run(S, [op.answer("q_otouto", num(9, 2))]);
    expect(d.layers).toEqual(["operation_choice"]);
    expect(d.consistency).toBe("inconsistent");
  });

  it("the kind of the problem is recorded whatever the outcome", () => {
    for (const [record, ops] of [
      [M, [op.answer("q_b", num(12))]],
      [M, []],
      [S, [op.swap("r_ratio")]],
      [S, [op.answer("q_otouto", num(8))]],
    ] as [ProblemRecord, AnyOp[]][]) {
      expect(run(record, ops).consistency).toBe(record.consistency);
    }
  });
});

describe("diagnose: signboard (指示書 第11節 M1)", () => {
  it("multiplying 6 by 3/4 is operation_choice, in a world that cannot happen", () => {
    const ops = [op.procedure("q_otouto", [{ quantity_id: "q_ani" }, num(3, 4)], "multiply")];
    const child = apply({ correct: S.world, ops });
    expect(child.procedures[0]?.impossible).toContain("non_integer");
    expect(diagnose({ record: S, ops, child }).primary).toBe("operation_choice");
  });

  it("reading the 3 as a difference changes the kind of the relation and its amount", () => {
    const d = run(S, [op.setRelationOperator("r_ratio", "less_by"), op.setRelationAmount("r_ratio", num(3))]);
    expect(d.layers).toEqual(["relation_kind", "quantity"]);
    expect(d.primary).toBe("relation_kind");
  });

  it("swapping the brothers is a direction, not operation_choice", () => {
    const d = run(S, [op.swap("r_ratio")]);
    expect(d.layers).toEqual(["direction"]);
    expect(d.operationEvidence).toEqual([]);
  });

  it("saying 8 alone is correct but not yet explained", () => {
    expect(run(S, [op.answer("q_otouto", num(8))]).outcome).toBe("correct_unexplained");
  });

  it("does not change the record or the ops", () => {
    const record = structuredClone(S);
    const ops = [op.swap("r_ratio")];
    const before = structuredClone(ops);
    run(record, ops);
    expect(record).toEqual(S);
    expect(ops).toEqual(before);
  });
});

describe("found in review: procedures and explicit words", () => {
  it("a procedure on a middle count is not compared with the final answer", () => {
    const r = twoStepRecord();
    const d = run(r, [op.procedure("q_m", [{ quantity_id: "q_a" }, num(2)], "add")], all(r));
    expect(d.layers).not.toContain("calculation");
    expect(d.layers).not.toContain("operation_choice");
  });

  it("words on a relation count as touching it even when there is also a procedure", () => {
    const ops = [op.procedure("q_b", [{ quantity_id: "q_a" }, num(3)], "add"), op.answer("q_b", num(2))];
    const d = run(D, ops, { phrases: ["r_1"] });
    expect(d.layers).not.toContain("operation_choice");
  });
});
