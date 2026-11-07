// The AI-free check (指示書 第7.3節, 第11節 M8; HANDOFF §3 F7): the child solves prepared problems with no
// junior and no drawing; the program judges. Written before the implementation.
import { describe, expect, it } from "vitest";
import { FRACTION_BANK, judgeAnswer, type ProblemRecord } from "@kimi/core";
import { CHECK_SIZE, judgeCheck, pickCheckProblems, scoreOf } from "./check.ts";

const ids = (rs: readonly ProblemRecord[]) => rs.map((r) => r.world.problem_id);

describe("choosing the check's problems", () => {
  it("gives three prepared problems from core's bank, all different", () => {
    const picked = pickCheckProblems(FRACTION_BANK, { flow: [], check: [] });
    expect(CHECK_SIZE).toBe(3);
    expect(picked).toHaveLength(3);
    expect(new Set(ids(picked)).size).toBe(3);
    for (const r of picked) expect(FRACTION_BANK).toContain(r);
  });

  it("prefers problems the child has not met with the junior", () => {
    const met = ids(FRACTION_BANK).slice(0, 6);
    const picked = pickCheckProblems(FRACTION_BANK, { flow: met, check: [] });
    for (const id of ids(picked)) expect(met).not.toContain(id);
  });

  it("then prefers problems not given in an earlier check", () => {
    const first = pickCheckProblems(FRACTION_BANK, { flow: [], check: [] });
    const second = pickCheckProblems(FRACTION_BANK, { flow: [], check: ids(first) });
    for (const id of ids(second)) expect(ids(first)).not.toContain(id);
  });

  it("mixes problems whose order follows the text and problems whose order does not (第7.3節)", () => {
    const picked = pickCheckProblems(FRACTION_BANK, { flow: [], check: [] });
    const kinds = new Set(picked.map((r) => r.consistency));
    expect(kinds).toEqual(new Set(["consistent", "inconsistent"]));
  });

  it("still gives three when the child has met every problem", () => {
    const picked = pickCheckProblems(FRACTION_BANK, { flow: ids(FRACTION_BANK), check: ids(FRACTION_BANK) });
    expect(picked).toHaveLength(3);
  });
});

describe("judging is core's judgeAnswer", () => {
  it("agrees with core on every bank problem, right and wrong", () => {
    for (const r of FRACTION_BANK) {
      const right = r.expected_answer as { num: number; den: number };
      expect(judgeCheck(r, right)).toBe(true);
      expect(judgeCheck(r, right)).toBe(judgeAnswer(r, right as never));
      const wrong = { num: right.num + 1, den: 1 };
      expect(judgeCheck(r, wrong)).toBe(false);
    }
  });
});

describe("the score for the grown-up", () => {
  it("counts the right answers over the problems given, a skipped problem counting as given", () => {
    expect(
      scoreOf([
        { problemId: "a", consistency: "consistent", outcome: "right" },
        { problemId: "b", consistency: "inconsistent", outcome: "not_right" },
        { problemId: "c", consistency: "consistent", outcome: "skipped" },
      ]),
    ).toEqual({ right: 1, total: 3 });
  });
});
