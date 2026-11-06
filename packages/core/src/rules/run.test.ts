// M1 step (7): run a reading rule on the correct world of a problem (指示書 第5.8節, 第11節 M1).
// Written before the implementation. The expected worlds are made by hand in each test.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { schemas, validateWorld, type ProblemRecord, type WorldScene } from "../schema/index.ts";
import { rat } from "../rational/index.ts";
import { solve } from "../solve/index.ts";
import { num } from "../apply/test-worlds.ts";
import { signboardAdditive, signboardCorrect, signboardProcedural } from "../../fixtures/problems/signboard.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import {
  differenceRecord,
  eventRecord,
  moveRecord,
  timesRecord,
  totalRecord,
} from "../diagnose/test-records.ts";
import { runRule, type Hypothesis } from "./run.ts";
import {
  ALWAYS,
  act,
  always,
  clause,
  H,
  hyp,
  mixedRecord,
  not,
  p,
  percentRecord,
  twoRelationRecord,
  unitFractionRecord,
  wordRecord,
  withRelation,
  zeroTimesRecord,
} from "./test-rules.ts";

const PROPERTY_RUNS = { numRuns: 60 };

function solvedValue(w: WorldScene, id: string) {
  const res = solve(w);
  if (res.kind !== "unique") throw new Error("not unique: " + res.kind);
  return res.values.get(id);
}

const signboard = (): ProblemRecord => structuredClone(signboardRecord);

describe("runRule: the signboard problem", () => {
  it("the numerator read as a difference gives 3 fewer, and the younger brother has 9", () => {
    const w = runRule(H.additive(), signboard());
    expect(w).toEqual(signboardAdditive);
    expect(solvedValue(w, "q_otouto")).toEqual(rat(9));
  });

  it("multiplying what is given makes the younger brother 3/4 of the older (9/2)", () => {
    const w = runRule(H.multiplyAlways(), signboard());
    expect(w).toEqual(signboardProcedural);
    expect(solvedValue(w, "q_otouto")).toEqual(rat(9, 2));
  });

  it("swapping the base makes the same structure as multiplying what is given", () => {
    expect(runRule(H.swap(), signboard())).toEqual(signboardProcedural);
  });

  it("inverting the multiple keeps the base and gives 4/3", () => {
    const w = runRule(H.invert(), signboard());
    expect(w).toEqual(withRelation(signboardCorrect, "r_ratio", { amount: num(4, 3) }));
    expect(solvedValue(w, "q_otouto")).toEqual(rat(9, 2));
  });

  it("the multiple itself read as a difference gives 3/4 fewer", () => {
    const w = runRule(H.additiveRatio(), signboard());
    expect(w).toEqual(withRelation(signboardCorrect, "r_ratio", { operator: "less_by", amount: num(3, 4) }));
  });

  it("dividing always, or the large number by the small one, keeps the correct structure here", () => {
    expect(runRule(H.divideAlways(), signboard())).toEqual(signboardCorrect);
    expect(runRule(H.divideLargeBySmall(), signboard())).toEqual(signboardCorrect);
  });

  it("asking about the other holder of the relation", () => {
    const w = runRule(H.misreadQuestion(), signboard());
    expect(w).toEqual({ ...signboardCorrect, question: { target_type: "quantity", target_id: "q_ani" } });
  });

  it("choosing the base by its position", () => {
    expect(runRule(always("k", act.chooseBy("known_value")), signboard())).toEqual(signboardProcedural);
    expect(runRule(always("f", act.chooseBy("first_mentioned")), signboard())).toEqual(signboardProcedural);
    expect(runRule(always("s", act.chooseBy("second_mentioned")), signboard())).toEqual(signboardCorrect);
    expect(runRule(always("a", act.chooseBy("asked")), signboard())).toEqual(signboardCorrect);
    // Larger and smaller compare the values of the correct world (younger 8, older 6).
    expect(runRule(always("l", act.chooseBy("larger_number")), signboard())).toEqual(signboardCorrect);
    expect(runRule(always("m", act.chooseBy("smaller_number")), signboard())).toEqual(signboardProcedural);
  });
});

describe("runRule: the other actions on hand-made problems", () => {
  it("a multiple above 1 read as a difference gives more by the written number", () => {
    const rec = wordRecord();
    const w = runRule(H.additive(), rec);
    expect(w).toEqual(withRelation(rec.world, "r_1", { operator: "more_by", amount: num(3) }));
    expect(solvedValue(w, "q_b")).toEqual(rat(9));
  });

  it("a percent read as a difference takes the written number of the percent", () => {
    const rec = percentRecord();
    const w = runRule(H.additive(), rec);
    expect(w).toEqual(withRelation(rec.world, "r_1", { operator: "less_by", amount: num(25) }));
    expect(solvedValue(w, "q_b")).toEqual(rat(175));
  });

  it("dividing always makes the known holder the subject", () => {
    const rec = wordRecord();
    const w = runRule(H.divideAlways(), rec);
    expect(w).toEqual(withRelation(rec.world, "r_1", { subject: "q_a", reference: "q_b" }));
    expect(solvedValue(w, "q_b")).toEqual(rat(2));
  });

  it("multiplying always leaves a problem that is already a multiplication", () => {
    const rec = wordRecord();
    expect(runRule(H.multiplyAlways(), rec)).toEqual(rec.world);
  });

  it("dividing the large number (6) by the small one (3)", () => {
    const rec = wordRecord();
    const w = runRule(H.divideLargeBySmall(), rec);
    expect(w).toEqual(withRelation(rec.world, "r_1", { subject: "q_a", reference: "q_b" }));
    expect(solvedValue(w, "q_b")).toEqual(rat(2));
  });

  it("a percent read as a count puts 25 on the asked quantity and takes the relation away", () => {
    const rec = percentRecord();
    const expected: WorldScene = {
      ...structuredClone(rec.world),
      quantities: rec.world.quantities.map((q) => (q.id === "q_b" ? { ...q, value: num(25) } : q)),
      relations: [],
    };
    expect(runRule(H.percentAsCount(), rec)).toEqual(expected);
  });

  it("flipping an event turns a gain into a loss", () => {
    const rec = eventRecord(5, 3);
    const expected: WorldScene = {
      ...structuredClone(rec.world),
      events: rec.world.events.map((e) => ({ ...e, type: "lose" as const })),
    };
    expect(runRule(H.flipEvent(), rec)).toEqual(expected);
  });

  it("choosing the base by a word uses the holder before (or after) that word", () => {
    const rec = wordRecord();
    // Before the topic particle is b, so b becomes the base: a = 3 times b, b = 2.
    const w = runRule(always("w", act.chooseByWord("before_word", "は")), rec);
    expect(w).toEqual(withRelation(rec.world, "r_1", { subject: "q_a", reference: "q_b" }));
    expect(solvedValue(w, "q_b")).toEqual(rat(2));
    // After the topic particle is a, already the base.
    expect(runRule(always("x", act.chooseByWord("after_word", "は")), rec)).toEqual(rec.world);
  });

  it("a word that appears twice is taken at the place nearest the multiple", () => {
    const rec = wordRecord();
    // The particle nearest the 3 follows a (the base); the far one follows b.
    expect(runRule(always("w", act.chooseByWord("before_word", "の")), rec)).toEqual(rec.world);
  });

  it("a word that is not in the sentence changes nothing", () => {
    const rec = wordRecord();
    expect(runRule(always("w", act.chooseByWord("before_word", "に対して")), rec)).toEqual(rec.world);
  });
});

describe("runRule: a rule that does nothing", () => {
  it("returns the correct world for no_change", () => {
    expect(runRule(H.noChange(), signboard())).toEqual(signboardCorrect);
    expect(runRule(H.noChange(), mixedRecord())).toEqual(mixedRecord().world);
    expect(runRule(H.noChange(), eventRecord())).toEqual(eventRecord().world);
  });

  it("returns the correct world when no clause matches", () => {
    expect(runRule(hyp("n", [clause(not(ALWAYS), act.swap())]), signboard())).toEqual(signboardCorrect);
    expect(runRule(hyp("n", [clause(p("relation_operator_is", "per"), act.invert())]), signboard())).toEqual(
      signboardCorrect,
    );
  });

  it("returns the correct world for any difference or multiple problem (property)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 30 }), fc.boolean(), (a, k, times) => {
        const rec = times ? timesRecord(a, k) : differenceRecord(a, k);
        expect(runRule(H.noChange(), rec)).toEqual(rec.world);
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("runRule: only the first matching clause", () => {
  it("each relation gets the action of its own first matching clause", () => {
    const rec = mixedRecord();
    const rule = hyp("h", [clause(p("relation_operator_is", "times"), act.invert()), clause(ALWAYS, act.swap())]);
    const expected = withRelation(withRelation(rec.world, "r_1", { amount: num(1, 3) }), "r_2", {
      subject: "q_m",
      reference: "q_b",
    });
    expect(runRule(rule, rec)).toEqual(expected);
  });

  it("a later clause that also matches is not applied", () => {
    const rec = mixedRecord();
    const rule = hyp("h", [clause(ALWAYS, act.swap()), clause(p("relation_operator_is", "times"), act.invert())]);
    const expected = withRelation(withRelation(rec.world, "r_1", { subject: "q_a", reference: "q_m" }), "r_2", {
      subject: "q_m",
      reference: "q_b",
    });
    expect(runRule(rule, rec)).toEqual(expected);
  });

  it("on the signboard, the clause on fractions wins over a later one", () => {
    const rule = hyp("h", [clause(p("relation_operator_is", "fraction_of"), act.invert()), clause(ALWAYS, act.swap())]);
    expect(runRule(rule, signboard())).toEqual(withRelation(signboardCorrect, "r_ratio", { amount: num(4, 3) }));
    const skipped = hyp("h", [clause(p("relation_operator_is", "times"), act.swap()), clause(ALWAYS, act.invert())]);
    expect(runRule(skipped, signboard())).toEqual(withRelation(signboardCorrect, "r_ratio", { amount: num(4, 3) }));
  });

  it("events are taken one by one as well", () => {
    const rule = hyp("h", [clause(p("relation_operator_is", "times"), act.swap()), clause(ALWAYS, act.flipEvent())]);
    expect(runRule(rule, eventRecord()).events.map((e) => e.type)).toEqual(["lose"]);
  });

  it("a condition can pick one relation by a word of its sentence", () => {
    const rec = twoRelationRecord();
    const rule = hyp("h", [clause(p("word_in_statement", "c"), act.swap())]);
    expect(runRule(rule, rec)).toEqual(withRelation(rec.world, "r_2", { subject: "q_a", reference: "q_c" }));
  });
});

describe("runRule: an action that does not fit leaves the element as it is", () => {
  it("no inverse of a zero multiple", () => {
    expect(runRule(H.invert(), zeroTimesRecord())).toEqual(zeroTimesRecord().world);
  });

  it("a difference is not inverted or read as a difference again", () => {
    expect(runRule(H.invert(), differenceRecord())).toEqual(differenceRecord().world);
    expect(runRule(H.additive(), differenceRecord())).toEqual(differenceRecord().world);
  });

  it("a total has no base to swap", () => {
    expect(runRule(H.swap(), totalRecord())).toEqual(totalRecord().world);
  });

  it("a relation has no event to flip; a problem without relations has no other holder to ask about", () => {
    expect(runRule(H.flipEvent(), timesRecord())).toEqual(timesRecord().world);
    expect(runRule(H.misreadQuestion(), eventRecord())).toEqual(eventRecord().world);
  });

  it("a percent count is not made from a multiple that is not a percent", () => {
    expect(runRule(H.percentAsCount(), unitFractionRecord())).toEqual(unitFractionRecord().world);
  });
});

describe("runRule: what it returns", () => {
  const ACTIONS = [
    act.noChange(),
    act.swap(),
    act.invert(),
    act.flipEvent(),
    act.misreadQuestion(),
    act.additive("numerator"),
    act.additive("ratio_value"),
    act.numberOp("multiply_always"),
    act.numberOp("divide_always"),
    act.numberOp("divide_large_by_small"),
    act.numberOp("percent_as_count"),
    act.chooseBy("first_mentioned"),
    act.chooseBy("second_mentioned"),
    act.chooseBy("known_value"),
    act.chooseBy("asked"),
    act.chooseBy("larger_number"),
    act.chooseBy("smaller_number"),
    act.chooseByWord("before_word", "の"),
    act.chooseByWord("after_word", "は"),
  ];
  const CONDITIONS = [
    ALWAYS,
    not(ALWAYS),
    p("relation_operator_is", "times"),
    p("relation_operator_is", "fraction_of"),
    p("ratio_kind_is", "lt1"),
    p("word_in_statement", "の"),
    p("word_before_ratio", "の"),
    p("reference_is", "known_value"),
    p("numbers_compare", "larger_is_known"),
    p("ratio_is_unit_fraction"),
  ];
  const RECORDS: (() => ProblemRecord)[] = [
    signboard,
    wordRecord,
    percentRecord,
    unitFractionRecord,
    mixedRecord,
    twoRelationRecord,
    zeroTimesRecord,
    () => eventRecord(),
    () => moveRecord(),
    () => totalRecord(),
    () => differenceRecord(),
    () => timesRecord(),
  ];
  const ruleArb: fc.Arbitrary<Hypothesis> = fc
    .array(fc.record({ when: fc.constantFrom(...CONDITIONS), then: fc.constantFrom(...ACTIONS) }), {
      minLength: 1,
      maxLength: 3,
    })
    .map((clauses) => hyp("h_any", clauses));

  it("is always a world that passes the schema and validateWorld (property)", () => {
    fc.assert(
      fc.property(ruleArb, fc.constantFrom(...RECORDS), (rule, make) => {
        const w = runRule(rule, make());
        expect(() => schemas.worldScene.parse(w)).not.toThrow();
        expect(validateWorld(w)).toEqual({ ok: true });
      }),
      PROPERTY_RUNS,
    );
  });

  it("never changes the rule or the record it is given (property)", () => {
    fc.assert(
      fc.property(ruleArb, fc.constantFrom(...RECORDS), (rule, make) => {
        const rec = make();
        const before = JSON.stringify([rule, rec]);
        runRule(rule, rec);
        expect(JSON.stringify([rule, rec])).toBe(before);
      }),
      PROPERTY_RUNS,
    );
  });

  it("gives the same world for the same rule and record", () => {
    for (const make of RECORDS) {
      expect(runRule(H.swap(), make())).toEqual(runRule(H.swap(), make()));
    }
  });
});
