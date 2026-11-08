// The first problem of the child's route (Q60): a story at a summer festival, with the child (a placeholder name the
// screen replaces with the child's own) and AIくん as the two holders. It is the same structure as the signboard
// (the known count is 3/4 of the asked one), so the common readings build the worlds the demo shows.
import { describe, expect, it } from "vitest";
import { schemas, validateStatements, validateWorld } from "../schema/index.ts";
import { solve } from "../solve/index.ts";
import { eq, fromSchema } from "../rational/index.ts";
import { problemConditions } from "../diagnose/index.ts";
import { runRule } from "../rules/run.ts";
import { COMMON_FRACTION_READINGS } from "../research/common.ts";
import { FESTIVAL_PLACEHOLDER, festivalRecord } from "../../fixtures/problems/festival.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { PREPARED_BANK } from "./prepared.ts";

const r = festivalRecord;

describe("the festival problem", () => {
  it("is a valid record with valid sentences that meets the conditions of a problem", () => {
    expect(() => schemas.problemRecord.parse(r)).not.toThrow();
    expect(validateWorld(r.world)).toEqual({ ok: true });
    expect(validateStatements(r.world, r.statements, r.syntax_marks)).toEqual({ ok: true });
    expect(problemConditions(r)).toEqual({ ok: true, failures: [] });
  });

  it("solves to 8, and its text is its three sentences", () => {
    const res = solve(r.world);
    if (res.kind !== "unique" || r.expected_answer === null) throw new Error(res.kind);
    expect(eq(res.values.get(r.world.question.target_id) as never, fromSchema(r.expected_answer))).toBe(true);
    expect(r.expected_answer).toEqual({ num: 8, den: 1 });
    expect(r.world.problem_text).toBe(r.statements.map((s) => s.text).join(""));
  });

  it("is a story: a festival, scooping, the placeholder child and AIくん", () => {
    expect(r.world.problem_text).toContain("なつまつり");
    expect(r.world.problem_text).toContain("金魚すくい");
    expect(r.world.holders.map((h) => h.label)).toEqual([FESTIVAL_PLACEHOLDER, "AIくん"]);
    // The placeholder never says きみ or あなた (the junior's gates refuse 「きみの」 as attribution).
    expect(FESTIVAL_PLACEHOLDER).not.toMatch(/きみ|君|あなた/);
  });

  it("read as 6 x 3/4, AIくん scoops 4 and a half goldfish; read as a difference, 9", () => {
    const valueOf = (id: string): string => {
      const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
      if (h === undefined) throw new Error(id);
      const w = runRule(h, r);
      const res = solve(w);
      if (res.kind !== "unique") throw new Error(res.kind);
      const v = res.values.get(r.world.question.target_id) as { num: bigint | number; den: bigint | number };
      return `${String(v.num)}/${String(v.den)}`;
    };
    expect(COMMON_FRACTION_READINGS.map((h) => h.id)).toEqual(expect.arrayContaining(["c_known_whole", "c_additive"]));
    expect(valueOf("c_known_whole")).toBe("9/2");
    expect(valueOf("c_additive")).toBe("9/1");
  });

  it("comes first in the prepared bank, before the locked fraction bank", () => {
    expect(PREPARED_BANK[0]).toBe(r);
    expect(PREPARED_BANK.slice(1)).toEqual(FRACTION_BANK);
  });
});
