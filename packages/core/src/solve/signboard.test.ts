// The signboard problem and its two misreadings, solved (指示書 第11節 M1, conditions of 第5.2節).
import { describe, expect, it } from "vitest";
import { schemas, validateWorld, type WorldScene } from "../schema/index.ts";
import { rat } from "../rational/index.ts";
import { signboard, signboardAdditive, signboardCorrect, signboardProcedural } from "../../fixtures/problems/signboard.ts";
import { solve, type SolveResult } from "./index.ts";

type Unique = Extract<SolveResult, { kind: "unique" }>;

function unique(w: WorldScene): Unique {
  const res = solve(w);
  expect(res.kind).toBe("unique");
  return res as Unique;
}

describe("signboard fixtures are valid worlds", () => {
  it.each(Object.entries(signboard))("%s passes the shape and meaning checks", (_name, w) => {
    expect(() => schemas.worldScene.parse(w)).not.toThrow();
    expect(validateWorld(w)).toEqual({ ok: true });
  });

  it("all three ask for the younger brother's count of a countable kind", () => {
    for (const w of Object.values(signboard)) {
      expect(w.question).toEqual({ target_type: "quantity", target_id: "q_otouto" });
      expect(w.item_kinds.find((k) => k.id === "k_kingyo")?.countable).toBe(true);
      expect(w.quantities.find((q) => q.id === "q_otouto")?.value).toBeNull();
    }
  });
});

describe("signboard solved (指示書 第5.2節)", () => {
  it("correct world: unique, younger = 8, possible", () => {
    const res = unique(signboardCorrect);
    expect(res.values.get("q_otouto")).toEqual(rat(8));
    expect(res.impossible).toEqual([]);
  });

  it("procedural reading: younger = 9/2, marked non_integer", () => {
    const res = unique(signboardProcedural);
    expect(res.values.get("q_otouto")).toEqual(rat(9, 2));
    expect(res.impossible).toContainEqual({ id: "q_otouto", reason: "non_integer" });
    expect(res.impossible.some((m) => m.reason === "negative")).toBe(false);
  });

  it("additive reading: younger = 9, possible", () => {
    const res = unique(signboardAdditive);
    expect(res.values.get("q_otouto")).toEqual(rat(9));
    expect(res.impossible).toEqual([]);
  });

  it("the misreadings give answers different from the correct one and from each other", () => {
    const answers = [signboardCorrect, signboardProcedural, signboardAdditive].map((w) => unique(w).values.get("q_otouto"));
    expect(answers[1]).not.toEqual(answers[0]);
    expect(answers[2]).not.toEqual(answers[0]);
    expect(answers[2]).not.toEqual(answers[1]);
  });

  it("solve does not change the fixture", () => {
    const before = structuredClone(signboardCorrect);
    solve(signboardCorrect);
    expect(signboardCorrect).toEqual(before);
  });
});
