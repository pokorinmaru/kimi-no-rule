// The judging problems of the research eval (指示書 第10.2節, addendum 5): a small set apart from the bank,
// each a valid problem by core, together telling the common readings apart, so "recovered" can be decided on
// problems the researcher never picks from.
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, groupHypotheses, problemConditions, schemas, solve, validateStatements, validateWorld } from "@kimi/core";
import { JUDGE_PROBLEMS } from "./judge-problems.ts";

const cases = JUDGE_PROBLEMS.map((r) => [r.world.problem_id, r] as const);

describe("the judging problems", () => {
  it("are about eight fraction-as-a-multiple problems with distinct ids, none of them in the bank", () => {
    const ids = JUDGE_PROBLEMS.map((r) => r.world.problem_id);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(ids.length).toBeLessThanOrEqual(12);
    expect(new Set(ids).size).toBe(ids.length);
    const bankIds = new Set(FRACTION_BANK.map((r) => r.world.problem_id));
    const bankTexts = new Set(FRACTION_BANK.map((r) => r.world.problem_text));
    for (const r of JUDGE_PROBLEMS) {
      expect(bankIds.has(r.world.problem_id), r.world.problem_id).toBe(false);
      expect(bankTexts.has(r.world.problem_text), r.world.problem_id).toBe(false);
    }
  });

  it.each(cases)("%s is a valid record with valid sentences", (_id, r) => {
    expect(() => schemas.problemRecord.parse(r)).not.toThrow();
    expect(validateWorld(r.world)).toEqual({ ok: true });
    expect(validateStatements(r.world, r.statements, r.syntax_marks)).toEqual({ ok: true });
  });

  it.each(cases)("%s solves to its answer and meets the conditions of a problem", (_id, r) => {
    const res = solve(r.world);
    if (res.kind !== "unique" || r.expected_answer === null) throw new Error(res.kind);
    const v = res.values.get(r.world.question.target_id);
    expect(v === undefined ? null : { num: Number(v.num), den: Number(v.den) }).toEqual(r.expected_answer);
    expect(problemConditions(r)).toEqual({ ok: true, failures: [] });
  });

  it("have both multiples below and above 1, a unit fraction, and both consistencies", () => {
    const amounts = JUDGE_PROBLEMS.map((r) => r.world.relations[0]?.amount);
    expect(amounts.some((a) => a !== undefined && a !== null && a.num > a.den)).toBe(true);
    expect(amounts.some((a) => a !== undefined && a !== null && a.num < a.den)).toBe(true);
    expect(amounts.some((a) => a !== undefined && a !== null && a.num === 1)).toBe(true);
    expect(new Set(JUDGE_PROBLEMS.map((r) => r.consistency))).toEqual(new Set(["consistent", "inconsistent"]));
  });

  it("no two common readings build the same world on every judging problem", () => {
    const groups = groupHypotheses(COMMON_FRACTION_READINGS, JUDGE_PROBLEMS);
    expect(groups.map((g) => g.map((h) => h.id))).toEqual(COMMON_FRACTION_READINGS.map((h) => [h.id]));
  });

  it("wait for a person's check, like the bank", () => {
    for (const r of JUDGE_PROBLEMS) expect(r.checks.human_checked).toBe(false);
  });
});
