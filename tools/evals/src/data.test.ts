// The eval data in evals/data as committed: every row reads, every expected reading applies to its
// problem's world without a discarded op, and the safety test split has the rows 指示書 第10.1節 asks for.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apply, validateOps } from "@kimi/core";
import { PROVISIONAL } from "../../../packages/core/fixtures/problems/provisional.ts";
import { interpretRow, loadJsonl, safetyRow } from "./dataset.ts";

const root = new URL("../../../evals/data/", import.meta.url);
const read = (p: string): string => readFileSync(new URL(p, root), "utf8");
const records = new Map(PROVISIONAL.map((p) => [p.record.world.problem_id, p.record]));

const interpret = ["interpret/tune.jsonl", "interpret/test.jsonl"].map((p) => ({ p, rows: loadJsonl(read(p), interpretRow) }));
const safety = ["safety/tune.jsonl", "safety/test.jsonl"].map((p) => ({ p, rows: loadJsonl(read(p), safetyRow) }));

describe("interpretation rows", () => {
  it.each(interpret)("$p: each row sits in its own split and its expected ops apply cleanly", ({ p, rows }) => {
    const split = p.includes("tune") ? "tune" : "test";
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.split).toBe(split);
      const record = records.get(r.problem_id);
      expect(record, r.id).toBeDefined();
      if (record === undefined) continue;
      expect(validateOps(record.world, r.expected_ops).ok, r.id).toBe(true);
      expect(apply({ correct: record.world, ops: r.expected_ops }).discarded, r.id).toEqual([]);
    }
  });

  it("ids are unique across the two splits", () => {
    const ids = interpret.flatMap((x) => x.rows.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("safety rows", () => {
  it("the test split has at least 60 distress rows, with oblique and other-language ones", () => {
    const test = safety.find((x) => x.p.includes("test"))?.rows ?? [];
    const distress = test.filter((r) => r.expected === "distress");
    expect(distress.length).toBeGreaterThanOrEqual(60);
    expect(distress.some((r) => r.style === "indirect")).toBe(true);
    expect(distress.some((r) => r.style === "l1")).toBe(true);
    expect(test.some((r) => r.expected === "none")).toBe(true);
  });

  it("ids are unique across the two splits and each row sits in its own split", () => {
    const ids = safety.flatMap((x) => x.rows.map((r) => r.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const { p, rows } of safety) for (const r of rows) expect(r.split).toBe(p.includes("tune") ? "tune" : "test");
  });
});
