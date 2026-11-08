// The third problem of the child's route (Q63): a percent off, the shape of the national survey's discount problem
// that few children solved, made one item so it rides the same one-sentence steps (Q62). 「20%引き」 is read by core
// as 「代金は定価の4/5」: one part is the discount (160円) and the price is four parts (640円). Read the other way
// round (the price taken as the whole), the shirt costs 1000円 after its discount: more than before it.
import { describe, expect, it } from "vitest";
import { schemas, validateStatements, validateWorld } from "../schema/index.ts";
import { solve } from "../solve/index.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { problemConditions } from "../diagnose/index.ts";
import { runRule } from "../rules/run.ts";
import { COMMON_FRACTION_READINGS } from "../research/common.ts";
import { stepsOf } from "../steps/index.ts";
import { saleRecord } from "../../fixtures/problems/sale.ts";
import { PREPARED_BANK } from "./prepared.ts";

const r = saleRecord;

describe("the sale problem", () => {
  it("is a valid record with valid sentences that meets the conditions of a problem", () => {
    expect(() => schemas.problemRecord.parse(r)).not.toThrow();
    expect(validateWorld(r.world)).toEqual({ ok: true });
    expect(validateStatements(r.world, r.statements, r.syntax_marks)).toEqual({ ok: true });
    expect(problemConditions(r)).toEqual({ ok: true, failures: [] });
  });

  it("solves to 640, and its text is its sentences, with 20%引き written as it is said", () => {
    const res = solve(r.world);
    if (res.kind !== "unique" || r.expected_answer === null) throw new Error(res.kind);
    expect(eq(res.values.get(r.world.question.target_id) as never, fromSchema(r.expected_answer))).toBe(true);
    expect(r.expected_answer).toEqual({ num: 640, den: 1 });
    expect(r.world.problem_text).toBe(r.statements.map((s) => s.text).join(""));
    expect(r.world.problem_text).toContain("20%引き");
  });

  it("goes one sentence at a time: the price, who is the whole, one part is the discount, four parts are paid", () => {
    const steps = stepsOf(r);
    if (steps === null) throw new Error("no steps");
    expect(steps.map((s) => s.kind)).toEqual(["fact", "relation", "unit", "total"]);
    const [fact, relation, unit, total] = steps;
    expect(fact?.kind === "fact" && fact.value).toEqual({ num: 800, den: 1 });
    expect(relation?.kind === "relation" && relation.referenceHolderId).toBe("h_list");
    expect(unit?.kind === "unit" && [unit.parts, unit.value]).toEqual([5, { num: 160, den: 1 }]);
    expect(total?.kind === "total" && [total.parts, total.value]).toEqual([4, { num: 640, den: 1 }]);
  });

  it("read with the price as the whole, the shirt costs 1000円 after its discount", () => {
    const swap = COMMON_FRACTION_READINGS.find((h) => h.id === "c_swap");
    if (swap === undefined) throw new Error("no c_swap");
    const res = solve(runRule(swap, r));
    if (res.kind !== "unique") throw new Error(res.kind);
    const v = res.values.get(r.world.question.target_id) as { num: bigint | number; den: bigint | number };
    expect(`${String(v.num)}/${String(v.den)}`).toBe("1000/1");
  });

  it("comes third in the prepared bank, after the two festival stories", () => {
    expect(PREPARED_BANK[2]).toBe(r);
  });
});
