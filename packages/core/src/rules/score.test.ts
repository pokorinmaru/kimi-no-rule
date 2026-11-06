// M1 step (7): whether a rule reproduces the first reading of a child, and grouping the rules that
// make the same reading (指示書 第5.8節, 第6.7節, 第11節 M1). Written before the implementation.
import { describe, expect, it } from "vitest";
import { num, op } from "../apply/test-worlds.ts";
import { signboardRecord } from "../../fixtures/problems/signboard-record.ts";
import { eventRecord, timesRecord } from "../diagnose/test-records.ts";
import { groupHypotheses, reproduction, scoreRule } from "./score.ts";
import { act, always, clause, H, hyp, observe, p, twoRelationRecord, wordRecord } from "./test-rules.ts";

const signboard = () => structuredClone(signboardRecord);
const additiveOps = () => [op.setRelationOperator("r_ratio", "less_by"), op.setRelationAmount("r_ratio", num(3))];
const ids = (groups: { id: string }[][]) => groups.map((g) => g.map((h) => h.id));

describe("reproduction: what is not counted", () => {
  it("a number said alone is neither reproduced nor missed", () => {
    const obs = observe(signboard(), [op.answer("q_otouto", num(9))]);
    expect(reproduction(H.additive(), obs)).toBe("not_applicable");
    expect(reproduction(H.noChange(), obs)).toBe("not_applicable");
  });

  it("a reading that touches no relation or event is not counted", () => {
    expect(reproduction(H.additive(), observe(signboard(), []))).toBe("not_applicable");
    expect(reproduction(H.additive(), observe(signboard(), [op.wordCue(1, [9])]))).toBe("not_applicable");
  });
});

describe("reproduction on the signboard", () => {
  it("the difference reading is reproduced by the additive rule and missed by the others", () => {
    const obs = observe(signboard(), additiveOps());
    expect(reproduction(H.additive(), obs)).toBe("reproduced");
    expect(reproduction(H.swap(), obs)).toBe("missed");
    expect(reproduction(H.noChange(), obs)).toBe("missed");
  });

  it("a swapped base is reproduced by an inverted multiple only when the 1 card was not placed", () => {
    const loose = observe(signboard(), [op.swap("r_ratio")], false);
    expect(reproduction(H.swap(), loose)).toBe("reproduced");
    expect(reproduction(H.invert(), loose)).toBe("reproduced");
    const placed = observe(signboard(), [op.swap("r_ratio")], true);
    expect(reproduction(H.swap(), placed)).toBe("reproduced");
    expect(reproduction(H.multiplyAlways(), placed)).toBe("reproduced");
    expect(reproduction(H.invert(), placed)).toBe("missed");
  });

  it("the correct reading with the 1 card is reproduced by doing nothing", () => {
    const obs = observe(signboard(), [op.setReference("r_ratio", "q_otouto")], true);
    expect(reproduction(H.noChange(), obs)).toBe("reproduced");
    expect(reproduction(H.swap(), obs)).toBe("missed");
  });
});

describe("reproduction compares only what the first reading touched", () => {
  it("a rule that also changes an untouched relation still reproduces", () => {
    // The child swaps r_1 only; r_2 is not part of the reading.
    const obs = observe(twoRelationRecord(), [op.swap("r_1")]);
    const onlyFirst = hyp("h_first", [clause(p("word_in_statement", "b"), act.swap())]);
    const onlySecond = hyp("h_second", [clause(p("word_in_statement", "c"), act.swap())]);
    expect(reproduction(H.swap(), obs)).toBe("reproduced");
    expect(reproduction(onlyFirst, obs)).toBe("reproduced");
    expect(reproduction(onlySecond, obs)).toBe("missed");
    expect(reproduction(H.noChange(), obs)).toBe("missed");
  });

  it("an untouched relation that the rule leaves alone does not make it a miss either", () => {
    const obs = observe(twoRelationRecord(), [op.swap("r_2")]);
    const onlySecond = hyp("h_second", [clause(p("word_in_statement", "c"), act.swap())]);
    expect(reproduction(onlySecond, obs)).toBe("reproduced");
    expect(reproduction(H.swap(), obs)).toBe("reproduced");
  });

  it("events are compared the same way", () => {
    const obs = observe(eventRecord(), [op.setEventType("e_1", "lose")]);
    expect(reproduction(H.flipEvent(), obs)).toBe("reproduced");
    expect(reproduction(H.noChange(), obs)).toBe("missed");
  });
});

describe("scoreRule", () => {
  it("counts each kind of result over the observations", () => {
    const observations = [
      observe(signboard(), additiveOps()),
      observe(signboard(), [op.swap("r_ratio")], true),
      observe(signboard(), [op.answer("q_otouto", num(9))]),
      observe(wordRecord(), [op.setRelationOperator("r_1", "more_by"), op.setRelationAmount("r_1", num(3))]),
    ];
    expect(scoreRule(H.additive(), observations)).toEqual({ reproduced: 2, missed: 1, notApplicable: 1 });
    expect(scoreRule(H.swap(), observations)).toEqual({ reproduced: 1, missed: 2, notApplicable: 1 });
  });

  it("no observations, nothing counted", () => {
    expect(scoreRule(H.additive(), [])).toEqual({ reproduced: 0, missed: 0, notApplicable: 0 });
  });
});

describe("groupHypotheses", () => {
  it("on the signboard, swapping the base and multiplying what is given are one group", () => {
    const hs = [H.swap(), H.invert(), H.multiplyAlways(), H.additive(), H.noChange(), H.chooseKnown()];
    expect(ids(groupHypotheses(hs, [signboard()]))).toEqual([
      ["h_swap", "h_multiply", "h_choose_known"],
      ["h_invert"],
      ["h_additive"],
      ["h_no_change"],
    ]);
  });

  it("a group holds only when the worlds agree on every record", () => {
    // On the multiple a = 3 b, multiplying always changes nothing while swapping does.
    const hs = [H.swap(), H.multiplyAlways(), H.noChange()];
    expect(ids(groupHypotheses(hs, [signboard(), timesRecord()]))).toEqual([["h_swap"], ["h_multiply"], ["h_no_change"]]);
    expect(ids(groupHypotheses(hs, [timesRecord()]))).toEqual([["h_swap"], ["h_multiply", "h_no_change"]]);
  });

  it("differently written rules for the same reading are grouped, the first one leads", () => {
    const a = always("h_a", act.swap());
    const b = hyp("h_b", [clause(p("relation_operator_is", "fraction_of"), act.swap())]);
    const c = always("h_c", act.chooseBy("known_value"));
    const groups = groupHypotheses([b, a, c], [signboard()]);
    expect(ids(groups)).toEqual([["h_b", "h_a", "h_c"]]);
    expect(groups[0]?.[0]?.id).toBe("h_b");
  });

  it("each hypothesis is in exactly one group", () => {
    const hs = [H.swap(), H.invert(), H.multiplyAlways(), H.additive(), H.noChange(), H.divideAlways()];
    const flat = ids(groupHypotheses(hs, [signboard(), wordRecord()])).flat();
    expect([...flat].sort()).toEqual(hs.map((h) => h.id).sort());
  });
});
