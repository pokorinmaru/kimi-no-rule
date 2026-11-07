// The grown-up's trend across days (指示書 第7.4節): per date, how many problems were solved and kept for later,
// how many times the junior's world was fixed, and which reading became the way of reading for now, went
// back to a guess, or left the pool. Only from the records the device keeps. Problems ended by "stop",
// "it's hard" or a rest are not counted (the child chooses what the grown-up sees of those). Written before
// the implementation.
import { describe, expect, it } from "vitest";
import type { AttemptRow, ResearchLogRow } from "../store/store.ts";
import { trendOf } from "./trend.ts";

const attempt = (at: string, outcome: AttemptRow["outcome"], fixes = 0): AttemptRow => ({
  at,
  problemId: "p_bank_card",
  consistency: "consistent",
  source: "competitor",
  readingId: "c_swap",
  firstPlacement: null,
  interpretation: { schema_version: "6", utterance_lang: "ja", representable: "full", ops: [], unclear: [], phrases: [] },
  fixes,
  unitTries: 0,
  totalTries: 0,
  outcome,
});
const line = (id: string) => ({ ja: `${id}の読み方`, en: `reading ${id}` });
const snap = (at: string, pool: [string, "hypothesis" | "confirmed"][], unsettled = false): ResearchLogRow => ({
  at,
  pool: pool.map(([id, status]) => ({ id, status, line: line(id) })),
  unsettled,
});
// The tests give dates with the time zone already applied; the day is the first ten letters.
const dayOf = (at: string): string => at.slice(0, 10);

describe("trendOf", () => {
  it("is empty with no records", () => {
    expect(trendOf([], [], "ja", dayOf)).toEqual([]);
  });

  it("counts solved and held problems and the fixes per day, oldest day first, and leaves out stopped, hard and rest", () => {
    const days = trendOf(
      [
        attempt("2026-11-06T10:00", "solved", 2),
        attempt("2026-11-06T10:05", "held", 1),
        attempt("2026-11-06T10:09", "hard", 3),
        attempt("2026-11-06T10:10", "stopped", 4),
        attempt("2026-11-07T09:00", "solved", 0),
        attempt("2026-11-07T09:05", "rest", 5),
      ],
      [],
      "ja",
      dayOf,
    );
    expect(days.map((d) => [d.date, d.solved, d.held, d.fixes])).toEqual([
      ["2026-11-06", 1, 1, 3],
      ["2026-11-07", 1, 0, 0],
    ]);
  });

  it("names the readings that became the way of reading for now, went back to a guess, or left, in the screen's language", () => {
    const log = [
      snap("2026-11-05T10:00", [["a", "hypothesis"], ["b", "hypothesis"]]),
      snap("2026-11-05T10:10", [["a", "confirmed"], ["b", "hypothesis"]]),
      snap("2026-11-07T09:00", [["a", "hypothesis"]]),
      snap("2026-11-07T09:10", [["c", "confirmed"]]),
    ];
    const ja = trendOf([], log, "ja", dayOf);
    expect(ja).toEqual([
      { date: "2026-11-05", solved: 0, held: 0, fixes: 0, settled: ["aの読み方"], backToGuess: [], dropped: [] },
      { date: "2026-11-07", solved: 0, held: 0, fixes: 0, settled: ["cの読み方"], backToGuess: ["aの読み方"], dropped: ["bの読み方", "aの読み方"] },
    ]);
    expect(trendOf([], log, "en", dayOf)[0]?.settled).toEqual(["reading a"]);
  });

  it("a reading that settles and goes back on the same day shows both, once each", () => {
    const log = [snap("2026-11-07T09:00", [["a", "confirmed"]]), snap("2026-11-07T09:05", [["a", "hypothesis"]]), snap("2026-11-07T09:10", [["a", "confirmed"]])];
    const [d] = trendOf([], log, "ja", dayOf);
    expect(d?.settled).toEqual(["aの読み方"]);
    expect(d?.backToGuess).toEqual(["aの読み方"]);
  });
});
