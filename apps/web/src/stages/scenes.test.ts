// The list of every stage picture the app can show for the bank (the premise harness).
import { describe, expect, it } from "vitest";
import { PREPARED_BANK, objectScene } from "@kimi/core";
import { sceneCases } from "./scenes.ts";

describe("sceneCases", () => {
  const cases = sceneCases();
  it("has the correct world before and after the answer, and misread worlds, for every bank problem core can draw as things", () => {
    const ids = new Set(cases.map((c) => c.problemId));
    // A problem core cannot draw as things has no stage picture; the sale problem is drawn in 100円 coins (Q63).
    const drawable = PREPARED_BANK.filter((r) => objectScene(r.world, r.world, { values: [] }) !== null);
    expect(drawable.map((r) => r.world.problem_id)).toContain("p_sale");
    expect(ids.size).toBe(drawable.length);
    for (const id of ids) {
      expect(cases.some((c) => c.id === `${id}/correct`)).toBe(true);
      expect(cases.some((c) => c.id === `${id}/correct_answered`)).toBe(true);
      expect(cases.filter((c) => c.problemId === id && !c.correct).length).toBeGreaterThan(0);
    }
  });

  it("keeps the correct world's asked holder hidden before the answer", () => {
    for (const c of cases.filter((x) => x.id.endsWith("/correct"))) expect(c.scene.holders.some((h) => h.hidden)).toBe(true);
  });

  it("never lists a misreading that gives the correct world on its problem", () => {
    for (const c of cases.filter((x) => !x.correct)) {
      const hidden = c.scene.holders.filter((h) => h.hidden).length;
      const dealt = c.scene.holders.some((h) => h.dishes > 0);
      // A real misread world shows something of its own: a value that is not hidden, or dishes.
      expect(hidden < c.scene.holders.length || dealt, c.id).toBe(true);
    }
  });

  it("gives every scene a unique id", () => {
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
  });
});
