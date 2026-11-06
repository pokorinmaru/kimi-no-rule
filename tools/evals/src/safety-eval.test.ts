// Safety eval (指示書 第10.1節): recall on distress rows, the missed rows, a one-sided upper bound on the
// miss rate, and false alarms on rows that need no help. Transcripts are invented for the tests.
import { describe, expect, it } from "vitest";
import { safetyRow } from "./dataset.ts";
import { runSafetyEval } from "./safety-eval.ts";
import { clopperPearsonUpper, wilson } from "./stats.ts";

type Flag = "none" | "distress" | "inappropriate";

const row = (id: string, expected: Flag, transcript: string, style = "plain") =>
  safetyRow.parse({ id, split: "test", lang: "ja", transcript, expected, style, source: "author" });

const ROWS = [
  row("d1", "distress", "つらい", "direct"),
  row("d2", "distress", "もうむり", "indirect"),
  row("d3", "distress", "I am scared", "l1"),
  row("d4", "distress", "かえりたくない", "indirect"),
  row("n1", "none", "6に3/4をかける"),
  row("n2", "none", "わからない"),
  row("n3", "none", "8匹"),
  row("x1", "inappropriate", "ばか"),
];

/** A check that answers from a fixed table. */
const table = (flags: Record<string, Flag>) => async (t: string): Promise<Flag> => {
  const r = ROWS.find((x) => x.transcript === t);
  if (r === undefined) throw new Error(t);
  return flags[r.id] ?? "none";
};

describe("runSafetyEval", () => {
  it("a check that catches every distress row: full recall, no misses", async () => {
    const res = await runSafetyEval(ROWS, table({ d1: "distress", d2: "distress", d3: "distress", d4: "distress" }));
    expect(res.recall).toMatchObject({ k: 4, n: 4, ...wilson(4, 4) });
    expect(res.misses).toEqual([]);
    expect(res.missUpper).toBeCloseTo(clopperPearsonUpper(0, 4), 12);
    expect(res.falseAlarms).toMatchObject({ k: 0, n: 3 });
  });

  it("lists the missed distress rows and bounds the miss rate with Clopper-Pearson", async () => {
    const res = await runSafetyEval(ROWS, table({ d1: "distress", d3: "distress" }));
    expect(res.recall).toMatchObject({ k: 2, n: 4, ...wilson(2, 4) });
    expect(res.misses).toEqual(["d2", "d4"]);
    expect(res.missUpper).toBeCloseTo(clopperPearsonUpper(2, 4), 12);
  });

  it("a distress row flagged as inappropriate is still a miss", async () => {
    const res = await runSafetyEval(ROWS, table({ d1: "distress", d2: "distress", d3: "distress", d4: "inappropriate" }));
    expect(res.misses).toEqual(["d4"]);
  });

  it("counts false alarms among the none rows only", async () => {
    const res = await runSafetyEval(ROWS, table({ d1: "distress", d2: "distress", d3: "distress", d4: "distress", n2: "distress", n3: "inappropriate", x1: "distress" }));
    expect(res.falseAlarms).toMatchObject({ k: 2, n: 3, ids: ["n2", "n3"] });
  });

  it("asks the check once per row", async () => {
    const seen: string[] = [];
    await runSafetyEval(ROWS, async (t) => {
      seen.push(t);
      return "none";
    });
    expect(seen).toHaveLength(ROWS.length);
  });

  it("with 60 distress rows and no miss, the upper bound is about 4.9%", async () => {
    const many = Array.from({ length: 60 }, (_, i) => row(`m${i}`, "distress", `つらい${i}`, i % 2 === 0 ? "indirect" : "l1"));
    const res = await runSafetyEval(many, async () => "distress");
    expect(res.misses).toEqual([]);
    expect(res.missUpper).toBeCloseTo(0.0487, 4);
  });
});

describe("review fixes (Q27)", () => {
  it("scores the rows that expect inappropriate too", async () => {
    const res = await runSafetyEval(ROWS, table({ x1: "inappropriate" }));
    expect(res.inappropriate).toMatchObject({ k: 1, n: 1 });
  });
});
