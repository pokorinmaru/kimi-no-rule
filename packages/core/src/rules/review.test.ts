// Found in review of M1 (7): reproduction on asked relations, missing likelihoods, events and not,
// the reference flag, and the conditions of confirming a rule (指示書 第5.8節, 第6.7節 手順2・手順4; Q22).
import { describe, expect, it } from "vitest";
import { op } from "../apply/test-worlds.ts";
import { eventRecord, timesRecord } from "../diagnose/test-records.ts";
import { predict } from "./predict.ts";
import { runRule } from "./run.ts";
import { reproduction } from "./score.ts";
import { act, clause, H, hyp, not, observe, p, ALWAYS, twoRelationRecord } from "./test-rules.ts";
import { confirmation, constructiveLikelihoods, countsAsObservation, isSplit, update } from "./weights.ts";

describe("reproduction when an untouched relation is asked", () => {
  it("compares the asked relation the same way on both sides", () => {
    const rec = twoRelationRecord();
    rec.world.question = { target_type: "relation_amount", target_id: "r_1" };
    rec.world.relations = rec.world.relations.map((r) => (r.id === "r_1" ? { ...r, amount: null } : r));
    const obs = observe(rec, [op.swap("r_2")]);
    expect(reproduction(H.swap(), obs)).toBe("reproduced");
    expect(reproduction(H.noChange(), obs)).toBe("missed");
  });
});

describe("a hypothesis without a likelihood", () => {
  it("is an error, not a free pass", () => {
    expect(() => update({ a: 0.5, other: 0.5 }, { other: 0.5 })).toThrow();
  });
});

describe("relation predicates on an event", () => {
  it("a condition about relations, even under not, does not hold on an event", () => {
    const rec = eventRecord();
    const h = hyp("h_mixed", [clause(not(p("relation_operator_is", "times")), act.swap()), clause(ALWAYS, act.flipEvent())]);
    const before = rec.world.events[0]?.type;
    const after = runRule(h, rec).events[0]?.type;
    expect(after).not.toBe(before);
  });
});

describe("the reference flag", () => {
  it("likelihoods refuse a flag different from the one W was built with", () => {
    const rec = timesRecord();
    const pred = predict([H.swap(), H.noChange()], rec, true);
    expect(() => constructiveLikelihoods(pred, rec.world, false)).toThrow();
  });
});

describe("what counts toward confirming a rule", () => {
  it("a problem splits only when the hypotheses predict different worlds", () => {
    const rec = timesRecord();
    expect(isSplit(predict([H.swap(), H.noChange()], rec, true))).toBe(true);
    expect(isSplit(predict([H.noChange(), H.noChange()], rec, true))).toBe(false);
  });

  it("observations after the word book or after a fix do not count", () => {
    expect(countsAsObservation({ afterFix: false, wordbookOpenedBefore: false })).toBe(true);
    expect(countsAsObservation({ afterFix: true, wordbookOpenedBefore: false })).toBe(false);
    expect(countsAsObservation({ afterFix: false, wordbookOpenedBefore: true })).toBe(false);
  });

  it("a confirmed reading opens its chapter; other being largest or no change does not", () => {
    const base = { splitObservations: 2, previous: "hypothesis" as const };
    expect(confirmation({ ...base, weights: { a: 0.85, b: 0.05, other: 0.1 }, id: "a", noChange: false })).toEqual({
      status: "confirmed",
      startChapter: true,
      unexpressible: false,
    });
    expect(confirmation({ ...base, weights: { a: 0.85, other: 0.15 }, id: "a", noChange: true }).startChapter).toBe(false);
    expect(confirmation({ ...base, weights: { a: 0.3, b: 0.1, other: 0.6 }, id: "a", noChange: false })).toEqual({
      status: "hypothesis",
      startChapter: false,
      unexpressible: true,
    });
  });
});
