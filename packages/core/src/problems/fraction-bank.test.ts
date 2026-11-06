// The bank of prepared fraction-as-a-multiple problems (指示書 第6.7節 手順3): each is a valid problem, and
// together they tell the common readings apart, so the research layer has something to choose from.
import { describe, expect, it } from "vitest";
import { schemas, validateStatements, validateWorld } from "../schema/index.ts";
import { solve } from "../solve/index.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { problemConditions } from "../diagnose/index.ts";
import { predict } from "../rules/predict.ts";
import { groupHypotheses } from "../rules/score.ts";
import { COMMON_FRACTION_READINGS } from "../research/common.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";

const cases = FRACTION_BANK.map((r) => [r.world.problem_id, r] as const);

describe("the fraction bank", () => {
  it("has the signboard pair and at least seven more, with distinct ids", () => {
    const ids = FRACTION_BANK.map((r) => r.world.problem_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("p_signboard");
    expect(ids.length).toBeGreaterThanOrEqual(9);
  });

  it.each(cases)("%s is a valid record with valid sentences", (_id, r) => {
    expect(() => schemas.problemRecord.parse(r)).not.toThrow();
    expect(validateWorld(r.world)).toEqual({ ok: true });
    expect(validateStatements(r.world, r.statements, r.syntax_marks)).toEqual({ ok: true });
  });

  it.each(cases)("%s solves to its prepared answer and meets the conditions of a problem", (_id, r) => {
    const res = solve(r.world);
    if (res.kind !== "unique" || r.expected_answer === null) throw new Error(`${res.kind}`);
    expect(eq(res.values.get(r.world.question.target_id) as never, fromSchema(r.expected_answer))).toBe(true);
    expect(problemConditions(r)).toEqual({ ok: true, failures: [] });
  });

  it("no two common readings build the same world on every bank problem", () => {
    const groups = groupHypotheses(COMMON_FRACTION_READINGS, FRACTION_BANK);
    expect(groups.map((g) => g.map((h) => h.id))).toEqual(COMMON_FRACTION_READINGS.map((h) => [h.id]));
  });

  it("every common misreading is told apart from the correct reading on some bank problem", () => {
    for (const h of COMMON_FRACTION_READINGS.slice(1)) {
      const split = FRACTION_BANK.some((r) => {
        const pred = predict([COMMON_FRACTION_READINGS[0] as never, h], r, true);
        return pred.predictions[0]?.worldClass !== pred.predictions[1]?.worldClass;
      });
      expect(split, h.id).toBe(true);
    }
  });
});
