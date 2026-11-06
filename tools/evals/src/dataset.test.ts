// Eval data rows in JSONL (指示書 第10.1節): each row names where it came from; ids are unique.
// All transcripts here are invented for the tests.
import { describe, expect, it } from "vitest";
import { interpretRow, loadJsonl, safetyRow } from "./dataset.ts";

const op = { op: "state_procedure", target_id: "q_otouto", operands: [{ quantity_id: "q_ani" }, { num: 3, den: 4 }], operation: "multiply", evidence: "" };

const iRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  problem_id: "p_signboard",
  split: "tune",
  kind: "times_means_multiply",
  lang: "ja",
  transcript: "6に3/4をかける",
  expected_ops: [op],
  source: "author",
  ...extra,
});

const sRow = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  split: "test",
  lang: "ja",
  transcript: "もうやめたい",
  expected: "distress",
  style: "direct",
  source: "third_party",
  ...extra,
});

const jsonl = (...rows: unknown[]) => rows.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");

describe("interpretRow", () => {
  it("accepts every kind, split and source", () => {
    const kinds = ["plain", "direction_swap", "times_means_multiply", "reference_swap", "consistent_rule", "hesitation", "l1_mix"];
    for (const kind of kinds) expect(interpretRow.safeParse(iRow("a", { kind })).success).toBe(true);
    for (const split of ["tune", "test"]) expect(interpretRow.safeParse(iRow("a", { split })).success).toBe(true);
    for (const source of ["author", "third_party", "ai_draft"]) expect(interpretRow.safeParse(iRow("a", { source })).success).toBe(true);
    expect(interpretRow.safeParse(iRow("a", { lang: "en", note: "a note" })).success).toBe(true);
  });

  it("rejects unknown values, a missing source and ops that are not interpretation ops", () => {
    expect(interpretRow.safeParse(iRow("a", { kind: "other" })).success).toBe(false);
    expect(interpretRow.safeParse(iRow("a", { split: "train" })).success).toBe(false);
    expect(interpretRow.safeParse(iRow("a", { source: "claude" })).success).toBe(false);
    expect(interpretRow.safeParse(iRow("a", { lang: "fr" })).success).toBe(false);
    expect(interpretRow.safeParse(iRow("a", { expected_ops: [{ op: "guess", target_id: "q_otouto" }] })).success).toBe(false);
    const noSource: Record<string, unknown> = iRow("a");
    delete noSource.source;
    expect(interpretRow.safeParse(noSource).success).toBe(false);
  });

  it("accepts an empty expected_ops (a row where nothing should be heard)", () => {
    expect(interpretRow.safeParse(iRow("a", { expected_ops: [] })).success).toBe(true);
  });
});

describe("safetyRow", () => {
  it("accepts every expected flag and style", () => {
    for (const expected of ["none", "distress", "inappropriate"]) expect(safetyRow.safeParse(sRow("s", { expected })).success).toBe(true);
    for (const style of ["direct", "indirect", "l1", "plain"]) expect(safetyRow.safeParse(sRow("s", { style })).success).toBe(true);
  });

  it("rejects unknown values and a missing source", () => {
    expect(safetyRow.safeParse(sRow("s", { expected: "sad" })).success).toBe(false);
    expect(safetyRow.safeParse(sRow("s", { style: "loud" })).success).toBe(false);
    const noSource: Record<string, unknown> = sRow("s");
    delete noSource.source;
    expect(safetyRow.safeParse(noSource).success).toBe(false);
  });
});

describe("loadJsonl", () => {
  it("reads one row per line with either schema", () => {
    const rows = loadJsonl(jsonl(iRow("a"), iRow("b", { split: "test" })), interpretRow);
    expect(rows.map((x) => x.id)).toEqual(["a", "b"]);
    expect(rows[1]?.split).toBe("test");
    expect(loadJsonl(jsonl(sRow("s1"), sRow("s2")), safetyRow).map((x) => x.expected)).toEqual(["distress", "distress"]);
  });

  it("skips blank lines, including a trailing newline and whitespace-only lines", () => {
    const text = `${jsonl(iRow("a"), "", "   ", iRow("b"))}\n`;
    expect(loadJsonl(text, interpretRow).map((x) => x.id)).toEqual(["a", "b"]);
    expect(loadJsonl("", interpretRow)).toEqual([]);
  });

  it("names the line of a row that fails the schema, counting blank lines", () => {
    const text = jsonl(iRow("a"), "", iRow("b", { kind: "other" }));
    expect(() => loadJsonl(text, interpretRow)).toThrow(/line 3\b/);
  });

  it("names the line of a row that is not JSON", () => {
    const text = jsonl(sRow("s1"), "{not json");
    expect(() => loadJsonl(text, safetyRow)).toThrow(/line 2\b/);
  });

  it("rejects a duplicate id and names it and its line", () => {
    const text = jsonl(iRow("row-dup"), iRow("b"), iRow("row-dup"));
    expect(() => loadJsonl(text, interpretRow)).toThrow(/duplicate/i);
    expect(() => loadJsonl(text, interpretRow)).toThrow(/row-dup/);
    expect(() => loadJsonl(text, interpretRow)).toThrow(/line 3\b/);
  });
});
