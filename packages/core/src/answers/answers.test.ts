// The child's numbers judged in core (原則3, 指示書 第7.1節 the size of one segment and the total).
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { judgeAnswer, judgeUnitValue } from "./index.ts";

const bank = (id: string) => {
  const r = FRACTION_BANK.find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(id);
  return r;
};
const n = (num: number, den = 1) => ({ num, den });

describe("judgeUnitValue and judgeAnswer", () => {
  it("the signboard: one segment of the younger brother's 8 cut in 4 is 2, the answer is 8", () => {
    const r = bank("p_signboard");
    expect(judgeUnitValue(r, n(2))).toBe(true);
    expect(judgeUnitValue(r, n(3))).toBe(false);
    expect(judgeAnswer(r, n(8))).toBe(true);
    expect(judgeAnswer(r, n(9, 2))).toBe(false);
  });

  it("a multiple above 1: 8 fish cut in 4 is 2, the father caught 10", () => {
    const r = bank("p_bank_fish_more");
    expect(judgeUnitValue(r, n(2))).toBe(true);
    expect(judgeAnswer(r, n(10))).toBe(true);
    expect(judgeAnswer(r, n(6))).toBe(false);
  });

  it("every bank problem's prepared answer is judged right", () => {
    for (const r of FRACTION_BANK) expect(judgeAnswer(r, r.expected_answer as never), r.world.problem_id).toBe(true);
  });
});
