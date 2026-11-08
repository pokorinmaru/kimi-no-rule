// The problem one sentence at a time (Q62): each step is one sentence or one thought the child checks, with its
// right answer from core, so the screen can stop at the step where the child's reading parts from the problem's.
import { describe, expect, it } from "vitest";
import { festivalRecord, festivalWholeRecord } from "../../fixtures/problems/festival.ts";
import { FRACTION_BANK } from "../../fixtures/problems/fraction-bank.ts";
import { validateWorld } from "../schema/semantic.ts";
import { solve } from "../solve/index.ts";
import { gate } from "../gates/index.ts";
import { stepScene, stepsOf } from "./index.ts";

const r = (num: number, den = 1) => ({ num, den });
/** The steps of a record, which must exist here. */
const stepsOrThrow = (rec: Parameters<typeof stepsOf>[0]) => {
  const s = stepsOf(rec);
  if (s === null) throw new Error("no steps");
  return s;
};
const at = <T,>(xs: readonly T[], i: number): T => {
  const x = xs[i];
  if (x === undefined) throw new Error(`no item ${String(i)}`);
  return x;
};

describe("the first problem: the whole is given (Q62)", () => {
  it("is a valid world: the child's 8, and AI-kun's is 3/4 of the child's, so 6", () => {
    const w = festivalWholeRecord.world;
    expect(validateWorld(w).ok).toBe(true);
    const res = solve(w);
    expect(res.kind).toBe("unique");
    if (res.kind === "unique") expect(res.values.get("q_ai")).toEqual({ num: 6n, den: 1n });
    expect(festivalWholeRecord.expected_answer).toEqual(r(6));
    expect(w.relations[0]).toMatchObject({ subject: "q_ai", reference: "q_me", amount: r(3, 4) });
  });
});

describe("stepsOf", () => {
  it("whole given: the number sentence, who is compared with whom, one part of four, then three parts", () => {
    expect(stepsOf(festivalWholeRecord)).toEqual([
      { kind: "fact", statementIndex: 0, holderId: "h_me", quantityId: "q_me", value: r(8) },
      { kind: "relation", statementIndex: 1, relationId: "r_ratio", subjectHolderId: "h_ai", referenceHolderId: "h_me", referenceQuantityId: "q_me", amount: r(3, 4) },
      { kind: "unit", knownHolderId: "h_me", parts: 4, value: r(2) },
      { kind: "total", statementIndex: 2, targetHolderId: "h_ai", parts: 3, value: r(6) },
    ]);
  });

  it("part given (the festival story): three parts are 6, so one part, then four parts", () => {
    expect(stepsOf(festivalRecord)).toEqual([
      { kind: "fact", statementIndex: 0, holderId: "h_me", quantityId: "q_me", value: r(6) },
      { kind: "relation", statementIndex: 1, relationId: "r_ratio", subjectHolderId: "h_me", referenceHolderId: "h_ai", referenceQuantityId: "q_ai", amount: r(3, 4) },
      { kind: "unit", knownHolderId: "h_me", parts: 3, value: r(2) },
      { kind: "total", statementIndex: 2, targetHolderId: "h_ai", parts: 4, value: r(8) },
    ]);
  });

  it("every step's value agrees with core's solution, for every bank problem it takes", () => {
    for (const rec of [festivalWholeRecord, festivalRecord, ...FRACTION_BANK]) {
      const steps = stepsOf(rec);
      if (steps === null) continue;
      const total = steps.find((s) => s.kind === "total");
      expect(total?.value, rec.world.problem_id).toEqual(rec.expected_answer);
      const unit = steps.find((s) => s.kind === "unit");
      const fact = steps.find((s) => s.kind === "fact");
      if (unit?.kind === "unit" && fact?.kind === "fact" && total?.kind === "total") {
        // known = unit × its parts, answer = unit × the target's parts
        expect(unit.value.num * unit.parts * fact.value.den).toBe(fact.value.num * unit.value.den);
        expect(unit.value.num * total.parts * total.value.den).toBe(total.value.num * unit.value.den);
      }
    }
  });

  it("takes the ribbon problem of the bank", () => {
    const ribbon = FRACTION_BANK.find((p) => p.world.problem_id === "p_fraction_c");
    expect(ribbon && stepsOf(ribbon)?.map((s) => s.kind)).toEqual(["fact", "relation", "unit", "total"]);
  });
});

describe("stepScene", () => {
  it("at the number sentence draws the child's things alone, and nothing of AI-kun", () => {
    const scene = stepScene(festivalWholeRecord, at(stepsOrThrow(festivalWholeRecord), 0), []);
    expect(scene?.holders).toHaveLength(1);
    expect(scene?.holders[0]).toMatchObject({ holderId: "h_me", count: { wholes: 8, piece: null }, hidden: false });
    expect(scene?.share).toBeNull();
  });

  it("from the relation on draws both, AI-kun as 「？」, and deals one part only once the child has said it", () => {
    const steps = stepsOrThrow(festivalWholeRecord);
    const before = stepScene(festivalWholeRecord, at(steps, 2), []);
    expect(before?.holders.find((h) => h.holderId === "h_ai")?.hidden).toBe(true);
    expect(before?.share).toBeNull();
    const after = stepScene(festivalWholeRecord, at(steps, 2), [r(2)]);
    expect(after?.share).toEqual({ wholes: 2, piece: null });
  });
});

describe("the gate keeps one part hidden until the child says it (Q62)", () => {
  const ctx = (numbers = [] as { num: number; den: number }[]) => ({
    correct: festivalWholeRecord.world,
    lang: "ja" as const,
    childSaid: { numbers, words: [] },
    grade: 6,
    interpretationRecorded: true,
    prediction: "answered" as const,
  });
  it("refuses a line with one part (2) before the child says it, and lets it through after", () => {
    expect(gate({ kind: "say", text: "1つ分は2匹だよ" }, ctx()).ok).toBe(false);
    expect(gate({ kind: "say", text: "1つ分は2匹だよ" }, ctx([r(2)])).ok).toBe(true);
  });
});
