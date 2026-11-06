// M1 step (6): conditions on a problem world (指示書 第5.2節, with the candidates of 第5.4節 and the sentence
// check of 第5.7節; the signboard line of 第11節 M1). Whether the worlds can be drawn is added in M4 (Q6).
// Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { signboardAdditive, signboardCorrect } from "../../fixtures/problems/signboard.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import { rat } from "../rational/index.ts";
import { solve } from "../solve/index.ts";
import { sameWorld } from "../world/same-world.ts";
import { problemConditions, type ConditionFailure } from "./conditions.ts";
import {
  differenceRecord,
  eventRecord,
  identityRecord,
  moveRecord,
  negativeRecord,
  nonIntegerRecord,
  nonlinearRecord,
  notUniqueRecord,
  sameAnswerRecord,
  silentRecord,
  timesRecord,
  totalRecord,
  twoStepRecord,
} from "./test-records.ts";

const PROPERTY_RUNS = { numRuns: 40 };

const codes = (r: ReturnType<typeof problemConditions>): ConditionFailure[] => r.failures.map((x) => x.code);

describe("conditions: problems that pass", () => {
  it.each([
    ["difference", differenceRecord()],
    ["times", timesRecord()],
    ["event", eventRecord()],
    ["two steps", twoStepRecord()],
  ])("%s passes with no failure", (_name, r) => {
    expect(problemConditions(r)).toEqual({ ok: true, failures: [] });
  });

  it("any difference world b = a + d passes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 15 }), (a, d) => {
        expect(problemConditions(differenceRecord(a, d))).toEqual({ ok: true, failures: [] });
      }),
      PROPERTY_RUNS,
    );
  });

  it("any times world b = k a with k > 1 passes", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 2, max: 9 }), (a, k) => {
        expect(problemConditions(timesRecord(a, k))).toEqual({ ok: true, failures: [] });
      }),
      PROPERTY_RUNS,
    );
  });

  it("does not change the record", () => {
    const r = differenceRecord();
    const before = structuredClone(r);
    problemConditions(r);
    expect(r).toEqual(before);
  });
});

describe("conditions: the correct world", () => {
  it("not solvable to one answer: not_unique", () => {
    const res = problemConditions(notUniqueRecord());
    expect(res.ok).toBe(false);
    expect(codes(res)).toContain("not_unique");
  });

  it("a negative count: impossible", () => {
    const res = problemConditions(negativeRecord());
    expect(res.ok).toBe(false);
    expect(codes(res)).toContain("impossible");
  });

  it("a countable kind that is not whole: impossible", () => {
    const res = problemConditions(nonIntegerRecord());
    expect(res.ok).toBe(false);
    expect(codes(res)).toContain("impossible");
  });

  it("a product of two unknowns: nonlinear", () => {
    const res = problemConditions(nonlinearRecord());
    expect(res.ok).toBe(false);
    expect(codes(res)).toContain("nonlinear");
  });
});

describe("conditions: the candidates", () => {
  it("nothing to flip: no_candidate", () => {
    for (const r of [totalRecord(), moveRecord()]) {
      const res = problemConditions(r);
      expect(res.ok).toBe(false);
      expect(codes(res)).toContain("no_candidate");
    }
  });

  it("b = 1 times a: the candidate is the correct world again", () => {
    const res = problemConditions(identityRecord());
    expect(res.ok).toBe(false);
    expect(res.failures).toContainEqual({ code: "candidate_same_as_correct", flip: expect.objectContaining({ element_id: "r_1" }) });
  });

  it("flipping a side relation leaves the answer: candidate_same_answer on that relation", () => {
    const res = problemConditions(sameAnswerRecord());
    expect(res.ok).toBe(false);
    expect(res.failures).toContainEqual({ code: "candidate_same_answer", flip: expect.objectContaining({ element_id: "r_2" }) });
    expect(res.failures.filter((x) => x.flip?.element_id === "r_1")).toEqual([]);
  });

  it("no sentence stands for the flipped relation: candidate_all_statements_hold", () => {
    const res = problemConditions(silentRecord());
    expect(res.ok).toBe(false);
    expect(res.failures).toContainEqual({ code: "candidate_all_statements_hold", flip: expect.objectContaining({ element_id: "r_1" }) });
  });

  it("a failure on the correct world carries no flip", () => {
    for (const r of [notUniqueRecord(), negativeRecord(), nonlinearRecord(), totalRecord()]) {
      for (const x of problemConditions(r).failures) {
        if (x.code === "not_unique" || x.code === "impossible" || x.code === "nonlinear" || x.code === "no_candidate") {
          expect(x.flip).toBeUndefined();
        }
      }
    }
  });
});

describe("conditions: signboard (指示書 第11節 M1)", () => {
  it("the signboard record passes", () => {
    expect(problemConditions(signboardRecord)).toEqual({ ok: true, failures: [] });
  });

  it("the correct world has the younger brother at 8, a world that can happen", () => {
    const res = solve(signboardRecord.world);
    expect(res.kind).toBe("unique");
    if (res.kind !== "unique") return;
    expect(res.values.get("q_otouto")).toEqual(rat(8));
    expect(res.impossible).toEqual([]);
  });

  it("the additive reading (3 fewer, younger 9) is not the same world as the correct one", () => {
    const res = solve(signboardAdditive);
    expect(res.kind === "unique" ? res.values.get("q_otouto") : null).toEqual(rat(9));
    expect(sameWorld(signboardAdditive, signboardCorrect)).toBe(false);
  });
});

describe("found in review: an asked relation amount", () => {
  it("the candidate that swaps the ends of 'how many times' is not the same as the correct world", () => {
    const w = pairWorld(5, [rel("r_1", "times", "q_b", "q_a", null)]);
    w.quantities = w.quantities.map((q) => (q.id === "q_b" ? { ...q, value: num(15) } : q));
    w.question = { target_type: "relation_amount", target_id: "r_1" };
    const res = problemConditions(record(w, [stmt(0, ["q_a", "q_b", "r_1"]), stmt(1, ["r_1"], true)]));
    expect(res.failures.map((f) => f.code)).not.toContain("candidate_same_as_correct");
  });
});
