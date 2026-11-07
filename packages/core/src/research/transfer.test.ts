// The transfer problems at run time (指示書 第6.7節 手順6, Q48): after the child fixes the junior's reading, a
// problem the old reading fails on, in the same wording or in another known phrasing. Only when the child reads
// the other phrasing without the old reading is the fix kept as a reading that does not lean on the wording.
// Core decides all of it from the records and the child's world. Written before the implementation.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { acceptStored, withStored } from "../problems/stored.ts";
import { runRule } from "../rules/run.ts";
import type { ProblemRecord } from "../schema/problem-record.ts";
import { COMMON_FRACTION_READINGS } from "./common.ts";
import { readsBeyondWording, transferLinks, transferOptions } from "./transfer.ts";

const dir = new URL("../../../../content/problems/transfer/", import.meta.url);
const raws = readdirSync(dir)
  .filter((f) => /^p_.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")) as unknown);
const meta = JSON.parse(readFileSync(new URL("transfers.json", dir), "utf8")) as unknown;
const records = acceptStored(raws, "research");
const byId = (id: string): ProblemRecord => {
  const r = [...records, ...FRACTION_BANK].find((x) => x.world.problem_id === id);
  if (r === undefined) throw new Error(`no ${id}`);
  return r;
};
const reading = (id: string) => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error(`no ${id}`);
  return h;
};

describe("transferLinks", () => {
  it("links every stored transfer problem to the old reading it was written for", () => {
    const links = transferLinks(meta, records);
    expect(links.map((l) => l.problemId).sort()).toEqual(records.map((r) => r.world.problem_id).sort());
    expect(links.find((l) => l.problemId === "p_transfer_c_swap_different_1")?.oldReading.id).toBe("c_swap");
  });

  it("drops an entry with no record, a broken reading, or an old reading that builds the correct world there", () => {
    const m = {
      p_missing_1: { oldReading: reading("c_swap") },
      p_transfer_c_swap_same_1: { oldReading: { id: "x", clauses: "no" } },
      p_transfer_c_swap_different_1: { oldReading: reading("c_correct") },
      p_transfer_c_additive_same_1: { oldReading: reading("c_additive") },
    };
    expect(transferLinks(m, records).map((l) => l.problemId)).toEqual(["p_transfer_c_additive_same_1"]);
  });

  it("reads anything that is not a list of entries as no link", () => {
    for (const bad of [null, "x", 3, [], { a: 1 }]) expect(transferLinks(bad, records)).toEqual([]);
  });
});

describe("transferOptions", () => {
  const links = transferLinks(meta, records);
  const bank = withStored(FRACTION_BANK, records);
  const fixed = byId("p_fraction_c");

  it("the other phrasing first, then the same wording, both failing under the old reading", () => {
    const got = transferOptions({ fixed, oldReadingId: "c_swap", links, bank, done: [fixed.world.problem_id] });
    expect(got.map((o) => [o.record.world.problem_id, o.wording])).toEqual([
      ["p_transfer_c_swap_different_1", "different"],
      ["p_transfer_c_swap_same_1", "same"],
    ]);
    for (const o of got) expect(o.oldReading.id).toBe("c_swap");
  });

  it("leaves out a problem already done in the session, and one that is not in the route's bank", () => {
    const done = [fixed.world.problem_id, "p_transfer_c_swap_different_1"];
    expect(transferOptions({ fixed, oldReadingId: "c_swap", links, bank, done }).map((o) => o.record.world.problem_id)).toEqual(["p_transfer_c_swap_same_1"]);
    expect(transferOptions({ fixed, oldReadingId: "c_swap", links, bank: FRACTION_BANK, done: [] })).toEqual([]);
  });

  it("offers nothing for a reading no transfer problem was written for", () => {
    expect(transferOptions({ fixed, oldReadingId: "c_invert", links, bank, done: [] })).toEqual([]);
  });

  it("decides the wording against the problem the child fixed, not the one the problem was written for", () => {
    // A fixed text that already uses 「を1とみる」: the problem written in that phrasing is now the same wording.
    const moto = { ...fixed, world: { ...fixed.world, problem_text: "姉のリボンを1とみると、妹のリボンは3/4です。" } };
    const got = transferOptions({ fixed: moto, oldReadingId: "c_swap", links, bank, done: [] });
    expect(got.find((o) => o.record.world.problem_id === "p_transfer_c_swap_different_1")?.wording).toBe("same");
    expect(got.every((o) => o.wording !== "different" || o.record.world.problem_id !== "p_transfer_c_swap_different_1")).toBe(true);
  });
});

describe("readsBeyondWording", () => {
  const fixed = byId("p_fraction_c");
  const different = byId("p_transfer_c_swap_different_1");
  const same = byId("p_transfer_c_swap_same_1");
  const old = reading("c_swap");
  const ok = { fixed, record: different, oldReading: old, childWorld: different.world, solved: true, unaided: true };

  it("holds when the child reads the other phrasing as written, unaided, and solves it", () => {
    expect(readsBeyondWording(ok)).toBe(true);
  });

  it("does not hold when the child's world is the old reading's world, or there is none", () => {
    expect(readsBeyondWording({ ...ok, childWorld: runRule(old, different) })).toBe(false);
    expect(readsBeyondWording({ ...ok, childWorld: null })).toBe(false);
  });

  it("does not hold when the problem was not solved, or the word book showed its wording first", () => {
    expect(readsBeyondWording({ ...ok, solved: false })).toBe(false);
    expect(readsBeyondWording({ ...ok, unaided: false })).toBe(false);
  });

  it("does not hold on the same wording: that shows the fix, not that it is free of the wording", () => {
    expect(readsBeyondWording({ ...ok, record: same, childWorld: same.world })).toBe(false);
  });

  it("does not hold when the old reading would have built the correct world there too", () => {
    expect(readsBeyondWording({ ...ok, oldReading: reading("c_correct") })).toBe(false);
  });

  it("never throws on a world core cannot compare", () => {
    const broken = { ...different.world, relations: [] };
    expect(() => readsBeyondWording({ ...ok, childWorld: broken })).not.toThrow();
  });
});
