// M1 step (6): same_world (指示書 第5.8節; used by the candidates of 第5.4節 and the conditions of 第5.2節;
// the signboard line of 第11節 M1). Written before the implementation.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { WorldScene } from "../schema/index.ts";
import { differenceWorld, num } from "../apply/test-worlds.ts";
import { signboardAdditive, signboardCorrect, signboardProcedural } from "../../fixtures/problems/signboard.ts";
import { pairWorld, rel } from "../diagnose/test-records.ts";
import { sameWorld } from "./same-world.ts";

const PROPERTY_RUNS = { numRuns: 60 };

type Relation = WorldScene["relations"][number];

function editRelation(w: WorldScene, id: string, f: (r: Relation) => Relation): WorldScene {
  return { ...structuredClone(w), relations: w.relations.map((r) => (r.id === id ? f(structuredClone(r)) : structuredClone(r))) };
}

const swapEnds = (r: Relation): Relation => ({ ...r, subject: r.reference ?? r.subject, reference: r.subject });

/** The signboard ratio with its amount turned upside down (reference kept). */
const signboardInverted = (): WorldScene =>
  editRelation(signboardCorrect, "r_ratio", (r) => ({ ...r, amount: num(4, 3) }));

describe("same_world: equal worlds", () => {
  it("a world is the same as a copy of itself", () => {
    expect(sameWorld(signboardCorrect, structuredClone(signboardCorrect))).toBe(true);
    expect(sameWorld(differenceWorld(5, 3), differenceWorld(5, 3))).toBe(true);
  });

  it("is reflexive and symmetric over difference worlds", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 9 }), (a, d, a2, d2) => {
        const x = differenceWorld(a, d);
        const y = differenceWorld(a2, d2);
        expect(sameWorld(x, structuredClone(x))).toBe(true);
        expect(sameWorld(x, y)).toBe(sameWorld(y, x));
      }),
      PROPERTY_RUNS,
    );
  });

  it("does not change either world", () => {
    const a = structuredClone(signboardCorrect);
    const b = signboardInverted();
    const before = [structuredClone(a), structuredClone(b)];
    sameWorld(a, b);
    expect([a, b]).toEqual(before);
  });
});

describe("same_world: solved values", () => {
  it("a different given number makes a different world", () => {
    expect(sameWorld(differenceWorld(5, 3), differenceWorld(6, 3))).toBe(false);
  });

  it("a different relation amount makes a different world", () => {
    expect(sameWorld(differenceWorld(5, 3), differenceWorld(5, 4))).toBe(false);
  });

  it("difference worlds are the same exactly when both numbers are", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 20 }), fc.integer({ min: 1, max: 9 }), (a, d, a2, d2) => {
        expect(sameWorld(differenceWorld(a, d), differenceWorld(a2, d2))).toBe(a === a2 && d === d2);
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("same_world: what is asked", () => {
  it("the same numbers with another question make a different world", () => {
    const asksA: WorldScene = { ...differenceWorld(5, 3), question: { target_type: "quantity", target_id: "q_a" } };
    expect(sameWorld(differenceWorld(5, 3), asksA)).toBe(false);
  });
});

describe("same_world: kind of each relation", () => {
  // a = 2 in both; b = a + 2 and b = 2 a both give b = 4 with an amount of 2.
  const plus = pairWorld(2, [rel("r_1", "more_by", "q_b", "q_a", num(2))]);
  const twice = pairWorld(2, [rel("r_1", "times", "q_b", "q_a", num(2))]);

  it("a difference and a ratio with the same numbers make different worlds", () => {
    expect(sameWorld(plus, twice)).toBe(false);
  });

  it("two ratio operators with the same numbers are the same kind", () => {
    const fraction = pairWorld(2, [rel("r_1", "fraction_of", "q_b", "q_a", num(2))]);
    expect(sameWorld(twice, fraction)).toBe(true);
  });
});

describe("same_world: order of lengths", () => {
  // a is not known, so no count is fixed; only b above a or b below a tells the two apart.
  const above = pairWorld(null, [rel("r_1", "more_by", "q_b", "q_a", num(3))]);
  const below = pairWorld(null, [rel("r_1", "less_by", "q_b", "q_a", num(3))]);

  it("a world whose counts are not all fixed is the same as a copy of itself", () => {
    expect(sameWorld(above, structuredClone(above))).toBe(true);
  });

  it("b above a and b below a make different worlds", () => {
    expect(sameWorld(above, below)).toBe(false);
  });
});

describe("same_world: the reference is not compared", () => {
  it("signboard: swapping the two ends and turning the fraction over are the same world", () => {
    const swapped = editRelation(signboardCorrect, "r_ratio", swapEnds);
    expect(swapped).toEqual(signboardProcedural);
    expect(sameWorld(swapped, signboardInverted())).toBe(true);
  });

  it("difference: swapping the two ends and swapping more for less are the same world", () => {
    const swapped = editRelation(differenceWorld(5, 3), "r_1", swapEnds);
    const less = editRelation(differenceWorld(5, 3), "r_1", (r) => ({ ...r, operator: "less_by" }));
    expect(sameWorld(swapped, less)).toBe(true);
  });

  it("for any fraction and given count, swapping the ends equals turning the fraction over", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 2, max: 9 }), fc.integer({ min: 1, max: 12 }), (p, q, k) => {
        // Decide the answer first: the asked count is q k, the given count p k.
        const w = pairWorld(p * k, [rel("r_1", "fraction_of", "q_a", "q_b", num(p, q))], "ratio");
        const swapped = editRelation(w, "r_1", swapEnds);
        const inverted = editRelation(w, "r_1", (r) => ({ ...r, amount: num(q, p) }));
        expect(sameWorld(swapped, inverted)).toBe(true);
        expect(sameWorld(w, swapped)).toBe(p === q);
      }),
      PROPERTY_RUNS,
    );
  });
});

describe("same_world: signboard (指示書 第11節 M1)", () => {
  it("the additive reading is not the same world as the correct one", () => {
    expect(sameWorld(signboardAdditive, signboardCorrect)).toBe(false);
  });

  it("the procedural reading is not the same world as the correct one, nor as the additive one", () => {
    expect(sameWorld(signboardProcedural, signboardCorrect)).toBe(false);
    expect(sameWorld(signboardProcedural, signboardAdditive)).toBe(false);
  });
});
