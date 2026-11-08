// One part before any answer, and the answer step dealt at the child's number (user request, 2026-11-08 夜).
import { describe, expect, it } from "vitest";
import { festivalWholeRecord, festivalRecord } from "../../fixtures/problems/festival.ts";
import { dealStart, dealStartLine, dealTotal, dealTotalLine } from "./deal.ts";
import { stepsOf, type Step } from "./index.ts";

const r = (num: number) => ({ num, den: 1 });
const kinds = (rec: typeof festivalWholeRecord) => {
  const steps = stepsOf(rec) ?? [];
  const pick = <K extends Step["kind"]>(k: K) => steps.find((s): s is Extract<Step, { kind: K }> => s.kind === k);
  return { fact: pick("fact"), unit: pick("unit"), total: pick("total") };
};

describe("dealStart", () => {
  it("puts every known thing in the pool and leaves the parts' plates empty", () => {
    for (const rec of [festivalWholeRecord, festivalRecord]) {
      const { fact, unit } = kinds(rec);
      if (fact === undefined || unit === undefined) throw new Error("no steps");
      const a = dealStart(rec, unit, fact);
      expect(a?.kind).toBe("start");
      expect(a?.plates).toEqual(Array.from({ length: unit.parts }, () => 0));
      expect(a?.left).toBe(a?.total);
      if (a !== null) expect(dealStartLine(rec, a, "ja")).toContain("くばってみよう");
    }
  });
});

describe("dealTotal", () => {
  it("deals one part per plate at the child's wrong number, and never names the answer", () => {
    const rec = festivalRecord;
    const { unit, total } = kinds(rec);
    if (unit === undefined || total === undefined) throw new Error("no steps");
    const answer = Number(total.value.num) / Number(total.value.den);
    const wrong = answer - Number(unit.value.num);
    const a = dealTotal(rec, total, unit.value, r(wrong));
    expect(a?.kind).toBe("over");
    expect(a?.plates.filter((x) => x === 0).length).toBe(1);
    expect(dealTotal(rec, total, unit.value, total.value)).toBeNull();
    if (a !== null) expect(dealTotalLine(rec, a, unit.value, r(wrong), "ja")).not.toContain(String(answer));
  });
});
