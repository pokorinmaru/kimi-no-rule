// The premise of the stage picture (the user's request, 2026-11-08): the picture must fit the problem and the logic,
// not the other way round. For every problem the child may meet and every world the app can show for it (the correct
// one and each common misreading, run by core), the counts decide what the parts must allow: a part for the thing, a
// container that shows every thing inside, and a way to draw a share that is not whole. Living things are never cut.
import { describe, expect, it } from "vitest";
import { COMMON_FRACTION_READINGS, FRACTION_BANK, runRule, solve, type ProblemRecord, type WorldScene } from "@kimi/core";
import { MAX_THINGS, containerPartFor, itemPartFor, shareStyleOf, type ItemPart } from "./spec.ts";

/** Every world the app can show for a problem: the correct one and each common misreading that runs. */
function worldsOf(r: ProblemRecord): WorldScene[] {
  const out: WorldScene[] = [r.world];
  for (const h of COMMON_FRACTION_READINGS) {
    try {
      out.push(runRule(h, r));
    } catch {
      // A reading that does not run on this problem is never shown for it.
    }
  }
  return out;
}

/** Each holder's count in each world where core can solve it (as a number of things, maybe not whole). */
function counts(r: ProblemRecord): { holder: string; count: number }[] {
  const out: { holder: string; count: number }[] = [];
  for (const w of worldsOf(r)) {
    const s = solve(w);
    if (s.kind !== "unique") continue;
    for (const q of w.quantities) {
      const v = s.values.get(q.id);
      if (v !== undefined) out.push({ holder: q.holder, count: Number(v.num) / Number(v.den) });
    }
  }
  return out;
}

const LIVING: readonly ItemPart[] = ["goldfish", "fish", "tulip", "flower_white", "flower_red"];

describe("the stage picture's premise, for every problem of the bank and every world the app can show", () => {
  it.each(FRACTION_BANK.map((r) => [r.world.problem_id, r] as const))("%s", (_id, r) => {
    const noun = r.world.item_kinds[0]?.noun ?? "";
    for (const h of r.world.holders) {
      // A part draws the thing, and a container that shows every thing holds it.
      const item = itemPartFor(noun, h.label);
      expect(item, `${noun} / ${h.label}`).not.toBeNull();
      if (item === null) continue;
      expect(containerPartFor(item)).toBeDefined();
    }
    for (const { count } of counts(r)) {
      // Every count fits one container side by side (the largest in the bank is 54 cards).
      expect(count).toBeLessThanOrEqual(MAX_THINGS);
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  it("finds at least one world with a share that is not whole, so the share style is needed", () => {
    expect(FRACTION_BANK.some((r) => counts(r).some((c) => !Number.isInteger(c.count)))).toBe(true);
  });

  it("draws every share that is not whole as a cut piece, living things included (the user's decision, 2026-11-08)", () => {
    for (const item of LIVING) expect(shareStyleOf(item)).toBe("cut");
  });

  it("puts goldfish in a clear tank, caught fish in an open cooler and flowers in a flower bed, never in something that hides them", () => {
    expect(containerPartFor("goldfish")).toBe("tank");
    expect(containerPartFor("fish")).toBe("cooler");
    expect(containerPartFor("tulip")).toBe("flowerbed");
    expect(containerPartFor("flower_red")).toBe("flowerbed");
  });
});
