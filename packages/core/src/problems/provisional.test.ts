// The provisional problems of every type, a consistent and an inconsistent one each (指示書 第11節 M1,
// conditions of 第5.2節). The problem texts are written for this repository.
import { describe, expect, it } from "vitest";
import { schemas, validateWorld } from "../schema/index.ts";
import { solve } from "../solve/index.ts";
import { fromSchema, eq } from "../rational/index.ts";
import { problemConditions } from "../diagnose/index.ts";
import { PROVISIONAL, PROVISIONAL_TYPES } from "../../fixtures/problems/provisional.ts";

describe("provisional problems", () => {
  it("cover every type with a consistent and an inconsistent problem, paired", () => {
    for (const type of PROVISIONAL_TYPES) {
      const of = PROVISIONAL.filter((p) => p.type === type);
      expect(of.map((p) => p.record.consistency).sort()).toEqual(["consistent", "inconsistent"]);
      const [a, b] = of;
      expect(a?.record.pair_id).toBe(b?.record.world.problem_id);
      expect(b?.record.pair_id).toBe(a?.record.world.problem_id);
    }
  });

  it.each(PROVISIONAL.map((p) => [p.record.world.problem_id, p] as const))("%s is a valid record", (_id, p) => {
    expect(() => schemas.problemRecord.parse(p.record)).not.toThrow();
    expect(validateWorld(p.record.world)).toEqual({ ok: true });
  });

  it.each(PROVISIONAL.map((p) => [p.record.world.problem_id, p] as const))("%s solves to its prepared answer", (_id, p) => {
    const res = solve(p.record.world);
    expect(res.kind).toBe("unique");
    if (res.kind !== "unique" || p.record.expected_answer === null) throw new Error("no answer");
    const v = res.values.get(p.record.world.question.target_id);
    expect(v !== undefined && eq(v, fromSchema(p.record.expected_answer))).toBe(true);
  });

  it.each(PROVISIONAL.map((p) => [p.record.world.problem_id, p] as const))("%s meets the conditions of a problem", (_id, p) => {
    expect(problemConditions(p.record)).toEqual({ ok: true, failures: [] });
  });

  it("the numbers of each world are written in its problem text", () => {
    for (const p of PROVISIONAL) {
      const w = p.record.world;
      for (const q of w.quantities) if (q.value !== null) expect(w.problem_text).toContain(String(q.value.num));
    }
  });
});
