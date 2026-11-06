// The signboard problem through apply (指示書 第11節 M1, 第5.3節): three readings of the same sentences,
// each given as the ops a child might say, end in the worlds of fixtures/problems/signboard.ts.
import { describe, expect, it } from "vitest";
import { validateWorld, schemas, type WorldScene } from "../schema/index.ts";
import { rat } from "../rational/index.ts";
import { solve, type SolveResult } from "../solve/index.ts";
import { signboardCorrect } from "../../fixtures/problems/signboard.ts";
import { apply } from "./index.ts";
import { num, op } from "./test-worlds.ts";

type Unique = Extract<SolveResult, { kind: "unique" }>;

function unique(w: WorldScene): Unique {
  const res = solve(w);
  expect(res.kind).toBe("unique");
  return res as Unique;
}

function ratio(w: WorldScene): WorldScene["relations"][number] {
  const r = w.relations.find((x) => x.id === "r_ratio");
  if (r === undefined) throw new Error("no r_ratio");
  return r;
}

function younger(w: WorldScene): WorldScene["quantities"][number] {
  const q = w.quantities.find((x) => x.id === "q_otouto");
  if (q === undefined) throw new Error("no q_otouto");
  return q;
}

const correctReading = () => apply({ correct: signboardCorrect, ops: [op.setReference("r_ratio", "q_otouto")] });
const proceduralReading = () =>
  apply({
    correct: signboardCorrect,
    ops: [op.procedure("q_otouto", [{ quantity_id: "q_ani" }, num(3, 4)], "multiply")],
  });
const additiveReading = () =>
  apply({
    correct: signboardCorrect,
    ops: [op.setRelationOperator("r_ratio", "less_by"), op.setRelationAmount("r_ratio", num(3))],
  });

describe("signboard: read as written", () => {
  it("naming the same reference changes nothing and is recorded as observed", () => {
    const res = correctReading();
    expect(res.observedReferences).toEqual([{ relation_id: "r_ratio", reference: "q_otouto" }]);
    expect(res.discarded).toEqual([]);
    expect(ratio(res.judgeWorld)).toEqual(ratio(signboardCorrect));
  });

  it("the judging world solves to younger = 8, a possible world", () => {
    const res = correctReading();
    const solved = unique(res.judgeWorld);
    expect(solved.values.get("q_otouto")).toEqual(rat(8));
    expect(solved.impossible).toEqual([]);
    expect(res.judge).toEqual({ released: [], unsatisfiable: [] });
  });

  it("the judging world does not carry the answer", () => {
    expect(younger(correctReading().judgeWorld).value).toBeNull();
  });
});

describe("signboard: multiply what is given (procedure)", () => {
  it("records 9/2 for the younger brother, marked as not whole", () => {
    const res = proceduralReading();
    expect(res.procedures).toHaveLength(1);
    expect(res.procedures[0]?.target_id).toBe("q_otouto");
    expect(res.procedures[0]?.value).toEqual(num(9, 2));
    expect(res.procedures[0]?.impossible).toContain("non_integer");
    expect(res.procedures[0]?.impossible).not.toContain("negative");
  });

  it("judges with 9/2 on the target but never draws that number", () => {
    const res = proceduralReading();
    expect(younger(res.judgeWorld).value).toEqual(num(9, 2));
    expect(younger(res.drawWorld).value).toBeNull();
    expect(younger(res.checkWorld).value).toBeNull();
  });

  it("keeps the given 6 in the drawing world (Q17)", () => {
    const res = proceduralReading();
    const older = (w: WorldScene) => w.quantities.find((q) => q.id === "q_ani")?.value;
    expect(older(res.drawWorld)).toEqual(num(6));
    expect(older(res.checkWorld)).toEqual(num(6));
  });

  it("carries the ratio between the two brothers as it is, and touches it", () => {
    const res = proceduralReading();
    expect(ratio(res.judgeWorld)).toEqual(ratio(signboardCorrect));
    expect(res.touched).toEqual(expect.arrayContaining(["q_otouto", "r_ratio"]));
    // The operands of a procedure are not among the touched fields (指示書 第5.3節).
    expect(res.touched).not.toContain("q_ani");
  });

  it("releases the untouched 6 and leaves a world that cannot happen (指示書 第11節 M1)", () => {
    const res = proceduralReading();
    expect(res.judge.released).toEqual(["q_ani"]);
    expect(res.judge.unsatisfiable).toEqual([]);
    const solved = unique(res.judgeWorld);
    expect(solved.values.get("q_otouto")).toEqual(rat(9, 2));
    expect(solved.impossible).toContainEqual({ id: "q_otouto", reason: "non_integer" });
  });
});

describe("signboard: the 3 read as a difference (additive)", () => {
  it("the judging world solves to younger = 9, a possible world", () => {
    const res = additiveReading();
    expect(ratio(res.judgeWorld)).toEqual({ ...ratio(signboardCorrect), operator: "less_by", amount: num(3) });
    const solved = unique(res.judgeWorld);
    expect(solved.values.get("q_otouto")).toEqual(rat(9));
    expect(solved.impossible).toEqual([]);
  });
});

describe("signboard: an answer said as a number", () => {
  it("is drawn on the younger brother but not judged", () => {
    const res = apply({ correct: signboardCorrect, ops: [op.answer("q_otouto", num(8))] });
    expect(younger(res.drawWorld).value).toEqual(num(8));
    expect(younger(res.judgeWorld).value).toBeNull();
    expect(res.answers).toEqual([{ target_id: "q_otouto", value: num(8), onQuestionTarget: true, drawn: true }]);
  });
});

describe("signboard: all readings", () => {
  it("every world passes the shape and meaning checks", () => {
    for (const res of [correctReading(), proceduralReading(), additiveReading()]) {
      expect(() => schemas.worldScene.parse(res.judgeWorld)).not.toThrow();
      expect(validateWorld(res.judgeWorld)).toEqual({ ok: true });
      expect(validateWorld(res.drawWorld)).toEqual({ ok: true });
    }
  });

  it("apply does not change the fixture", () => {
    const before = structuredClone(signboardCorrect);
    correctReading();
    proceduralReading();
    additiveReading();
    expect(signboardCorrect).toEqual(before);
  });
});
