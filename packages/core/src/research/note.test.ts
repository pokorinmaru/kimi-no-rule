// The grown-up's research note (指示書 第7.4節, 第6.7節 研究ノート・手順4): what the research state holds, in
// plain adult words decided by core. Each hypothesis has a line with no number but the 1 and no operation,
// whether it is still a guess or the way of reading for now, and how many counted problems it reproduces.
// The adult note Claude wrote (note_for_adult) is never shown. Written before the implementation.
import { describe, expect, it } from "vitest";
import type { ProblemRecord } from "../schema/index.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { runRule, type Hypothesis } from "../rules/run.ts";
import { sameReading } from "../rules/same-reading.ts";
import { hasOperationName, numbersIn } from "../gates/index.ts";
import { COMMON_FRACTION_READINGS, CORRECT_READING_ID, OTHER, readingLine, researchSummary, type FirstReading, type ResearchState } from "./index.ts";

const common = (id: string): Hypothesis => {
  const h = COMMON_FRACTION_READINGS.find((x) => x.id === id);
  if (h === undefined) throw new Error("no common reading " + id);
  return structuredClone(h);
};
const readingBy = (h: Hypothesis, record: ProblemRecord): FirstReading => ({
  record,
  childWorld: runRule(h, record),
  referencePlaced: true,
  afterFix: false,
  wordbookOpenedBefore: false,
});
/** Problems where the known-number reading and the sentence's own reading build different worlds. */
const differing = FRACTION_BANK.filter((r) => !sameReading(runRule(common("c_known_whole"), r), runRule(common(CORRECT_READING_ID), r), true)).slice(0, 3);

const BANNED_JA = ["君", "きみ", "あなた", "まちがい", "間違", "正し", "正解", "つられ", "ずれ", "苦手", "できない", "障害"];
const BANNED_EN = /\b(?:you|your|wrong|mistakes?|mistaken|correct(?:ly)?|incorrect|error|fooled|tricked|weak|poor|bad|disorder)\b/i;
const strip1 = (t: string): string => t.split("1とみる").join("").replace(/\bas 1\b/g, "");

function stateWith(pool: ResearchState["pool"], weights: ResearchState["weights"], readings: FirstReading[], unexpressible = false): ResearchState {
  return { pool, weights, readings, unscored: 0, unexpressible };
}

describe("readingLine: a hypothesis in plain adult words", () => {
  it("says every common reading in both languages, with no number but the 1, no operation and no word that judges or blames", () => {
    expect(differing.length).toBeGreaterThanOrEqual(2);
    for (const h of COMMON_FRACTION_READINGS) {
      for (const lang of ["ja", "en"] as const) {
        const line = readingLine(h, lang);
        expect(line.length, h.id).toBeGreaterThan(0);
        expect(numbersIn(strip1(line)), `${h.id} ${line}`).toEqual([]);
        expect(hasOperationName(line), `${h.id} ${line}`).toBe(false);
        if (lang === "ja") for (const w of BANNED_JA) expect(line.includes(w), `${h.id} ${line}`).toBe(false);
        else expect(BANNED_EN.test(line), `${h.id} ${line}`).toBe(false);
      }
    }
  });

  it("has no junior's prefix: the note is about the app's idea, not the junior's card", () => {
    for (const h of COMMON_FRACTION_READINGS) {
      expect(readingLine(h, "ja").startsWith("後輩")).toBe(false);
      expect(readingLine(h, "en").toLowerCase().startsWith("the junior")).toBe(false);
    }
  });

  it("says the sentence's own reading as reading the sentence as written", () => {
    expect(readingLine(common(CORRECT_READING_ID), "ja")).toBe("文が言うとおりの人を、1とみる");
    expect(readingLine(common(CORRECT_READING_ID), "en")).toBe("takes as 1 the person the sentence says");
  });

  it("never shows the free note Claude wrote for adults, even when no card words fit", () => {
    const odd: Hypothesis = { ...common("c_swap"), id: "h_odd", clauses: [], note_for_adult: "3をかける間違いをする" };
    for (const lang of ["ja", "en"] as const) {
      const line = readingLine(odd, lang);
      expect(line).not.toContain("間違い");
      expect(line).not.toContain("3");
      expect(line.length).toBeGreaterThan(0);
    }
    const known = { ...common("c_known_whole"), note_for_adult: "always multiplies: wrong" };
    expect(readingLine(known, "en")).not.toContain("wrong");
  });
});

describe("researchSummary: the note's entries from the state the device keeps", () => {
  it("is empty before any problem", () => {
    expect(researchSummary(stateWith([], { [OTHER]: 1 }, []), "ja")).toEqual({ entries: [], counted: 0, unsettled: false });
  });

  it("lists each hypothesis with its line, its status and how many counted problems it reproduces, heaviest first", () => {
    const known = common("c_known_whole");
    const correct = common(CORRECT_READING_ID);
    const readings = differing.map((r) => readingBy(known, r));
    const s = stateWith(
      [
        { hypothesis: correct, status: "hypothesis", splitObservations: 2 },
        { hypothesis: known, status: "confirmed", splitObservations: 2 },
      ],
      { [OTHER]: 0.05, [CORRECT_READING_ID]: 0.1, c_known_whole: 0.85 },
      readings,
    );
    const sum = researchSummary(s, "ja");
    expect(sum.counted).toBe(readings.length);
    expect(sum.unsettled).toBe(false);
    expect(sum.entries.map((e) => e.id)).toEqual(["c_known_whole", CORRECT_READING_ID]);
    expect(sum.entries[0]).toEqual({ id: "c_known_whole", line: readingLine(known, "ja"), status: "confirmed", backing: readings.length });
    expect(sum.entries[1]).toEqual({ id: CORRECT_READING_ID, line: readingLine(correct, "ja"), status: "hypothesis", backing: 0 });
    expect(researchSummary(s, "en").entries[0]?.line).toBe(readingLine(known, "en"));
  });

  it("says when no hypothesis fits most placements (unexpressible)", () => {
    const s = stateWith([{ hypothesis: common("c_swap"), status: "hypothesis", splitObservations: 0 }], { [OTHER]: 0.7, c_swap: 0.3 }, [], true);
    expect(researchSummary(s, "ja").unsettled).toBe(true);
  });

  it("does not count a reading core cannot run, and does not throw", () => {
    const first = differing[0] as ProblemRecord;
    const broken = { ...readingBy(common("c_swap"), first), record: { ...first, syntax_marks: null as never } };
    const s = stateWith([{ hypothesis: common("c_swap"), status: "hypothesis", splitObservations: 0 }], { [OTHER]: 0.5, c_swap: 0.5 }, [broken]);
    expect(researchSummary(s, "ja").entries[0]?.backing).toBe(0);
    expect(researchSummary(s, "ja").counted).toBe(1);
  });
});
