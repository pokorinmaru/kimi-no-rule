// M1 step (5): check_statements (指示書 第5.7節; released constraints and procedure values from 第5.3節;
// criteria from 第11節 M1). Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { AnyOp, ProblemRecord, WorldScene } from "../schema/index.ts";
import { apply, type ApplyInput, type ApplyResult } from "../apply/index.ts";
import { differenceWorld, num, op, phrase, totalWorld, worldW } from "../apply/test-worlds.ts";
import { signboardCorrect } from "../../fixtures/problems/signboard.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import {
  checkStatements,
  type CheckInput,
  type CheckResult,
  type StatementCheck,
  type StatementVerdict,
} from "./index.ts";

type Statement = ProblemRecord["statements"][number];
type Mark = ProblemRecord["syntax_marks"][number];

const PROPERTY_RUNS = { numRuns: 60 };

// ---------------------------------------------------------------------------------------------
// Statements for the main test world W (written for these tests)
// ---------------------------------------------------------------------------------------------

function stmt(index: number, element_ids: string[], tokens: string[] = [], is_question = false): Statement {
  return { index, text: tokens.join(""), element_ids, is_question, speaker_holder_id: null, tokens };
}

function mark(kind: Mark["kind"], statement_index: number, at: number, word: string, element_id: string | null): Mark {
  return {
    kind,
    statement_index,
    token_start: at,
    token_end: at,
    element_id,
    word,
    ratio_kind: null,
    l1_pattern_id: null,
    native_checked: null,
  };
}

/** s0 holders only, s1 q_a, s2 q_c and q_d, s3 r_1, s4 r_2, s5 r_4, s6 e_1, s7 the question. */
const W_STATEMENTS: Statement[] = [
  stmt(0, ["h_a", "h_b", "h_c"], ["a", "と", "b", "と", "c", "が", "います", "。"]),
  stmt(1, ["h_a", "q_a"], ["a", "は", "5", "こ", "。"]),
  stmt(2, ["q_c", "q_d", "k_other"], ["c", "は", "2", "こ", "、", "a", "の", "other", "は", "1", "。"]),
  stmt(3, ["r_1"], ["b", "は", "a", "より", "3", "こ", "多い", "。"]),
  stmt(4, ["r_2"], ["c", "は", "a", "より", "3", "こ", "少ない", "。"]),
  stmt(5, ["r_4"], ["b", "は", "c", "より", "6", "こ", "多い", "。"]),
  // q_c2 has no value in the correct world, so it is not a constraint of this sentence.
  stmt(6, ["e_1", "q_c2"], ["c", "は", "4", "こ", "もらう", "。"]),
  stmt(7, ["q_b"], ["b", "は", "何", "こ", "？"], true),
];

const W_MARKS: Mark[] = [
  mark("holder_mention", 3, 2, "a", "h_a"),
  mark("relation_word", 3, 3, "より", "r_1"),
  mark("relation_word", 4, 3, "より", "r_2"),
  // A relation word pointing to a relation the sentence does not express: never a cue.
  mark("relation_word", 4, 6, "少ない", "r_1"),
  // A unit word on the relation of the sentence: not a kind that gives cues.
  mark("unit_word", 4, 5, "こ", "r_2"),
  mark("relation_word", 5, 3, "より", "r_4"),
];

/** Ops on W that touch every relation and the event without changing any of them. */
const W_ALL_TOUCHED: AnyOp[] = [
  op.setReference("r_1", "q_a"),
  op.setReference("r_2", "q_a"),
  op.setReference("r_4", "q_c"),
  op.setEventAmount("e_1", num(4)),
];

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

interface Case {
  correct: WorldScene;
  statements: Statement[];
  marks?: Mark[];
}

const W_CASE: Case = { correct: worldW(), statements: W_STATEMENTS, marks: W_MARKS };

function inputFor(c: Case, ops: AnyOp[], extra: Partial<ApplyInput> = {}): CheckInput {
  const correct = structuredClone(c.correct);
  const child = apply({ correct, ops, ...extra });
  return { correct, statements: c.statements, syntaxMarks: c.marks ?? [], ops, child };
}

function run(c: Case, ops: AnyOp[], extra: Partial<ApplyInput> = {}): CheckResult {
  return checkStatements(inputFor(c, ops, extra));
}

function checked(res: CheckResult): StatementCheck[] {
  expect(res.kind).toBe("checked");
  if (res.kind !== "checked") throw new Error("not checked");
  return res.statements;
}

const verdicts = (res: CheckResult): StatementVerdict[] => checked(res).map((s) => s.verdict);

function at(res: CheckResult, index: number): StatementCheck {
  const s = checked(res).find((x) => x.index === index);
  if (s === undefined) throw new Error(`no statement ${index}`);
  return s;
}

/**
 * Phrases naming every element of the sentences. A world that matches the correct one has the words
 * of the child on all of them (指示書 第5.4節), so these tests do not lean on how an untouched
 * element is judged.
 */
const touchAll = (statements: readonly Statement[]) =>
  [...new Set(statements.flatMap((s) => s.element_ids))].map((id) => phrase(id));

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** b = a + d, with its three sentences. */
function differenceCase(a: number, d: number): Case {
  return {
    correct: differenceWorld(a, d),
    statements: [stmt(0, ["h_a", "q_a"]), stmt(1, ["r_1"]), stmt(2, ["q_b"], [], true)],
  };
}

/**
 * The signboard shape built from its answer: younger = d*k is chosen first, older = n*k is given,
 * and older = (n/d) x younger. n/d is reduced and not 1.
 */
function ratioCase(n: number, d: number, k: number): Case {
  const w = structuredClone(signboardCorrect);
  w.quantities = w.quantities.map((q) => (q.id === "q_ani" ? { ...q, value: num(n * k) } : q));
  w.relations = w.relations.map((r) => (r.id === "r_ratio" ? { ...r, amount: num(n, d) } : r));
  return { correct: w, statements: signboardRecord.statements, marks: signboardRecord.syntax_marks };
}

const ratioArb = fc
  .tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 10 }))
  .map(([n0, d0, k]) => {
    const g = gcd(n0, d0);
    return { n: n0 / g, d: d0 / g, k };
  })
  .filter(({ n, d }) => n !== d);

// ---------------------------------------------------------------------------------------------
// The test statements are sound
// ---------------------------------------------------------------------------------------------

describe("test statements", () => {
  it("every id in the statements and marks exists in W, and each mark sits on its word", () => {
    const w = worldW();
    const ids = new Set(
      [...w.holders, ...w.item_kinds, ...w.quantities, ...w.relations, ...w.events].map((x) => x.id),
    );
    for (const s of W_STATEMENTS) for (const id of s.element_ids) expect(ids.has(id)).toBe(true);
    for (const m of W_MARKS) {
      if (m.element_id !== null) expect(ids.has(m.element_id)).toBe(true);
      expect(W_STATEMENTS[m.statement_index]?.tokens[m.token_start]).toBe(m.word);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// 第11節 M1: a world that matches the correct one makes every sentence hold
// ---------------------------------------------------------------------------------------------

describe("the world of a child that matches the correct world", () => {
  it("W: every sentence holds and no cue is made", () => {
    const res = checked(run(W_CASE, W_ALL_TOUCHED, { phrases: touchAll(W_STATEMENTS) }));
    expect(res.map((s) => s.index)).toEqual(W_STATEMENTS.map((s) => s.index));
    expect(res.map((s) => s.verdict)).toEqual(W_STATEMENTS.map(() => "holds"));
    for (const s of res) expect(s.cues).toEqual([]);
  });

  it("W, property: any order of no-change touches of every relation and the event, with extra true values", () => {
    const refs = { r_1: ["q_a", "more_by", 3], r_2: ["q_a", "less_by", 3], r_4: ["q_c", "more_by", 6] } as const;
    const relationTouch = (id: keyof typeof refs) => {
      const [reference, operator, amount] = refs[id];
      return fc.constantFrom(
        op.setReference(id, reference),
        op.setRelationOperator(id, operator),
        op.setRelationAmount(id, num(amount)),
      );
    };
    const arb = fc
      .record({
        r1: relationTouch("r_1"),
        r2: relationTouch("r_2"),
        r4: relationTouch("r_4"),
        event: fc.constantFrom("amount", "type", "phrase"),
        extra: fc.subarray([
          op.answer("q_b", num(8)),
          op.setQuantity("q_a", num(5)),
          op.setQuantity("q_c", num(2)),
          op.setQuantity("q_d", num(1)),
        ]),
      })
      .chain((g) => {
        const eventOps =
          g.event === "amount"
            ? [op.setEventAmount("e_1", num(4))]
            : g.event === "type"
              ? [op.setEventType("e_1", "gain")]
              : [];
        const all = [g.r1, g.r2, g.r4, ...eventOps, ...g.extra];
        return fc
          .shuffledSubarray(all, { minLength: all.length, maxLength: all.length })
          .map((ops) => ({ ops, phrases: touchAll(W_STATEMENTS) }));
      });
    fc.assert(
      fc.property(arb, ({ ops, phrases }) => {
        const res = run(W_CASE, ops, { phrases });
        expect(verdicts(res)).toEqual(W_STATEMENTS.map(() => "holds"));
      }),
      PROPERTY_RUNS,
    );
  });

  it("difference worlds built from the answer, property: every sentence holds", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        fc.constantFrom("reference", "operator", "amount"),
        fc.boolean(),
        (a, d, touch, withAnswer) => {
          const t =
            touch === "reference"
              ? op.setReference("r_1", "q_a")
              : touch === "operator"
                ? op.setRelationOperator("r_1", "more_by")
                : op.setRelationAmount("r_1", num(d));
          const ops = withAnswer ? [op.answer("q_b", num(a + d)), t] : [t];
          const c = differenceCase(a, d);
          expect(verdicts(run(c, ops, { phrases: touchAll(c.statements) }))).toEqual(["holds", "holds", "holds"]);
        },
      ),
      PROPERTY_RUNS,
    );
  });

  it("signboard-shaped worlds built from the answer, property: every sentence holds", () => {
    fc.assert(
      fc.property(
        ratioArb,
        fc.constantFrom("reference", "operator", "amount"),
        fc.boolean(),
        ({ n, d, k }, touch, withAnswer) => {
          const t =
            touch === "reference"
              ? op.setReference("r_ratio", "q_otouto")
              : touch === "operator"
                ? op.setRelationOperator("r_ratio", "fraction_of")
                : op.setRelationAmount("r_ratio", num(n, d));
          const ops = withAnswer ? [t, op.answer("q_otouto", num(d * k))] : [t];
          const c = ratioCase(n, d, k);
          expect(verdicts(run(c, ops, { phrases: touchAll(c.statements) }))).toEqual(["holds", "holds", "holds"]);
        },
      ),
      PROPERTY_RUNS,
    );
  });

  it("a total with a list of references: every sentence holds", () => {
    const c: Case = {
      correct: totalWorld(),
      statements: [stmt(0, ["q_x"]), stmt(1, ["q_y"]), stmt(2, ["r_t"]), stmt(3, ["q_t"], [], true)],
    };
    expect(verdicts(run(c, [op.setRelationOperator("r_t", "total_of")], { phrases: touchAll(c.statements) }))).toEqual([
      "holds",
      "holds",
      "holds",
      "holds",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// 第11節 M1: a misreading candidate makes at least one sentence fail
// ---------------------------------------------------------------------------------------------

describe("the world of a misreading candidate", () => {
  it.each<[string, AnyOp]>([
    ["r_1 more_by -> less_by", op.setRelationOperator("r_1", "less_by")],
    ["r_1 direction swapped", op.swap("r_1")],
    ["r_2 less_by -> more_by", op.setRelationOperator("r_2", "more_by")],
    ["r_2 direction swapped", op.swap("r_2")],
    ["r_4 more_by -> less_by", op.setRelationOperator("r_4", "less_by")],
    ["r_4 direction swapped", op.swap("r_4")],
    ["e_1 gain -> lose", op.setEventType("e_1", "lose")],
  ])("W, %s: at least one sentence fails", (_name, flip) => {
    expect(verdicts(run(W_CASE, [flip]))).toContain("fails");
  });

  it("difference worlds, property: flipped operator, swapped direction or a wrong amount fails a sentence", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 10 }),
        fc.constantFrom("operator", "direction", "amount"),
        (a, d, e, kind) => {
          const flip =
            kind === "operator"
              ? op.setRelationOperator("r_1", "less_by")
              : kind === "direction"
                ? op.swap("r_1")
                : op.setRelationAmount("r_1", num(d + e));
          const res = run(differenceCase(a, d), [flip]);
          expect(verdicts(res)).toContain("fails");
          expect(at(res, 1).verdict).toBe("fails");
        },
      ),
      PROPERTY_RUNS,
    );
  });

  it("signboard-shaped worlds, property: swapped direction or the reciprocal amount fails the ratio sentence", () => {
    fc.assert(
      fc.property(ratioArb, fc.constantFrom("direction", "reciprocal"), ({ n, d, k }, kind) => {
        const flip = kind === "direction" ? op.swap("r_ratio") : op.setRelationAmount("r_ratio", num(d, n));
        const res = run(ratioCase(n, d, k), [flip]);
        expect(verdicts(res)).toContain("fails");
        expect(at(res, 1).verdict).toBe("fails");
      }),
      PROPERTY_RUNS,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The five verdicts
// ---------------------------------------------------------------------------------------------

describe("holds", () => {
  it("a sentence with no number, relation or event holds", () => {
    expect(at(run(W_CASE, [], { phrases: touchAll(W_STATEMENTS.slice(0, 1)) }), 0).verdict).toBe("holds");
  });

  it("given numbers the child named, with the correct values, hold", () => {
    const res = run(W_CASE, [], { phrases: touchAll(W_STATEMENTS.slice(1, 3)) });
    expect(at(res, 1).verdict).toBe("holds");
    expect(at(res, 2).verdict).toBe("holds");
  });

  it("an asked quantity among the ids of a sentence is not a constraint of that sentence", () => {
    const c: Case = { correct: worldW(), statements: [stmt(0, ["q_a", "q_b"])] };
    expect(verdicts(run(c, [], { phrases: touchAll(c.statements) }))).toEqual(["holds"]);
  });

  it("the question sentence holds when the child asks the same thing, whatever the values", () => {
    expect(at(run(W_CASE, [op.setRelationOperator("r_1", "less_by")]), 7).verdict).toBe("holds");
  });
});

describe("fails", () => {
  it("a given number the child changed", () => {
    expect(at(run(W_CASE, [op.setQuantity("q_a", num(7))]), 1).verdict).toBe("fails");
  });

  it("a relation whose correct formula does not hold on the values of the child", () => {
    // b is read against c: b = 2 + 3 = 5, while b = a + 3 asks for 8.
    expect(at(run(W_CASE, [op.setReference("r_1", "q_c")]), 3).verdict).toBe("fails");
  });

  it("an event of another type", () => {
    expect(at(run(W_CASE, [op.setEventType("e_1", "lose")]), 6).verdict).toBe("fails");
  });

  it("an event of another amount", () => {
    expect(at(run(W_CASE, [op.setEventAmount("e_1", num(5))]), 6).verdict).toBe("fails");
  });

  it("an event with the correct amount holds", () => {
    const res = run(W_CASE, [op.setEventAmount("e_1", num(4))], { phrases: touchAll(W_STATEMENTS.slice(6, 7)) });
    expect(at(res, 6).verdict).toBe("holds");
  });

  it("one failing constraint fails the sentence even when another is undetermined", () => {
    const c: Case = { correct: worldW(), statements: [stmt(0, ["q_a", "r_1"])] };
    expect(verdicts(run(c, [op.setQuantity("q_a", num(7))]))).toEqual(["fails"]);
  });
});

describe("undetermined", () => {
  it("a relation the child did not touch, even when both ends have values", () => {
    // The answer is drawn on b and a keeps 5, but r_1 is not in the world of the child.
    const res = run(W_CASE, [op.answer("q_b", num(8)), op.setQuantity("q_a", num(5))]);
    expect(at(res, 3).verdict).toBe("undetermined");
  });

  it("a touched relation with an end whose value is not fixed", () => {
    // r_1 now reads b against c after the event; the event is untouched, so b has no value.
    expect(at(run(W_CASE, [op.setReference("r_1", "q_c2")]), 3).verdict).toBe("undetermined");
  });

  it("an event the child did not touch", () => {
    expect(at(run(W_CASE, []), 6).verdict).toBe("undetermined");
  });

  it("an event the child removed", () => {
    expect(at(run(W_CASE, [op.remove("e_1")]), 6).verdict).toBe("undetermined");
  });

  it("a given number the child removed, with the rest of the sentence holding", () => {
    expect(at(run(W_CASE, [op.remove("q_d")]), 2).verdict).toBe("undetermined");
  });

  it("holds and undetermined together give undetermined", () => {
    const c: Case = { correct: worldW(), statements: [stmt(0, ["q_a", "r_1"])] };
    expect(verdicts(run(c, []))).toEqual(["undetermined"]);
  });

  it("a total untouched by the child", () => {
    const c: Case = { correct: totalWorld(), statements: [stmt(0, ["r_t"])] };
    expect(verdicts(run(c, [op.setQuantity("q_x", num(2))]))).toEqual(["undetermined"]);
  });
});

describe("different_question", () => {
  it.each<[string, AnyOp]>([
    ["another quantity", op.setQuestionTarget("q_c2", "quantity")],
    ["a relation amount", op.setQuestionTarget("r_1", "relation_amount")],
  ])("the child asks about %s", (_name, ask) => {
    const res = run(W_CASE, [ask]);
    expect(at(res, 7).verdict).toBe("different_question");
    expect(at(res, 7).cues).toEqual([]);
  });

  it("only the question sentence is marked", () => {
    const res = run(W_CASE, [...W_ALL_TOUCHED, op.setQuestionTarget("q_c2", "quantity")]);
    expect(verdicts(res).filter((v) => v === "different_question")).toHaveLength(1);
  });
});

describe("jointly_unsatisfiable", () => {
  // a = 5, c = 2 and c = a - 4 are all words of the child.
  const ops = [op.setQuantity("q_a", num(5)), op.setQuantity("q_c", num(2)), op.setRelationAmount("r_2", num(4))];

  it("the words of the child contradict each other (the apply result this case rests on)", () => {
    expect(apply({ correct: worldW(), ops }).draw.unsatisfiable).toEqual([["q_a", "q_c", "r_2"]]);
  });

  it("sentences with an id in a conflicting set are jointly_unsatisfiable, all others undetermined", () => {
    const res = run(W_CASE, ops);
    expect(verdicts(res)).toEqual([
      "undetermined",
      "jointly_unsatisfiable",
      "jointly_unsatisfiable",
      "undetermined",
      "jointly_unsatisfiable",
      "undetermined",
      "undetermined",
      "undetermined",
    ]);
    for (const s of checked(res)) expect(s.cues).toEqual([]);
  });

  it("a sentence is matched by any of its ids, also one that is not a number, relation or event", () => {
    const input = inputFor(W_CASE, []);
    const child: ApplyResult = { ...input.child, draw: { ...input.child.draw, unsatisfiable: [["h_a"]] } };
    expect(verdicts(checkStatements({ ...input, child }))).toEqual([
      "jointly_unsatisfiable",
      "jointly_unsatisfiable",
      "undetermined",
      "undetermined",
      "undetermined",
      "undetermined",
      "undetermined",
      "undetermined",
    ]);
  });
});

// Released constraints: 指示書 第5.3節.
describe("released constraints", () => {
  it("a sentence holding a released number fails", () => {
    // c = a - 4 contradicts the untouched 2 of c, which is released.
    const input = inputFor(W_CASE, [op.setRelationAmount("r_2", num(4))]);
    expect(input.child.draw.released).toEqual(["q_c"]);
    expect(at(checkStatements(input), 2).verdict).toBe("fails");
  });

  it("fails even when the solved value happens to equal the correct one", () => {
    const input = inputFor(W_CASE, W_ALL_TOUCHED);
    const child: ApplyResult = { ...input.child, draw: { ...input.child.draw, released: ["q_a"] } };
    const res = checkStatements({ ...input, child });
    expect(at(res, 1).verdict).toBe("fails");
    expect(at(res, 3).verdict).toBe("holds");
  });

  it("a released relation fails its sentence", () => {
    const input = inputFor(W_CASE, W_ALL_TOUCHED);
    const child: ApplyResult = { ...input.child, draw: { ...input.child.draw, released: ["r_4"] } };
    expect(at(checkStatements({ ...input, child }), 5).verdict).toBe("fails");
  });
});

// ---------------------------------------------------------------------------------------------
// Number-only utterances
// ---------------------------------------------------------------------------------------------

describe("number only", () => {
  it.each<[string, AnyOp[]]>([
    ["one answer on the asked quantity", [op.answer("q_b", num(8))]],
    ["a wrong answer on the asked quantity", [op.answer("q_b", num(15))]],
    ["two answers on the asked quantity", [op.answer("q_b", num(8)), op.answer("q_b", num(9))]],
  ])("%s is not checked", (_name, ops) => {
    expect(run(W_CASE, ops)).toEqual({ kind: "number_only" });
  });

  it.each<[string, AnyOp[]]>([
    ["no ops", []],
    ["an answer on a quantity that is not asked", [op.answer("q_a", num(5))]],
    ["an answer together with a relation", [op.answer("q_b", num(8)), op.setReference("r_1", "q_a")]],
    ["an answer together with a number", [op.answer("q_b", num(8)), op.setQuantity("q_a", num(5))]],
    ["a word cue only", [op.wordCue(3, [3])]],
  ])("%s is checked", (_name, ops) => {
    expect(run(W_CASE, ops).kind).toBe("checked");
  });
});

// ---------------------------------------------------------------------------------------------
// Reason cues
// ---------------------------------------------------------------------------------------------

describe("reason cues", () => {
  it("a swapped relation: the relation word is tied to what is now the reference in the world of the child", () => {
    const res = run(W_CASE, [op.swap("r_1")]);
    expect(at(res, 3).verdict).toBe("fails");
    expect(at(res, 3).cues).toEqual([
      { statement_index: 3, token_start: 3, token_end: 3, word: "より", linked_to: "q_b" },
    ]);
  });

  it("a reference moved to a third quantity is what the word is tied to", () => {
    const res = run(W_CASE, [op.setReference("r_1", "q_c")]);
    expect(at(res, 3).cues).toEqual([
      { statement_index: 3, token_start: 3, token_end: 3, word: "より", linked_to: "q_c" },
    ]);
  });

  it("only relation words and ratio notation on the relation of the sentence give cues", () => {
    const res = run(W_CASE, [op.swap("r_2")]);
    expect(at(res, 4).verdict).toBe("fails");
    expect(at(res, 4).cues).toEqual([
      { statement_index: 4, token_start: 3, token_end: 3, word: "より", linked_to: "q_c" },
    ]);
  });

  it("no cue when the reference of the child is the correct one", () => {
    const res = run(W_CASE, [op.setRelationOperator("r_1", "less_by")]);
    expect(at(res, 3).verdict).toBe("fails");
    expect(at(res, 3).cues).toEqual([]);
  });

  it("no cue on a failing sentence without relation marks", () => {
    const res = run(W_CASE, [op.setQuantity("q_a", num(7))]);
    expect(at(res, 1).verdict).toBe("fails");
    expect(at(res, 1).cues).toEqual([]);
  });

  it("property: cues only on failing sentences, tied to the reference of the child, never to the correct one", () => {
    const correct = worldW();
    const quantities = ["q_a", "q_b", "q_c", "q_c2", "q_d"];
    const relations = ["r_1", "r_2", "r_4"];
    const pool: AnyOp[] = [
      ...relations.map((r) => op.swap(r)),
      ...relations.flatMap((r) => quantities.map((q) => op.setReference(r, q))),
      ...relations.flatMap((r) => (["more_by", "less_by", "times"] as const).map((o) => op.setRelationOperator(r, o))),
      ...relations.map((r) => op.setRelationAmount(r, num(2))),
      op.setQuantity("q_a", num(7)),
      op.answer("q_b", num(8)),
    ];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...pool), { minLength: 1, maxLength: 3 }), (ops) => {
        const input = inputFor(W_CASE, ops);
        const res = checkStatements(input);
        if (res.kind !== "checked") return;
        for (const s of res.statements) {
          if (s.verdict !== "fails") {
            expect(s.cues).toEqual([]);
            continue;
          }
          for (const cue of s.cues) {
            const m = W_MARKS.find(
              (x) => x.statement_index === s.index && x.token_start === cue.token_start && x.word === cue.word,
            );
            expect(m?.kind === "relation_word" || m?.kind === "ratio_notation").toBe(true);
            expect(W_STATEMENTS[s.index]?.element_ids).toContain(m?.element_id);
            const right = correct.relations.find((r) => r.id === m?.element_id);
            const mine = input.child.checkWorld.relations.find((r) => r.id === m?.element_id);
            expect(cue.linked_to).toBe(mine?.reference);
            expect(cue.linked_to).not.toBe(right?.reference);
          }
        }
      }),
      PROPERTY_RUNS,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------------------------

describe("purity", () => {
  const pool: AnyOp[] = [
    ...W_ALL_TOUCHED,
    op.swap("r_1"),
    op.swap("r_2"),
    op.setRelationOperator("r_4", "less_by"),
    op.setRelationAmount("r_2", num(4)),
    op.setQuantity("q_a", num(5)),
    op.setQuantity("q_c", num(2)),
    op.setEventType("e_1", "lose"),
    op.setQuestionTarget("q_c2", "quantity"),
    op.answer("q_b", num(8)),
    op.answer("q_b", num(9)),
    op.remove("q_d"),
  ];
  const opsArb = fc.array(fc.constantFrom(...pool), { maxLength: 5 });

  it("property: the input is not changed", () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const input = inputFor(W_CASE, ops);
        const before = structuredClone(input);
        checkStatements(input);
        expect(input).toEqual(before);
      }),
      PROPERTY_RUNS,
    );
  });

  it("property: the same input gives the same result, one entry per sentence in order", () => {
    fc.assert(
      fc.property(opsArb, (ops) => {
        const input = inputFor(W_CASE, ops);
        const res = checkStatements(input);
        expect(checkStatements(structuredClone(input))).toEqual(res);
        if (res.kind === "checked") {
          expect(res.statements.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
        }
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("found in review: asked events and sentences of holders only", () => {
  it("an asked event amount is not a constraint, so a matching world does not leave it undecided", () => {
    const correct = worldW();
    correct.question = { target_type: "event_amount", target_id: "e_1" };
    correct.events = correct.events.map((e) => (e.id === "e_1" ? { ...e, amount: null } : e));
    correct.quantities = correct.quantities.map((q) => (q.id === "q_c2" ? { ...q, value: num(6) } : q));
    const c: Case = { correct, statements: [stmt(0, ["e_1", "h_c"]), stmt(1, ["e_1"], [], true)] };
    expect(verdicts(run(c, [], { phrases: touchAll(c.statements) }))).toEqual(["holds", "holds"]);
  });

  it("a sentence naming only a holder is not decided until the child's words touch it (指示書 第5.7節)", () => {
    const c: Case = { correct: worldW(), statements: [stmt(0, ["h_a"])] };
    expect(verdicts(run(c, []))).toEqual(["undetermined"]);
    expect(verdicts(run(c, [], { phrases: [phrase("h_a")] }))).toEqual(["holds"]);
  });

  it("a sentence with no elements at all holds", () => {
    const c: Case = { correct: worldW(), statements: [stmt(0, [])] };
    expect(verdicts(run(c, []))).toEqual(["holds"]);
  });
});
