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

import { saleRecord } from "../../fixtures/problems/sale.ts";
import { dealAttempt, dealLine, dealStatus } from "./deal.ts";
import { percentOff } from "./index.ts";

describe("plate numbers that are one part or the answer (safety review, 2026-11-08)", () => {
  it("are not given before the plates are all the same, and are given once they are", () => {
    // festival 1: 8 into 4, one part 2, the answer 6. A child's 3 deals [3,3,2,0]: the last plate's 2 is one part.
    const rec = festivalWholeRecord;
    const { fact, unit } = kinds(rec);
    if (fact === undefined || unit === undefined) throw new Error("no steps");
    const a = dealAttempt(rec, unit, fact, r(3));
    if (a === null) throw new Error("no deal");
    expect(a.plates).toEqual([3, 3, 2, 0]);
    const s = dealStatus(a.plates, a.total, a.worth, a.left, a.hidden);
    expect(s.plates.map((p) => p.value)).toEqual([3, 3, null, 0]);
    expect(s.plates[2]?.fraction).toBeNull();
    const done = dealStatus([2, 2, 2, 2], a.total, a.worth, 0, a.hidden);
    expect(done.equal).toBe(true);
    expect(done.plates.map((p) => p.value)).toEqual([2, 2, 2, 2]);
    expect(done.plates[0]?.fraction).toEqual({ num: 2, den: 8 });
  });

  it("the sale problem: 200円 (one part) on a plate is hidden; 800円 is the child's own number, so it is given", () => {
    const { fact, unit } = kinds(saleRecord as never);
    if (fact === undefined || unit === undefined) throw new Error("no steps");
    const a = dealAttempt(saleRecord, unit, fact, r(800));
    if (a === null) throw new Error("no deal");
    const s = dealStatus(a.plates, a.total, a.worth, a.left, a.hidden);
    expect(s.plates.map((p) => p.value)).toEqual([800, null, 0, 0, 0]);
    expect(s.totalValue).toBe(1000);
  });
});

describe("dealAttempt refuses what cannot be dealt as things", () => {
  it("0, a negative number, a fraction, a number that is not whole coins, and one part itself", () => {
    const rec = festivalWholeRecord;
    const { fact, unit } = kinds(rec);
    if (fact === undefined || unit === undefined) throw new Error("no steps");
    for (const v of [{ num: 0, den: 1 }, { num: -2, den: 1 }, { num: 3, den: 2 }, unit.value]) expect(dealAttempt(rec, unit, fact, v)).toBeNull();
    const sale = kinds(saleRecord as never);
    if (sale.fact === undefined || sale.unit === undefined) throw new Error("no steps");
    expect(dealAttempt(saleRecord, sale.unit, sale.fact, r(150))).toBeNull();
  });

  it("deals too many (the plates run out) and too few (things are left)", () => {
    const rec = festivalWholeRecord;
    const { fact, unit } = kinds(rec);
    if (fact === undefined || unit === undefined) throw new Error("no steps");
    expect(dealAttempt(rec, unit, fact, r(4))?.kind).toBe("over");
    const under = dealAttempt(rec, unit, fact, r(1));
    expect(under?.kind).toBe("under");
    expect(under?.left).toBe(4);
  });
});

describe("AI-kun's deal lines", () => {
  it("never say one part or the answer, and fall back to fewer numbers", () => {
    for (const rec of [festivalWholeRecord, festivalRecord]) {
      const { fact, unit, total } = kinds(rec);
      if (fact === undefined || unit === undefined || total === undefined) throw new Error("no steps");
      for (const tried of [1, 3, 4, 5, 6]) {
        const a = dealAttempt(rec, unit, fact, r(tried));
        if (a === null) continue;
        const line = dealLine(rec, a, r(tried), "ja");
        expect(line).not.toBeNull();
        for (const n of [unit.value, total.value]) expect(line ?? "").not.toMatch(new RegExp(`(^|[^0-9])${String(n.num)}(${a.unitCounter}|ずつ)`));
      }
    }
  });
});

describe("percentOff", () => {
  it("reads 20%引き as 4 of 5 parts kept", () => {
    const steps = stepsOf(saleRecord) ?? [];
    const rel = steps.find((s): s is Extract<Step, { kind: "relation" }> => s.kind === "relation");
    if (rel === undefined) throw new Error("no relation");
    expect(percentOff(saleRecord, rel)).toEqual({ percent: 20, parts: 5, kept: 4 });
  });

  it("is null for a problem with no percent", () => {
    const steps = stepsOf(festivalWholeRecord) ?? [];
    const rel = steps.find((s): s is Extract<Step, { kind: "relation" }> => s.kind === "relation");
    if (rel === undefined) throw new Error("no relation");
    expect(percentOff(festivalWholeRecord, rel)).toBeNull();
  });
});
